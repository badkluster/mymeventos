import { Role } from '@mym/shared';
import { CalendarItem, Event } from './crm.models';
import { ProductionPlan } from '../production/production.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { dueDateKey } from '../../utils/argentina-date';
import { idOf, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

const EVENT_TERMINAL_STATUSES = ['cancelled', 'lost'];
// Narrower than GET /production/candidates's 120-day browsing window (production.routes.ts) —
// this is a "you're running out of time" nudge, not a full candidates list.
const WINDOW_DAYS = 20;

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function syncMissingProductionReminders(now: Date): Promise<number> {
  const until = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
  const plans: any[] = await ProductionPlan.find({ deletedAt: null, isCurrent: true }).select('eventId').lean();
  const events: any[] = await Event.find({
    deletedAt: null,
    eventDate: { $gte: now, $lt: until },
    status: { $nin: EVENT_TERMINAL_STATUSES },
    _id: { $nin: plans.map((plan: any) => plan.eventId) }
  }).select('_id eventName salonId eventDate').lean();

  let synced = 0;
  for (const event of events) {
    const salon: any = event.salonId
      ? await Salon.findOne({ _id: event.salonId, deletedAt: null }).select('managerUserId').lean()
      : undefined;
    await CalendarItem.findOneAndUpdate(
      { automationKey: `production_missing:${event._id}` },
      {
        $set: {
          type: 'reminder',
          source: 'system',
          title: `Falta generar producción — ${event.eventName || 'evento'}`,
          description: `El evento del ${dueDateKey(event.eventDate)} todavía no tiene un plan de producción vigente.`,
          startAt: now,
          allDay: false,
          status: 'scheduled',
          priority: 'normal',
          visibility: 'private',
          eventId: event._id,
          salonId: event.salonId,
          assignedToUserId: idOf(salon?.managerUserId),
          metadata: { productionMissing: true }
        },
        $setOnInsert: {
          notification: { enabled: true, channels: ['system', 'email'], sendAt: now, status: 'scheduled', attemptCount: 0 }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    synced += 1;
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const eventId = idOf(item?.eventId);
  if (!eventId) return false;
  const [event, plan] = await Promise.all([
    Event.findOne({ _id: eventId, deletedAt: null, status: { $nin: EVENT_TERMINAL_STATUSES } }).select('_id').lean(),
    ProductionPlan.findOne({ eventId, deletedAt: null, isCurrent: true }).select('_id').lean()
  ]);
  return Boolean(event) && !plan;
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
  domainKey: 'productionMissing',
  notificationType: 'production_missing',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: () => '/admin/production'
};

export async function processProductionMissingTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncMissingProductionReminders, options);
}
