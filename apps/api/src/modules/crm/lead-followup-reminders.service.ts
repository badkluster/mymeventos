import { Role } from '@mym/shared';
import { CalendarItem, Lead } from './crm.models';
import { User } from '../users/user.model';
import { idOf, runGenericReminderTick, type GenericReminderOptions, type GenericReminderRecipients, type GenericTickResult } from './reminder-engine';

const UNATTENDED_HOURS = 48;
const ESCALATION_DAYS = 5;

async function fallbackRecipients(): Promise<string[]> {
  const users = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } }).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function syncLeadFollowUpReminders(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - UNATTENDED_HOURS * 3_600_000);
  const leads: any[] = await Lead.find({ deletedAt: null, status: 'new', createdAt: { $lte: cutoff } })
    .select('_id assignedUserId createdAt fullName').lean();
  let synced = 0;
  for (const lead of leads) {
    const ageDays = (now.getTime() - new Date(lead.createdAt).getTime()) / 86_400_000;
    const name = lead.fullName || 'sin nombre';
    const stages: Array<{ key: string; title: string; escalate: boolean }> = [
      { key: 'unattended_48h', title: `Lead sin atender hace 48 horas: ${name}`, escalate: false }
    ];
    if (ageDays >= ESCALATION_DAYS) stages.push({ key: 'unattended_5d', title: `Lead sin atender hace 5 días: ${name}`, escalate: true });

    for (const stage of stages) {
      const automationKey = `lead_followup:${lead._id}:${stage.key}`;
      await CalendarItem.findOneAndUpdate(
        { automationKey },
        {
          $set: {
            type: 'reminder',
            source: 'system',
            title: stage.title,
            description: 'Revisá y contactá al lead antes de que se enfríe la oportunidad.',
            startAt: now,
            allDay: false,
            status: 'scheduled',
            priority: stage.escalate ? 'high' : 'normal',
            visibility: 'private',
            leadId: lead._id,
            assignedToUserId: idOf(lead.assignedUserId),
            metadata: { leadFollowUp: true, escalate: stage.escalate }
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
  const leadId = idOf(item?.leadId);
  if (!leadId) return false;
  const lead: any = await Lead.findOne({ _id: leadId, deletedAt: null }).select('_id status').lean();
  // Once the lead moves past "new" (contacted, converted, lost, etc.) there is nothing left to
  // chase — cancel rather than notify.
  return Boolean(lead) && lead.status === 'new';
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  if (item?.metadata?.escalate) return { kind: 'internal', userIds: await fallbackRecipients() };
  const assignedId = idOf(item.assignedToUserId);
  if (assignedId) return { kind: 'internal', userIds: [assignedId] };
  return { kind: 'internal', userIds: await fallbackRecipients() };
}

function buildContent(item: any) {
  return { subject: item.title, text: item.description || item.title };
}

const options: GenericReminderOptions = {
  domainKey: 'leadFollowUp',
  notificationType: 'lead_followup',
  stillApplies,
  resolveRecipients,
  buildContent,
  actionUrl: (item: any) => {
    const leadId = idOf(item?.leadId);
    return leadId ? `/admin/leads` : undefined;
  }
};

export async function processLeadFollowUpTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncLeadFollowUpReminders, options);
}
