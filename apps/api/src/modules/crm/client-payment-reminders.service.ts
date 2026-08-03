import { CalendarItem, Contract, Customer, Event } from './crm.models';
import { renderBrandedEmail } from '../email/email-template.util';
import {
  addDaysToDateKey,
  argentinaDateKey,
  argentinaMidnight,
  dueDateKey
} from '../../utils/argentina-date';
import {
  idOf,
  runGenericReminderTick,
  type GenericReminderOptions,
  type GenericReminderRecipients,
  type GenericTickResult
} from './reminder-engine';
import { planFor, isOpenInstallment, installmentDueDateKey, remainingInstallmentAmount } from './financial-reminders.service';

// Client-facing counterpart to financial-reminders.service.ts, which is internal-only by
// design. Deliberately simpler: no overdue/escalation stages — dunning a client automatically is
// what the human-supervised "Contacto de cobro" flow is for (payment-collection.routes.ts). This
// is only a friendly heads-up before/on the due date, gated per contract by
// Contract.clientReminderOptIn.
const EVENT_TERMINAL_STATUSES = new Set(['cancelled', 'lost']);
const BALANCE_LEAD_DAYS = 15;

type ClientRule = { key: 'due_5_days' | 'due_1_day' | 'due_today'; daysUntilDue: number; title: string };
const clientInstallmentRules: ClientRule[] = [
  { key: 'due_5_days', daysUntilDue: 5, title: 'Recordatorio de pago próximo' },
  { key: 'due_1_day', daysUntilDue: 1, title: 'Tu pago vence mañana' },
  { key: 'due_today', daysUntilDue: 0, title: 'Tu pago vence hoy' }
];

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

