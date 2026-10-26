import { Router } from 'express';
import { Permission, Role } from '@mym/shared';
import { z } from 'zod';
import { Salon } from '../salons/salon.model';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { SalonMonthlyGoal } from './salon-monthly-goal.model';
import { commercialGoals } from './commercial-goals.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { dashboardAgenda, dashboardAlerts, dashboardSummary } from './dashboard.service';
import { dashboardMetricDefinitions } from './metric-catalog';

const router = Router();
router.use(requireAuth, requirePermission(Permission.DASHBOARD_VIEW));

type TimedResult<T> = { value: T; elapsedMs: number };
async function timed<T>(work: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const value = await work();
  return { value, elapsedMs: Date.now() - startedAt };
}

router.get('/initial', asyncHandler(async (request, response) => {
  const startedAt = Date.now();
  const [summaryResult, agendaResult, alertsResult] = await Promise.all([
    timed(() => dashboardSummary(request)),
    timed(() => dashboardAgenda(request)),
    timed(() => dashboardAlerts(request)),
  ]);
  const elapsedMs = Date.now() - startedAt;
  response.append('Server-Timing', `dashboard-summary;dur=${summaryResult.elapsedMs}`);
  response.append('Server-Timing', `dashboard-agenda;dur=${agendaResult.elapsedMs}`);
  response.append('Server-Timing', `dashboard-alerts;dur=${alertsResult.elapsedMs}`);

  if (elapsedMs >= 750) {
    console.warn(JSON.stringify({
      event: 'slow_dashboard_initial',
      elapsedMs,
      summaryMs: summaryResult.elapsedMs,
      agendaMs: agendaResult.elapsedMs,
      alertsMs: alertsResult.elapsedMs,
      userId: request.user?.id ?? null,
      region: process.env.VERCEL_REGION ?? null,
    }));
  }

  return sendSuccess(response, {
    summary: summaryResult.value,
    agenda: agendaResult.value,
    alerts: alertsResult.value,
  });
}));
router.get('/summary', asyncHandler(async (request, response) => sendSuccess(response, await dashboardSummary(request))));
router.get('/agenda', asyncHandler(async (request, response) => sendSuccess(response, await dashboardAgenda(request))));
router.get('/alerts', asyncHandler(async (request, response) => sendSuccess(response, await dashboardAlerts(request))));
router.get('/metrics', asyncHandler(async (_request, response) => sendSuccess(response, { items: dashboardMetricDefinitions })));

const goalQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
router.get('/commercial-goals', asyncHandler(async (request, response) => {
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date());
  const [defaultYear, defaultMonth] = localToday.split('-').map(Number);
  const parsed = goalQuery.safeParse({ year: request.query.year ?? defaultYear, month: request.query.month ?? defaultMonth });
  if (!parsed.success) throw new ApiError(400, 'GOAL_PERIOD_INVALID');
  return sendSuccess(response, await commercialGoals(request, parsed.data.year, parsed.data.month));
}));

const goalBody = goalQuery.extend({
  salonId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  target: z.coerce.number().int().min(1).max(1000),
  reason: z.string().trim().max(500).optional(),
});
router.put('/commercial-goals', asyncHandler(async (request, response) => {
  if (!request.user!.roles.includes(Role.ADMIN)) throw new ApiError(403, 'FORBIDDEN');
  const parsed = goalBody.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'GOAL_INVALID');
  const { salonId, year, month, target, reason } = parsed.data;
  if (!canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const salon = await Salon.findOne({ _id: salonId, active: true, deletedAt: null }).select('_id').lean();
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date());
  if (`${year}-${String(month).padStart(2, '0')}` < today) throw new ApiError(422, 'GOAL_HISTORICAL_LOCKED');
  const existing: any = await SalonMonthlyGoal.findOne({ salonId, year, month });
  if (existing && existing.target !== target && !reason) throw new ApiError(400, 'GOAL_CHANGE_REASON_REQUIRED');
  if (existing) {
    if (existing.target !== target) {
      existing.history.push({ previousTarget: existing.target, target, changedAt: new Date(), changedBy: request.user!.id, reason });
      existing.target = target;
      existing.updatedBy = request.user!.id;
      try { await existing.save(); } catch (error: any) {
        if (error?.name === 'VersionError') throw new ApiError(409, 'GOAL_CHANGED_CONCURRENTLY');
        throw error;
      }
      await writeAuditLog(request, 'SALON_MONTHLY_GOAL_UPDATE', 'SalonMonthlyGoal', existing._id.toString(), { year, month, previousTarget: existing.history.at(-1)?.previousTarget, target, reason });
    }
    return sendSuccess(response, { goal: existing });
  }
  try {
    const goal = await SalonMonthlyGoal.create({ salonId, year, month, target, createdBy: request.user!.id, updatedBy: request.user!.id, history: [{ target, changedAt: new Date(), changedBy: request.user!.id, reason }] });
    await writeAuditLog(request, 'SALON_MONTHLY_GOAL_CREATE', 'SalonMonthlyGoal', goal._id.toString(), { year, month, target });
    return sendSuccess(response, { goal }, 201);
  } catch (error: any) {
    if (error?.code === 11000) throw new ApiError(409, 'GOAL_ALREADY_EXISTS');
    throw error;
  }
}));

export default router;
