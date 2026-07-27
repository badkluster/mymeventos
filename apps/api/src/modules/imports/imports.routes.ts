import { createHash } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission, canAccessSalon } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { Contract, Customer, Event } from '../crm/crm.models';
import { Expense, ExpenseCategory, Supplier } from '../operations/operations.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
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
const templateHelp: Record<string, Record<string, string>> = {
  expenses: { salonId: 'Nombre exacto del salón o ID', eventId: 'Nombre del evento, Nombre | AAAA-MM-DD o ID', supplierId: 'Nombre, CUIT, email o ID', categoryCode: 'Código de categoría, ej. MEAT o BEVERAGES' },
  production: { eventId: 'Nombre del evento, Nombre | AAAA-MM-DD o ID', responsibleId: 'Email, usuario, nombre o ID' },
  contracts: { eventId: 'Nombre del evento, Nombre | AAAA-MM-DD o ID', customerId: 'DNI, email, nombre o ID', salonId: 'Nombre exacto del salón o ID' },
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
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function rowErrors(row: Record<string, string>, type: string) {
  const errors: string[] = [];
  for (const field of fields[type].required) if (!row[field]?.trim()) errors.push(`Falta ${field}.`);
  for (const field of ['totalAmount', 'baseAmount', 'paidAmount', 'balanceAmount', 'plannedQuantity', 'initialEstimatedAmount', 'finalAmount', 'additionalAmount', 'taxAmount']) if (row[field] && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) errors.push(`${field} debe ser numérico y no negativo.`);
  if (row.date && Number.isNaN(new Date(row.date).getTime())) errors.push('La fecha no es válida.');
  if (row.approvedAt && Number.isNaN(new Date(row.approvedAt).getTime())) errors.push('La fecha de aprobación no es válida.');
  if (type === 'contracts' && row.totalAmount && row.paidAmount && Number(row.paidAmount) > Number(row.totalAmount)) errors.push('paidAmount no puede superar totalAmount.');
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

type ResolveCache = Map<string, any>;
async function cached(cache: ResolveCache, key: string, resolver: () => Promise<any>) {
  if (cache.has(key)) return cache.get(key);
  const value = await resolver(); cache.set(key, value); return value;
}
async function uniqueByReference(model: any, query: any, label: string) {
  const matches = await model.find(query).select('_id name fullName businessName eventName eventDate salonId customerId email username documentNumber taxId').limit(2).lean();
  if (!matches.length) throw new Error(`No se encontró ${label}.`);
  if (matches.length > 1) throw new Error(`${label} es ambiguo. Usá el ID o un dato más específico.`);
  return matches[0];
}
async function resolveSalon(value: string, cache: ResolveCache) {
  return cached(cache, `salon:${value}`, async () => {
    const salon = objectIdPattern.test(value)
      ? await Salon.findOne({ _id: value, deletedAt: null }).lean()
      : await uniqueByReference(Salon, { name: new RegExp(`^${escapeRegex(value)}$`, 'i'), deletedAt: null }, `el salón “${value}”`);
    if (!salon) throw new Error(`No se encontró el salón “${value}”.`);
    return salon;
  });
}
function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`); parsed.setUTCDate(parsed.getUTCDate() + days); return parsed.toISOString().slice(0, 10);
}
async function resolveEvent(value: string, salonId: string | undefined, cache: ResolveCache) {
  return cached(cache, `event:${salonId || ''}:${value}`, async () => {
    if (objectIdPattern.test(value)) {
      const event = await Event.findOne({ _id: value, deletedAt: null, ...(salonId ? { salonId } : {}) }).lean();
      if (!event) throw new Error(`No se encontró el evento “${value}”.`);
      return event;
    }
    const [name, date] = value.split('|').map((part) => part.trim());
    const query: any = { eventName: new RegExp(`^${escapeRegex(name)}$`, 'i'), deletedAt: null, ...(salonId ? { salonId } : {}) };
    if (date) {
      const from = new Date(`${date}T03:00:00.000Z`); const to = new Date(`${addDays(date, 1)}T03:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) query.eventDate = { $gte: from, $lt: to };
    }
    return uniqueByReference(Event, query, `el evento “${value}”`);
  });
}
async function resolveCustomer(value: string, cache: ResolveCache) {
  return cached(cache, `customer:${value}`, async () => {
    if (objectIdPattern.test(value)) {
      const customer = await Customer.findOne({ _id: value, deletedAt: null }).lean();
      if (!customer) throw new Error(`No se encontró el cliente “${value}”.`);
      return customer;
    }
    const escaped = new RegExp(`^${escapeRegex(value)}$`, 'i');
    return uniqueByReference(Customer, { deletedAt: null, $or: [{ fullName: escaped }, { email: escaped }, { normalizedEmail: value.toLowerCase() }, { documentNumber: value }] }, `el cliente “${value}”`);
  });
}
async function resolveSupplier(value: string, cache: ResolveCache) {
  return cached(cache, `supplier:${value}`, async () => {
    if (objectIdPattern.test(value)) {
      const supplier = await Supplier.findOne({ _id: value, deletedAt: null }).lean();
      if (!supplier) throw new Error(`No se encontró el proveedor “${value}”.`);
      return supplier;
    }
    const escaped = new RegExp(`^${escapeRegex(value)}$`, 'i');
    return uniqueByReference(Supplier, { deletedAt: null, $or: [{ name: escaped }, { businessName: escaped }, { email: escaped }, { taxId: value }] }, `el proveedor “${value}”`);
  });
}
async function resolveUser(value: string, cache: ResolveCache) {
  return cached(cache, `user:${value}`, async () => {
    if (objectIdPattern.test(value)) {
      const user = await User.findOne({ _id: value, deletedAt: null }).lean();
      if (!user) throw new Error(`No se encontró el responsable “${value}”.`);
      return user;
    }
    const escaped = new RegExp(`^${escapeRegex(value)}$`, 'i');
    return uniqueByReference(User, { deletedAt: null, $or: [{ fullName: escaped }, { email: escaped }, { username: escaped }] }, `el responsable “${value}”`);
  });
}
async function resolveReferences(request: any, row: Record<string, string>, type: string, cache: ResolveCache) {
  const resolved: any = { ...row };
  let salon: any;
  if (row.salonId) {
    salon = await resolveSalon(row.salonId, cache); resolved.salonId = salon._id.toString();
    if (!canAccessSalon(request.user, resolved.salonId)) throw new Error('Sin acceso al salón indicado.');
  }
  if (row.eventId) {
    const event: any = await resolveEvent(row.eventId, resolved.salonId, cache); resolved.eventId = event._id.toString();
    resolved.salonId = resolved.salonId || event.salonId?.toString();
    if (resolved.salonId && !canAccessSalon(request.user, resolved.salonId)) throw new Error('Sin acceso al salón del evento.');
    resolved.eventDocument = event;
  }
  if (row.customerId) resolved.customerId = (await resolveCustomer(row.customerId, cache))._id.toString();
  if (row.supplierId) resolved.supplierId = (await resolveSupplier(row.supplierId, cache))._id.toString();
  if (row.responsibleId) resolved.responsibleId = (await resolveUser(row.responsibleId, cache))._id.toString();
  if (row.categoryCode) {
    const category = await cached(cache, `category:${row.categoryCode}`, () => ExpenseCategory.findOne({ code: row.categoryCode.toUpperCase(), deletedAt: null, isActive: true }).lean());
    if (!category) throw new Error(`No existe la categoría ${row.categoryCode}.`);
  }
  if (type === 'contracts' && resolved.eventDocument) {
    if (resolved.eventDocument.customerId?.toString() !== resolved.customerId) throw new Error('El cliente indicado no coincide con el cliente del evento.');
    if (resolved.eventDocument.salonId?.toString() !== resolved.salonId) throw new Error('El salón indicado no coincide con el salón del evento.');
  }
  delete resolved.eventDocument;
  return resolved;
}

