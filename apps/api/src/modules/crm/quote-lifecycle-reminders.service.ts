import { CalendarItem, Customer, Lead, Quote } from './crm.models';
import { renderBrandedEmail } from '../email/email-template.util';
import { addDaysToDateKey, argentinaDateKey, argentinaMidnight, dueDateKey } from '../../utils/argentina-date';
import { idOf, runGenericReminderTick, type GenericReminderFailureReason, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

const CLIENT_NOTICE_DAYS_BEFORE = 3;
const INTERNAL_FOLLOW_UP_AFTER_DAYS = 5;

/** P10: a sent quote past its validUntil becomes expired automatically — a plain status flip,
 * no CalendarItem/reminder involved, since there's nothing to notify about, just a stale state
 * to correct. Runs at the start of every tick so the sync below only ever sees quotes still
 * genuinely "sent". */
async function autoExpireQuotes(now: Date): Promise<number> {
  const result = await Quote.updateMany(
    { deletedAt: null, status: 'sent', validUntil: { $lt: now } },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount ?? 0;
}

async function upsertQuoteReminder(input: {
  automationKey: string;
  quote: any;
  title: string;
  description: string;
  sendAt: Date;
  kind: 'client_notice' | 'internal_followup';
  recipientUserId?: string;
}): Promise<void> {
  await CalendarItem.findOneAndUpdate(
    { automationKey: input.automationKey },
    {
      $set: {
        type: 'reminder',
        source: 'system',
        title: input.title,
        description: input.description,
        startAt: input.sendAt,
        allDay: false,
        status: 'scheduled',
        priority: 'normal',
        visibility: 'private',
        quoteId: input.quote._id,
        leadId: input.quote.leadId,
        customerId: input.quote.customerId,
        assignedToUserId: input.recipientUserId,
        metadata: { quoteLifecycle: true, kind: input.kind, quoteEmail: input.quote.email }
      },
      $setOnInsert: {
        notification: {
          enabled: true,
          channels: input.kind === 'client_notice' ? ['email'] : ['system', 'email'],
          sendAt: input.sendAt,
          status: 'scheduled',
          attemptCount: 0
        }
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function syncQuoteLifecycleReminders(now: Date): Promise<number> {
  await autoExpireQuotes(now);
  const todayKey = argentinaDateKey(now);
  const quotes: any[] = await Quote.find({ deletedAt: null, status: 'sent' })
    .select('_id customerId leadId email validUntil sentAt createdBy quoteNumber').lean();

  // Batch the lead-assignee lookup instead of one `Lead.findOne` per eligible quote inside
  // the loop below (small N+1, same class of issue fixed in financial-reminders.service.ts).
  const followUpEligibleLeadIds = new Set<string>();
  for (const quote of quotes) {
    if (!quote.sentAt || !quote.leadId) continue;
    const sentAgeDays = (now.getTime() - new Date(quote.sentAt).getTime()) / 86_400_000;
    if (sentAgeDays >= INTERNAL_FOLLOW_UP_AFTER_DAYS) {
      const leadId = idOf(quote.leadId);
      if (leadId) followUpEligibleLeadIds.add(leadId);
    }
  }
  const followUpLeads = followUpEligibleLeadIds.size
    ? await Lead.find({ _id: { $in: [...followUpEligibleLeadIds] }, deletedAt: null }).select('_id assignedUserId').lean()
    : [];
  const leadAssigneeById = new Map(followUpLeads.map((lead: any) => [idOf(lead._id)!, idOf(lead.assignedUserId)]));

  let synced = 0;
  for (const quote of quotes) {
    const validUntilKey = dueDateKey(quote.validUntil);
    if (validUntilKey && validUntilKey >= todayKey) {
      const noticeKey = addDaysToDateKey(validUntilKey, -CLIENT_NOTICE_DAYS_BEFORE);
      if (noticeKey <= todayKey) {
        await upsertQuoteReminder({
          automationKey: `quote_client_notice:${quote._id}`,
          quote,
          title: 'Tu presupuesto está por vencer',
          description: `Tu presupuesto ${quote.quoteNumber ?? ''} vence el ${validUntilKey}. Contactanos si querés confirmarlo o necesitás más tiempo.`,
          sendAt: argentinaMidnight(noticeKey < todayKey ? todayKey : noticeKey),
          kind: 'client_notice'
        });
        synced += 1;
      }
    }

    if (quote.sentAt) {
      const sentAgeDays = (now.getTime() - new Date(quote.sentAt).getTime()) / 86_400_000;
      if (sentAgeDays >= INTERNAL_FOLLOW_UP_AFTER_DAYS) {
        const leadId = idOf(quote.leadId);
        const recipientUserId = (leadId ? leadAssigneeById.get(leadId) : undefined) ?? idOf(quote.createdBy);
        if (recipientUserId) {
          await upsertQuoteReminder({
            automationKey: `quote_internal_followup:${quote._id}`,
            quote,
            title: `Presupuesto ${quote.quoteNumber ?? ''} enviado sin respuesta`,
            description: 'El presupuesto sigue "enviado" hace más de 5 días sin aceptar ni rechazar — vale la pena reforzar el contacto.',
            sendAt: now,
            kind: 'internal_followup',
            recipientUserId
          });
          synced += 1;
        }
      }
    }
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const quoteId = idOf(item?.quoteId);
  if (!quoteId) return false;
  const quote: any = await Quote.findOne({ _id: quoteId, deletedAt: null }).select('_id status').lean();
  return Boolean(quote) && quote.status === 'sent';
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  if (item?.metadata?.kind === 'client_notice') {
    if (item?.metadata?.quoteEmail) return { kind: 'external', to: item.metadata.quoteEmail };
    const customerId = idOf(item?.customerId);
    const customer: any = customerId ? await Customer.findOne({ _id: customerId, deletedAt: null }).select('email').lean() : undefined;
    return { kind: 'external', to: customer?.email ?? '' };
  }
  return { kind: 'internal', userIds: [String(item.assignedToUserId)] };
}

function buildContent(item: any) {
  if (item?.metadata?.kind === 'client_notice') {
    const html = renderBrandedEmail({
      eyebrow: 'Tu presupuesto',
      heading: item.title,
      intro: item.description,
      footerNote: 'Si ya nos respondiste, ignorá este mensaje.'
    });
    return { subject: item.title, text: item.description, html };
  }
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'quoteLifecycle',
  notificationType: 'quote_lifecycle',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: (item: any) => {
    const quoteId = idOf(item?.quoteId);
    return quoteId ? `/admin/quotes` : undefined;
  }
};

export async function processQuoteLifecycleTick(now = new Date()): Promise<GenericTickResult> {
  // All telemetry below is count-only. In particular, no CalendarItem id, quote id, recipient,
  // address, or provider error text reaches runtime logs.
  const startedAt = Date.now();
  const failureReasons: Record<GenericReminderFailureReason, number> = {
    still_applies_error: 0,
    recipient_resolution_error: 0,
    content_build_error: 0,
    action_url_error: 0,
    missing_external_recipient: 0,
    no_active_internal_recipients: 0,
    external_send_error: 0,
    internal_notification_write_error: 0,
    mark_sent_error: 0,
    failure_state_write_error: 0,
    unknown: 0
  };
  const result = await runGenericReminderTick(
    now,
    syncQuoteLifecycleReminders,
    {
      ...options,
      onFailure: (reason) => { failureReasons[reason] += 1; }
    }
  );
  const elapsedMs = Date.now() - startedAt;
  if (result.failed) {
    console.warn(JSON.stringify({
      event: 'quote_lifecycle_failure_summary',
      failed: result.failed,
      failureReasons
    }));
  }
  if (elapsedMs >= 500) {
    console.warn(JSON.stringify({ event: 'quote_lifecycle_tick_timing', elapsedMs, ...result }));
  }
  return result;
}