async function upsertClientReminderItem(input: {
  automationKey: string;
  event: any;
  contract: any;
  title: string;
  description: string;
  sendAtKey: string;
  metadataExtra: Record<string, unknown>;
}): Promise<void> {
  const sendAt = argentinaMidnight(input.sendAtKey);
  await CalendarItem.findOneAndUpdate(
    { automationKey: input.automationKey },
    {
      $set: {
        type: 'reminder',
        source: 'system',
        title: input.title,
        description: input.description,
        startAt: sendAt,
        allDay: true,
        priority: 'normal',
        visibility: 'private',
        eventId: input.event._id,
        customerId: idOf(input.event.customerId) ?? idOf(input.contract.customerId),
        contractId: input.contract._id,
        salonId: input.event.salonId,
        metadata: { clientPaymentReminder: true, ...input.metadataExtra }
      },
      $setOnInsert: {
        status: 'scheduled',
        notification: { enabled: true, channels: ['email'], sendAt, status: 'scheduled', attemptCount: 0 }
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function cancelClientReminderItems(filter: Record<string, unknown>): Promise<void> {
  await CalendarItem.updateMany({
    deletedAt: null,
    source: 'system',
    'metadata.clientPaymentReminder': true,
    ...filter,
    'notification.status': { $in: ['pending', 'scheduled', 'failed'] }
  }, {
    $set: { status: 'cancelled', 'notification.status': 'cancelled' },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1 }
  });
}

async function syncClientPaymentReminders(now: Date): Promise<number> {
  const todayKey = argentinaDateKey(now);
  const contracts: any[] = await Contract.find({ deletedAt: null, status: 'approved', clientReminderOptIn: { $ne: false } })
    .select('_id eventId customerId salonId balanceAmount paymentPlanSnapshot versionNumber createdAt')
    .sort({ eventId: 1, versionNumber: -1, createdAt: -1 })
    .lean();
  if (!contracts.length) return 0;

  const contractByEvent = new Map<string, any>();
  for (const contract of contracts) {
    const eventId = idOf(contract.eventId);
    if (eventId && !contractByEvent.has(eventId)) contractByEvent.set(eventId, contract);
  }
  const eventIds = [...contractByEvent.keys()];
  const events: any[] = eventIds.length ? await Event.find({
    _id: { $in: eventIds },
    deletedAt: null,
    status: { $nin: [...EVENT_TERMINAL_STATUSES] }
  }).select('_id customerId salonId eventName eventType eventDate paymentPlanSnapshot status').lean() : [];

  let synced = 0;
  for (const event of events) {
    const contract = contractByEvent.get(idOf(event._id)!);
    if (!contract) continue;
    const activeKeys: string[] = [];

    for (const installment of planFor(event, contract)) {
      const dueKey = installmentDueDateKey(installment);
      if (!dueKey || dueKey < todayKey || !isOpenInstallment(installment)) continue;
      const installmentId = String(installment.id ?? dueKey);
      for (const rule of clientInstallmentRules) {
        const sendAtKey = addDaysToDateKey(dueKey, -rule.daysUntilDue);
        if (sendAtKey > todayKey) continue;
        const automationKey = `client_payment:installment:${idOf(event._id)}:${installmentId}:${rule.key}:${dueKey}`;
        activeKeys.push(automationKey);
        await upsertClientReminderItem({
          automationKey,
          event,
          contract,
          title: rule.title,
          description: `${installment.label || 'Cuota'} de ${event.eventName || event.eventType || 'tu evento'} por ${money(remainingInstallmentAmount(installment))}. Vencimiento: ${dueKey}.`,
          sendAtKey,
          metadataExtra: { kind: 'installment', installmentId, dueDateKey: dueKey }
        });
        synced += 1;
      }
    }

    const eventDateKey = dueDateKey(event.eventDate);
    const balance = Number(contract.balanceAmount ?? 0);
    if (eventDateKey && balance > 0 && eventDateKey >= todayKey) {
      const scheduledKey = addDaysToDateKey(eventDateKey, -BALANCE_LEAD_DAYS);
      const sendAtKey = scheduledKey < todayKey ? todayKey : scheduledKey;
      const automationKey = `client_payment:balance:${idOf(contract._id)}:${eventDateKey}`;
      activeKeys.push(automationKey);
      await upsertClientReminderItem({
        automationKey,
        event,
        contract,
        title: 'Saldo pendiente antes de tu evento',
        description: `Tenés un saldo pendiente de ${money(balance)} para tu evento del ${eventDateKey}.`,
        sendAtKey,
        metadataExtra: { kind: 'balance', dueDateKey: eventDateKey }
      });
      synced += 1;
    }

    await cancelClientReminderItems({ eventId: event._id, automationKey: { $nin: activeKeys } });
  }

  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  if (item?.metadata?.clientPaymentReminder !== true) return false;
  const contractId = idOf(item?.contractId);
  const eventId = idOf(item?.eventId);
  const [contract, event] = await Promise.all([
    contractId ? Contract.findOne({ _id: contractId, deletedAt: null, status: 'approved', clientReminderOptIn: { $ne: false } }).select('_id balanceAmount paymentPlanSnapshot').lean() : Promise.resolve(undefined),
    eventId ? Event.findOne({ _id: eventId, deletedAt: null }).select('_id status paymentPlanSnapshot').lean() : Promise.resolve(undefined)
  ]);
  if (!contract || !event || EVENT_TERMINAL_STATUSES.has(String((event as any).status))) return false;
  if (item.metadata.kind === 'balance') return Number((contract as any).balanceAmount ?? 0) > 0;
  const plan = planFor(event, contract);
  const installment = plan.find((candidate: any) => String(candidate?.id ?? '') === String(item.metadata.installmentId));
  return isOpenInstallment(installment) && installmentDueDateKey(installment) === item.metadata.dueDateKey;
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  const customerId = idOf(item?.customerId);
  const customer: any = customerId ? await Customer.findOne({ _id: customerId, deletedAt: null }).select('email').lean() : undefined;
  return { kind: 'external', to: customer?.email ?? '' };
}

function buildContent(item: any) {
  const html = renderBrandedEmail({
    eyebrow: 'Recordatorio de pago',
    heading: item.title,
    intro: item.description
  });
  return { subject: item.title, text: item.description, html };
}

const options: GenericReminderOptions = {
  domainKey: 'clientPaymentReminder',
  notificationType: 'client_payment_reminder',
  stillApplies,
  resolveRecipients,
  buildContent
};

export async function processClientPaymentReminderTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncClientPaymentReminders, options);
}
