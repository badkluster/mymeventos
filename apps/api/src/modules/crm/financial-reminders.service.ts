import { Role } from '@mym/shared';
import { CalendarItem, Contract, Event, Lead, Payment } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { Notification } from '../notifications/notification.model';
import { sendEmail } from '../email/email.service';
import {
  addDaysToDateKey,
  argentinaDateKey,
  argentinaMidnight,
  daysBetweenDateKeys,
  dueDateKey
} from '../../utils/argentina-date';

const FINANCIAL_LOCK_MS = 10 * 60_000;
const FINANCIAL_RETRY_DELAY_MS = 60 * 60_000;
const MAX_REMINDERS_PER_TICK = 50;
const EVENT_TERMINAL_STATUSES = new Set(['cancelled', 'lost']);
const PAYMENT_TERMINAL_STATUSES = new Set(['paid', 'cancelled', 'refunded']);
const INSTALLMENT_TERMINAL_STATUSES = new Set(['paid', 'cancelled']);

type RecipientMode = 'normal' | 'balance' | 'escalation';
type ReminderRule = {
  key: 'due_7_days' | 'due_3_days' | 'due_today' | 'overdue' | 'second_notice' | 'escalation';
  daysUntilDue: number;
  title: string;
  priority: 'normal' | 'high' | 'critical';
  recipientMode: RecipientMode;
};

const paymentRules: ReminderRule[] = [
  { key: 'due_7_days', daysUntilDue: 7, title: 'Pago por vencer en 7 días', priority: 'normal', recipientMode: 'normal' },
  { key: 'due_3_days', daysUntilDue: 3, title: 'Pago por vencer en 3 días', priority: 'high', recipientMode: 'normal' },
  { key: 'due_today', daysUntilDue: 0, title: 'Pago vence hoy', priority: 'high', recipientMode: 'normal' },
  { key: 'overdue', daysUntilDue: -1, title: 'Pago vencido', priority: 'critical', recipientMode: 'normal' },
  { key: 'second_notice', daysUntilDue: -3, title: 'Segundo aviso de pago vencido', priority: 'critical', recipientMode: 'normal' },
  { key: 'escalation', daysUntilDue: -7, title: 'Escalamiento por pago vencido', priority: 'critical', recipientMode: 'escalation' }
];

const balanceRule = {
  key: 'event_balance_15_days',
  title: 'Saldo pendiente a 15 días del evento',
  priority: 'high' as const,
  recipientMode: 'balance' as const
};

type ReminderContext = {
  source: 'installment' | 'payment' | 'balance';
  obligationKey: string;
  automationKey: string;
  rule: string;
  title: string;
  description: string;
  priority: 'normal' | 'high' | 'critical';
  sendAtKey: string;
  dueDateKey?: string;
  event: any;
  contract: any;
  payment?: any;
  installment?: any;
  remainingAmount: number;
  recipientMode: RecipientMode;
};

type RecipientResolution = { userIds: string[]; primaryUserId?: string };

type FinancialTickResult = {
  synced: number;
  delivered: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
};

function idOf(value: unknown): string | undefined {
  const item: any = value;
  const raw = item?._id ?? item;
  return raw?.toString?.() ?? (typeof raw === 'string' ? raw : undefined);
}

