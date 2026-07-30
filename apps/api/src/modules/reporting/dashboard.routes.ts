import { Router } from 'express';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { dashboardAgenda, dashboardAlerts, dashboardSummary } from './dashboard.service';
import { dashboardMetricDefinitions } from './metric-catalog';

const router = Router();
router.use(requireAuth, requirePermission(Permission.DASHBOARD_VIEW));

router.get('/initial', asyncHandler(async (request, response) => {
  const [summary, agenda, alerts] = await Promise.all([
    dashboardSummary(request),
    dashboardAgenda(request),
    dashboardAlerts(request)
  ]);
  return sendSuccess(response, { summary, agenda, alerts });
}));
router.get('/summary', asyncHandler(async (request, response) => sendSuccess(response, await dashboardSummary(request))));
router.get('/agenda', asyncHandler(async (request, response) => sendSuccess(response, await dashboardAgenda(request))));
router.get('/alerts', asyncHandler(async (request, response) => sendSuccess(response, await dashboardAlerts(request))));
router.get('/metrics', asyncHandler(async (_request, response) => sendSuccess(response, { items: dashboardMetricDefinitions })));

export default router;
