import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { ExpenseSourceType, ExpenseStatus, Role, SupplierCategory } from '@mym/shared';
import { ApiError } from '../../middlewares/errorHandler';
import { WorkSession } from '../attendance/attendance.models';
import { Expense, ExpenseAllocation, ExpenseCategory } from '../operations/operations.models';
import { User } from '../users/user.model';
import {
  PayrollAdjustment,
  PayrollConcept,
  PayrollProfile,
  PayrollRun,
  PayrollSettlement,
  SalaryAdvance,
  ensurePayrollSettlementRunEmployeeIndex
} from './payroll.models';
import {
  calculateSettlement,
  PAYROLL_CALCULATION_VERSION,
  type CalculationItem,
  type ManualCalculationItem,
  type ProfileSnapshot
} from './payroll.calculation';

const BASE_CONCEPTS = [
  ['NORMAL_HOURS', 'Horas normales', 'earning', 'attendance', true, false, 10],
  ['OVERTIME_HOURS', 'Horas extra', 'earning', 'overtime', true, false, 20],
  ['WORK_DAYS', 'Jornadas', 'earning', 'attendance', true, false, 30],
  ['WORKED_EVENTS', 'Eventos trabajados', 'earning', 'event', true, false, 40],
  ['SHIFT_PREMIUM', 'Adicional nocturno o fin de semana', 'earning', 'overtime', true, false, 50],
  ['NIGHT_PREMIUM', 'Adicional nocturno', 'earning', 'overtime', true, false, 55],
  ['WEEKEND_PREMIUM', 'Adicional fin de semana', 'earning', 'overtime', true, false, 60],
  ['HOLIDAY_PREMIUM', 'Adicional feriado', 'earning', 'overtime', true, false, 65],
  ['BONUS', 'Bonificación', 'earning', 'bonus', false, true, 70],
  ['REIMBURSEMENT', 'Viático o reintegro', 'earning', 'reimbursement', false, true, 80],
  ['ADVANCE', 'Adelanto', 'deduction', 'advance', true, false, 90],
  ['ABSENCE', 'Ausencia', 'deduction', 'attendance', false, true, 100],
  ['MANUAL_ADJUSTMENT', 'Ajuste manual', 'earning', 'adjustment', false, true, 110],
  ['OTHER_EARNING', 'Otro haber', 'earning', 'manual', false, true, 120],
  ['OTHER_DEDUCTION', 'Otro descuento', 'deduction', 'manual', false, true, 130]
] as const;

export type PayrollActor = {
  id: string;
  roles: string[];
  salonIds?: string[];
  managedSalonIds?: string[];
};

function plain<T>(value: T): T {
  return value && typeof (value as any).toObject === 'function' ? (value as any).toObject() : value;
}

function stringId(value: unknown): string | undefined {
  if (!value) return undefined;
  return String((value as any)._id ?? value);
}

function ids(values?: unknown[]): string[] {
  return [...new Set((values ?? []).map(stringId).filter((value): value is string => Boolean(value)))];
}

type PayrollExpenseGroup = { salonId: string; eventId?: string; weight: number };
type PayrollExpenseAllocation = PayrollExpenseGroup & { amountMinor: number };

export function allocatePayrollExpenseMinor(totalMinor: number, groups: PayrollExpenseGroup[]): PayrollExpenseAllocation[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new Error('El importe de la liquidación debe ser un entero no negativo.');
  const validGroups = groups.filter((group) => group.salonId);
  if (!validGroups.length || totalMinor === 0) return validGroups.map((group) => ({ ...group, amountMinor: 0 }));
  const totalWeight = validGroups.reduce((sum, group) => sum + Math.max(1, Number(group.weight) || 0), 0);
  let pending = totalMinor;
  return validGroups.map((group, index) => {
    const amountMinor = index === validGroups.length - 1 ? pending : Math.floor((totalMinor * Math.max(1, Number(group.weight) || 0)) / totalWeight);
    pending -= amountMinor;
    return { ...group, amountMinor };
  });
}

function actorSalonIds(actor: PayrollActor): string[] {
  return [...new Set([...(actor.salonIds ?? []), ...(actor.managedSalonIds ?? [])].map(String))];
}

function isAdmin(actor: PayrollActor): boolean {
  return actor.roles.includes(Role.ADMIN);
}