function uniqueIds(values: Array<unknown>): string[] {
  return [...new Set(values.map(idOf).filter((value): value is string => Boolean(value)))];
}

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function humanDate(value?: string): string {
  if (!value) return 'sin fecha definida';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00.000Z`));
}

function remainingInstallmentAmount(installment: any): number {
  return Math.max(0, Number(installment?.amount ?? 0) - Number(installment?.paidAmount ?? 0));
}

function isOpenInstallment(installment: any): boolean {
  return Boolean(installment)
    && !INSTALLMENT_TERMINAL_STATUSES.has(String(installment.status ?? ''))
    && remainingInstallmentAmount(installment) > 0;
}

function eventTitle(event: any): string {
  return event?.eventName || event?.eventType || 'Evento sin nombre';
}

function installmentDueDateKey(installment: any): string | undefined {
  return dueDateKey(installment?.paymentWindowEnd ?? installment?.dueDate);
}

/**
 * We do not backfill every historical warning on the first deploy. If a tick was
 * unavailable, it catches up with the current escalation level only; future
 * stages remain scheduled normally.
 */
function pendingRulesForDueDate(dueKey: string, todayKey: string): Array<{ rule: ReminderRule; sendAtKey: string }> {
  const daysUntilDue = daysBetweenDateKeys(todayKey, dueKey);
  if (daysUntilDue > 7) return paymentRules.map((rule) => ({ rule, sendAtKey: addDaysToDateKey(dueKey, -rule.daysUntilDue) }));
  if (daysUntilDue >= 0) return paymentRules
    .filter((rule) => rule.daysUntilDue <= daysUntilDue)
    .map((rule) => ({ rule, sendAtKey: addDaysToDateKey(dueKey, -rule.daysUntilDue) }));
  if (daysUntilDue >= -2) return paymentRules
    .filter((rule) => rule.key === 'overdue' || rule.daysUntilDue <= -3)
    .map((rule) => ({ rule, sendAtKey: rule.key === 'overdue' ? todayKey : addDaysToDateKey(dueKey, -rule.daysUntilDue) }));
  if (daysUntilDue >= -6) return paymentRules
    .filter((rule) => rule.key === 'second_notice' || rule.key === 'escalation')
    .map((rule) => ({ rule, sendAtKey: rule.key === 'second_notice' ? todayKey : addDaysToDateKey(dueKey, -rule.daysUntilDue) }));
  const escalation = paymentRules.find((rule) => rule.key === 'escalation')!;
  return [{ rule: escalation, sendAtKey: todayKey }];
}

function calendarMetadata(context: ReminderContext, recipients: RecipientResolution): Record<string, unknown> {
  const installmentId = context.installment?.id ? String(context.installment.id) : undefined;
  return {
    financialReminder: true,
    source: context.source,
    rule: context.rule,
    obligationKey: context.obligationKey,
    dueDateKey: context.dueDateKey,
    planInstallmentId: installmentId,
    remainingAmount: context.remainingAmount,
    recipientUserIds: recipients.userIds,
    recipientMode: context.recipientMode
  };
}

async function activeUsersById(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  return User.find({ _id: { $in: ids }, active: true, deletedAt: null })
    .select('_id roles notificationPreferences email')
    .lean();
}

async function fallbackFinancialUsers(): Promise<any[]> {
  return User.find({
    active: true,
    deletedAt: null,
    roles: { $in: [Role.ADMIN, Role.MANAGER] }
  }).select('_id roles notificationPreferences email').lean();
}

async function resolveFinancialRecipients(event: any, mode: RecipientMode): Promise<RecipientResolution> {
  const leadId = idOf(event?.leadId) ?? idOf(event?.sourceLeadId);
  const salonId = idOf(event?.salonId);
  const [lead, salon] = await Promise.all([
    leadId ? Lead.findOne({ _id: leadId, deletedAt: null }).select('assignedUserId').lean() : Promise.resolve(undefined),
    salonId ? Salon.findOne({ _id: salonId, deletedAt: null, active: true }).select('managerUserId').lean() : Promise.resolve(undefined)
  ]);
  const leadAssigneeId = idOf((lead as any)?.assignedUserId);
  const salonManagerId = idOf((salon as any)?.managerUserId);
  let directUsers = await activeUsersById(uniqueIds([leadAssigneeId, salonManagerId]));

  if (!directUsers.length && salonId) {
    directUsers = await User.find({
      active: true,
      deletedAt: null,
      roles: Role.SALON_MANAGER,
      managedSalonIds: salonId
    }).select('_id roles notificationPreferences email').lean();
  }

  const directIds = uniqueIds(directUsers.map((user: any) => user._id));
  const leadIsActive = directIds.includes(leadAssigneeId ?? '');
  const managerIsActive = directIds.includes(salonManagerId ?? '');
  const primaryUserId = leadIsActive ? leadAssigneeId : managerIsActive ? salonManagerId : directIds[0];
  const activeSalonManagerId = managerIsActive ? salonManagerId : undefined;

  if (mode === 'normal') {
    if (primaryUserId) return { userIds: [primaryUserId], primaryUserId };
    const fallback = await fallbackFinancialUsers();
    return { userIds: uniqueIds(fallback.map((user: any) => user._id)) };
  }

  if (mode === 'balance') {
    const userIds = uniqueIds([primaryUserId, activeSalonManagerId]);
    if (userIds.length) return { userIds, primaryUserId };
    const fallback = await fallbackFinancialUsers();
    return { userIds: uniqueIds(fallback.map((user: any) => user._id)) };
  }

  const escalationUsers = await fallbackFinancialUsers();
  return {
    userIds: uniqueIds([primaryUserId, activeSalonManagerId, ...escalationUsers.map((user: any) => user._id)]),
    primaryUserId
  };
}

const cancellableNotificationStatuses = ['pending', 'scheduled', 'failed'];

async function cancelFinancialItems(filter: Record<string, unknown>): Promise<void> {
  await CalendarItem.updateMany({
    deletedAt: null,
    source: 'system',
    'metadata.financialReminder': true,
    ...filter,
    'notification.status': { $in: cancellableNotificationStatuses }
  }, {
    $set: { status: 'cancelled', 'notification.status': 'cancelled' },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1 }
  });
}

async function cancelStaleObligationItems(obligationKey: string, activeKeys: string[]): Promise<void> {
  await cancelFinancialItems({
    'metadata.obligationKey': obligationKey,
    automationKey: { $nin: activeKeys }
  });
}

async function cancelObligationItems(obligationKey: string): Promise<void> {
  await cancelStaleObligationItems(obligationKey, []);
}

async function upsertFinancialCalendarItem(context: ReminderContext): Promise<void> {
  const recipients = await resolveFinancialRecipients(context.event, context.recipientMode);
  const eventId = idOf(context.event?._id);
  const contractId = idOf(context.contract?._id);
  const paymentId = idOf(context.payment?._id);
  const salonId = idOf(context.event?.salonId) ?? idOf(context.contract?.salonId);
  const customerId = idOf(context.event?.customerId) ?? idOf(context.contract?.customerId);
  const recipientUserIds = recipients.userIds;
  const metadata = calendarMetadata(context, recipients);

  const filter = { automationKey: context.automationKey };
  // A payment plan can be corrected after a prior cancellation. Re-arm only a
  // system-cancelled, unsent stage; already sent stages remain immutable.
  await CalendarItem.updateOne({ ...filter, 'notification.status': 'cancelled' }, {
    $set: {
      status: 'scheduled',
      'notification.enabled': true,
      'notification.status': 'scheduled',
      'notification.sendAt': argentinaMidnight(context.sendAtKey)
    },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1, 'notification.lastError': 1 }
  });
  const update = {
      $set: {
        type: 'payment_window',
        title: context.title,
        description: context.description,
        startAt: argentinaMidnight(context.dueDateKey ?? context.sendAtKey),
        allDay: true,
        priority: context.priority,
        visibility: 'shared',
        salonId,
        assignedToUserId: recipients.primaryUserId ?? recipientUserIds[0],
        customerId,
        eventId,
        contractId,
        paymentId,
        source: 'system',
        metadata
      },
      $setOnInsert: {
        status: 'scheduled',
        notification: {
          enabled: true,
          channels: ['system', 'email'],
          offsetValue: 0,
          offsetUnit: 'days',
          sendAt: argentinaMidnight(context.sendAtKey),
          status: 'scheduled',
          attemptCount: 0
        }
      }
    };
  try {
    await CalendarItem.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error: any) {
    // A unique key race can occur when GitHub Actions and the Vercel fallback
    // overlap. The winner inserted the item, so a normal update is sufficient.
    if (error?.code !== 11000) throw error;
    await CalendarItem.findOneAndUpdate(filter, { $set: update.$set }, { new: true });
  }
}

function planFor(event: any, contract: any): any[] {
  if (Array.isArray(event?.paymentPlanSnapshot) && event.paymentPlanSnapshot.length) return event.paymentPlanSnapshot;
  return Array.isArray(contract?.paymentPlanSnapshot) ? contract.paymentPlanSnapshot : [];
}

function installmentContext(event: any, contract: any, installment: any, rule: ReminderRule, sendAtKey: string, dueKey: string): ReminderContext {
  const eventId = idOf(event._id)!;
  const installmentId = String(installment.id ?? dueKey);
  const obligationKey = `financial:installment:${eventId}:${installmentId}`;
  const remainingAmount = remainingInstallmentAmount(installment);
  const label = installment.label || 'Cuota programada';
  return {
    source: 'installment',
    obligationKey,
    automationKey: `${obligationKey}:${rule.key}:${dueKey}`,
    rule: rule.key,
    title: rule.title,
    description: `${label} de ${eventTitle(event)} por ${money(remainingAmount)}. Vencimiento: ${humanDate(dueKey)}.`,
    priority: rule.priority,
    sendAtKey,
    dueDateKey: dueKey,
    event,
    contract,
    installment,
    remainingAmount,
    recipientMode: rule.recipientMode
  };
}

function paymentContext(event: any, contract: any, payment: any, rule: ReminderRule, sendAtKey: string, dueKey: string): ReminderContext {
  const paymentId = idOf(payment._id)!;
  const obligationKey = `financial:payment:${paymentId}`;
  const remainingAmount = Math.max(0, Number(payment.amount ?? 0));
  return {
    source: 'payment',
    obligationKey,
    automationKey: `${obligationKey}:${rule.key}:${dueKey}`,
    rule: rule.key,
    title: rule.title,
    description: `${payment.paymentNumber || 'Pago pendiente'} de ${eventTitle(event)} por ${money(remainingAmount)}. Vencimiento: ${humanDate(dueKey)}.`,
    priority: rule.priority,
    sendAtKey,
    dueDateKey: dueKey,
    event,
    contract,
    payment,
    remainingAmount,
    recipientMode: rule.recipientMode
  };
}

function balanceContext(event: any, contract: any, sendAtKey: string, eventDateKey: string): ReminderContext {
  const contractId = idOf(contract._id)!;
  const remainingAmount = Math.max(0, Number(contract.balanceAmount ?? 0));
  const obligationKey = `financial:balance:${contractId}`;
  return {
    source: 'balance',
    obligationKey,
    automationKey: `${obligationKey}:${balanceRule.key}:${eventDateKey}`,
    rule: balanceRule.key,
    title: balanceRule.title,
    description: `${eventTitle(event)} tiene un saldo pendiente de ${money(remainingAmount)}. Fecha del evento: ${humanDate(eventDateKey)}.`,
    priority: balanceRule.priority,
    sendAtKey,
    dueDateKey: eventDateKey,
    event,
    contract,
    remainingAmount,
    recipientMode: balanceRule.recipientMode
  };
}

async function syncFinancialCalendarItems(now: Date): Promise<number> {
  const todayKey = argentinaDateKey(now);
  const contracts: any[] = await Contract.find({ deletedAt: null, status: 'approved' })
    .select('_id eventId customerId salonId balanceAmount paymentPlanSnapshot versionNumber createdAt')
    .sort({ eventId: 1, versionNumber: -1, createdAt: -1 })
    .lean();
  if (!contracts.length) {
    await cancelFinancialItems({});
    return 0;
  }

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
  }).select('_id customerId salonId leadId sourceLeadId eventName eventType eventDate paymentPlanSnapshot status').lean() : [];
  const eventById = new Map(events.map((event: any) => [idOf(event._id)!, event]));
  await cancelFinancialItems({ eventId: { $nin: events.map((event: any) => event._id) } });
  let synced = 0;

  for (const event of events) {
    const contract = contractByEvent.get(idOf(event._id)!);
    if (!contract) continue;
    const installments = planFor(event, contract);
    const activeInstallmentObligationKeys: string[] = [];
    for (const installment of installments) {
      const dueKey = installmentDueDateKey(installment);
      const obligationKey = `financial:installment:${idOf(event._id)}:${String(installment?.id ?? dueKey ?? '')}`;
      if (!dueKey || !isOpenInstallment(installment)) {
        await cancelObligationItems(obligationKey);
        continue;
      }
      activeInstallmentObligationKeys.push(obligationKey);
      const contexts = pendingRulesForDueDate(dueKey, todayKey)
        .map(({ rule, sendAtKey }) => installmentContext(event, contract, installment, rule, sendAtKey, dueKey));
      for (const context of contexts) await upsertFinancialCalendarItem(context);
      await cancelStaleObligationItems(obligationKey, contexts.map((context) => context.automationKey));
      synced += contexts.length;
    }
    await cancelFinancialItems({
      eventId: event._id,
      'metadata.source': 'installment',
      'metadata.obligationKey': { $nin: activeInstallmentObligationKeys }
    });

    const eventDateKey = dueDateKey(event.eventDate);
    const balance = Number(contract.balanceAmount ?? 0);
    const balanceObligationKey = `financial:balance:${idOf(contract._id)}`;
    if (!eventDateKey || balance <= 0 || eventDateKey < todayKey) {
      await cancelObligationItems(balanceObligationKey);
      await cancelFinancialItems({
        eventId: event._id,
        'metadata.source': 'balance'
      });
      continue;
    }
    const scheduledBalanceKey = addDaysToDateKey(eventDateKey, -15);
    const context = balanceContext(event, contract, scheduledBalanceKey < todayKey ? todayKey : scheduledBalanceKey, eventDateKey);
    await upsertFinancialCalendarItem(context);
    await cancelStaleObligationItems(balanceObligationKey, [context.automationKey]);
    await cancelFinancialItems({
      eventId: event._id,
      'metadata.source': 'balance',
      'metadata.obligationKey': { $nin: [balanceObligationKey] }
    });
    synced += 1;
  }

  const pendingPayments: any[] = await Payment.find({
    deletedAt: null,
    // `null` includes ledger rows created before the source field existed;
    // ticket-order payments remain excluded because they are never due invoices.
    source: { $in: ['manual', null] },
    status: 'pending',
    dueDate: { $ne: null }
  }).select('_id paymentNumber eventId contractId salonId customerId planInstallmentId amount dueDate status').lean();
  const activePaymentObligationKeysByEvent = new Map<string, string[]>();
  for (const payment of pendingPayments) {
    const paymentEventId = idOf(payment.eventId);
    const contract = contractByEvent.get(paymentEventId ?? '');
    const event = paymentEventId ? eventById.get(paymentEventId) : undefined;
    const dueKey = dueDateKey(payment.dueDate);
    const obligationKey = `financial:payment:${idOf(payment._id)}`;
    const currentPlan = event && contract ? planFor(event, contract) : [];
    const alreadyRepresentedByPlan = Boolean(payment.planInstallmentId && currentPlan.some((item: any) => String(item?.id) === String(payment.planInstallmentId)));
    if (!event || !contract || !dueKey || PAYMENT_TERMINAL_STATUSES.has(String(payment.status)) || alreadyRepresentedByPlan) {
      await cancelObligationItems(obligationKey);
      continue;
    }
    const contexts = pendingRulesForDueDate(dueKey, todayKey)
      .map(({ rule, sendAtKey }) => paymentContext(event, contract, payment, rule, sendAtKey, dueKey));
    const activePaymentObligationKeys = activePaymentObligationKeysByEvent.get(paymentEventId!) ?? [];
    activePaymentObligationKeys.push(obligationKey);
    activePaymentObligationKeysByEvent.set(paymentEventId!, activePaymentObligationKeys);
    for (const context of contexts) await upsertFinancialCalendarItem(context);
    await cancelStaleObligationItems(obligationKey, contexts.map((context) => context.automationKey));
    synced += contexts.length;
  }
  for (const event of events) {
    const eventId = idOf(event._id)!;
    await cancelFinancialItems({
      eventId: event._id,
      'metadata.source': 'payment',
      'metadata.obligationKey': { $nin: activePaymentObligationKeysByEvent.get(eventId) ?? [] }
    });
  }

  return synced;
}

async function claimNextDueReminder(now: Date): Promise<any | null> {
  return CalendarItem.findOneAndUpdate({
    deletedAt: null,
    source: 'system',
    'metadata.financialReminder': true,
    'notification.enabled': true,
    'notification.sendAt': { $lte: now },
    $or: [
      { 'notification.status': { $in: ['pending', 'scheduled'] } },
      { 'notification.status': 'failed', 'notification.nextRetryAt': { $lte: now } },
      { 'notification.status': 'processing', 'notification.lockExpiresAt': { $lte: now } }
    ]
  }, {
    $set: {
      'notification.status': 'processing',
      'notification.lockedAt': now,
      'notification.lockExpiresAt': new Date(now.getTime() + FINANCIAL_LOCK_MS)
    },
    $unset: { 'notification.lastError': 1 },
    $inc: { 'notification.attemptCount': 1 }
  }, { new: true });
}

async function stillRequiresReminder(item: any): Promise<boolean> {
  const source = item?.metadata?.source;
  const eventId = idOf(item?.eventId);
  const contractId = idOf(item?.contractId);
  const [event, contract] = await Promise.all([
    eventId ? Event.findOne({ _id: eventId, deletedAt: null }).select('_id status paymentPlanSnapshot').lean() : Promise.resolve(undefined),
    contractId ? Contract.findOne({ _id: contractId, deletedAt: null, status: 'approved' }).select('_id balanceAmount paymentPlanSnapshot').lean() : Promise.resolve(undefined)
  ]);
  if (!event || EVENT_TERMINAL_STATUSES.has(String((event as any).status)) || !contract) return false;
  if (source === 'payment') {
    const paymentId = idOf(item?.paymentId);
    const payment: any = paymentId ? await Payment.findOne({ _id: paymentId, deletedAt: null }).select('status dueDate').lean() : undefined;
    return Boolean(payment && payment.status === 'pending' && dueDateKey(payment.dueDate) === item?.metadata?.dueDateKey);
  }
  if (source === 'installment') {
    const installmentId = String(item?.metadata?.planInstallmentId ?? '');
    const plan = planFor(event, contract);
    const installment = plan.find((candidate: any) => String(candidate?.id ?? '') === installmentId);
    return isOpenInstallment(installment) && installmentDueDateKey(installment) === item?.metadata?.dueDateKey;
  }
  if (source === 'balance') return Number((contract as any).balanceAmount ?? 0) > 0;
  return false;
}

function canReceiveSystemReminder(user: any): boolean {
  const preferences = user.notificationPreferences ?? {};
  return preferences.paymentReminder !== false && preferences.systemNotificationsEnabled !== false && preferences.inApp !== false;
}

function canReceiveEmailReminder(user: any): boolean {
  const preferences = user.notificationPreferences ?? {};
  return Boolean(user.email) && preferences.paymentReminder !== false && preferences.emailNotificationsEnabled !== false && preferences.email !== false;
}

async function deliverFinancialReminder(item: any, now: Date): Promise<'delivered' | 'skipped'> {
  if (!await stillRequiresReminder(item)) {
    await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
      $set: { status: 'cancelled', 'notification.status': 'cancelled' },
      $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1 }
    });
    return 'skipped';
  }

  const recipientIds = uniqueIds(item?.metadata?.recipientUserIds ?? [item.assignedToUserId]);
  const recipients: any[] = await activeUsersById(recipientIds);
  if (!recipients.length) {
    await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
      $set: {
        'notification.status': 'failed',
        'notification.lastError': 'No hay responsables activos para recibir el recordatorio.',
        'notification.nextRetryAt': new Date(now.getTime() + FINANCIAL_RETRY_DELAY_MS)
      },
      $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1 }
    });
    throw new Error('No hay responsables activos para recibir el recordatorio.');
  }

  const automationKey = String(item.automationKey);
  const actionUrl = idOf(item.eventId) ? `/admin/events/${idOf(item.eventId)}` : idOf(item.contractId) ? `/admin/contracts/${idOf(item.contractId)}` : '/admin/payments';
  const systemRecipients = recipients.filter(canReceiveSystemReminder);
  if (item.notification?.channels?.includes('system') && systemRecipients.length) {
    await Notification.bulkWrite(systemRecipients.map((user: any) => ({
      updateOne: {
        filter: { userId: user._id, automationKey },
        update: {
          $setOnInsert: {
            userId: user._id,
            automationKey,
            type: 'financial_reminder',
            title: item.title,
            message: item.description || item.title,
            actionUrl,
            metadata: { ...(item.metadata ?? {}), calendarItemId: item._id }
          }
        },
        upsert: true
      }
    })));
  }

  if (item.notification?.channels?.includes('email')) {
    await Promise.allSettled(recipients.filter(canReceiveEmailReminder).map((user: any) => sendEmail({
      to: user.email,
      subject: item.title,
      text: `${item.description || item.title}\n\nAbrir en M&M Eventos: ${actionUrl}`
    })));
  }

  await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
    $set: { 'notification.status': 'sent', 'notification.lastSentAt': now },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1, 'notification.lastError': 1 }
  });
  return 'delivered';
}

async function markReminderFailure(item: any, error: unknown, now: Date): Promise<void> {
  const message = error instanceof Error ? error.message : 'No se pudo enviar el recordatorio financiero.';
  await CalendarItem.updateOne({ _id: item._id, 'notification.status': 'processing' }, {
    $set: {
      'notification.status': 'failed',
      'notification.lastError': message,
      'notification.nextRetryAt': new Date(now.getTime() + FINANCIAL_RETRY_DELAY_MS)
    },
    $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1 }
  });
}

export async function processFinancialReminderTick(now = new Date()): Promise<FinancialTickResult> {
  const synced = await syncFinancialCalendarItems(now);
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  while (processed < MAX_REMINDERS_PER_TICK) {
    const item = await claimNextDueReminder(now);
    if (!item) break;
    processed += 1;
    try {
      const result = await deliverFinancialReminder(item, now);
      if (result === 'delivered') delivered += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await markReminderFailure(item, error, now);
    }
  }
  const hasMore = processed >= MAX_REMINDERS_PER_TICK;
  return { synced, delivered, skipped, failed, hasMore };
}

export const financialReminderPolicy = {
  dueInDays: [7, 3],
  overdueFirstAfterDays: 1,
  overdueSecondAfterDays: 3,
  escalationAfterDays: 7,
  balanceBeforeEventDays: 15
} as const;
