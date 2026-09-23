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
// One tick can evaluate the same (event, recipientMode) pair many times — every pending
// rule stage of every open installment on the same event calls this with identical inputs.
// The cache is scoped to a single processFinancialReminderTick() call (never shared across
// ticks), so a stale resolution can only ever be as stale as recipients already are mid-tick.
type RecipientCache = Map<string, Promise<RecipientResolution>>;

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

// Exported (unchanged otherwise) so client-payment-reminders.service.ts can reuse the exact same
// notion of "open installment"/due date instead of re-deriving it and risking drift.
export function remainingInstallmentAmount(installment: any): number {
  return Math.max(0, Number(installment?.amount ?? 0) - Number(installment?.paidAmount ?? 0));
}

export function isOpenInstallment(installment: any): boolean {
  return Boolean(installment)
    && !INSTALLMENT_TERMINAL_STATUSES.has(String(installment.status ?? ''))
    && remainingInstallmentAmount(installment) > 0;
}

function eventTitle(event: any): string {
  return event?.eventName || event?.eventType || 'Evento sin nombre';
}

export function installmentDueDateKey(installment: any): string | undefined {
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

async function resolveFinancialRecipients(event: any, mode: RecipientMode, cache?: RecipientCache): Promise<RecipientResolution> {
  const cacheKey = cache ? `${idOf(event?._id) ?? 'none'}:${mode}` : undefined;
  if (cacheKey && cache!.has(cacheKey)) return cache!.get(cacheKey)!;
  const resolution = resolveFinancialRecipientsUncached(event, mode);
  if (cacheKey) cache!.set(cacheKey, resolution);
  return resolution;
}

async function resolveFinancialRecipientsUncached(event: any, mode: RecipientMode): Promise<RecipientResolution> {
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

// `extraFilter` should carry whichever indexed field (eventId/paymentId/contractId) the
// caller already has in scope. `metadata.obligationKey` alone is a Mixed-field equality
// with no index of its own, so without this the query falls back to scanning every
// system-sourced CalendarItem ever created by this automation to find one match — and
// this runs once per installment/payment/balance obligation, every tick.
async function cancelStaleObligationItems(obligationKey: string, activeKeys: string[], extraFilter: Record<string, unknown> = {}): Promise<void> {
  await cancelFinancialItems({
    ...extraFilter,
    'metadata.obligationKey': obligationKey,
    automationKey: { $nin: activeKeys }
  });
}

async function cancelObligationItems(obligationKey: string, extraFilter: Record<string, unknown> = {}): Promise<void> {
  await cancelStaleObligationItems(obligationKey, [], extraFilter);
}

type DesiredCalendarItem = {
  automationKey: string;
  contentFields: Record<string, unknown>;
  insertDefaults: { status: string; notification: Record<string, unknown> };
  sendAt: Date;
};

// Phase 4 (2026-09-23 Fluid Active CPU audit): pure computation, no Mongo call. Splits what used
// to be the first half of upsertFinancialCalendarItem (still resolves recipients through the same
// cache) from the actual writes, so every desired item for the whole tick can be diffed against a
// single batched read instead of two unconditional writes each.
async function buildDesiredCalendarItem(context: ReminderContext, recipientCache: RecipientCache): Promise<DesiredCalendarItem> {
  const recipients = await resolveFinancialRecipients(context.event, context.recipientMode, recipientCache);
  const eventId = idOf(context.event?._id);
  const contractId = idOf(context.contract?._id);
  const paymentId = idOf(context.payment?._id);
  const salonId = idOf(context.event?.salonId) ?? idOf(context.contract?.salonId);
  const customerId = idOf(context.event?.customerId) ?? idOf(context.contract?.customerId);
  const recipientUserIds = recipients.userIds;
  const metadata = calendarMetadata(context, recipients);
  const sendAt = argentinaMidnight(context.sendAtKey);
  return {
    automationKey: context.automationKey,
    sendAt,
    contentFields: {
      type: 'payment_window',
      title: context.title,
      description: context.description,
      // The calendar represents when the reminder needs attention. The actual
      // payment due date stays in metadata/description for context.
      startAt: sendAt,
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
    insertDefaults: {
      status: 'scheduled',
      notification: {
        enabled: true,
        channels: ['system', 'email'],
        offsetValue: 0,
        offsetUnit: 'days',
        sendAt,
        status: 'scheduled',
        attemptCount: 0
      }
    }
  };
}

function normalizeRelationId(value: unknown): string | null {
  return value == null ? null : idOf(value) ?? null;
}

// Explicit field-by-field, never a blanket JSON.stringify (key order / ObjectId-vs-string would
// make that unsafe). Any field this doesn't know how to compare confidently should be added
// here, not assumed equal — a false "unchanged" silently skips a needed write; a false "changed"
// only costs one harmless extra write, so every comparison below is biased toward the safe side.
function calendarContentEquals(existing: any, desired: DesiredCalendarItem): boolean {
  if (!existing) return false;
  const fields = desired.contentFields as Record<string, any>;
  if (existing.title !== fields.title) return false;
  if (existing.description !== fields.description) return false;
  if (!existing.startAt || new Date(existing.startAt).getTime() !== (fields.startAt as Date).getTime()) return false;
  if (existing.priority !== fields.priority) return false;
  if (normalizeRelationId(existing.salonId) !== normalizeRelationId(fields.salonId)) return false;
  if (normalizeRelationId(existing.assignedToUserId) !== normalizeRelationId(fields.assignedToUserId)) return false;
  if (normalizeRelationId(existing.customerId) !== normalizeRelationId(fields.customerId)) return false;
  if (normalizeRelationId(existing.eventId) !== normalizeRelationId(fields.eventId)) return false;
  if (normalizeRelationId(existing.contractId) !== normalizeRelationId(fields.contractId)) return false;
  if (normalizeRelationId(existing.paymentId) !== normalizeRelationId(fields.paymentId)) return false;
  const existingMetadata = existing.metadata ?? {};
  const desiredMetadata = fields.metadata as Record<string, unknown>;
  if (existingMetadata.rule !== desiredMetadata.rule) return false;
  if (existingMetadata.obligationKey !== desiredMetadata.obligationKey) return false;
  if (existingMetadata.dueDateKey !== desiredMetadata.dueDateKey) return false;
  if ((existingMetadata.planInstallmentId ?? undefined) !== (desiredMetadata.planInstallmentId ?? undefined)) return false;
  if (Number(existingMetadata.remainingAmount ?? 0) !== Number(desiredMetadata.remainingAmount ?? 0)) return false;
  if (existingMetadata.recipientMode !== desiredMetadata.recipientMode) return false;
  const existingRecipients = uniqueIds((existingMetadata.recipientUserIds ?? []) as unknown[]);
  const desiredRecipients = uniqueIds((desiredMetadata.recipientUserIds ?? []) as unknown[]);
  if (existingRecipients.length !== desiredRecipients.length) return false;
  for (let index = 0; index < existingRecipients.length; index += 1) {
    if (existingRecipients[index] !== desiredRecipients[index]) return false;
  }
  return true;
}

type CalendarWriteStats = {
  generatedItemCount: number;
  uniqueAutomationKeyCount: number;
  existingItemCount: number;
  createdCount: number;
  updatedCount: number;
  reactivatedCount: number;
  unchangedCount: number;
};

// Phase 4: one batched read (`CalendarItem.find({automationKey:{$in:[...]}})`, the automationKey
// unique index makes this a cheap indexed $in) replaces what used to be two unconditional writes
// per desired item. The decision below is made in Node from that snapshot, then exactly one
// targeted Mongo write is issued per item — zero when nothing actually changed. Every write stays
// guarded (or upsert-with-11000-fallback) so a stale snapshot can only ever cause a write to match
// nothing and no-op, never to clobber a state that moved on concurrently; the next tick's fresh
// snapshot reconciles it. Content-field writes are deliberately NOT guarded on notification.status
// (matching the original code's second call, which never checked it either) — only the
// cancelled→reactivation flip is guarded, exactly as it always was.
async function applyDesiredCalendarItems(items: DesiredCalendarItem[]): Promise<CalendarWriteStats> {
  const generatedItemCount = items.length;
  const byKey = new Map<string, DesiredCalendarItem>();
  for (const item of items) byKey.set(item.automationKey, item);
  const dedupedItems = [...byKey.values()];
  const uniqueAutomationKeyCount = dedupedItems.length;

  const existingDocs: any[] = dedupedItems.length
    ? await CalendarItem.find({ automationKey: { $in: dedupedItems.map((item) => item.automationKey) } })
        .select('automationKey status notification title description startAt priority salonId assignedToUserId customerId eventId contractId paymentId metadata')
        .lean()
    : [];
  const existingByKey = new Map(existingDocs.map((doc: any) => [doc.automationKey, doc]));

  let createdCount = 0;
  let updatedCount = 0;
  let reactivatedCount = 0;
  let unchangedCount = 0;

  for (const item of dedupedItems) {
    const filter = { automationKey: item.automationKey };
    const existing: any = existingByKey.get(item.automationKey);

    if (!existing) {
      createdCount += 1;
      try {
        await CalendarItem.findOneAndUpdate(filter, { $set: item.contentFields, $setOnInsert: item.insertDefaults }, { upsert: true, new: true, setDefaultsOnInsert: true });
      } catch (error: any) {
        // A unique key race can occur when GitHub Actions and the Vercel fallback overlap.
        // The winner inserted the item, so a normal update is sufficient.
        if (error?.code !== 11000) throw error;
        await CalendarItem.findOneAndUpdate(filter, { $set: item.contentFields }, { new: true });
      }
      continue;
    }

    if (existing.notification?.status === 'cancelled') {
      // A payment plan can be corrected after a prior cancellation. Re-arm only a
      // system-cancelled, unsent stage; already sent stages remain immutable. Folded into one
      // write (was two): same guarded filter, same end state.
      reactivatedCount += 1;
      await CalendarItem.updateOne({ ...filter, 'notification.status': 'cancelled' }, {
        $set: {
          ...item.contentFields,
          status: 'scheduled',
          'notification.enabled': true,
          'notification.status': 'scheduled',
          'notification.sendAt': item.sendAt
        },
        $unset: { 'notification.lockedAt': 1, 'notification.lockExpiresAt': 1, 'notification.nextRetryAt': 1, 'notification.lastError': 1 }
      });
      continue;
    }

    if (calendarContentEquals(existing, item)) {
      unchangedCount += 1;
      continue;
    }

    updatedCount += 1;
    await CalendarItem.updateOne(filter, { $set: item.contentFields });
  }

  return { generatedItemCount, uniqueAutomationKeyCount, existingItemCount: existingDocs.length, createdCount, updatedCount, reactivatedCount, unchangedCount };
}

export function planFor(event: any, contract: any): any[] {
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
  // Temporary/conditional timing breakdown for the Vercel Fluid Active CPU audit
  // (2026-09-23). Logs only past the threshold, JSON-structured, no PII — safe to
  // remove once the fix is confirmed in production or to keep as a standing guard.
  const tickStartedAt = Date.now();
  const todayKey = argentinaDateKey(now);
  const contractsStartedAt = Date.now();
  const contracts: any[] = await Contract.find({ deletedAt: null, status: 'approved' })
    .select('_id eventId customerId salonId balanceAmount paymentPlanSnapshot versionNumber createdAt')
    .sort({ eventId: 1, versionNumber: -1, createdAt: -1 })
    .lean();
  const contractsQueryMs = Date.now() - contractsStartedAt;
  if (!contracts.length) {
    await cancelFinancialItems({});
    const elapsedMs = Date.now() - tickStartedAt;
    if (elapsedMs >= 500) {
      console.warn(JSON.stringify({ event: 'financial_tick_timing', elapsedMs, candidateCount: 0, stages: { contractsQueryMs } }));
    }
    return 0;
  }

  const contractByEvent = new Map<string, any>();
  for (const contract of contracts) {
    const eventId = idOf(contract.eventId);
    if (eventId && !contractByEvent.has(eventId)) contractByEvent.set(eventId, contract);
  }
  const eventIds = [...contractByEvent.keys()];
  const eventsStartedAt = Date.now();
  const events: any[] = eventIds.length ? await Event.find({
    _id: { $in: eventIds },
    deletedAt: null,
    status: { $nin: [...EVENT_TERMINAL_STATUSES] }
  }).select('_id customerId salonId leadId sourceLeadId eventName eventType eventDate paymentPlanSnapshot status').lean() : [];
  const eventsQueryMs = Date.now() - eventsStartedAt;
  const eventById = new Map(events.map((event: any) => [idOf(event._id)!, event]));
  await cancelFinancialItems({ eventId: { $nin: events.map((event: any) => event._id) } });
  let synced = 0;
  const recipientCache: RecipientCache = new Map();
  // Phase 4: contexts are collected here instead of written immediately — every write for the
  // whole tick (installment, balance, and payment contexts alike) happens in one batched pass
  // after both loops below, against one prefetch of existing CalendarItems.
  const pendingContexts: ReminderContext[] = [];
  const obligationLoopStartedAt = Date.now();
  // Phase 2 (2026-09-23): plain counters, no query/logic change — answers "how much of the
  // Contract.find({status:'approved'}) universe is actually dormant this tick" without
  // guessing. Read alongside financial_tick_timing below.
  let installmentCount = 0;
  let openInstallmentCount = 0;
  let contractsWithOpenInstallments = 0;
  let contractsWithBalance = 0;
  let contractsSkipped = 0;

  for (const event of events) {
    const contract = contractByEvent.get(idOf(event._id)!);
    if (!contract) continue;
    const installments = planFor(event, contract);
    installmentCount += installments.length;
    const activeInstallmentObligationKeys: string[] = [];
    for (const installment of installments) {
      const dueKey = installmentDueDateKey(installment);
      const obligationKey = `financial:installment:${idOf(event._id)}:${String(installment?.id ?? dueKey ?? '')}`;
      if (!dueKey || !isOpenInstallment(installment)) {
        await cancelObligationItems(obligationKey, { eventId: event._id });
        continue;
      }
      openInstallmentCount += 1;
      activeInstallmentObligationKeys.push(obligationKey);
      const contexts = pendingRulesForDueDate(dueKey, todayKey)
        .map(({ rule, sendAtKey }) => installmentContext(event, contract, installment, rule, sendAtKey, dueKey));
      pendingContexts.push(...contexts);
      await cancelStaleObligationItems(obligationKey, contexts.map((context) => context.automationKey), { eventId: event._id });
      synced += contexts.length;
    }
    if (activeInstallmentObligationKeys.length) contractsWithOpenInstallments += 1;
    await cancelFinancialItems({
      eventId: event._id,
      'metadata.source': 'installment',
      'metadata.obligationKey': { $nin: activeInstallmentObligationKeys }
    });

    const eventDateKey = dueDateKey(event.eventDate);
    const balance = Number(contract.balanceAmount ?? 0);
    const balanceObligationKey = `financial:balance:${idOf(contract._id)}`;
    if (!eventDateKey || balance <= 0 || eventDateKey < todayKey) {
      await cancelObligationItems(balanceObligationKey, { contractId: contract._id });
      await cancelFinancialItems({
        eventId: event._id,
        'metadata.source': 'balance'
      });
      if (!activeInstallmentObligationKeys.length) contractsSkipped += 1;
      continue;
    }
    contractsWithBalance += 1;
    const scheduledBalanceKey = addDaysToDateKey(eventDateKey, -15);
    const context = balanceContext(event, contract, scheduledBalanceKey < todayKey ? todayKey : scheduledBalanceKey, eventDateKey);
    pendingContexts.push(context);
    await cancelStaleObligationItems(balanceObligationKey, [context.automationKey], { contractId: contract._id });
    await cancelFinancialItems({
      eventId: event._id,
      'metadata.source': 'balance',
      'metadata.obligationKey': { $nin: [balanceObligationKey] }
    });
    synced += 1;
  }

  const obligationLoopMs = Date.now() - obligationLoopStartedAt;

  const paymentsStartedAt = Date.now();
  const pendingPayments: any[] = await Payment.find({
    deletedAt: null,
    // `null` includes ledger rows created before the source field existed;
    // ticket-order payments remain excluded because they are never due invoices.
    source: { $in: ['manual', null] },
    status: 'pending',
    dueDate: { $ne: null }
  }).select('_id paymentNumber eventId contractId salonId customerId planInstallmentId amount dueDate status').lean();
  const paymentsQueryMs = Date.now() - paymentsStartedAt;
  const paymentsLoopStartedAt = Date.now();
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
      await cancelObligationItems(obligationKey, { paymentId: payment._id });
      continue;
    }
    const contexts = pendingRulesForDueDate(dueKey, todayKey)
      .map(({ rule, sendAtKey }) => paymentContext(event, contract, payment, rule, sendAtKey, dueKey));
    const activePaymentObligationKeys = activePaymentObligationKeysByEvent.get(paymentEventId!) ?? [];
    activePaymentObligationKeys.push(obligationKey);
    activePaymentObligationKeysByEvent.set(paymentEventId!, activePaymentObligationKeys);
    pendingContexts.push(...contexts);
    await cancelStaleObligationItems(obligationKey, contexts.map((context) => context.automationKey), { paymentId: payment._id });
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
  const paymentsLoopMs = Date.now() - paymentsLoopStartedAt;

  const calendarWriteStartedAt = Date.now();
  const desiredItems = await Promise.all(pendingContexts.map((context) => buildDesiredCalendarItem(context, recipientCache)));
  const writeStats = await applyDesiredCalendarItems(desiredItems);
  const calendarWriteMs = Date.now() - calendarWriteStartedAt;

  const elapsedMs = Date.now() - tickStartedAt;
  if (elapsedMs >= 500) {
    console.warn(JSON.stringify({
      event: 'financial_tick_timing',
      elapsedMs,
      candidateCount: contracts.length,
      eventCount: events.length,
      paymentCount: pendingPayments.length,
      contractsWithOpenInstallments,
      contractsWithBalance,
      contractsSkipped,
      installmentCount,
      openInstallmentCount,
      synced,
      ...writeStats,
      stages: { contractsQueryMs, eventsQueryMs, obligationLoopMs, paymentsQueryMs, paymentsLoopMs, calendarWriteMs }
    }));
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
