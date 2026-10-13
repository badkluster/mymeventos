import { Router } from 'express';
import { Permission } from '@mym/shared';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { validateRequest } from '../../middlewares/validateRequest';
import { availableReports, getReport, reportCsv, reportExcelXml } from './reports.service';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { z } from 'zod';
import { Salon } from '../salons/salon.model';
import { MetaCampaignSalonAssignment } from './marketing-funnel.model';
import { canManageCampaignAssignments } from './marketing-funnel.service';

const router = Router();
router.use(requireAuth, requirePermission(Permission.REPORTS_READ));

router.get('/', asyncHandler(async (request, response) => sendSuccess(response, { items: availableReports(request) })));
const campaignId = z.string().trim().min(3).max(64).regex(/^\d+$/);
const assignmentSchema = z.object({
  body: z.object({ salonId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable() }),
  params: z.object({ campaignId }),
  query: z.object({}),
});

router.get('/marketing-funnel/assignments', asyncHandler(async (request, response) => {
  const items = await MetaCampaignSalonAssignment.find({ active: true }).populate('salonId', 'name').select('campaignId salonId updatedAt').lean();
  return sendSuccess(response, { canManage: canManageCampaignAssignments(request), items: items.map((item: any) => ({
    campaignId: item.campaignId,
    salonId: item.salonId?._id?.toString?.() ?? item.salonId?.toString?.() ?? null,
    salonName: item.salonId?.name ?? null,
    updatedAt: item.updatedAt,
  })) });
}));
router.put('/marketing-funnel/assignments/:campaignId', requirePermission(Permission.ANALYTICS_SETTINGS_MANAGE), validateRequest(assignmentSchema), asyncHandler(async (request, response) => {
  const { salonId } = request.body;
  if (!salonId) {
    await MetaCampaignSalonAssignment.updateOne({ campaignId: request.params.campaignId }, { $set: { active: false, updatedBy: request.user!.id } });
    await writeAuditLog(request, 'META_CAMPAIGN_SALON_UNASSIGN', 'MetaCampaignSalonAssignment', request.params.campaignId);
    return sendSuccess(response, { assignment: null });
  }
  const salon: any = await Salon.findOne({ _id: salonId, active: true, deletedAt: null }).select('_id name').lean();
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  if (!canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const assignment: any = await MetaCampaignSalonAssignment.findOneAndUpdate(
    { campaignId: request.params.campaignId },
    { $set: { salonId, active: true, updatedBy: request.user!.id }, $setOnInsert: { campaignId: request.params.campaignId, createdBy: request.user!.id } },
    { new: true, upsert: true },
  ).lean();
  await writeAuditLog(request, 'META_CAMPAIGN_SALON_ASSIGN', 'MetaCampaignSalonAssignment', request.params.campaignId, { salonId });
  return sendSuccess(response, { assignment: { campaignId: assignment?.campaignId, salonId: salon._id.toString(), salonName: salon.name, updatedAt: assignment?.updatedAt } });
}));
router.get('/:key/export', requirePermission(Permission.REPORTS_EXPORT), asyncHandler(async (request, response) => {
  const format = String(request.query.format || 'csv');
  if (!['csv', 'excel'].includes(format)) throw new ApiError(400, 'INVALID_EXPORT_FORMAT', 'Los formatos disponibles son CSV y Excel.');
  const report = await getReport(request, request.params.key, true);
  if (report.meta.totalItems > 10_000) throw new ApiError(413, 'EXPORT_TOO_LARGE', 'El reporte supera 10.000 filas. Reducí el período o aplicá más filtros.');
  await writeAuditLog(request, 'REPORT_EXPORT', 'Report', request.params.key, { format, totalItems: report.meta.totalItems, filters: report.meta.filters });
  const timestamp = new Date().toISOString().slice(0, 10);
  if (format === 'excel') {
    response.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${request.params.key}-${timestamp}.xls"`);
    return response.send(reportExcelXml(report));
  }
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${request.params.key}-${timestamp}.csv"`);
  return response.send(reportCsv(report));
}));
router.get('/:key', asyncHandler(async (request, response) => sendSuccess(response, await getReport(request, request.params.key))));

export default router;
