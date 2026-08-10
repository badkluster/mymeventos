import { Router } from 'express';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
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

export default router;
