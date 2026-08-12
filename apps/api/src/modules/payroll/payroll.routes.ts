import { Router } from 'express';
import { z } from 'zod';
import { ObjectIdSchema, Permission, Role } from '@mym/shared';
import { requireAnyPermission, requireAuth } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { AuditLog } from '../audit/auditLog.model';
import { PayrollAdjustment } from './payroll.models';
import * as payrollService from './payroll.service';
import { createRunPdf, settlementsCsv, settlementsExcelXml, storeSettlementReceipt } from './payroll.document.service';

const router = Router();
const optionalId = ObjectIdSchema.optional().or(z.literal(''));
const pagination = { page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(50) };
const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };
const method = z.enum(['cash', 'bank_transfer', 'mercado_pago', 'card', 'other']);
const amount = z.coerce.number().int().nonnegative();
const bodyEmpty = z.unknown().optional();
const actor = (request: any): payrollService.PayrollActor => request.user;
const anyPayrollView = () => requireAnyPermission([Permission.PAYROLL_VIEW, Permission.PAYROLL_READ, Permission.PAYROLL_MANAGE]);
const anyPayrollProfiles = () => requireAnyPermission([Permission.PAYROLL_MANAGE_PROFILES, Permission.PAYROLL_MANAGE]);
const anyPayrollAttendance = () => requireAnyPermission([Permission.PAYROLL_MANAGE_ATTENDANCE, Permission.PAYROLL_MANAGE]);
const anyPayrollCreate = () => requireAnyPermission([Permission.PAYROLL_CREATE, Permission.PAYROLL_MANAGE]);
const anyPayrollCalculate = () => requireAnyPermission([Permission.PAYROLL_CALCULATE, Permission.PAYROLL_MANAGE]);
const anyPayrollApprove = () => requireAnyPermission([Permission.PAYROLL_APPROVE, Permission.PAYROLL_MANAGE]);
const anyPayrollPay = () => requireAnyPermission([Permission.PAYROLL_PAY, Permission.PAYROLL_MANAGE]);
const anyPayrollExport = () => requireAnyPermission([Permission.PAYROLL_EXPORT, Permission.PAYROLL_MANAGE]);
const anyPayrollAudit = () => requireAnyPermission([Permission.PAYROLL_AUDIT, Permission.PAYROLL_MANAGE]);

const profileBody = z.object({
  employeeId: ObjectIdSchema,
  compensationType: z.enum(['hourly', 'daily', 'monthly', 'per_event', 'mixed']),
  payrollFrequency: z.enum(['weekly', 'biweekly', 'monthly', 'custom']),
  currency: z.string().trim().length(3).default('ARS'),
  hourlyRateMinor: amount.optional(),
  dailyRateMinor: amount.optional(),
  monthlySalaryMinor: amount.optional(),
  eventRateMinor: amount.optional(),
  expectedMonthlyHours: z.coerce.number().nonnegative().optional(),
  overtimeAfterMinutes: z.coerce.number().int().nonnegative().optional(),
  overtimeMultiplier: z.coerce.number().min(1).optional(),
  nightMultiplier: z.coerce.number().min(1).optional(),
  weekendMultiplier: z.coerce.number().min(1).optional(),
  holidayMultiplier: z.coerce.number().min(1).optional(),
  nightStartHour: z.coerce.number().int().min(0).max(23).optional(),
  nightEndHour: z.coerce.number().int().min(0).max(23).optional(),
  graceMinutes: z.coerce.number().int().nonnegative().optional(),
  roundingRule: z.enum(['none', 'nearest_5', 'floor_5', 'ceil_5', 'nearest_15', 'floor_15', 'ceil_15']).optional(),
  breakPolicy: z.enum(['unpaid', 'paid', 'manual']).optional(),
  paymentMethod: method.optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  salonIds: z.array(ObjectIdSchema).default([]),
  notes: z.string().trim().max(2000).optional()
});
const profileUpdateBody = profileBody.omit({ employeeId: true }).partial();
const conceptBody = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  type: z.enum(['earning', 'deduction']),
  source: z.enum(['attendance', 'overtime', 'event', 'bonus', 'advance', 'reimbursement', 'manual', 'adjustment']),
  isAutomatic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  requiresReason: z.boolean().default(false),
  displayOrder: z.coerce.number().int().default(0)
});
const runBody = z.object({
  name: z.string().trim().min(3).max(180),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'custom']),
  salonIds: z.array(ObjectIdSchema).min(1),
  employeeIds: z.array(ObjectIdSchema).default([]),
  eventId: optionalId,
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional()
});
const settlementBody = z.object({
  employeeId: ObjectIdSchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  eventId: optionalId,
  notes: z.string().trim().max(2000).optional()
});
const advanceBody = z.object({
  employeeId: ObjectIdSchema,
  date: z.coerce.date(),
  amountMinor: z.coerce.number().int().positive(),
  currency: z.string().trim().length(3).default('ARS'),
  reason: z.string().trim().min(3).max(1000),
  attachment: z.object({ url: z.string().url(), secureUrl: z.string().url().optional(), publicId: z.string().optional(), resourceType: z.enum(['image', 'video', 'raw']).optional(), format: z.string().optional(), bytes: z.number().int().nonnegative().optional(), filename: z.string().optional() }).optional()
});
const idParam = z.object({ body: bodyEmpty, params: z.object({ id: ObjectIdSchema }), query: z.object({}) });