function dateKey(value: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizePayrollPeriod(periodStart: Date, periodEnd: Date): { start: Date; end: Date; endExclusive: Date } {
  const startKey = dateKey(periodStart);
  const endKey = dateKey(periodEnd);
  const start = new Date(`${startKey}T00:00:00-03:00`);
  const end = new Date(`${endKey}T00:00:00-03:00`);
  if (end.getTime() < start.getTime()) throw new ApiError(422, 'PAYROLL_INVALID_PERIOD');
  return { start, end, endExclusive: new Date(end.getTime() + 24 * 60 * 60 * 1000) };
}

function profileSnapshot(profile: any): ProfileSnapshot & Record<string, unknown> {
  const source = plain(profile) as any;
  return {
    profileId: stringId(source._id),
    version: source.version,
    compensationType: source.compensationType,
    currency: source.currency,
    hourlyRateMinor: source.hourlyRateMinor,
    dailyRateMinor: source.dailyRateMinor,
    monthlySalaryMinor: source.monthlySalaryMinor,
    eventRateMinor: source.eventRateMinor,
    expectedMonthlyHours: source.expectedMonthlyHours,
    overtimeAfterMinutes: source.overtimeAfterMinutes,
    overtimeMultiplier: source.overtimeMultiplier,
    nightMultiplier: source.nightMultiplier,
    weekendMultiplier: source.weekendMultiplier,
    holidayMultiplier: source.holidayMultiplier,
    nightStartHour: source.nightStartHour,
    nightEndHour: source.nightEndHour,
    graceMinutes: source.graceMinutes,
    roundingRule: source.roundingRule,
    breakPolicy: source.breakPolicy,
    paymentMethod: source.paymentMethod,
    effectiveFrom: source.effectiveFrom,
    effectiveTo: source.effectiveTo,
    salonIds: ids(source.salonIds)
  } as ProfileSnapshot & Record<string, unknown>;
}

function assertPositiveInteger(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new ApiError(422, 'PAYROLL_INVALID_AMOUNT', `${field} debe ser un entero mayor o igual a cero en unidades menores.`);
}

function validateProfileInput(input: any): void {
  ['hourlyRateMinor', 'dailyRateMinor', 'monthlySalaryMinor', 'eventRateMinor'].forEach((field) => assertPositiveInteger(input[field], field));
  const type = input.compensationType;
  if (type === 'hourly' && !input.hourlyRateMinor) throw new ApiError(422, 'PAYROLL_PROFILE_RATE_REQUIRED');
  if (type === 'daily' && !input.dailyRateMinor) throw new ApiError(422, 'PAYROLL_PROFILE_RATE_REQUIRED');
  if (type === 'monthly' && !input.monthlySalaryMinor) throw new ApiError(422, 'PAYROLL_PROFILE_RATE_REQUIRED');
  if (type === 'per_event' && !input.eventRateMinor) throw new ApiError(422, 'PAYROLL_PROFILE_RATE_REQUIRED');
  if (type === 'mixed' && !input.hourlyRateMinor && !input.dailyRateMinor && !input.monthlySalaryMinor && !input.eventRateMinor) throw new ApiError(422, 'PAYROLL_PROFILE_RATE_REQUIRED');
  if (input.effectiveTo && new Date(input.effectiveTo).getTime() < new Date(input.effectiveFrom).getTime()) throw new ApiError(422, 'PAYROLL_INVALID_PROFILE_DATES');
}

function sessionStatus(session: any): 'pending' | 'approved' | 'rejected' {
  if (session.payrollApprovalStatus === 'approved') return 'approved';
  if (session.payrollApprovalStatus === 'rejected') return 'rejected';
  return 'pending';
}

function attendanceFlags(session: any, peers: any[]): string[] {
  const flags: string[] = [];
  if (!session.endedAt || session.status === 'active' || session.status === 'incomplete') flags.push('incomplete');
  if (session.requiresReview || session.status === 'under_review') flags.push('observed');
  if (session.endedAt && new Date(session.endedAt).getTime() <= new Date(session.startedAt).getTime()) flags.push('negative_duration');
  if (Number(session.workedMinutes ?? 0) > 16 * 60) flags.push('excessive_duration');
  const start = new Date(session.startedAt).getTime(); const end = new Date(session.endedAt ?? session.startedAt).getTime();
  if (peers.some((candidate) => String(candidate._id) !== String(session._id) && String(candidate.userId) === String(session.userId) && new Date(candidate.startedAt).getTime() < end && new Date(candidate.endedAt ?? candidate.startedAt).getTime() > start)) flags.push('overlap');
  if (session.payrollManualAdjustmentReason) flags.push('manually_adjusted');
  return flags;
}

export async function ensurePayrollBaseConcepts(): Promise<void> {
  await Promise.all(BASE_CONCEPTS.map(([code, name, type, source, isAutomatic, requiresReason, displayOrder]) => PayrollConcept.updateOne(
    { code },
    { $setOnInsert: { code, name, type, source, isAutomatic, requiresReason, displayOrder, isActive: true } },
    { upsert: true }
  )));
}

export async function assertEmployeeInScope(actor: PayrollActor, employeeId: string): Promise<void> {
  if (isAdmin(actor)) return;
  const user: any = await User.findOne({ _id: employeeId, deletedAt: null }).select('salonIds managedSalonIds').lean();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  const allowed = actorSalonIds(actor);
  const employeeSalons = [...ids(user.salonIds), ...ids(user.managedSalonIds)];
  if (!employeeSalons.some((salonId) => allowed.includes(salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

export function assertSalonScope(actor: PayrollActor, salonIdsToCheck: string[]): void {
  if (isAdmin(actor)) return;
  const allowed = actorSalonIds(actor);
  if (!salonIdsToCheck.length || !salonIdsToCheck.every((salonId) => allowed.includes(salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

export async function createPayrollProfile(actor: PayrollActor, input: any): Promise<any> {
  await assertEmployeeInScope(actor, input.employeeId);
  validateProfileInput(input);
  const { _id, id, __v, createdAt, updatedAt, createdBy, updatedBy, version, supersedesProfileId, isActive, ...profileInput } = input;
  const { start } = normalizePayrollPeriod(new Date(input.effectiveFrom), new Date(input.effectiveFrom));
  const existing: any = await PayrollProfile.findOne({ employeeId: input.employeeId, isActive: true, effectiveTo: null }).sort({ effectiveFrom: -1, version: -1 });
  if (existing && new Date(existing.effectiveFrom).getTime() >= start.getTime()) throw new ApiError(409, 'PAYROLL_PROFILE_EFFECTIVE_CONFLICT');
  if (existing) {
    existing.effectiveTo = new Date(start.getTime() - 1);
    existing.isActive = false;
    existing.updatedBy = actor.id;
    await existing.save();
  }
  const profile = await PayrollProfile.create({
    ...profileInput,
    currency: String(profileInput.currency ?? 'ARS').toUpperCase(),
    effectiveFrom: start,
    effectiveTo: profileInput.effectiveTo ? normalizePayrollPeriod(new Date(profileInput.effectiveTo), new Date(profileInput.effectiveTo)).end : undefined,
    salonIds: ids(profileInput.salonIds),
    version: Number(existing?.version ?? 0) + 1,
    supersedesProfileId: existing?._id,
    isActive: !input.effectiveTo,
    createdBy: actor.id,
    updatedBy: actor.id
  });
  return profile;
}

export async function listPayrollProfiles(actor: PayrollActor, filters: { employeeId?: string; active?: string; page?: number; limit?: number; search?: string }) {
  const query: any = {};
  if (filters.employeeId) { await assertEmployeeInScope(actor, filters.employeeId); query.employeeId = filters.employeeId; }
  if (filters.active !== undefined) query.isActive = filters.active === 'true';
  const page = filters.page ?? 1; const limit = filters.limit ?? 50;
  const profiles = await PayrollProfile.find(query).populate('employeeId', 'firstName lastName fullName salonIds managedSalonIds').sort({ effectiveFrom: -1, version: -1 }).lean();
  const scoped = isAdmin(actor) ? profiles : profiles.filter((profile: any) => {
    const employeeSalons = [...ids(profile.employeeId?.salonIds), ...ids(profile.employeeId?.managedSalonIds)];
    return employeeSalons.some((salonId) => actorSalonIds(actor).includes(salonId));
  });
  const searched = filters.search?.trim() ? scoped.filter((profile: any) => `${profile.employeeId?.fullName ?? ''} ${profile.employeeId?.firstName ?? ''} ${profile.employeeId?.lastName ?? ''}`.toLowerCase().includes(filters.search!.trim().toLowerCase())) : scoped;
  return { items: searched.slice((page - 1) * limit, page * limit), total: searched.length, page, limit };
}

export async function getEmployeePayrollProfiles(actor: PayrollActor, employeeId: string): Promise<any[]> {
  await assertEmployeeInScope(actor, employeeId);
  return PayrollProfile.find({ employeeId }).sort({ effectiveFrom: -1, version: -1 }).lean();
}

export async function getProfileForPeriod(employeeId: string, periodStart: Date, periodEnd: Date): Promise<any> {
  const profile = await PayrollProfile.findOne({
    employeeId,
    effectiveFrom: { $lte: periodStart },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: periodEnd } }]
  }).sort({ version: -1 }).lean();
  if (!profile) throw new ApiError(422, 'PAYROLL_PROFILE_NOT_FOUND');
  return profile;
}

export async function updatePayrollProfile(actor: PayrollActor, id: string, input: any): Promise<any> {
  const current: any = await PayrollProfile.findById(id);
  if (!current) throw new ApiError(404, 'PAYROLL_PROFILE_NOT_FOUND');
  await assertEmployeeInScope(actor, String(current.employeeId));
  const previous = profileSnapshot(current);
  const next = { ...plain(current), ...input, employeeId: String(current.employeeId), effectiveFrom: input.effectiveFrom ?? current.effectiveFrom, effectiveTo: input.effectiveTo ?? current.effectiveTo };
  validateProfileInput(next);
  const { start, end } = normalizePayrollPeriod(new Date(next.effectiveFrom), new Date(next.effectiveTo ?? next.effectiveFrom));
  const usedInSettlement = await PayrollSettlement.exists({ 'payrollProfileSnapshot.profileId': String(current._id) });

  if (!usedInSettlement) {
    const overlappingProfile = await PayrollProfile.exists({
      _id: { $ne: current._id },
      employeeId: current.employeeId,
      effectiveFrom: { $lte: end },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: start } }],
    });
    if (overlappingProfile) throw new ApiError(409, 'PAYROLL_PROFILE_EFFECTIVE_CONFLICT');
    Object.assign(current, {
      ...input,
      currency: String(next.currency ?? 'ARS').toUpperCase(),
      effectiveFrom: start,
      effectiveTo: input.effectiveTo ? end : current.effectiveTo,
      salonIds: input.salonIds === undefined ? current.salonIds : ids(input.salonIds),
      updatedBy: actor.id,
    });
    await current.save();
    return { profile: current, previous, versioned: false };
  }

  if (!current.isActive) throw new ApiError(409, 'PAYROLL_PROFILE_HISTORICAL_LOCKED');
  const profile = await createPayrollProfile(actor, { ...plain(current), ...input, employeeId: String(current.employeeId), effectiveFrom: input.effectiveFrom ?? new Date() });
  return { profile, previous, versioned: true };
}

export async function deletePayrollProfile(actor: PayrollActor, id: string): Promise<{ deleted: boolean; deactivated: boolean; previous: any }> {
  const current: any = await PayrollProfile.findById(id);
  if (!current) throw new ApiError(404, 'PAYROLL_PROFILE_NOT_FOUND');
  await assertEmployeeInScope(actor, String(current.employeeId));
  const previous = profileSnapshot(current);
  const usedInSettlement = await PayrollSettlement.exists({ 'payrollProfileSnapshot.profileId': String(current._id) });

  if (!usedInSettlement) {
    await current.deleteOne();
    return { deleted: true, deactivated: false, previous };
  }
  if (!current.isActive) throw new ApiError(409, 'PAYROLL_PROFILE_HISTORICAL_LOCKED');

  current.isActive = false;
  current.effectiveTo = new Date();
  current.updatedBy = actor.id;
  await current.save();
  return { deleted: false, deactivated: true, previous };
}

export async function listPayrollAttendance(actor: PayrollActor, filters: any) {
  const { start, endExclusive } = normalizePayrollPeriod(filters.from ?? new Date(Date.now() - 30 * 86400000), filters.to ?? new Date());
  const query: any = { startedAt: { $gte: start, $lt: endExclusive } };
  if (filters.employeeId) { await assertEmployeeInScope(actor, filters.employeeId); query.userId = filters.employeeId; }
  if (filters.salonId) { assertSalonScope(actor, [filters.salonId]); query.salonId = filters.salonId; }
  else if (!isAdmin(actor)) query.salonId = { $in: actorSalonIds(actor) };
  if (filters.eventId) query.eventId = filters.eventId;
  if (filters.status === 'approved' || filters.status === 'rejected' || filters.status === 'pending') query.payrollApprovalStatus = filters.status;
  if (filters.incomplete === 'true') query.$or = [{ endedAt: null }, { status: { $in: ['active', 'incomplete'] } }];
  if (filters.observed === 'true') query.$or = [{ requiresReview: true }, { status: 'under_review' }];
  const page = filters.page ?? 1; const limit = filters.limit ?? 50;
  const rows: any[] = await WorkSession.find(query).sort({ startedAt: -1 }).populate('userId', 'firstName lastName fullName staffProfile.staffCode salonIds managedSalonIds').populate('salonId', 'name').populate('eventId', 'eventName eventType eventDate').lean();
  const items = rows.map((session) => ({ ...session, payrollStatus: sessionStatus(session), flags: attendanceFlags(session, rows) }));
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit };
}

function assertSessionEligibleForApproval(session: any): void {
  if (!session || !['completed', 'adjusted'].includes(session.status) || session.requiresReview || !session.endedAt) throw new ApiError(422, 'PAYROLL_ATTENDANCE_NOT_APPROVABLE');
  if (session.payrollSettlementId) throw new ApiError(409, 'PAYROLL_ATTENDANCE_ALREADY_SETTLED');
}

export async function approvePayrollAttendance(actor: PayrollActor, sessionId: string, input: { approvedMinutes?: number; reason?: string }) {
  const session: any = await WorkSession.findById(sessionId);
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  assertSalonScope(actor, ids([session.salonId]));
  assertSessionEligibleForApproval(session);
  const defaultMinutes = Number(session.payableMinutes ?? session.workedMinutes ?? 0);
  const approvedMinutes = input.approvedMinutes ?? defaultMinutes;
  if (!Number.isInteger(approvedMinutes) || approvedMinutes < 0 || approvedMinutes > Number(session.workedMinutes ?? 0)) throw new ApiError(422, 'PAYROLL_ATTENDANCE_INVALID_MINUTES');
  if (approvedMinutes !== defaultMinutes && !input.reason?.trim()) throw new ApiError(422, 'PAYROLL_REASON_REQUIRED');
  const original = { payableMinutes: session.payableMinutes, approvedMinutes: session.approvedMinutes, payrollApprovalStatus: session.payrollApprovalStatus };
  session.approvedMinutes = approvedMinutes;
  session.payrollApprovalStatus = 'approved';
  session.payrollApprovedBy = actor.id;
  session.payrollApprovedAt = new Date();
  session.payrollRejectedBy = undefined;
  session.payrollRejectedAt = undefined;
  session.payrollRejectionReason = undefined;
  if (approvedMinutes !== defaultMinutes) { session.payrollManualAdjustmentReason = input.reason?.trim(); session.payrollOriginalValues = original; }
  await session.save();
  return { session, original };
}

export async function updatePayrollAttendance(actor: PayrollActor, sessionId: string, input: { approvedMinutes: number; reason: string }) {
  const session: any = await WorkSession.findById(sessionId);
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  assertSalonScope(actor, ids([session.salonId]));
  if (session.payrollSettlementId) throw new ApiError(409, 'PAYROLL_ATTENDANCE_ALREADY_SETTLED');
  if (!Number.isInteger(input.approvedMinutes) || input.approvedMinutes < 0 || input.approvedMinutes > Number(session.workedMinutes ?? 0)) throw new ApiError(422, 'PAYROLL_ATTENDANCE_INVALID_MINUTES');
  const original = { approvedMinutes: session.approvedMinutes, payrollApprovalStatus: session.payrollApprovalStatus };
  session.approvedMinutes = input.approvedMinutes;
  session.payrollManualAdjustmentReason = input.reason.trim();
  session.payrollOriginalValues = original;
  session.payrollApprovalStatus = 'pending';
  await session.save();
  return { session, original };
}

export async function rejectPayrollAttendance(actor: PayrollActor, sessionId: string, reason: string) {
  const session: any = await WorkSession.findById(sessionId);
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  assertSalonScope(actor, ids([session.salonId]));
  if (session.payrollSettlementId) throw new ApiError(409, 'PAYROLL_ATTENDANCE_ALREADY_SETTLED');
  const original = { payrollApprovalStatus: session.payrollApprovalStatus, approvedMinutes: session.approvedMinutes };
  session.payrollApprovalStatus = 'rejected';
  session.payrollRejectedBy = actor.id;
  session.payrollRejectedAt = new Date();
  session.payrollRejectionReason = reason.trim();
  await session.save();
  return { session, original };
}

export async function bulkApprovePayrollAttendance(actor: PayrollActor, sessionIds: string[]): Promise<{ approved: string[]; failures: Array<{ id: string; code: string; message: string }> }> {
  const approved: string[] = []; const failures: Array<{ id: string; code: string; message: string }> = [];
  for (const id of [...new Set(sessionIds)]) {
    try { await approvePayrollAttendance(actor, id, {}); approved.push(id); }
    catch (error) { const known = error as ApiError; failures.push({ id, code: known.code ?? 'INTERNAL_ERROR', message: known.message ?? 'No se pudo aprobar la jornada.' }); }
  }
  return { approved, failures };
}

async function settlementSessions(employeeId: string, periodStart: Date, periodEndExclusive: Date, eventId?: string): Promise<any[]> {
  const query: any = {
    userId: employeeId,
    status: { $in: ['completed', 'adjusted'] },
    requiresReview: false,
    payrollApprovalStatus: 'approved',
    $or: [{ payrollSettlementId: null }, { payrollSettlementId: { $exists: false } }],
    startedAt: { $gte: periodStart, $lt: periodEndExclusive }
  };
  if (eventId) query.eventId = eventId;
  return WorkSession.find(query).sort({ startedAt: 1 }).lean();
}

async function reserveSessions(settlementId: string, sessions: any[]): Promise<void> {
  const sessionIds = sessions.map((session) => session._id);
  if (!sessionIds.length) return;
  const result: any = await WorkSession.updateMany({
    _id: { $in: sessionIds },
    payrollApprovalStatus: 'approved',
    $or: [{ payrollSettlementId: null }, { payrollSettlementId: { $exists: false } }]
  }, { $set: { payrollSettlementId: settlementId } });
  if (Number(result.modifiedCount ?? result.nModified ?? 0) !== sessionIds.length) {
    await WorkSession.updateMany({ payrollSettlementId: settlementId }, { $unset: { payrollSettlementId: 1 } });
    throw new ApiError(409, 'PAYROLL_ATTENDANCE_ALREADY_SETTLED');
  }
}

async function reserveAdvances(settlementId: string, advances: any[]): Promise<void> {
  const advanceIds = advances.map((advance) => advance._id);
  if (!advanceIds.length) return;
  const result: any = await SalaryAdvance.updateMany({ _id: { $in: advanceIds }, status: 'pending' }, { $set: { status: 'deducted', payrollSettlementId: settlementId } });
  if (Number(result.modifiedCount ?? result.nModified ?? 0) !== advanceIds.length) {
    await SalaryAdvance.updateMany({ payrollSettlementId: settlementId, status: 'deducted' }, { $set: { status: 'pending' }, $unset: { payrollSettlementId: 1 } });
    throw new ApiError(409, 'PAYROLL_ADVANCE_ALREADY_DEDUCTED');
  }
}

async function manualItemsForSettlement(settlementId: string): Promise<ManualCalculationItem[]> {
  const adjustments: any[] = await PayrollAdjustment.find({ settlementId }).populate('conceptId').lean();
  return adjustments.map((adjustment) => {
    const concept: any = adjustment.conceptId;
    return {
      conceptCode: concept.code,
      conceptName: concept.name,
      conceptType: concept.type,
      source: concept.source,
      sourceId: String(adjustment._id),
      quantity: adjustment.quantity ?? 1,
      unit: adjustment.quantity ? 'unit' : 'amount',
      unitAmountMinor: adjustment.amountMinor,
      subtotalMinor: adjustment.amountMinor,
      description: concept.description,
      isManual: true,
      reason: adjustment.reason
    };
  });
}

export function calculationErrors(profile: any, sessions: any[]): string[] {
  const errors: string[] = [];
  if (!sessions.length && profile.compensationType !== 'monthly') errors.push('No hay asistencias aprobadas disponibles para liquidar.');
  return errors;
}

async function persistCalculation(settlement: any, profile: any, sessions: any[], advances: any[], actorId: string): Promise<any> {
  const manualItems = await manualItemsForSettlement(String(settlement._id));
  const calculation = calculateSettlement({
    profile: profileSnapshot(profile),
    sessions: sessions.map((session) => ({ id: String(session._id), startedAt: session.startedAt, approvedMinutes: Number(session.approvedMinutes ?? 0), eventId: stringId(session.eventId) })),
    manualItems,
    advances: advances.map((advance) => ({ id: String(advance._id), amountMinor: Number(advance.amountMinor), reason: advance.reason, date: advance.date }))
  });
  settlement.payrollProfileSnapshot = profileSnapshot(profile);
  settlement.attendanceRecordIds = sessions.map((session) => session._id);
  const sessionSalonIds = ids(sessions.map((session) => session.salonId));
  settlement.salonIds = sessionSalonIds.length ? sessionSalonIds : ids((profileSnapshot(profile) as any).salonIds);
  settlement.items = calculation.items;
  settlement.baseAmountMinor = calculation.baseAmountMinor;
  settlement.earningsAmountMinor = calculation.earningsAmountMinor;
  settlement.deductionsAmountMinor = calculation.deductionsAmountMinor;
  settlement.grossAmountMinor = calculation.grossAmountMinor;
  settlement.netAmountMinor = calculation.netAmountMinor;
  settlement.calculationVersion = PAYROLL_CALCULATION_VERSION;
  settlement.calculationDetails = { ...calculation.details, errors: calculationErrors(profile, sessions), calculatedAt: new Date() };
  settlement.updatedBy = actorId;
  await settlement.save();
  return settlement;
}

export async function createIndividualSettlement(actor: PayrollActor, input: { employeeId: string; periodStart: Date; periodEnd: Date; paymentDate?: Date; eventId?: string; notes?: string }) {
  await assertEmployeeInScope(actor, input.employeeId);
  await ensurePayrollSettlementRunEmployeeIndex();
  const { start, end, endExclusive } = normalizePayrollPeriod(input.periodStart, input.periodEnd);
  const duplicate = await PayrollSettlement.exists({ employeeId: input.employeeId, periodStart: start, periodEnd: end, status: { $ne: 'cancelled' } });
  if (duplicate) throw new ApiError(409, 'PAYROLL_SETTLEMENT_DUPLICATE');
  const profile = await getProfileForPeriod(input.employeeId, start, end);
  const sessions = await settlementSessions(input.employeeId, start, endExclusive, input.eventId);
  const errors = calculationErrors(profile, sessions);
  if (errors.length) throw new ApiError(422, 'PAYROLL_CALCULATION_BLOCKED', errors.join(' '));
  const settlement: any = await PayrollSettlement.create({
    settlementCode: `LIQ-${randomUUID().slice(0, 8).toUpperCase()}`,
    employeeId: input.employeeId,
    payrollProfileSnapshot: profileSnapshot(profile),
    periodStart: start,
    periodEnd: end,
    currency: profile.currency,
    paymentMethod: profile.paymentMethod,
    calculationVersion: PAYROLL_CALCULATION_VERSION,
    notes: input.notes,
    createdBy: actor.id,
    updatedBy: actor.id
  });
  try {
    await reserveSessions(String(settlement._id), sessions);
    const advances = await SalaryAdvance.find({ employeeId: input.employeeId, status: 'pending', date: { $lte: end } }).sort({ date: 1 }).lean();
    await reserveAdvances(String(settlement._id), advances);
    return await persistCalculation(settlement, profile, sessions, advances, actor.id);
  } catch (error) {
    await WorkSession.updateMany({ payrollSettlementId: settlement._id }, { $unset: { payrollSettlementId: 1 } });
    await SalaryAdvance.updateMany({ payrollSettlementId: settlement._id, status: 'deducted' }, { $set: { status: 'pending' }, $unset: { payrollSettlementId: 1 } });
    settlement.calculationDetails = { errors: [error instanceof Error ? error.message : 'No se pudo reservar la información para liquidar.'] };
    await settlement.save();
    throw error;
  }
}

export async function recalculateSettlement(actor: PayrollActor, settlementId: string): Promise<any> {
  const settlement: any = await PayrollSettlement.findById(settlementId);
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  if (settlement.status !== 'draft') throw new ApiError(409, 'PAYROLL_SETTLEMENT_LOCKED');
  const sessions = await WorkSession.find({ _id: { $in: settlement.attendanceRecordIds }, payrollSettlementId: settlement._id }).sort({ startedAt: 1 }).lean();
  const advances = await SalaryAdvance.find({ payrollSettlementId: settlement._id, status: 'deducted' }).sort({ date: 1 }).lean();
  return persistCalculation(settlement, settlement.payrollProfileSnapshot, sessions, advances, actor.id);
}

export async function assertSettlementScope(actor: PayrollActor, settlement: any): Promise<void> {
  if (isAdmin(actor)) return;
  const salons = ids(settlement.salonIds);
  if (!salons.length) {
    const sessions: any[] = await WorkSession.find({ _id: { $in: settlement.attendanceRecordIds } }).select('salonId').lean();
    assertSalonScope(actor, ids(sessions.map((session) => session.salonId)));
    return;
  }
  assertSalonScope(actor, salons);
}

export async function addSettlementItem(actor: PayrollActor, settlementId: string, input: { conceptId: string; amountMinor: number; quantity?: number; reason: string }) {
  assertPositiveInteger(input.amountMinor, 'amountMinor');
  if (!input.amountMinor) throw new ApiError(422, 'PAYROLL_INVALID_AMOUNT');
  const settlement: any = await PayrollSettlement.findById(settlementId);
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  if (!['draft', 'under_review'].includes(settlement.status)) throw new ApiError(409, 'PAYROLL_SETTLEMENT_LOCKED');
  const concept: any = await PayrollConcept.findOne({ _id: input.conceptId, isActive: true }).lean();
  if (!concept) throw new ApiError(404, 'PAYROLL_CONCEPT_NOT_FOUND');
  if (concept.requiresReason && !input.reason?.trim()) throw new ApiError(422, 'PAYROLL_REASON_REQUIRED');
  const adjustment: any = await PayrollAdjustment.create({ settlementId, employeeId: settlement.employeeId, conceptId: concept._id, amountMinor: input.amountMinor, quantity: input.quantity, reason: input.reason.trim(), createdBy: actor.id, updatedBy: actor.id });
  const sessions = await WorkSession.find({ _id: { $in: settlement.attendanceRecordIds }, payrollSettlementId: settlement._id }).sort({ startedAt: 1 }).lean();
  const advances = await SalaryAdvance.find({ payrollSettlementId: settlement._id, status: 'deducted' }).sort({ date: 1 }).lean();
  await persistCalculation(settlement, settlement.payrollProfileSnapshot, sessions, advances, actor.id);
  return adjustment;
}

export async function approveSettlement(actor: PayrollActor, settlementId: string): Promise<any> {
  const settlement: any = await PayrollSettlement.findById(settlementId);
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  if (!['draft', 'under_review'].includes(settlement.status)) throw new ApiError(409, 'PAYROLL_SETTLEMENT_NOT_APPROVABLE');
  if ((settlement.calculationDetails?.errors ?? []).length) throw new ApiError(422, 'PAYROLL_CALCULATION_BLOCKED');
  settlement.status = 'approved'; settlement.approvedBy = actor.id; settlement.approvedAt = new Date(); settlement.updatedBy = actor.id;
  await settlement.save();
  return settlement;
}

async function payrollExpenseGroups(settlement: any): Promise<{ groups: PayrollExpenseGroup[]; employeeName: string }> {
  const [sessions, employee] = await Promise.all([
    WorkSession.find({ _id: { $in: settlement.attendanceRecordIds ?? [] } }).select('salonId eventId approvedMinutes workedMinutes').lean(),
    User.findById(settlement.employeeId).select('fullName firstName lastName salonIds primarySalonId').lean()
  ]) as [any[], any];
  const grouped = new Map<string, PayrollExpenseGroup>();
  for (const session of sessions) {
    const salonId = stringId((session as any).salonId);
    if (!salonId) continue;
    const eventId = stringId((session as any).eventId);
    const key = `${salonId}:${eventId ?? 'general'}`;
    const current = grouped.get(key);
    const weight = Math.max(1, Number((session as any).approvedMinutes ?? (session as any).workedMinutes ?? 0));
    grouped.set(key, current ? { ...current, weight: current.weight + weight } : { salonId, eventId, weight });
  }
  if (!grouped.size) {
    const fallbackSalons = ids([
      ...(settlement.salonIds ?? []),
      ...(settlement.payrollProfileSnapshot?.salonIds ?? []),
      ...(employee?.salonIds ?? []),
      employee?.primarySalonId
    ]);
    fallbackSalons.forEach((salonId) => grouped.set(`${salonId}:general`, { salonId, weight: 1 }));
  }
  if (!grouped.size) throw new ApiError(422, 'PAYROLL_EXPENSE_ALLOCATION_MISSING');
  const employeeName = employee?.fullName || [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Empleado';
  return { groups: [...grouped.values()], employeeName };
}

async function payrollExpenseCategory(actorId: string): Promise<any> {
  return ExpenseCategory.findOneAndUpdate(
    { code: 'PAYROLL' },
    {
      $setOnInsert: { code: 'PAYROLL', name: 'Sueldos y jornales', type: 'STAFF', isActive: true, createdBy: actorId },
      $set: { updatedBy: actorId }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export async function syncPaidSettlementExpenses(settlement: any, actorId: string): Promise<any[]> {
  const totalMinor = Number(settlement.netAmountMinor ?? 0);
  if (totalMinor <= 0) return [];
  const [{ groups, employeeName }, category] = await Promise.all([payrollExpenseGroups(settlement), payrollExpenseCategory(actorId)]);
  const paidAt = settlement.paidAt ?? new Date();
  const allocations = allocatePayrollExpenseMinor(totalMinor, groups).filter((allocation) => allocation.amountMinor > 0);
  return Promise.all(allocations.map(async (allocation) => {
    const sourceId = `${settlement._id}:${allocation.salonId}:${allocation.eventId ?? 'general'}`;
    const amount = allocation.amountMinor / 100;
    const update: any = {
      $set: {
        date: paidAt,
        salonId: allocation.salonId,
        categoryId: category._id,
        category: SupplierCategory.STAFFING,
        description: `Liquidación ${settlement.settlementCode} · ${employeeName}`,
        amount,
        initialEstimatedAmount: 0,
        finalAmount: amount,
        additionalAmount: 0,
        taxAmount: 0,
        currency: settlement.currency ?? 'ARS',
        status: ExpenseStatus.PAID,
        paymentMethod: settlement.paymentMethod,
        paidAt,
        notes: `Generado automáticamente desde la liquidación ${settlement.settlementCode}.`,
        updatedBy: actorId
      },
      $setOnInsert: { sourceType: ExpenseSourceType.PAYROLL, sourceId, createdBy: actorId }
    };
    if (allocation.eventId) update.$set.eventId = allocation.eventId;
    else update.$unset = { eventId: 1 };
    const expense: any = await Expense.findOneAndUpdate(
      { sourceType: ExpenseSourceType.PAYROLL, sourceId, deletedAt: null },
      update,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (allocation.eventId) await ExpenseAllocation.findOneAndUpdate(
      { expenseId: expense._id, eventId: allocation.eventId, salonId: allocation.salonId, deletedAt: null },
      {
        $set: { amount, percentage: 100, allocationType: 'DIRECT', updatedBy: actorId },
        $setOnInsert: { expenseId: expense._id, eventId: allocation.eventId, salonId: allocation.salonId, createdBy: actorId }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return expense;
  }));
}

export async function markSettlementPaid(actor: PayrollActor, settlementId: string, input: { paymentMethod?: string; paymentReference?: string; paidAt?: Date }) {
  const settlement: any = await PayrollSettlement.findById(settlementId);
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  if (settlement.paymentStatus === 'paid') return { settlement, expenses: await syncPaidSettlementExpenses(settlement, actor.id), idempotentReplay: true };
  if (settlement.status !== 'approved') throw new ApiError(409, 'PAYROLL_SETTLEMENT_NOT_PAYABLE');
  settlement.paymentStatus = 'paid'; settlement.paymentMethod = input.paymentMethod ?? settlement.paymentMethod; settlement.paymentReference = input.paymentReference?.trim(); settlement.paidAt = input.paidAt ?? new Date(); settlement.updatedBy = actor.id;
  const expenses = await syncPaidSettlementExpenses(settlement, actor.id);
  await settlement.save();
  return { settlement, expenses, idempotentReplay: false };
}

export async function cancelSettlement(actor: PayrollActor, settlementId: string, reason: string): Promise<any> {
  const settlement: any = await PayrollSettlement.findById(settlementId);
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  if (!['draft', 'under_review'].includes(settlement.status)) throw new ApiError(409, 'PAYROLL_SETTLEMENT_LOCKED');
  settlement.status = 'cancelled'; settlement.notes = [settlement.notes, `Cancelación: ${reason.trim()}`].filter(Boolean).join('\n'); settlement.updatedBy = actor.id;
  await settlement.save();
  await WorkSession.updateMany({ payrollSettlementId: settlement._id }, { $unset: { payrollSettlementId: 1 } });
  await SalaryAdvance.updateMany({ payrollSettlementId: settlement._id, status: 'deducted' }, { $set: { status: 'pending' }, $unset: { payrollSettlementId: 1 } });
  return settlement;
}

export async function listSettlements(actor: PayrollActor, filters: any) {
  const query: any = {};
  if (filters.employeeId) { await assertEmployeeInScope(actor, filters.employeeId); query.employeeId = filters.employeeId; }
  if (filters.runId) query.payrollRunId = filters.runId;
  if (filters.status) query.status = filters.status;
  if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
  if (filters.from || filters.to) {
    const { start, end } = normalizePayrollPeriod(filters.from ?? new Date(Date.now() - 30 * 86400000), filters.to ?? new Date());
    query.periodStart = { $gte: start }; query.periodEnd = { $lte: end };
  }
  if (!isAdmin(actor)) query.salonIds = { $in: actorSalonIds(actor) };
  const page = filters.page ?? 1; const limit = filters.limit ?? 50;
  const [items, total] = await Promise.all([
    PayrollSettlement.find(query).populate('employeeId', 'firstName lastName fullName').populate('payrollRunId', 'name status').sort({ periodEnd: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PayrollSettlement.countDocuments(query)
  ]);
  return { items, total, page, limit };
}

export async function getSettlement(actor: PayrollActor, id: string): Promise<any> {
  const settlement: any = await PayrollSettlement.findById(id).populate('employeeId', 'firstName lastName fullName email staffProfile.staffCode').populate('attendanceRecordIds').lean();
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  await assertSettlementScope(actor, settlement);
  return settlement;
}

function calculateRunTotals(settlements: any[]) {
  return settlements.reduce((total, settlement) => ({
    settlements: total.settlements + 1,
    baseAmountMinor: total.baseAmountMinor + Number(settlement.baseAmountMinor ?? 0),
    earningsAmountMinor: total.earningsAmountMinor + Number(settlement.earningsAmountMinor ?? 0),
    deductionsAmountMinor: total.deductionsAmountMinor + Number(settlement.deductionsAmountMinor ?? 0),
    grossAmountMinor: total.grossAmountMinor + Number(settlement.grossAmountMinor ?? 0),
    netAmountMinor: total.netAmountMinor + Number(settlement.netAmountMinor ?? 0),
    paidAmountMinor: total.paidAmountMinor + (settlement.paymentStatus === 'paid' ? Number(settlement.netAmountMinor ?? 0) : 0)
  }), { settlements: 0, baseAmountMinor: 0, earningsAmountMinor: 0, deductionsAmountMinor: 0, grossAmountMinor: 0, netAmountMinor: 0, paidAmountMinor: 0 });
}

export async function createPayrollRun(actor: PayrollActor, input: any): Promise<any> {
  const { start, end } = normalizePayrollPeriod(input.periodStart, input.periodEnd);
  assertSalonScope(actor, ids(input.salonIds));
  for (const employeeId of ids(input.employeeIds)) await assertEmployeeInScope(actor, employeeId);
  if (input.idempotencyKey) {
    const replay = await PayrollRun.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (replay) return { run: replay, idempotentReplay: true };
  }
  const run = await PayrollRun.create({ ...input, periodStart: start, periodEnd: end, salonIds: ids(input.salonIds), employeeIds: ids(input.employeeIds), eventId: input.eventId || undefined, generatedBy: actor.id, createdBy: actor.id, updatedBy: actor.id });
  return { run, idempotentReplay: false };
}

export async function listPayrollRuns(actor: PayrollActor, filters: any) {
  const query: any = {};
  if (filters.status) query.status = filters.status;
  if (!isAdmin(actor)) query.salonIds = { $in: actorSalonIds(actor) };
  const page = filters.page ?? 1; const limit = filters.limit ?? 50;
  const [items, total] = await Promise.all([
    PayrollRun.find(query).sort({ periodEnd: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PayrollRun.countDocuments(query)
  ]);
  return { items, total, page, limit };
}

export async function getPayrollRun(actor: PayrollActor, runId: string): Promise<any> {
  const run: any = await PayrollRun.findById(runId).lean();
  if (!run) throw new ApiError(404, 'PAYROLL_RUN_NOT_FOUND');
  assertSalonScope(actor, ids(run.salonIds));
  const settlements = await PayrollSettlement.find({ payrollRunId: run._id }).populate('employeeId', 'firstName lastName fullName').sort({ createdAt: 1 }).lean();
  return { run, settlements };
}

export async function calculatePayrollRun(actor: PayrollActor, runId: string) {
  const run: any = await PayrollRun.findById(runId);
  if (!run) throw new ApiError(404, 'PAYROLL_RUN_NOT_FOUND');
  assertSalonScope(actor, ids(run.salonIds));
  if (!['draft', 'calculated'].includes(run.status)) throw new ApiError(409, 'PAYROLL_RUN_LOCKED');
  const employeeIds = ids(run.employeeIds);
  const employees = employeeIds.length ? employeeIds : ids((await User.find({ active: true, deletedAt: null, salonIds: { $in: ids(run.salonIds) } }).select('_id').lean()).map((user: any) => user._id));
  const created: string[] = []; const failures: Array<{ employeeId: string; code: string; message: string }> = [];
  for (const employeeId of employees) {
    const existing: any = await PayrollSettlement.findOne({ payrollRunId: run._id, employeeId }).lean();
    if (existing) { created.push(String(existing._id)); continue; }
    try {
      const { start, end, endExclusive } = normalizePayrollPeriod(run.periodStart, run.periodEnd);
      const profile = await getProfileForPeriod(employeeId, start, end);
      const sessions = await settlementSessions(employeeId, start, endExclusive, stringId(run.eventId));
      const errors = calculationErrors(profile, sessions);
      if (errors.length) throw new ApiError(422, 'PAYROLL_CALCULATION_BLOCKED', errors.join(' '));
      const settlement: any = await PayrollSettlement.create({ settlementCode: `LIQ-${randomUUID().slice(0, 8).toUpperCase()}`, payrollRunId: run._id, employeeId, payrollProfileSnapshot: profileSnapshot(profile), periodStart: start, periodEnd: end, currency: profile.currency, paymentMethod: profile.paymentMethod, calculationVersion: PAYROLL_CALCULATION_VERSION, createdBy: actor.id, updatedBy: actor.id });
      try {
        await reserveSessions(String(settlement._id), sessions);
        const advances = await SalaryAdvance.find({ employeeId, status: 'pending', date: { $lte: end } }).sort({ date: 1 }).lean();
        await reserveAdvances(String(settlement._id), advances);
        await persistCalculation(settlement, profile, sessions, advances, actor.id);
        created.push(String(settlement._id));
      } catch (error) {
        await WorkSession.updateMany({ payrollSettlementId: settlement._id }, { $unset: { payrollSettlementId: 1 } });
        await SalaryAdvance.updateMany({ payrollSettlementId: settlement._id, status: 'deducted' }, { $set: { status: 'pending' }, $unset: { payrollSettlementId: 1 } });
        settlement.status = 'cancelled'; await settlement.save(); throw error;
      }
    } catch (error) {
      const known = error as ApiError;
      failures.push({ employeeId, code: known.code ?? 'INTERNAL_ERROR', message: known.message ?? 'No se pudo calcular la liquidación.' });
    }
  }
  const settlements = await PayrollSettlement.find({ payrollRunId: run._id }).lean();
  run.status = failures.length ? 'under_review' : 'calculated'; run.calculatedAt = new Date(); run.totals = calculateRunTotals(settlements); run.updatedBy = actor.id; await run.save();
  return { run, created, failures };
}

export async function transitionPayrollRun(actor: PayrollActor, runId: string, action: 'submit-review' | 'approve' | 'mark-paid') {
  const run: any = await PayrollRun.findById(runId);
  if (!run) throw new ApiError(404, 'PAYROLL_RUN_NOT_FOUND');
  assertSalonScope(actor, ids(run.salonIds));
  const settlements: any[] = await PayrollSettlement.find({ payrollRunId: run._id });
  if (!settlements.length) throw new ApiError(422, 'PAYROLL_RUN_EMPTY');
  if (action === 'submit-review') {
    if (!['calculated', 'under_review'].includes(run.status)) throw new ApiError(409, 'PAYROLL_RUN_LOCKED');
    await PayrollSettlement.updateMany({ payrollRunId: run._id, status: 'draft' }, { $set: { status: 'under_review', updatedBy: actor.id } });
    run.status = 'under_review'; run.updatedBy = actor.id; await run.save(); return { run, failures: [] };
  }
  if (action === 'approve') {
    if (!['calculated', 'under_review'].includes(run.status)) throw new ApiError(409, 'PAYROLL_RUN_LOCKED');
    const failures: Array<{ settlementId: string; code: string; message: string }> = [];
    for (const settlement of settlements) {
      try { await approveSettlement(actor, String(settlement._id)); }
      catch (error) { const known = error as ApiError; failures.push({ settlementId: String(settlement._id), code: known.code ?? 'INTERNAL_ERROR', message: known.message }); }
    }
    run.status = failures.length ? 'under_review' : 'approved'; if (!failures.length) { run.approvedBy = actor.id; run.approvedAt = new Date(); } run.updatedBy = actor.id; run.totals = calculateRunTotals(await PayrollSettlement.find({ payrollRunId: run._id }).lean()); await run.save(); return { run, failures };
  }
  if (!['approved', 'partially_paid'].includes(run.status)) throw new ApiError(409, 'PAYROLL_RUN_NOT_PAYABLE');
  const failures: Array<{ settlementId: string; code: string; message: string }> = [];
  for (const settlement of settlements) {
    try { await markSettlementPaid(actor, String(settlement._id), {}); }
    catch (error) { const known = error as ApiError; failures.push({ settlementId: String(settlement._id), code: known.code ?? 'INTERNAL_ERROR', message: known.message }); }
  }
  const finalSettlements = await PayrollSettlement.find({ payrollRunId: run._id }).lean();
  run.status = finalSettlements.every((settlement: any) => settlement.paymentStatus === 'paid') ? 'paid' : 'partially_paid'; if (run.status === 'paid') run.paidAt = new Date(); run.updatedBy = actor.id; run.totals = calculateRunTotals(finalSettlements); await run.save(); return { run, failures };
}

export async function listPayrollConcepts(filters: { active?: string; search?: string }) {
  await ensurePayrollBaseConcepts();
  const query: any = {};
  if (filters.active !== undefined) query.isActive = filters.active === 'true';
  if (filters.search?.trim()) query.$or = [{ code: { $regex: filters.search.trim(), $options: 'i' } }, { name: { $regex: filters.search.trim(), $options: 'i' } }];
  return PayrollConcept.find(query).sort({ displayOrder: 1, name: 1 }).lean();
}

export async function createPayrollConcept(actor: PayrollActor, input: any) {
  return PayrollConcept.create({ ...input, code: input.code.toUpperCase(), createdBy: actor.id, updatedBy: actor.id });
}

export async function updatePayrollConcept(actor: PayrollActor, conceptId: string, input: any) {
  const concept: any = await PayrollConcept.findById(conceptId);
  if (!concept) throw new ApiError(404, 'PAYROLL_CONCEPT_NOT_FOUND');
  if (input.code && input.code !== concept.code) {
    const used = await PayrollSettlement.exists({ 'items.conceptId': concept._id });
    if (used) throw new ApiError(409, 'PAYROLL_CONCEPT_HISTORICAL_LOCKED');
  }
  Object.assign(concept, { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}), updatedBy: actor.id });
  await concept.save(); return concept;
}

export async function listSalaryAdvances(actor: PayrollActor, filters: any) {
  const query: any = {};
  if (filters.employeeId) { await assertEmployeeInScope(actor, filters.employeeId); query.employeeId = filters.employeeId; }
  if (filters.status) query.status = filters.status;
  const page = filters.page ?? 1; const limit = filters.limit ?? 50;
  const [items, total] = await Promise.all([
    SalaryAdvance.find(query).populate('employeeId', 'firstName lastName fullName salonIds managedSalonIds').sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SalaryAdvance.countDocuments(query)
  ]);
  const scoped = isAdmin(actor) ? items : items.filter((advance: any) => [...ids(advance.employeeId?.salonIds), ...ids(advance.employeeId?.managedSalonIds)].some((salonId) => actorSalonIds(actor).includes(salonId)));
  return { items: scoped, total: isAdmin(actor) ? total : scoped.length, page, limit };
}

export async function createSalaryAdvance(actor: PayrollActor, input: any) {
  await assertEmployeeInScope(actor, input.employeeId);
  assertPositiveInteger(input.amountMinor, 'amountMinor');
  if (!input.amountMinor) throw new ApiError(422, 'PAYROLL_INVALID_AMOUNT');
  return SalaryAdvance.create({ ...input, currency: String(input.currency ?? 'ARS').toUpperCase(), createdBy: actor.id, updatedBy: actor.id });
}

export async function updateSalaryAdvance(actor: PayrollActor, id: string, input: any) {
  const advance: any = await SalaryAdvance.findById(id);
  if (!advance) throw new ApiError(404, 'PAYROLL_ADVANCE_NOT_FOUND');
  await assertEmployeeInScope(actor, String(advance.employeeId));
  if (advance.status === 'deducted') throw new ApiError(409, 'PAYROLL_ADVANCE_LOCKED');
  if (input.amountMinor !== undefined) { assertPositiveInteger(input.amountMinor, 'amountMinor'); if (!input.amountMinor) throw new ApiError(422, 'PAYROLL_INVALID_AMOUNT'); }
  if (input.status === 'cancelled' && !input.cancellationReason?.trim()) throw new ApiError(422, 'PAYROLL_REASON_REQUIRED');
  const previous = { amountMinor: advance.amountMinor, date: advance.date, reason: advance.reason, status: advance.status, payrollSettlementId: advance.payrollSettlementId };
  Object.assign(advance, { ...input, updatedBy: actor.id, ...(input.status === 'cancelled' ? { cancelledAt: new Date(), cancelledBy: actor.id } : {}) });
  await advance.save(); return { advance, previous };
}

export async function payrollDashboard(actor: PayrollActor, from: Date, to: Date) {
  const { start, end, endExclusive } = normalizePayrollPeriod(from, to);
  const attendanceScope: any = isAdmin(actor) ? {} : { salonId: { $in: actorSalonIds(actor) } };
  const settlementScope: any = isAdmin(actor) ? {} : { salonIds: { $in: actorSalonIds(actor) } };
  const [withoutProfile, incomplete, pendingAttendance, review, unpaid, recent, estimated] = await Promise.all([
    User.countDocuments({ active: true, deletedAt: null, ...(isAdmin(actor) ? {} : { salonIds: { $in: actorSalonIds(actor) } }), _id: { $nin: await PayrollProfile.distinct('employeeId', { isActive: true }) } }),
    WorkSession.countDocuments({ ...attendanceScope, startedAt: { $gte: start, $lt: endExclusive }, $or: [{ endedAt: null }, { status: { $in: ['active', 'incomplete'] } }] }),
    WorkSession.countDocuments({ ...attendanceScope, startedAt: { $gte: start, $lt: endExclusive }, payrollApprovalStatus: { $in: [null, 'pending'] }, status: { $in: ['completed', 'adjusted'] }, requiresReview: false }),
    PayrollSettlement.countDocuments({ ...settlementScope, status: 'under_review', periodStart: { $gte: start }, periodEnd: { $lte: end } }),
    PayrollSettlement.countDocuments({ ...settlementScope, status: 'approved', paymentStatus: 'unpaid', periodStart: { $gte: start }, periodEnd: { $lte: end } }),
    PayrollSettlement.find(settlementScope).populate('employeeId', 'firstName lastName fullName').sort({ createdAt: -1 }).limit(8).lean(),
    PayrollSettlement.aggregate([{ $match: { ...settlementScope, status: { $in: ['draft', 'under_review', 'approved'] }, periodStart: { $gte: start }, periodEnd: { $lte: end } } }, { $group: { _id: null, netAmountMinor: { $sum: '$netAmountMinor' } } }])
  ]);
  return { withoutProfile, incomplete, pendingAttendance, review, unpaid, estimatedAmountMinor: Number(estimated[0]?.netAmountMinor ?? 0), recent };
}

export async function mobilePayrollSettlements(employeeId: string, filters: any) {
  const query: any = { employeeId, status: 'approved' };
  if (filters.from || filters.to) {
    const { start, end } = normalizePayrollPeriod(filters.from ?? new Date(Date.now() - 180 * 86400000), filters.to ?? new Date());
    query.periodStart = { $gte: start }; query.periodEnd = { $lte: end };
  }
  return PayrollSettlement.find(query).select('settlementCode periodStart periodEnd status paymentStatus paymentMethod paymentReference paidAt netAmountMinor grossAmountMinor deductionsAmountMinor currency receipt createdAt').sort({ periodEnd: -1 }).lean();
}

export async function mobilePayrollSettlement(employeeId: string, settlementId: string) {
  const settlement = await PayrollSettlement.findOne({ _id: settlementId, employeeId, status: 'approved' }).select('-payrollProfileSnapshot').lean();
  if (!settlement) throw new ApiError(404, 'PAYROLL_SETTLEMENT_NOT_FOUND');
  return settlement;
}

export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}
