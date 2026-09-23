import { Role, WorkSessionStatus } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { WorkSession } from '../attendance/attendance.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { idOf, uniqueIds, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

const OPEN_SESSION_HOURS = 8;

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function syncOpenSessionAlerts(now: Date): Promise<number> {
  const startedTiming = Date.now();
  const cutoff = new Date(now.getTime() - OPEN_SESSION_HOURS * 3_600_000);
  const sessions: any[] = await WorkSession.find({ status: WorkSessionStatus.ACTIVE, startedAt: { $lte: cutoff } })
    .select('_id userId salonId startedAt').lean();

  // Batch the per-session `Salon.findOne` this loop used to run once per candidate.
  const salonIds = uniqueIds(sessions.map((session: any) => session.salonId));
  const salons = salonIds.length
    ? await Salon.find({ _id: { $in: salonIds }, deletedAt: null }).select('managerUserId').lean()
    : [];
  const managerUserIdBySalon = new Map(salons.map((salon: any) => [idOf(salon._id)!, idOf(salon.managerUserId)]));

  let synced = 0;
  for (const session of sessions) {
    const managerUserId = session.salonId ? managerUserIdBySalon.get(idOf(session.salonId)!) : undefined;
    await CalendarItem.findOneAndUpdate(
      { automationKey: `open_session:${session._id}` },
      {
        $set: {
          type: 'alert',
          source: 'system',
          title: 'Jornada abierta sin fichaje de salida',
          description: `Una jornada lleva abierta más de ${OPEN_SESSION_HOURS} horas sin marcar salida. Revisala y corregila si hace falta antes de que distorsione la liquidación.`,
          startAt: now,
          allDay: false,
          status: 'scheduled',
          priority: 'high',
          visibility: 'private',
          salonId: session.salonId,
          assignedToUserId: managerUserId,
          metadata: { openWorkSession: true, workSessionId: String(session._id) }
        },
        $setOnInsert: {
          notification: { enabled: true, channels: ['system', 'email'], sendAt: now, status: 'scheduled', attemptCount: 0 }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    synced += 1;
  }
  const elapsedMs = Date.now() - startedTiming;
  if (elapsedMs >= 500) {
    console.warn(JSON.stringify({
      event: 'open_work_session_tick_timing',
      elapsedMs,
      candidateCount: sessions.length,
      salonCount: salonIds.length,
      synced
    }));
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const sessionId = item?.metadata?.workSessionId;
  if (!sessionId) return false;
  const session: any = await WorkSession.findOne({ _id: sessionId }).select('status').lean();
  return Boolean(session) && session.status === WorkSessionStatus.ACTIVE;
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
  domainKey: 'openWorkSession',
  notificationType: 'open_work_session',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: () => '/admin/attendance'
};

export async function processOpenSessionAlertTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncOpenSessionAlerts, options);
}