router.use(requireAuth);

router.get('/dashboard', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object(dateRange) })), asyncHandler(async (request, response) => {
  const now = new Date();
  const from = (request.query as any).from ?? new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const to = (request.query as any).to ?? now;
  return sendSuccess(response, await payrollService.payrollDashboard(actor(request), from, to));
}));

router.get('/profiles', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ employeeId: ObjectIdSchema.optional(), active: z.enum(['true', 'false']).optional(), search: z.string().trim().max(160).optional(), ...pagination }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.listPayrollProfiles(actor(request), request.query));
}));
router.get('/profiles/:employeeId', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({ employeeId: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, { items: await payrollService.getEmployeePayrollProfiles(actor(request), request.params.employeeId) });
}));
router.post('/profiles', anyPayrollProfiles(), validateRequest(z.object({ body: profileBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const profile = await payrollService.createPayrollProfile(actor(request), request.body);
  await writeAuditLog(request, 'PAYROLL_PROFILE_CREATE', 'PayrollProfile', String(profile._id), { employeeId: request.body.employeeId, effectiveFrom: profile.effectiveFrom, version: profile.version });
  return sendSuccess(response, { profile }, 201);
}));
router.patch('/profiles/:id', anyPayrollProfiles(), validateRequest(z.object({ body: profileUpdateBody.refine((value) => Object.keys(value).length > 0), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const result = await payrollService.updatePayrollProfile(actor(request), request.params.id, request.body);
  await writeAuditLog(request, result.versioned ? 'PAYROLL_PROFILE_VERSION_CREATE' : 'PAYROLL_PROFILE_UPDATE', 'PayrollProfile', String(result.profile._id), { supersedesProfileId: result.versioned ? request.params.id : undefined, before: result.previous, after: result.profile.toObject?.() ?? result.profile, changes: request.body });
  return sendSuccess(response, { profile: result.profile });
}));
router.delete('/profiles/:id', anyPayrollProfiles(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const result = await payrollService.deletePayrollProfile(actor(request), request.params.id);
  await writeAuditLog(request, result.deactivated ? 'PAYROLL_PROFILE_DEACTIVATE' : 'PAYROLL_PROFILE_DELETE', 'PayrollProfile', request.params.id, { before: result.previous, deleted: result.deleted, deactivated: result.deactivated });
  return sendSuccess(response, { deleted: result.deleted, deactivated: result.deactivated });
}));

router.get('/attendance', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ employeeId: ObjectIdSchema.optional(), salonId: ObjectIdSchema.optional(), eventId: ObjectIdSchema.optional(), status: z.enum(['pending', 'approved', 'rejected']).optional(), incomplete: z.enum(['true', 'false']).optional(), observed: z.enum(['true', 'false']).optional(), ...dateRange, ...pagination }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.listPayrollAttendance(actor(request), request.query));
}));
router.patch('/attendance/:id', anyPayrollAttendance(), validateRequest(z.object({ body: z.object({ approvedMinutes: z.coerce.number().int().nonnegative(), reason: z.string().trim().min(3).max(1000) }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const { session, original } = await payrollService.updatePayrollAttendance(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_ATTENDANCE_ADJUST', 'WorkSession', request.params.id, { before: original, after: { approvedMinutes: session.approvedMinutes }, reason: request.body.reason });
  return sendSuccess(response, { session });
}));
router.post('/attendance/:id/approve', anyPayrollAttendance(), validateRequest(z.object({ body: z.object({ approvedMinutes: z.coerce.number().int().nonnegative().optional(), reason: z.string().trim().min(3).max(1000).optional() }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const { session, original } = await payrollService.approvePayrollAttendance(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_ATTENDANCE_APPROVE', 'WorkSession', request.params.id, { before: original, after: { approvedMinutes: session.approvedMinutes }, reason: request.body.reason });
  return sendSuccess(response, { session });
}));
router.post('/attendance/:id/reject', anyPayrollAttendance(), validateRequest(z.object({ body: z.object({ reason: z.string().trim().min(3).max(1000) }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const { session, original } = await payrollService.rejectPayrollAttendance(actor(request), request.params.id, request.body.reason);
  await writeAuditLog(request, 'PAYROLL_ATTENDANCE_REJECT', 'WorkSession', request.params.id, { before: original, after: { reason: request.body.reason } });
  return sendSuccess(response, { session });
}));
router.post('/attendance/bulk-approve', anyPayrollAttendance(), validateRequest(z.object({ body: z.object({ sessionIds: z.array(ObjectIdSchema).min(1).max(200) }), params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const result = await payrollService.bulkApprovePayrollAttendance(actor(request), request.body.sessionIds);
  await writeAuditLog(request, 'PAYROLL_ATTENDANCE_BULK_APPROVE', 'WorkSession', undefined, { approved: result.approved, failures: result.failures });
  return sendSuccess(response, result);
}));

router.get('/concepts', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ active: z.enum(['true', 'false']).optional(), search: z.string().trim().max(120).optional() }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, { items: await payrollService.listPayrollConcepts(request.query) });
}));
router.post('/concepts', anyPayrollProfiles(), validateRequest(z.object({ body: conceptBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const concept = await payrollService.createPayrollConcept(actor(request), request.body);
  await writeAuditLog(request, 'PAYROLL_CONCEPT_CREATE', 'PayrollConcept', String(concept._id), request.body);
  return sendSuccess(response, { concept }, 201);
}));
router.patch('/concepts/:id', anyPayrollProfiles(), validateRequest(z.object({ body: conceptBody.partial().refine((value) => Object.keys(value).length > 0), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const concept = await payrollService.updatePayrollConcept(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_CONCEPT_UPDATE', 'PayrollConcept', String(concept._id), request.body);
  return sendSuccess(response, { concept });
}));

router.get('/runs', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ status: z.enum(['draft', 'calculated', 'under_review', 'approved', 'partially_paid', 'paid', 'cancelled']).optional(), ...pagination }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.listPayrollRuns(actor(request), request.query));
}));
router.post('/runs', anyPayrollCreate(), validateRequest(z.object({ body: runBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const result = await payrollService.createPayrollRun(actor(request), request.body);
  await writeAuditLog(request, 'PAYROLL_RUN_CREATE', 'PayrollRun', String(result.run._id), { periodStart: result.run.periodStart, periodEnd: result.run.periodEnd, idempotentReplay: result.idempotentReplay });
  return sendSuccess(response, result, result.idempotentReplay ? 200 : 201);
}));
router.get('/runs/:id', anyPayrollView(), validateRequest(idParam), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.getPayrollRun(actor(request), request.params.id));
}));
router.post('/runs/:id/calculate', anyPayrollCalculate(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const result = await payrollService.calculatePayrollRun(actor(request), request.params.id);
  await writeAuditLog(request, 'PAYROLL_RUN_CALCULATE', 'PayrollRun', request.params.id, { created: result.created, failures: result.failures });
  return sendSuccess(response, result);
}));
router.post('/runs/:id/submit-review', anyPayrollCalculate(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const result = await payrollService.transitionPayrollRun(actor(request), request.params.id, 'submit-review');
  await writeAuditLog(request, 'PAYROLL_RUN_SUBMIT_REVIEW', 'PayrollRun', request.params.id);
  return sendSuccess(response, result);
}));
router.post('/runs/:id/approve', anyPayrollApprove(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const result = await payrollService.transitionPayrollRun(actor(request), request.params.id, 'approve');
  await writeAuditLog(request, 'PAYROLL_RUN_APPROVE', 'PayrollRun', request.params.id, { failures: result.failures });
  return sendSuccess(response, result);
}));
router.post('/runs/:id/mark-paid', anyPayrollPay(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const result = await payrollService.transitionPayrollRun(actor(request), request.params.id, 'mark-paid');
  await writeAuditLog(request, 'PAYROLL_RUN_MARK_PAID', 'PayrollRun', request.params.id, { failures: result.failures });
  return sendSuccess(response, result);
}));
router.get('/runs/:id/export/pdf', anyPayrollExport(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const { run, settlements } = await payrollService.getPayrollRun(actor(request), request.params.id);
  const buffer = await createRunPdf(run, settlements);
  await writeAuditLog(request, 'PAYROLL_EXPORT_RUN_PDF', 'PayrollRun', request.params.id);
  response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Content-Disposition', `attachment; filename="lote-${run._id}.pdf"`); return response.send(buffer);
}));

