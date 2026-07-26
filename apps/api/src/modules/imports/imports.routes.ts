import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission, canAccessSalon } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { Contract, Event } from '../crm/crm.models';
import { Expense, ExpenseCategory } from '../operations/operations.models';
import { ProductionItem, ProductionSection } from '../production/production.models';
import { generateProductionPlan, normalizeProductName } from '../production/production.service';
import { ImportJob, ImportRowError } from './import.models';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const fields: Record<string, { required: string[]; optional: string[] }> = {
  expenses: { required: ['date', 'description', 'salonId', 'finalAmount'], optional: ['externalId', 'eventId', 'supplierId', 'categoryCode', 'initialEstimatedAmount', 'additionalAmount', 'taxAmount', 'status', 'paymentMethod', 'notes'] },
  production: { required: ['eventId', 'productName', 'plannedQuantity', 'unit'], optional: ['externalId', 'sectionType', 'responsibleId', 'observations'] },
  contracts: { required: ['contractNumber', 'eventId', 'customerId', 'salonId', 'totalAmount'], optional: ['status', 'baseAmount', 'paidAmount', 'balanceAmount', 'approvedAt', 'observations'] },
};
const templates: Record<string, string[]> = {
  expenses: ['externalId', 'date', 'description', 'salonId', 'eventId', 'supplierId', 'categoryCode', 'initialEstimatedAmount', 'finalAmount', 'additionalAmount', 'taxAmount', 'status', 'paymentMethod', 'notes'],
  production: ['externalId', 'eventId', 'productName', 'plannedQuantity', 'unit', 'sectionType', 'responsibleId', 'observations'],
  contracts: ['contractNumber', 'eventId', 'customerId', 'salonId', 'totalAmount', 'status', 'baseAmount', 'paidAmount', 'balanceAmount', 'approvedAt', 'observations'],
};
function cleanCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return String(value.result ?? '').trim();
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
  }
  return String(value).trim().slice(0, 500);
}
function normalizeHeader(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function suggestedMapping(headers: string[], type: string) {
  const available = [...fields[type].required, ...fields[type].optional];
  return Object.fromEntries(available.map((field) => [field, headers.find((header) => normalizeHeader(header) === normalizeHeader(field)) || '']).filter(([, header]) => header));
}
function rowObject(headers: string[], row: string[]) { return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])); }
function mappedRow(source: Record<string, string>, mapping: Record<string, string>) { return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, source[header] ?? ''])); }
function rowErrors(row: Record<string, string>, type: string) {
  const errors: string[] = [];
  for (const field of fields[type].required) if (!row[field]?.trim()) errors.push(`Falta ${field}.`);
  for (const field of ['salonId', 'eventId', 'customerId', 'supplierId', 'responsibleId']) if (row[field] && !objectIdPattern.test(row[field])) errors.push(`${field} no es un ObjectId válido.`);
  for (const field of ['totalAmount', 'baseAmount', 'paidAmount', 'balanceAmount', 'plannedQuantity', 'initialEstimatedAmount', 'finalAmount', 'additionalAmount', 'taxAmount']) if (row[field] && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) errors.push(`${field} debe ser numérico y no negativo.`);
  if (row.date && Number.isNaN(new Date(row.date).getTime())) errors.push('La fecha no es válida.');
  return errors;
}
async function parseWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'IMPORT_EMPTY_WORKBOOK', 'El archivo no contiene hojas.');
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cleanCell).filter(Boolean);
  if (!headers.length) throw new ApiError(400, 'IMPORT_HEADERS_MISSING', 'La primera fila debe contener encabezados.');
  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) { const values = (row.values as ExcelJS.CellValue[]).slice(1, headers.length + 1).map(cleanCell); if (values.some(Boolean)) rows.push(values); } });
  if (rows.length > 5000) throw new ApiError(413, 'IMPORT_TOO_MANY_ROWS', 'El máximo por importación es 5.000 filas.');
  return { sheetName: sheet.name, headers, rows };
}
async function validateJob(job: any, mapping: Record<string, string>) {
  const missingMappings = fields[job.type].required.filter((field) => !mapping[field] || !job.headers.includes(mapping[field]));
  if (missingMappings.length) throw new ApiError(400, 'IMPORT_MAPPING_INCOMPLETE', `Falta mapear: ${missingMappings.join(', ')}.`);
  await ImportRowError.deleteMany({ importJobId: job._id });
  const previewRows: any[] = []; const errorDocs: any[] = []; const seen = new Set<string>(); let duplicates = 0; let valid = 0;
  job.rawRows.forEach((values: string[], index: number) => {
    const source = rowObject(job.headers, values); const mapped = mappedRow(source, mapping); const errors = rowErrors(mapped, job.type);
    const duplicateKey = mapped.externalId || (job.type === 'contracts' ? mapped.contractNumber : '');
    if (duplicateKey && seen.has(duplicateKey)) { errors.push('Duplicado dentro del archivo.'); duplicates += 1; }
    if (duplicateKey) seen.add(duplicateKey);
    if (errors.length) errors.forEach((message) => errorDocs.push({ importJobId: job._id, rowNumber: index + 2, code: 'ROW_VALIDATION', message, sourceRow: mapped }));
    else valid += 1;
    if (previewRows.length < 50) previewRows.push({ rowNumber: index + 2, values: mapped, errors });
  });
  if (errorDocs.length) await ImportRowError.insertMany(errorDocs, { ordered: false });
  const idempotencyKey = createHash('sha256').update(`${job.fileHash}:${job.type}:${JSON.stringify(mapping)}`).digest('hex');
  Object.assign(job, { mapping, previewRows, validRows: valid, errorRows: job.rawRows.length - valid, duplicateRows: duplicates, status: 'validated', idempotencyKey });
  await job.save();
  return job;
}
function refs(body: any) { return { eventId: body.eventId || undefined, supplierId: body.supplierId || undefined }; }
async function executeExpense(request: any, job: any, row: any, rowNumber: number) {
  if (!canAccessSalon(request.user, row.salonId)) throw new Error('Sin acceso al salón.');
  if (row.eventId && !(await Event.exists({ _id: row.eventId, salonId: row.salonId, deletedAt: null }))) throw new Error('El evento no existe o pertenece a otro salón.');
  const category: any = row.categoryCode ? await ExpenseCategory.findOne({ code: row.categoryCode.toUpperCase(), deletedAt: null }).lean() : null;
  const sourceId = row.externalId || `${job.fileHash}:${rowNumber}`;
  const amount = Number(row.finalAmount || 0) + Number(row.additionalAmount || 0) + Number(row.taxAmount || 0);
  const result = await Expense.updateOne({ sourceType: 'import', sourceId, deletedAt: null }, { $setOnInsert: { date: new Date(row.date), description: row.description, salonId: row.salonId, ...refs(row), categoryId: category?._id, category: 'OTHER', initialEstimatedAmount: Number(row.initialEstimatedAmount || 0), finalAmount: Number(row.finalAmount || 0), additionalAmount: Number(row.additionalAmount || 0), taxAmount: Number(row.taxAmount || 0), amount, currency: 'ARS', status: ['paid', 'pending', 'cancelled'].includes(row.status) ? row.status : 'pending', paymentMethod: row.paymentMethod || undefined, paidAt: row.status === 'paid' ? new Date(row.date) : undefined, notes: row.notes, sourceType: 'import', sourceId, createdBy: request.user.id, updatedBy: request.user.id } }, { upsert: true });
  return result.upsertedCount ? 'imported' : 'skipped';
}
async function executeContract(request: any, job: any, row: any, rowNumber: number) {
  if (!canAccessSalon(request.user, row.salonId)) throw new Error('Sin acceso al salón.');
  const event: any = await Event.findOne({ _id: row.eventId, customerId: row.customerId, salonId: row.salonId, deletedAt: null }).lean();
  if (!event) throw new Error('Evento, cliente y salón no coinciden.');
  const result = await Contract.updateOne({ importJobId: job._id, importRowNumber: rowNumber }, { $setOnInsert: { contractNumber: row.contractNumber, eventId: row.eventId, customerId: row.customerId, salonId: row.salonId, status: ['draft', 'pending_approval', 'approved', 'requires_changes', 'cancelled'].includes(row.status) ? row.status : 'pending_approval', totalAmount: Number(row.totalAmount), baseAmount: Number(row.baseAmount || row.totalAmount), paidAmount: Number(row.paidAmount || 0), balanceAmount: Number(row.balanceAmount || (Number(row.totalAmount) - Number(row.paidAmount || 0))), approvedAt: row.approvedAt ? new Date(row.approvedAt) : undefined, observations: row.observations, importJobId: job._id, importRowNumber: rowNumber, createdBy: request.user.id, updatedBy: request.user.id } }, { upsert: true });
  return result.upsertedCount ? 'imported' : 'skipped';
}
async function executeProduction(request: any, job: any, row: any, rowNumber: number) {
  const generated: any = await generateProductionPlan(request, row.eventId); const plan = generated.plan;
  const type = ['savory', 'sweet', 'beverages', 'cake', 'bakery', 'kitchen', 'bar', 'miscellaneous'].includes(row.sectionType) ? row.sectionType : 'miscellaneous';
  const sectionNames: any = { savory: 'Producción salada', sweet: 'Producción dulce', beverages: 'Bebidas', cake: 'Tortas', bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros' };
  const section: any = await ProductionSection.findOneAndUpdate({ productionPlanId: plan._id, type, deletedAt: null }, { $setOnInsert: { name: sectionNames[type], order: plan.sections.length, createdBy: request.user.id }, updatedBy: request.user.id }, { upsert: true, new: true });
  const sourceId = row.externalId || `${job.fileHash}:${rowNumber}`;
  const result = await ProductionItem.updateOne({ productionPlanId: plan._id, sourceType: 'manual', sourceId, deletedAt: null }, { $setOnInsert: { productionPlanId: plan._id, sectionId: section._id, normalizedProductName: normalizeProductName(row.productName), productNameSnapshot: row.productName, plannedQuantity: Number(row.plannedQuantity), unit: row.unit, responsibleId: row.responsibleId || undefined, observations: row.observations, dueAt: plan.eventDate, sourceType: 'manual', sourceId, isManual: true, createdBy: request.user.id, updatedBy: request.user.id } }, { upsert: true });
  return result.upsertedCount ? 'imported' : 'skipped';
}

router.use(requireAuth);
router.get('/template/:type', requirePermission(Permission.IMPORTS_CREATE), asyncHandler(async (request, response) => {
  const type = String(request.params.type); if (!templates[type]) throw new ApiError(404, 'IMPORT_TYPE_NOT_FOUND');
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Importación'); sheet.addRow(templates[type]); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer(); response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); response.setHeader('Content-Disposition', `attachment; filename="plantilla-${type}.xlsx"`); return response.send(Buffer.from(buffer));
}));
router.post('/preview', requirePermission(Permission.IMPORTS_CREATE), upload.single('file'), asyncHandler(async (request, response) => {
  if (request.file) {
    const type = String(request.body.type || ''); if (!fields[type]) throw new ApiError(400, 'IMPORT_TYPE_INVALID');
    if (!/\.xlsx$/i.test(request.file.originalname)) throw new ApiError(400, 'IMPORT_FILE_INVALID', 'Solo se permiten archivos .xlsx.');
    const parsed = await parseWorkbook(request.file.buffer); const fileHash = createHash('sha256').update(request.file.buffer).digest('hex');
    const existing: any = await ImportJob.findOne({ fileHash, type, createdBy: request.user!.id, status: { $in: ['uploaded', 'validated'] } }).sort({ createdAt: -1 });
    const job = existing ?? await ImportJob.create({ type, originalFileName: request.file.originalname, fileHash, ...parsed, totalRows: parsed.rows.length, createdBy: request.user!.id });
    return sendSuccess(response, { import: job, headers: job.headers, suggestedMapping: suggestedMapping(job.headers, type), fields: fields[type] }, 201);
  }
  const importId = String(request.body.importId || ''); const mapping = typeof request.body.mapping === 'string' ? JSON.parse(request.body.mapping) : request.body.mapping;
  const job: any = await ImportJob.findOne({ _id: importId, createdBy: request.user!.id }); if (!job) throw new ApiError(404, 'IMPORT_NOT_FOUND');
  await validateJob(job, mapping || {});
  return sendSuccess(response, { import: job, fields: fields[job.type] });
}));
router.post('/execute', requirePermission(Permission.IMPORTS_EXECUTE), asyncHandler(async (request, response) => {
  const job: any = await ImportJob.findById(String(request.body.importId || '')); if (!job) throw new ApiError(404, 'IMPORT_NOT_FOUND');
  if (job.status === 'completed' || job.status === 'completed_with_errors') return sendSuccess(response, { import: job, idempotent: true });
  if (job.status !== 'validated') throw new ApiError(409, 'IMPORT_NOT_VALIDATED', 'Primero validá la importación.');
  job.status = 'executing'; await job.save(); let imported = 0; let skipped = 0; let failed = 0;
  for (let index = 0; index < job.rawRows.length; index += 1) {
    const rowNumber = index + 2; const source = rowObject(job.headers, job.rawRows[index]); const row = mappedRow(source, Object.fromEntries(job.mapping));
    if (rowErrors(row, job.type).length) { skipped += 1; continue; }
    try { const status = job.type === 'expenses' ? await executeExpense(request, job, row, rowNumber) : job.type === 'contracts' ? await executeContract(request, job, row, rowNumber) : await executeProduction(request, job, row, rowNumber); if (status === 'imported') imported += 1; else skipped += 1; }
    catch (error) { failed += 1; await ImportRowError.updateOne({ importJobId: job._id, rowNumber, code: 'EXECUTION_ERROR' }, { $setOnInsert: { message: error instanceof Error ? error.message : 'No se pudo importar la fila.', sourceRow: row } }, { upsert: true }); }
  }
  Object.assign(job, { status: failed ? 'completed_with_errors' : 'completed', importedRows: imported, skippedRows: skipped, errorRows: job.errorRows + failed, executedAt: new Date(), executedBy: request.user!.id }); await job.save();
  await writeAuditLog(request, 'IMPORT_EXECUTE', 'ImportJob', job._id.toString(), { type: job.type, imported, skipped, failed, fileHash: job.fileHash });
  return sendSuccess(response, { import: job, idempotent: false });
}));
router.get('/:id/errors', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (request, response) => { const items = await ImportRowError.find({ importJobId: request.params.id }).sort({ rowNumber: 1 }).lean(); return sendSuccess(response, { items }); }));
router.get('/:id', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (request, response) => { const job = await ImportJob.findById(request.params.id).select('-rawRows').lean(); if (!job) throw new ApiError(404, 'IMPORT_NOT_FOUND'); return sendSuccess(response, { import: job }); }));
router.get('/', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (_request, response) => { const items = await ImportJob.find().select('-rawRows -previewRows').populate('createdBy', 'firstName lastName fullName').sort({ createdAt: -1 }).limit(100).lean(); return sendSuccess(response, { items }); }));

export default router;
