import { Role } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { ProductionPlan } from '../production/production.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { dueDateKey } from '../../utils/argentina-date';
import { idOf, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

// Symmetric to production-reminders.service.ts (which nudges "no hay plan generado" before the
// event). This one nudges the other end of the same gap: the event already happened and someone
// forgot to click "Cerrar producción" — the plan can sit at 'checked' (every item done) forever
// because closing is a separate, explicit action (production.routes.ts POST /plans/:id/close).
const REMINDER_STAGES = [1, 3];
const OPEN_PLAN_STATUSES = ['pending', 'in_progress', 'ready', 'blocked', 'checked'];

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function findPendingClosePlans(now: Date, olderThanDays: number): Promise<any[]> {
  const threshold = new Date(now.getTime() - olderThanDays * 86_400_000);
  return ProductionPlan.find({ deletedAt: null, isCurrent: true, status: { $in: OPEN_PLAN_STATUSES }, eventDate: { $lte: threshold } })
    .select('_id eventDate salonId eventId')
    .populate('eventId', 'eventName status')
    .lean();
}

async function syncProductionPendingCloseReminders(now: Date): Promise<number> {
  let synced = 0;
  for (const olderThanDays of REMINDER_STAGES) {
    const plans = await findPendingClosePlans(now, olderThanDays);
    for (const plan of plans as any[]) {
      // Belt-and-suspenders: events.routes.ts now cancels the plan when the event is
      // cancelled/lost, but this guards plans left over from before that fix shipped.
      if (!plan.eventId || ['cancelled', 'lost'].includes(plan.eventId.status)) continue;
      const salon: any = plan.salonId
        ? await Salon.findOne({ _id: plan.salonId, deletedAt: null }).select('managerUserId').lean()
        : undefined;
      await CalendarItem.findOneAndUpdate(
        { automationKey: `production_pending_close:${plan._id}:d${olderThanDays}` },
        {
          $set: {
            type: 'reminder',
            source: 'system',
            title: `Producción sin cerrar (D+${olderThanDays}) — ${plan.eventId.eventName || 'evento'}`,
            description: `El evento del ${dueDateKey(plan.eventDate)} ya pasó y su plan de producción todavía no se cerró.`,
            startAt: now,
            allDay: false,
            status: 'scheduled',
            priority: olderThanDays >= 3 ? 'high' : 'normal',
            visibility: 'private',
            eventId: plan.eventId._id,
            salonId: plan.salonId,
            assignedToUserId: idOf(salon?.managerUserId),
            metadata: { productionPendingClose: true, olderThanDays, productionPlanId: plan._id }
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
  const planId = idOf(item?.metadata?.productionPlanId);
  if (!planId) return false;
  const plan: any = await ProductionPlan.findOne({ _id: planId, deletedAt: null }).select('status').lean();
  return Boolean(plan) && OPEN_PLAN_STATUSES.includes(plan.status);
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
  domainKey: 'productionPendingClose',
  notificationType: 'production_pending_close',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: (item: any) => {
    const planId = idOf(item?.metadata?.productionPlanId);
    return planId ? `/admin/production/${planId}` : '/admin/production';
  }
};

export async function processProductionPendingCloseTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncProductionPendingCloseReminders, options);
}
