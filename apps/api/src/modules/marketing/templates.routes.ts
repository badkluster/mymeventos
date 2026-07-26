import { Router } from 'express';
import { z } from 'zod';
import { MARKETING_TEMPLATE_CATEGORIES, Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { MarketingTemplate } from './marketing.models';
import { renderMarketingVariables } from './marketing-variables.service';
import { sampleVariableContext } from './marketing-sample-context';
import { sanitizeEmailHtml, stripHtmlToText } from './marketing-sanitize.service';

function sanitizeTemplateBody(body: Record<string, unknown>) {
  if (typeof body.renderedHtml === 'string') {
    const html = sanitizeEmailHtml(body.renderedHtml);
    body.renderedHtml = html;
    if (!body.renderedText) body.renderedText = stripHtmlToText(html);
  }
  return body;
}

const router = Router();
router.use(requireAuth);

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const schema = (body: z.ZodTypeAny, params: z.ZodRawShape = {}) => z.object({ body, params: z.object(params), query: z.object({}).passthrough() });

const templateBody = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().max(2000).optional(),
  category: z.enum(MARKETING_TEMPLATE_CATEGORIES).optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal('')),
  subject: z.string().max(200).optional(),
  preheader: z.string().max(200).optional(),
  contentJson: z.unknown(),
  renderedHtml: z.string().max(200_000).optional(),
  renderedText: z.string().max(50_000).optional(),
  isActive: z.boolean().optional(),
  salonId: id.optional().or(z.literal('')),
  tags: z.array(z.string().max(60)).optional()
});

router.get('/', requirePermission(Permission.MARKETING_TEMPLATES_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  const category = typeof request.query.category === 'string' ? request.query.category : undefined;
  if (category) and.push({ category });
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  if (search) and.push({ name: { $regex: search, $options: 'i' } });
  const activeOnly = request.query.isActive === 'true';
  if (activeOnly) and.push({ isActive: true });
  const query = { $and: and };
  const [items, totalItems] = await Promise.all([
    MarketingTemplate.find(query).sort({ isSystemTemplate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MarketingTemplate.countDocuments(query)
  ]);
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.get('/:id', requirePermission(Permission.MARKETING_TEMPLATES_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const template = await MarketingTemplate.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!template) throw new ApiError(404, 'NOT_FOUND');
  return sendSuccess(response, { template });
}));

router.post('/', requirePermission(Permission.MARKETING_TEMPLATES_MANAGE), validateRequest(schema(templateBody)), asyncHandler(async (request, response) => {
  if (request.body.salonId) {
    if (!canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
  const template = await MarketingTemplate.create({ ...sanitizeTemplateBody(request.body), salonId: request.body.salonId || undefined, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'MARKETING_TEMPLATE_CREATE', 'MarketingTemplate', String(template._id));
  return sendSuccess(response, { template }, 201);
}));

router.patch('/:id', requirePermission(Permission.MARKETING_TEMPLATES_MANAGE), validateRequest(schema(templateBody.partial(), { id })), asyncHandler(async (request, response) => {
  const template = await MarketingTemplate.findOne({ _id: request.params.id, deletedAt: null });
  if (!template) throw new ApiError(404, 'NOT_FOUND');
  if (template.isSystemTemplate && !request.user!.roles.includes(Role.ADMIN)) throw new ApiError(403, 'FORBIDDEN');
  Object.assign(template, sanitizeTemplateBody(request.body), { salonId: request.body.salonId || template.salonId, updatedBy: request.user!.id });
  template.version = (template.version ?? 1) + 1;
  await template.save();
  await writeAuditLog(request, 'MARKETING_TEMPLATE_UPDATE', 'MarketingTemplate', String(template._id));
  return sendSuccess(response, { template });
}));

router.delete('/:id', requirePermission(Permission.MARKETING_TEMPLATES_MANAGE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const template = await MarketingTemplate.findOne({ _id: request.params.id, deletedAt: null });
  if (!template) throw new ApiError(404, 'NOT_FOUND');
  if (template.isSystemTemplate) throw new ApiError(409, 'VALIDATION_ERROR', 'Las plantillas del sistema no se pueden eliminar, solo desactivar.');
  template.deletedAt = new Date();
  template.deletedBy = request.user!.id as any;
  await template.save();
  await writeAuditLog(request, 'MARKETING_TEMPLATE_DELETE', 'MarketingTemplate', String(template._id));
  return sendSuccess(response, { success: true });
}));

router.post('/:id/duplicate', requirePermission(Permission.MARKETING_TEMPLATES_MANAGE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const source: any = await MarketingTemplate.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!source) throw new ApiError(404, 'NOT_FOUND');
  const { _id, createdAt, updatedAt, ...rest } = source;
  const template = await MarketingTemplate.create({ ...rest, name: `${source.name} (copia)`, isSystemTemplate: false, version: 1, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'MARKETING_TEMPLATE_DUPLICATE', 'MarketingTemplate', String(template._id), { sourceId: request.params.id });
  return sendSuccess(response, { template }, 201);
}));

router.post('/:id/preview', requirePermission(Permission.MARKETING_TEMPLATES_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const template: any = await MarketingTemplate.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!template) throw new ApiError(404, 'NOT_FOUND');
  const context = sampleVariableContext();
  const subject = renderMarketingVariables(template.subject ?? '', context).rendered;
  const { rendered: html, missingVariables } = renderMarketingVariables(template.renderedHtml ?? '', context, { escapeValues: false });
  return sendSuccess(response, { subject, html, missingVariables });
}));

export default router;
