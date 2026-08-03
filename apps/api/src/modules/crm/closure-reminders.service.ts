import { Role } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { findEventsWithPendingClosure } from '../event-closure/pending-closures';
import { idOf, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

const REMINDER_STAGES = [1, 7];

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function syncClosurePendingReminders(now: Date): Promise<number> {
  let synced = 0;
  for (const olderThanDays of REMINDER_STAGES) {
    const events = await findEventsWithPendingClosure(now, olderThanDays);
    for (const event of events as any[]) {
      const salon: any = event.salonId
        ? await Salon.findOne({ _id: event.salonId, deletedAt: null }).select('managerUserId').lean()
        : undefined;
      await CalendarItem.findOneAndUpdate(
        { automationKey: `closure_pending:${event._id}:d${olderThanDays}` },
        {
          $set: {
            type: 'reminder',
            source: 'system',
            title: `Cierre de evento pendiente (D+${olderThanDays}) — ${event.eventName || 'evento'}`,
            description: 'El evento ya pasó y su cierre operativo/financiero/administrativo todavía no está completo.',
            startAt: now,
            allDay: false,
            status: 'scheduled',
            priority: olderThanDays >= 7 ? 'high' : 'normal',
            visibility: 'private',
            eventId: event._id,
            salonId: event.salonId,
            assignedToUserId: idOf(salon?.managerUserId),
            metadata: { closurePending: true, olderThanDays }
          },
          $setOnInsert: {
            notification: { enabled: true, channels: ['system', 'email'], sendAt: now, status: 'scheduled', attemptCount: 0 }
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      synced += 1;
    }
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const eventId = idOf(item?.eventId);
  if (!eventId) return false;
  // olderThanDays: 0 is a superset of both D+1 and D+7 stages — correct regardless of which
  // stage created this particular item, since a closed event drops out of every threshold.
  const pending = await findEventsWithPendingClosure(new Date(), 0);
  return pending.some((event: any) => String(event._id) === eventId);
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  const assignedId = idOf(item.assignedToUserId);
  if (assignedId) return { kind: 'internal', userIds: [assignedId] };
  return { kind: 'internal', userIds: await fallbackRecipients() };
}

function buildContent(item: any) {
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'closurePending',
  notificationType: 'closure_pending',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: (item: any) => {
    const eventId = idOf(item?.eventId);
    return eventId ? `/admin/events/${eventId}/closure` : undefined;
  }
};

export async function processClosurePendingTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncClosurePendingReminders, options);
}
