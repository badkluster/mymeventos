import { Router } from 'express';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { availableReports, getReport, reportCsv, reportExcelXml } from './reports.service';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';

const router = Router();
router.use(requireAuth, requirePermission(Permission.REPORTS_READ));

router.get('/', asyncHandler(async (request, response) => sendSuccess(response, { items: availableReports(request) })));
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