async function validateJob(request: any, job: any, mapping: Record<string, string>) {
  const missingMappings = fields[job.type].required.filter((field) => !mapping[field] || !job.headers.includes(mapping[field]));
  if (missingMappings.length) throw new ApiError(400, 'IMPORT_MAPPING_INCOMPLETE', `Falta mapear: ${missingMappings.join(', ')}.`);
  await ImportRowError.deleteMany({ importJobId: job._id });
  const previewRows: any[] = []; const errorDocs: any[] = []; const seen = new Set<string>(); const cache: ResolveCache = new Map(); let duplicates = 0; let valid = 0;
  for (let index = 0; index < job.rawRows.length; index += 1) {
    const source = rowObject(job.headers, job.rawRows[index]); const mapped = mappedRow(source, mapping); const errors = rowErrors(mapped, job.type);
    const duplicateKey = mapped.externalId || (job.type === 'contracts' ? mapped.contractNumber : '');
    if (duplicateKey && seen.has(duplicateKey)) { errors.push('Duplicado dentro del archivo.'); duplicates += 1; }
    if (duplicateKey) seen.add(duplicateKey);
    if (!errors.length) {
      try { await resolveReferences(request, mapped, job.type, cache); } catch (error) { errors.push(error instanceof Error ? error.message : 'No se pudieron resolver las referencias.'); }
    }
    if (errors.length) errors.forEach((message) => errorDocs.push({ importJobId: job._id, rowNumber: index + 2, code: 'ROW_VALIDATION', message, sourceRow: mapped }));
    else valid += 1;
    if (previewRows.length < 50) previewRows.push({ rowNumber: index + 2, values: mapped, errors });
  }
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
  const category: any = row.categoryCode ? await ExpenseCategory.findOne({ code: row.categoryCode.toUpperCase(), deletedAt: null, isActive: true }).lean() : null;
  const sourceId = row.externalId || `${job.fileHash}:${rowNumber}`;
  const amount = Number(row.finalAmount || 0) + Number(row.additionalAmount || 0) + Number(row.taxAmount || 0);
  const result = await Expense.updateOne({ sourceType: 'import', sourceId, deletedAt: null }, { $setOnInsert: { date: new Date(row.date), description: row.description, salonId: row.salonId, ...refs(row), categoryId: category?._id, category: 'OTHER', initialEstimatedAmount: Number(row.initialEstimatedAmount || 0), finalAmount: Number(row.finalAmount || 0), additionalAmount: Number(row.additionalAmount || 0), taxAmount: Number(row.taxAmount || 0), amount, currency: 'ARS', status: ['paid', 'pending', 'cancelled'].includes(row.status) ? row.status : 'pending', paymentMethod: row.paymentMethod || undefined, paidAt: row.status === 'paid' ? new Date(row.date) : undefined, notes: row.notes, sourceType: 'import', sourceId, createdBy: request.user.id, updatedBy: request.user.id } }, { upsert: true });
  return result.upsertedCount ? 'imported' : 'skipped';
}
async function executeContract(request: any, job: any, row: any, rowNumber: number) {
  if (!canAccessSalon(request.user, row.salonId)) throw new Error('Sin acceso al salón.');
  const event: any = await Event.findOne({ _id: row.eventId, customerId: row.customerId, salonId: row.salonId, deletedAt: null }).lean();
  if (!event) throw new Error('Evento, cliente y salón no coinciden.');
  const totalAmount = Number(row.totalAmount); const paidAmount = Number(row.paidAmount || 0); const balanceAmount = row.balanceAmount ? Number(row.balanceAmount) : Math.max(0, totalAmount - paidAmount);
  const requestedStatus = ['draft', 'pending_approval', 'approved', 'requires_changes', 'cancelled'].includes(row.status) ? row.status : 'pending_approval';
  if (requestedStatus === 'approved' && !row.approvedAt) throw new Error('Un contrato aprobado importado debe indicar approvedAt.');
  const result = await Contract.updateOne({ importJobId: job._id, importRowNumber: rowNumber }, { $setOnInsert: { contractNumber: row.contractNumber, eventId: row.eventId, customerId: row.customerId, salonId: row.salonId, status: requestedStatus, totalAmount, baseAmount: Number(row.baseAmount || totalAmount), paidAmount, balanceAmount, approvedAt: row.approvedAt ? new Date(row.approvedAt) : undefined, observations: row.observations, importJobId: job._id, importRowNumber: rowNumber, createdBy: request.user.id, updatedBy: request.user.id } }, { upsert: true });
  return result.upsertedCount ? 'imported' : 'skipped';
}
async function executeProduction(request: any, job: any, row: any, rowNumber: number) {
  const generated: any = await generateProductionPlan(request, row.eventId);
  if (generated.requiresRegeneration) throw new Error('La producción vigente está desactualizada. Regenerala antes de importar ítems.');
  const plan = generated.plan;
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
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Importación'); sheet.addRow(templates[type]);
  sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
  templates[type].forEach((field, index) => {
    const help = templateHelp[type]?.[field];
    if (help) sheet.getCell(1, index + 1).note = help;
  });
  sheet.columns.forEach((column) => { column.width = 24; });
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
  await validateJob(request, job, mapping || {});
  return sendSuccess(response, { import: job, fields: fields[job.type] });
}));
router.post('/execute', requirePermission(Permission.IMPORTS_EXECUTE), asyncHandler(async (request, response) => {
  const job: any = await ImportJob.findById(String(request.body.importId || '')); if (!job) throw new ApiError(404, 'IMPORT_NOT_FOUND');
  if (job.status === 'completed' || job.status === 'completed_with_errors') return sendSuccess(response, { import: job, idempotent: true });
  if (job.status !== 'validated') throw new ApiError(409, 'IMPORT_NOT_VALIDATED', 'Primero validá la importación.');
  job.status = 'executing'; await job.save(); let imported = 0; let skipped = 0; let failed = 0; const cache: ResolveCache = new Map();
  for (let index = 0; index < job.rawRows.length; index += 1) {
    const rowNumber = index + 2; const source = rowObject(job.headers, job.rawRows[index]); const mapped = mappedRow(source, Object.fromEntries(job.mapping));
    if (rowErrors(mapped, job.type).length) { skipped += 1; continue; }
    try {
      const row = await resolveReferences(request, mapped, job.type, cache);
      const status = job.type === 'expenses' ? await executeExpense(request, job, row, rowNumber) : job.type === 'contracts' ? await executeContract(request, job, row, rowNumber) : await executeProduction(request, job, row, rowNumber);
      if (status === 'imported') imported += 1; else skipped += 1;
    } catch (error) { failed += 1; await ImportRowError.updateOne({ importJobId: job._id, rowNumber, code: 'EXECUTION_ERROR' }, { $setOnInsert: { message: error instanceof Error ? error.message : 'No se pudo importar la fila.', sourceRow: mapped } }, { upsert: true }); }
  }
  Object.assign(job, { status: failed ? 'completed_with_errors' : 'completed', importedRows: imported, skippedRows: skipped, errorRows: job.errorRows + failed, executedAt: new Date(), executedBy: request.user!.id }); await job.save();
  await writeAuditLog(request, 'IMPORT_EXECUTE', 'ImportJob', job._id.toString(), { type: job.type, imported, skipped, failed, fileHash: job.fileHash });
  return sendSuccess(response, { import: job, idempotent: false });
}));
router.get('/:id/errors', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (request, response) => { const items = await ImportRowError.find({ importJobId: request.params.id }).sort({ rowNumber: 1 }).lean(); return sendSuccess(response, { items }); }));
router.get('/:id', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (request, response) => { const job = await ImportJob.findById(request.params.id).select('-rawRows').lean(); if (!job) throw new ApiError(404, 'IMPORT_NOT_FOUND'); return sendSuccess(response, { import: job }); }));
router.get('/', requirePermission(Permission.IMPORTS_VIEW), asyncHandler(async (_request, response) => { const items = await ImportJob.find().select('-rawRows -previewRows').populate('createdBy', 'firstName lastName fullName').sort({ createdAt: -1 }).limit(100).lean(); return sendSuccess(response, { items }); }));

export default router;
