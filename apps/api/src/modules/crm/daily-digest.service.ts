import { Role } from '@mym/shared';
import { CalendarItem, Event } from './crm.models';
import { User } from '../users/user.model';
import { Notification } from '../notifications/notification.model';
import { sendEmail } from '../email/email.service';
import { renderBrandedEmail } from '../email/email-template.util';
import { findEventsWithPendingClosure } from '../event-closure/pending-closures';
import { argentinaDateKey, argentinaMidnight, addDaysToDateKey } from '../../utils/argentina-date';

const EVENT_TERMINAL_STATUSES = ['cancelled', 'lost'];
// The digest is an aggregate report, not a per-obligation reminder, so it doesn't fit
// reminder-engine.ts's claim-next-item model — it's its own small tick, run once the local
// morning window starts. Idempotency comes from the Notification automationKey below, not from
// a tight minute-level window, so a delayed or repeated tick within the same day never re-sends.
const DIGEST_START_HOUR = 8;

function argentinaHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(date));
}

type DigestSummary = {
  dateKey: string;
  events: any[];
  reminders: any[];
  paymentsDueToday: any[];
  pendingClosures: any[];
};

async function buildDailyDigest(now: Date, salonIds?: string[]): Promise<DigestSummary> {
  const todayKey = argentinaDateKey(now);
  const start = argentinaMidnight(todayKey);
  const end = argentinaMidnight(addDaysToDateKey(todayKey, 1));
  const salonFilter = salonIds?.length ? { salonId: { $in: salonIds } } : {};

  const [events, reminders, paymentsDueToday, allPendingClosures] = await Promise.all([
    Event.find({ deletedAt: null, status: { $nin: EVENT_TERMINAL_STATUSES }, eventDate: { $gte: start, $lt: end }, ...salonFilter })
      .select('_id eventName eventDate salonId').sort({ eventDate: 1 }).lean(),
    CalendarItem.find({ deletedAt: null, status: { $nin: ['done', 'cancelled'] }, type: { $in: ['reminder', 'alert', 'task', 'meeting'] }, startAt: { $gte: start, $lt: end }, ...salonFilter })
      .select('_id title startAt eventId').sort({ startAt: 1 }).lean(),
    CalendarItem.find({ deletedAt: null, 'metadata.financialReminder': true, 'metadata.dueDateKey': todayKey, 'notification.status': { $ne: 'cancelled' }, ...salonFilter })
      .select('_id title eventId').lean(),
    findEventsWithPendingClosure(now, 0)
  ]);
  const pendingClosures = salonIds?.length
    ? allPendingClosures.filter((event: any) => salonIds.includes(String(event.salonId)))
    : allPendingClosures;

  return { dateKey: todayKey, events, reminders, paymentsDueToday, pendingClosures };
}

function digestContent(summary: DigestSummary, scopeLabel: string): { subject: string; text: string; html: string } {
  const subject = `Resumen del día — ${scopeLabel} (${summary.dateKey})`;
  const bulletLines = (label: string, items: any[], toLine: (item: any) => string) => [
    `${label}: ${items.length}`,
    ...items.slice(0, 15).map((item) => `  · ${toLine(item)}`)
  ];
  const text = [
    ...bulletLines('Eventos de hoy', summary.events, (event) => event.eventName || 'Evento sin nombre'),
    ...bulletLines('Alertas y recordatorios de hoy', summary.reminders, (item) => item.title),
    ...bulletLines('Pagos vencidos hoy', summary.paymentsDueToday, (item) => item.title),
    ...bulletLines('Cierres de evento pendientes', summary.pendingClosures, (event) => event.eventName || 'Evento sin nombre')
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: 'Resumen ejecutivo diario',
    heading: `Hoy, ${summary.dateKey}`,
    intro: `Esto es lo que tiene ${scopeLabel} para hoy en M&M Eventos.`,
    rows: [
      ['Eventos de hoy', String(summary.events.length)],
      ['Alertas y recordatorios de hoy', String(summary.reminders.length)],
      ['Pagos vencidos hoy', String(summary.paymentsDueToday.length)],
      ['Cierres de evento pendientes', String(summary.pendingClosures.length)]
    ],
    footerNote: 'Abrí el backoffice para ver el detalle completo de cada punto.'
  });
  return { subject, text, html };
}

async function deliverDigestToUser(user: any, summary: DigestSummary, scopeLabel: string): Promise<boolean> {
  const automationKey = `daily_digest:${user._id}:${summary.dateKey}`;
  const content = digestContent(summary, scopeLabel);
  const result = await Notification.bulkWrite([{
    updateOne: {
      filter: { userId: user._id, automationKey },
      update: {
        $setOnInsert: {
          userId: user._id,
          automationKey,
          type: 'daily_digest',
          title: content.subject,
          message: content.text,
          actionUrl: '/admin/dashboard'
        }
      },
      upsert: true
    }
  }]);
  const isFirstSendToday = (result.upsertedCount ?? 0) > 0;
  if (!isFirstSendToday) return false;
  const preferences = user.notificationPreferences ?? {};
  if (user.email && preferences.email !== false && preferences.emailNotificationsEnabled !== false) {
    await sendEmail({ to: user.email, subject: content.subject, text: content.text, html: content.html }).catch(() => undefined);
  }
  return true;
}

export async function processDailyDigestTick(now = new Date()): Promise<{ delivered: number; skipped: number; failed: number; hasMore: boolean }> {
  if (argentinaHour(now) < DIGEST_START_HOUR) return { delivered: 0, skipped: 0, failed: 0, hasMore: false };
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const globalSummary = await buildDailyDigest(now);
    const globalUsers = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } })
      .select('_id email notificationPreferences').lean();
    for (const user of globalUsers) {
      if (await deliverDigestToUser(user, globalSummary, 'Administración')) delivered += 1; else skipped += 1;
    }

    const salonManagers = await User.find({ active: true, deletedAt: null, roles: Role.SALON_MANAGER, managedSalonIds: { $exists: true, $ne: [] } })
      .select('_id email notificationPreferences managedSalonIds').lean();
    for (const manager of salonManagers) {
      const salonIds = (manager.managedSalonIds ?? []).map((id: any) => String(id));
      const summary = await buildDailyDigest(now, salonIds);
      if (await deliverDigestToUser(manager, summary, 'tu salón')) delivered += 1; else skipped += 1;
    }
  } catch {
    failed += 1;
  }
  return { delivered, skipped, failed, hasMore: false };
}
