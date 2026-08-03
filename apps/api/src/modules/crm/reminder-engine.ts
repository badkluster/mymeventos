import { CalendarItem } from './crm.models';
import { User } from '../users/user.model';
import { Notification } from '../notifications/notification.model';
import { sendEmail } from '../email/email.service';

// Generic version of the lock/lease/delivery machinery that financial-reminders.service.ts
// pioneered for CalendarItem-based reminders. Kept separate (not imported by that file) so the
// already-verified financial flow is never at risk from changes made for the newer domains below.
// `idOf`/`uniqueIds` are intentionally duplicated here rather than shared with that file, for the
// same reason.

const GENERIC_LOCK_MS = 10 * 60_000;
const GENERIC_RETRY_DELAY_MS = 60 * 60_000;
export const DEFAULT_MAX_REMINDERS_PER_TICK = 50;

export function idOf(value: unknown): string | undefined {
  const item: any = value;
  const raw = item?._id ?? item;
  return raw?.toString?.() ?? (typeof raw === 'string' ? raw : undefined);
}

export function uniqueIds(values: Array<unknown>): string[] {
  return [...new Set(values.map(idOf).filter((value): value is string => Boolean(value)))];
}

export type GenericReminderRecipients =
  | { kind: 'internal'; userIds: string[]; primaryUserId?: string }
  | { kind: 'external'; to: string };

export type GenericReminderContent = {
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; path?: string; content?: Buffer | string; cid?: string }>;
};

export type GenericReminderOptions = {
  // Matches the `metadata.<domainKey>: true` discriminator each domain's sync step sets on its
  // CalendarItems, mirroring `metadata.financialReminder: true`.
  domainKey: string;
  notificationType: string;
  stillApplies: (item: any) => Promise<boolean> | boolean;
  resolveRecipients: (item: any) => Promise<GenericReminderRecipients> | GenericReminderRecipients;
  buildContent: (item: any) => GenericReminderContent;
  actionUrl?: (item: any) => string | undefined;
};

function canReceiveSystemReminder(user: any): boolean {
  const preferences = user.notificationPreferences ?? {};
  return preferences.systemNotificationsEnabled !== false && preferences.inApp !== false;
}

function canReceiveEmailReminder(user: any): boolean {
  const preferences = user.notificationPreferences ?? {};
  return Boolean(user.email) && preferences.emailNotificationsEnabled !== false && preferences.email !== false;
}

async function activeUsersById(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  return User.find({ _id: { $in: ids }, active: true, deletedAt: null })
    .select('_id roles notificationPreferences email')
    .lean();
}

export async function claimNextGenericReminder(now: Date, domainKey: string): Promise<any | null> {
  return CalendarItem.findOneAndUpdate({
    deletedAt: null,
    [`metadata.${domainKey}`]: true,
    'notification.enabled': true,
    'notification.sendAt': { $lte: now },
    $or: [
      { 'notification.status': { $in: ['pending', 'scheduled'] } },
      { 'notification.status': 'failed', 'notification.nextRetryAt': { $lte: now } },
      { 'notification.status': 'processing', 'notification.lockExpiresAt': { $lte: now } }
    ]
  }, {
    $set: {
      'notification.status': 'processing',
      'notification.lockedAt': now,
      'notification.lockExpiresAt': new Date(now.getTime() + GENERIC_LOCK_MS)
    },
    $unset: { 'notification.lastError': 1 },
    $inc: { 'notification.attemptCount': 1 }
  }, { new: true });
}

export async function markGenericReminderFailure(item: any, error: unknown, now: Date): Promise<void> {
  const message = error instanceof Error ? error.message : 'No se pudo enviar el recordatorio.';
  await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
    $set: {
      'notification.status': 'failed',
      'notification.lastError': message,
      'notification.nextRetryAt': new Date(now.getTime() + GENERIC_RETRY_DELAY_MS)
    },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1 }
  });
}

export async function deliverGenericReminder(item: any, now: Date, options: GenericReminderOptions): Promise<'delivered' | 'skipped'> {
  if (!(await options.stillApplies(item))) {
    await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
      $set: { status: 'cancelled', 'notification.status': 'cancelled' },
      $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1 }
    });
    return 'skipped';
  }

  const recipients = await options.resolveRecipients(item);
  const content = options.buildContent(item);
  const automationKey = String(item.automationKey ?? item._id);
  const actionUrl = options.actionUrl?.(item);

  if (recipients.kind === 'external') {
    if (!recipients.to) {
      await markGenericReminderFailure(item, new Error('No hay un email de destino para este recordatorio.'), now);
      throw new Error('No hay un email de destino para este recordatorio.');
    }
    await sendEmail({ to: recipients.to, subject: content.subject, text: content.text, html: content.html, attachments: content.attachments });
  } else {
    const activeRecipients = await activeUsersById(recipients.userIds);
    if (!activeRecipients.length) {
      const message = 'No hay responsables activos para recibir el recordatorio.';
      await markGenericReminderFailure(item, new Error(message), now);
      throw new Error(message);
    }
    const systemRecipients = activeRecipients.filter(canReceiveSystemReminder);
    if (systemRecipients.length) {
      await Notification.bulkWrite(systemRecipients.map((user: any) => ({
        updateOne: {
          filter: { userId: user._id, automationKey },
          update: {
            $setOnInsert: {
              userId: user._id,
              automationKey,
              type: options.notificationType,
              title: content.subject,
              message: content.text,
              actionUrl,
              metadata: { ...(item.metadata ?? {}), calendarItemId: item._id }
            }
          },
          upsert: true
        }
      })));
    }
    await Promise.allSettled(activeRecipients.filter(canReceiveEmailReminder).map((user: any) => sendEmail({
      to: user.email,
      subject: content.subject,
      text: actionUrl ? `${content.text}\n\nAbrir en M&M Eventos: ${actionUrl}` : content.text,
      html: content.html,
      attachments: content.attachments
    })));
  }

  await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
    $set: { 'notification.status': 'sent', 'notification.lastSentAt': now },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1, 'notification.lastError': 1 }
  });
  return 'delivered';
}

export type GenericTickResult = { synced: number; delivered: number; skipped: number; failed: number; hasMore: boolean };

// The shape every new domain's `processXTick(now)` returns — identical to
// financial-reminders.service.ts's own FinancialTickResult so calendar-tick.routes.ts can treat
// every domain uniformly.
export async function runGenericReminderTick(
  now: Date,
  sync: (now: Date) => Promise<number>,
  options: GenericReminderOptions,
  maxPerTick = DEFAULT_MAX_REMINDERS_PER_TICK
): Promise<GenericTickResult> {
  const synced = await sync(now);
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  while (processed < maxPerTick) {
    const item = await claimNextGenericReminder(now, options.domainKey);
    if (!item) break;
    processed += 1;
    try {
      const result = await deliverGenericReminder(item, now, options);
      if (result === 'delivered') delivered += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await markGenericReminderFailure(item, error, now);
    }
  }
  return { synced, delivered, skipped, failed, hasMore: processed >= maxPerTick };
}
