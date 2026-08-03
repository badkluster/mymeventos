import { Role } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { WorkSession } from '../attendance/attendance.models';
import { User } from '../users/user.model';
import { runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

// Grace period before nagging — long enough that a still-open, not-yet-due payroll period never
// triggers this, only genuinely stale approved sessions no one has settled.
const PENDING_GRACE_DAYS = 35;

function pendingSessionsQuery(userId?: string) {
  return {
    ...(userId ? { userId } : {}),
    status: { $in: ['completed', 'adjusted'] },
    requiresReview: false,
    payrollApprovalStatus: 'approved',
    $or: [{ payrollSettlementId: null }, { payrollSettlementId: { $exists: false } }],
    startedAt: { $lte: new Date(Date.now() - PENDING_GRACE_DAYS * 86_400_000) }
  };
}

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function syncPayrollPendingAlerts(now: Date): Promise<number> {
  const userIds: string[] = (await WorkSession.distinct('userId', pendingSessionsQuery())).map((id: any) => String(id));

  let synced = 0;
  for (const userId of userIds) {
    const employee: any = await User.findOne({ _id: userId, deletedAt: null }).select('fullName firstName lastName').lean();
    const name = employee?.fullName || [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'un empleado';
    await CalendarItem.findOneAndUpdate(
      { automationKey: `payroll_pending:${userId}` },
      {
        $set: {
          type: 'reminder',
          source: 'system',
          title: `Liquidación pendiente de generar — ${name}`,
          description: `${name} tiene jornadas aprobadas hace más de ${PENDING_GRACE_DAYS} días sin una liquidación generada.`,
          startAt: now,
          allDay: false,
          status: 'scheduled',
          priority: 'normal',
          visibility: 'private',
          metadata: { payrollPending: true, employeeId: userId }
        },
        $setOnInsert: {
          notification: { enabled: true, channels: ['system', 'email'], sendAt: now, status: 'scheduled', attemptCount: 0 }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    synced += 1;
  }

  await CalendarItem.updateMany(
    {
      deletedAt: null,
      'metadata.payrollPending': true,
      'metadata.employeeId': { $nin: userIds },
      'notification.status': { $in: ['pending', 'scheduled', 'failed'] }
    },
    {
      $set: { status: 'cancelled', 'notification.status': 'cancelled' },
      $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1 }
    }
  );

  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const employeeId = item?.metadata?.employeeId;
  if (!employeeId) return false;
  const count = await WorkSession.countDocuments(pendingSessionsQuery(String(employeeId)));
  return count > 0;
}

async function resolveRecipients(): Promise<GenericReminderRecipients> {
  return { kind: 'internal', userIds: await fallbackRecipients() };
}

function buildContent(item: any) {
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'payrollPending',
  notificationType: 'payroll_pending',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: () => '/admin/payroll'
};

export async function processPayrollPendingTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncPayrollPendingAlerts, options);
}
