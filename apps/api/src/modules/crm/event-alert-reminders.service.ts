import { Event } from './crm.models';
import { idOf, runGenericReminderTick, type GenericReminderOptions, type GenericTickResult } from './reminder-engine';

const EVENT_TERMINAL_STATUSES = new Set(['cancelled', 'lost']);

// event-alert-calendar-sync.service.ts already keeps these CalendarItems in sync whenever the
// event's task plan is saved — there is nothing to reconcile here on a schedule, only pending
// deliveries to claim.
async function noSync(): Promise<number> {
  return 0;
}

async function stillApplies(item: any): Promise<boolean> {
  const eventId = idOf(item?.eventId);
  if (!eventId) return false;
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).select('_id status').lean();
  return Boolean(event) && !EVENT_TERMINAL_STATUSES.has(String(event.status));
}

const options: GenericReminderOptions = {
  domainKey: 'eventAlert',
  notificationType: 'event_alert_reminder',
  stillApplies,
  // The user asked for these to notify whoever created the alert, specifically.
  resolveRecipients: (item: any) => ({ kind: 'internal', userIds: [String(item.createdBy)] }),
  buildContent: (item: any) => ({
    subject: item.title,
    text: item.description || item.title
  }),
  actionUrl: (item: any) => {
    const eventId = idOf(item?.eventId);
    return eventId ? `/admin/events/${eventId}` : undefined;
  }
};

export async function processEventAlertReminderTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, noSync, options);
}