router.get('/settlements/export/:format', anyPayrollExport(), validateRequest(z.object({ body: bodyEmpty, params: z.object({ format: z.enum(['csv', 'excel']) }), query: z.object({ employeeId: ObjectIdSchema.optional(), runId: ObjectIdSchema.optional(), status: z.enum(['draft', 'under_review', 'approved', 'cancelled']).optional(), paymentStatus: z.enum(['unpaid', 'paid']).optional(), ...dateRange }) })), asyncHandler(async (request, response) => {
  const result = await payrollService.listSettlements(actor(request), { ...request.query, page: 1, limit: 100 });
  const isExcel = request.params.format === 'excel'; const contents = isExcel ? settlementsExcelXml(result.items) : settlementsCsv(result.items);
  await writeAuditLog(request, isExcel ? 'PAYROLL_EXPORT_EXCEL' : 'PAYROLL_EXPORT_CSV', 'PayrollSettlement', undefined, { count: result.items.length });
  response.setHeader('Content-Type', isExcel ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="liquidaciones.${isExcel ? 'xls' : 'csv'}"`); return response.send(contents);
}));
router.get('/settlements', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ employeeId: ObjectIdSchema.optional(), runId: ObjectIdSchema.optional(), status: z.enum(['draft', 'under_review', 'approved', 'cancelled']).optional(), paymentStatus: z.enum(['unpaid', 'paid']).optional(), ...dateRange, ...pagination }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.listSettlements(actor(request), request.query));
}));
router.post('/settlements/individual', anyPayrollCreate(), validateRequest(z.object({ body: settlementBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const settlement = await payrollService.createIndividualSettlement(actor(request), request.body);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_CREATE', 'PayrollSettlement', String(settlement._id), { employeeId: request.body.employeeId, periodStart: settlement.periodStart, periodEnd: settlement.periodEnd });
  return sendSuccess(response, { settlement }, 201);
}));
router.get('/settlements/:id', anyPayrollView(), validateRequest(idParam), asyncHandler(async (request, response) => {
  return sendSuccess(response, { settlement: await payrollService.getSettlement(actor(request), request.params.id) });
}));
router.post('/settlements/:id/recalculate', anyPayrollCalculate(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const settlement = await payrollService.recalculateSettlement(actor(request), request.params.id);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_RECALCULATE', 'PayrollSettlement', request.params.id, { calculationVersion: settlement.calculationVersion });
  return sendSuccess(response, { settlement });
}));
router.post('/settlements/:id/approve', anyPayrollApprove(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const settlement = await payrollService.approveSettlement(actor(request), request.params.id);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_APPROVE', 'PayrollSettlement', request.params.id);
  return sendSuccess(response, { settlement });
}));
router.post('/settlements/:id/mark-paid', anyPayrollPay(), validateRequest(z.object({ body: z.object({ paymentMethod: method.optional(), paymentReference: z.string().trim().max(300).optional(), paidAt: z.coerce.date().optional() }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const result = await payrollService.markSettlementPaid(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_MARK_PAID', 'PayrollSettlement', request.params.id, { paymentReference: request.body.paymentReference, generatedExpenses: result.expenses.length, idempotentReplay: result.idempotentReplay });
  return sendSuccess(response, result);
}));
router.post('/settlements/:id/cancel', anyPayrollCalculate(), validateRequest(z.object({ body: z.object({ reason: z.string().trim().min(3).max(1000) }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const settlement = await payrollService.cancelSettlement(actor(request), request.params.id, request.body.reason);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_CANCEL', 'PayrollSettlement', request.params.id, { reason: request.body.reason });
  return sendSuccess(response, { settlement });
}));
router.post('/settlements/:id/items', anyPayrollCalculate(), validateRequest(z.object({ body: z.object({ conceptId: ObjectIdSchema, amountMinor: z.coerce.number().int().positive(), quantity: z.coerce.number().positive().optional(), reason: z.string().trim().min(3).max(1000) }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const adjustment = await payrollService.addSettlementItem(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_ADD_ITEM', 'PayrollSettlement', request.params.id, { adjustmentId: adjustment._id, reason: request.body.reason, amountMinor: request.body.amountMinor });
  return sendSuccess(response, { adjustment }, 201);
}));
router.post('/settlements/:id/receipt', anyPayrollExport(), validateRequest(idParam), asyncHandler(async (request, response) => {
  const settlement = await payrollService.getSettlement(actor(request), request.params.id);
  if (settlement.status !== 'approved') throw new ApiError(409, 'PAYROLL_SETTLEMENT_RECEIPT_LOCKED');
  const receipt = await storeSettlementReceipt(request.params.id);
  await writeAuditLog(request, 'PAYROLL_SETTLEMENT_RECEIPT_GENERATE', 'PayrollSettlement', request.params.id);
  return sendSuccess(response, { receipt });
}));

router.get('/advances', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ employeeId: ObjectIdSchema.optional(), status: z.enum(['pending', 'deducted', 'cancelled']).optional(), ...pagination }) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await payrollService.listSalaryAdvances(actor(request), request.query));
}));
router.post('/advances', anyPayrollCreate(), validateRequest(z.object({ body: advanceBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const advance = await payrollService.createSalaryAdvance(actor(request), request.body);
  await writeAuditLog(request, 'PAYROLL_ADVANCE_CREATE', 'SalaryAdvance', String(advance._id), { employeeId: request.body.employeeId, amountMinor: request.body.amountMinor, reason: request.body.reason });
  return sendSuccess(response, { advance }, 201);
}));
router.patch('/advances/:id', anyPayrollCreate(), validateRequest(z.object({ body: advanceBody.omit({ employeeId: true }).partial().extend({ status: z.enum(['pending', 'cancelled']).optional(), cancellationReason: z.string().trim().min(3).max(1000).optional() }).refine((value) => Object.keys(value).length > 0), params: z.object({ id: ObjectIdSchema }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const result = await payrollService.updateSalaryAdvance(actor(request), request.params.id, request.body);
  await writeAuditLog(request, 'PAYROLL_ADVANCE_UPDATE', 'SalaryAdvance', request.params.id, { before: result.previous, after: result.advance.toObject?.() ?? result.advance, reason: request.body.cancellationReason });
  return sendSuccess(response, { advance: result.advance });
}));

router.get('/adjustments', anyPayrollView(), validateRequest(z.object({ body: bodyEmpty, params: z.object({}), query: z.object({ settlementId: ObjectIdSchema.optional(), employeeId: ObjectIdSchema.optional(), ...pagination }) })), asyncHandler(async (request, response) => {
  const query: any = {}; if ((request.query as any).settlementId) query.settlementId = (request.query as any).settlementId; if ((request.query as any).employeeId) { await payrollService.assertEmployeeInScope(actor(request), (request.query as any).employeeId); query.employeeId = (request.query as any).employeeId; }
  const page = (request.query as any).page; const limit = (request.query as any).limit;
  const items = await PayrollAdjustment.find(query).populate('conceptId', 'name code type').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  return sendSuccess(response, { items, total: await PayrollAdjustment.countDocuments(query), page, limit });
}));

router.get('/audit', anyPayrollAudit(), asyncHandler(async (request, response) => {
  if (!request.user!.roles.includes(Role.ADMIN)) throw new ApiError(403, 'FORBIDDEN');
  const logs = await AuditLog.find({ entityType: { $in: ['PayrollProfile', 'PayrollConcept', 'PayrollRun', 'PayrollSettlement', 'SalaryAdvance', 'WorkSession'] }, action: { $regex: '^PAYROLL_' } }).populate('actorUserId', 'firstName lastName fullName').sort({ createdAt: -1 }).limit(300).lean();
  return sendSuccess(response, { items: logs });
}));

export default router;
