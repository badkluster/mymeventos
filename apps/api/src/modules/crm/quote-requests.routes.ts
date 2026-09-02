import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Customer, Lead, LeadActivity, PackageTemplate, Quote, QuoteRequest, QuoteRevision, VenuePackageRule } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { accessibleSalonIds, canAccessSalon, referenceId, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { generateAndUploadQuotePdf } from './quote-pdf.service';
import { createQuoteRequest } from './quote-request.service';
import { calculateCommercialQuote } from './quote-pricing';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const statuses = ['new', 'in_review', 'converted', 'discarded', 'duplicated'] as const;
const sources = ['website', 'admin', 'whatsapp', 'office', 'phone', 'quick_quote', 'other'] as const;
const menuSectionsSchema = z.array(z.object({ title: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) }));
const pricingModes = ['per_person', 'fixed'] as const;
const createSchema = z.object({
  body: z.object({
    source: z.enum(sources).default('admin'),
    contactName: z.string().trim().min(2),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    eventType: z.string().trim().optional(),
    estimatedEventDate: z.coerce.date().optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    interestedSalonIds: z.array(objectId).default([]),
    message: z.string().trim().optional(),
    assignedToUserId: objectId.optional(),
    internalNotes: z.string().trim().optional()
  }).refine((body) => Boolean(body.phone || body.email), { message: 'Debe indicar teléfono o email.', path: ['phone'] }),
  params: z.object({}),
  query: z.object({})
});
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const patchSchema = z.object({ body: z.object({ status: z.enum(statuses).optional(), assignedToUserId: objectId.nullable().optional(), internalNotes: z.string().trim().optional() }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(statuses) }), params: z.object({ id: objectId }), query: z.object({}) });
const duplicatedSchema = z.object({ body: z.object({ duplicateOfRequestId: objectId.optional() }), params: z.object({ id: objectId }), query: z.object({}) });
const convertSchema = z.object({
  body: z.object({
    salonIds: z.array(objectId).min(1).optional(),
    salonId: objectId.optional(),
    packageTemplateId: objectId.optional(),
    manualMode: z.boolean().optional(),
    applyCommercialOverrides: z.boolean().optional(),
    packageName: z.string().trim().optional(),
    durationHours: z.coerce.number().positive().optional(),
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
    pricingMode: z.enum(pricingModes).optional(),
    pricePerPerson: z.coerce.number().min(0).optional(),
    fixedPrice: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    finalPricePerPerson: z.coerce.number().min(0).optional(),
    finalFixedPrice: z.coerce.number().min(0).optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    paymentTerms: z.string().trim().optional(),
    promotionText: z.string().trim().optional(),
    giftText: z.string().trim().optional(),
    menuSections: menuSectionsSchema.optional(),
    includedServices: z.array(z.string().trim().min(1)).optional(),
    notes: z.string().trim().optional(),
    validUntil: z.coerce.date().optional(),
    honoreeName: z.string().trim().optional(), vegetarianCount: z.coerce.number().int().min(0).optional(), veganCount: z.coerce.number().int().min(0).optional(), celiacCount: z.coerce.number().int().min(0).optional(), lactoseIntolerantCount: z.coerce.number().int().min(0).optional(), tableLinenColor: z.string().trim().optional()
  }).refine((body) => Boolean(body.salonId || body.salonIds?.length), 'Debe seleccionar al menos un salón.'),
  params: z.object({ id: objectId }),
  query: z.object({})
});

const router = Router();

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function uniqueIds(ids: string[]): string[] { return [...new Set(ids.filter(Boolean))]; }
function quoteNumber(): string { return `P-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`; }
function calculateQuote(values: Record<string, any>): Record<string, any> {
  return calculateCommercialQuote(values);
}
async function quoteValidUntil(salonId: string, requested?: Date): Promise<Date> {
  if (requested) return requested;
  const salon: any = await Salon.findById(salonId).select('defaultQuoteValidityDays').lean();
  const days = Number(salon?.defaultQuoteValidityDays) > 0 ? Number(salon.defaultQuoteValidityDays) : 7;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + days);
  validUntil.setHours(23, 59, 59, 999);
  return validUntil;
}
function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}
function quoteTemplateValues(template: Record<string, any>): Record<string, any> {
  const { _id, __v, createdAt, updatedAt, createdBy, updatedBy, deletedAt, deletedBy, ...values } = template;
  return values;
}
function assignedToCurrentUserOrUnassigned(request: Request): Record<string, unknown> {
  return { $or: [{ assignedToUserId: { $exists: false } }, { assignedToUserId: null }, { assignedToUserId: request.user!.id }] };
}
function salonScopeForRequests(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ interestedSalonIds: { $in: accessibleSalonIds(request.user!) } }, assignedToCurrentUserOrUnassigned(request)];
}
function salonScopeForQuotes(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ salonId: { $in: accessibleSalonIds(request.user!) } }];
}
async function ensureRequestAccess(request: Request, item: any): Promise<void> {
  if (!item || item.deletedAt) throw new ApiError(404, 'QUOTE_REQUEST_NOT_FOUND');
  const assignedToUserId = item.assignedToUserId?.toString?.() ?? item.assignedToUserId;
  if (!request.user!.roles.includes(Role.ADMIN) && assignedToUserId && assignedToUserId !== request.user!.id) throw new ApiError(403, 'QUOTE_REQUEST_ASSIGNED_TO_OTHER_USER');
  // The detail query populates `interestedSalonIds`, so entries can be Salon
  // documents rather than raw ObjectIds. Normalize both shapes before the scope
  // comparison; calling `.toString()` on a populated document yields an object
  // representation and falsely rejects users who do have that salon assigned.
  const salonIds = (item.interestedSalonIds ?? []).map(referenceId).filter((id: string | undefined): id is string => Boolean(id));
  if (salonIds.length && !salonIds.some((salonId: string) => canAccessSalon(request.user!, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}
async function ensureAccessibleSalons(request: Request, salonIds: string[]): Promise<void> {
  if (salonIds.some((salonId) => !canAccessSalon(request.user!, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const count = await Salon.countDocuments({ _id: { $in: salonIds }, active: true, deletedAt: null });
  if (count !== salonIds.length) throw new ApiError(404, 'SALON_NOT_FOUND');
}
async function ensureAssigneeCanAccessRequestSalons(assignedToUserId: string | null | undefined, salonIds: string[]): Promise<void> {
  if (!assignedToUserId) return;
  const user: any = await User.findOne({ _id: assignedToUserId, active: true, deletedAt: null }).select('roles salonIds managedSalonIds').lean();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  if ((user.roles ?? []).includes(Role.ADMIN)) return;
  const assigneeSalonIds = new Set([...(user.salonIds ?? []), ...(user.managedSalonIds ?? [])].map((id: { toString(): string } | string) => id.toString()));
  if (!salonIds.some((salonId) => assigneeSalonIds.has(salonId))) throw new ApiError(403, 'ASSIGNEE_SALON_SCOPE_FORBIDDEN');
}
// Global template values are the commercial fallback. A venue rule is optional and
// only overrides those values when the salon needs a different configuration.
async function getApplicableTemplate(templateId: string, salonId: string): Promise<Record<string, any>> {
  const template: any = await PackageTemplate.findOne({ _id: templateId, active: true, deletedAt: null }).lean();
  if (!template || (!template.isGlobal && !(template.salonIds ?? []).some((id: { toString(): string }) => id.toString() === salonId))) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const rule: any = await VenuePackageRule.findOne({ packageTemplateId: templateId, salonId, deletedAt: null }).lean();
  if (rule && !rule.active) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const overrideKeys = ['name', 'durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
  return { ...template, ...(rule ? pickDefined(rule, overrideKeys) : {}) };
}
async function createRevision(quote: any, request: Request): Promise<void> {
  const latest: any = await QuoteRevision.findOne({ quoteId: quote._id }).sort({ version: -1 }).lean();
  await QuoteRevision.create({ quoteId: quote._id, version: (latest?.version ?? 0) + 1, snapshot: quote.toObject ? quote.toObject() : quote, changeReason: 'Presupuesto creado desde solicitud', createdBy: request.user!.id });
}
function buildQuery(request: Request): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ deletedAt: null }];
  conditions.push(...salonScopeForRequests(request));
  const status = queryValue(request.query.status); if (status && statuses.includes(status as any)) conditions.push({ status });
  else conditions.push({ status: { $in: ['new', 'in_review'] } });
  const source = queryValue(request.query.source); if (source && sources.includes(source as any)) conditions.push({ source });
  const salonId = queryValue(request.query.salonId); if (salonId && objectId.safeParse(salonId).success) conditions.push({ interestedSalonIds: salonId });
  const assignedToUserId = queryValue(request.query.assignedToUserId); if (assignedToUserId && objectId.safeParse(assignedToUserId).success) conditions.push({ assignedToUserId });
  const leadId = queryValue(request.query.leadId); if (leadId && objectId.safeParse(leadId).success) conditions.push({ leadId });
  const customerId = queryValue(request.query.customerId); if (customerId && objectId.safeParse(customerId).success) conditions.push({ customerId });
  const dateFrom = queryValue(request.query.dateFrom); if (dateFrom) conditions.push({ createdAt: { $gte: new Date(dateFrom) } });
  const dateTo = queryValue(request.query.dateTo); if (dateTo) conditions.push({ createdAt: { $lte: new Date(dateTo) } });
  const term = queryValue(request.query.search); if (term) conditions.push({ $or: ['contactName', 'phone', 'email', 'eventType', 'message'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.QUOTES_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const sortBy = ['createdAt', 'updatedAt', 'estimatedEventDate', 'status'].includes(queryValue(request.query.sortBy) ?? '') ? queryValue(request.query.sortBy)! : 'createdAt';
  const sortOrder = queryValue(request.query.sortOrder) === 'asc' ? 1 : -1;
  const query = buildQuery(request);
  const totalItems = await QuoteRequest.countDocuments(query);
  const items = await QuoteRequest.find(query).populate('leadId', 'fullName phone email eventType guestCount eventDate').populate('customerId', 'fullName phone email').populate('interestedSalonIds', 'name').populate('interestedPackageTemplateId', 'name').populate('assignedToUserId takenByUserId', 'firstName lastName email').sort({ [sortBy]: sortOrder }).skip((page - 1) * limit).limit(limit).lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.QUOTES_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  await ensureAccessibleSalons(request, request.body.interestedSalonIds ?? []);
  if (request.body.assignedToUserId) {
    await ensureAssigneeCanAccessRequestSalons(request.body.assignedToUserId, request.body.interestedSalonIds ?? []);
  }
  const result = await createQuoteRequest({ ...request.body, originalPayload: request.body, userId: request.user!.id });
  await writeAuditLog(request, 'QUOTE_REQUEST_CREATE', 'QuoteRequest', result.quoteRequest._id.toString());
  return sendSuccess(response, result, 201, getApiMessage('QUOTE_REQUEST_CREATED'));
}));

router.get('/:id', requirePermission(Permission.QUOTES_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  // Check the persisted record before populating its relations. This keeps the
  // authorization decision tied to the stored ObjectIds instead of a populated
  // representation that can vary between Mongoose/Vercel runtimes.
  const storedQuoteRequest = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureRequestAccess(request, storedQuoteRequest);
  const quoteRequest = await QuoteRequest.populate(storedQuoteRequest, [
    { path: 'leadId' },
    { path: 'customerId' },
    { path: 'interestedSalonIds', select: 'name' },
    { path: 'interestedPackageTemplateId', select: 'name' },
    { path: 'possibleDuplicateLeadIds', select: 'fullName phone email' },
  ]);
  const leadId = (quoteRequest as any).leadId?._id ?? (quoteRequest as any).leadId;
  const customerId = (quoteRequest as any).customerId?._id ?? (quoteRequest as any).customerId;
  const [activities, previousRequests, previousQuotes] = await Promise.all([
    LeadActivity.find({ $or: [leadId ? { leadId } : {}, customerId ? { customerId } : {}].filter((item) => Object.keys(item).length) }).sort({ createdAt: -1 }).limit(20).lean(),
    QuoteRequest.find({ $and: [{ ...(leadId ? { leadId } : { customerId }), deletedAt: null, _id: { $ne: request.params.id } }, ...salonScopeForRequests(request)] }).sort({ createdAt: -1 }).limit(20).lean(),
    Quote.find({ $and: [{ ...(leadId ? { leadId } : { customerId }), deletedAt: null }, ...salonScopeForQuotes(request)] }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  return sendSuccess(response, { quoteRequest, activities, previousRequests, previousQuotes });
}));

router.patch('/:id', requirePermission(Permission.QUOTES_UPDATE), validateRequest(patchSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  if (request.body.assignedToUserId !== undefined) {
    const salonIds = (quoteRequest.interestedSalonIds ?? []).map((id: { toString(): string }) => id.toString());
    await ensureAssigneeCanAccessRequestSalons(request.body.assignedToUserId, salonIds);
  }
  Object.assign(quoteRequest, request.body, { updatedBy: request.user!.id });
  await quoteRequest.save();
  await writeAuditLog(request, 'QUOTE_REQUEST_UPDATE', 'QuoteRequest', quoteRequest._id.toString());
  return sendSuccess(response, { quoteRequest }, 200, getApiMessage('QUOTE_REQUEST_UPDATED'));
}));

router.patch('/:id/status', requirePermission(Permission.QUOTES_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  quoteRequest.status = request.body.status;
  quoteRequest.reviewedByUserId = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  await LeadActivity.create({ leadId: quoteRequest.leadId, customerId: quoteRequest.customerId, type: 'system', title: 'Estado de solicitud actualizado', metadata: { quoteRequestId: quoteRequest._id, status: quoteRequest.status }, createdBy: request.user!.id });
  return sendSuccess(response, { quoteRequest }, 200, getApiMessage('QUOTE_REQUEST_UPDATED'));
}));

router.patch('/:id/take', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  quoteRequest.status = 'in_review';
  quoteRequest.takenByUserId = request.user!.id;
  quoteRequest.assignedToUserId = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  return sendSuccess(response, { quoteRequest }, 200, getApiMessage('QUOTE_REQUEST_UPDATED'));
}));

router.patch('/:id/discard', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  quoteRequest.status = 'discarded';
  quoteRequest.reviewedByUserId = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  return sendSuccess(response, { quoteRequest }, 200, getApiMessage('QUOTE_REQUEST_UPDATED'));
}));

router.patch('/:id/mark-duplicated', requirePermission(Permission.QUOTES_UPDATE), validateRequest(duplicatedSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  quoteRequest.status = 'duplicated';
  quoteRequest.duplicateOfRequestId = request.body.duplicateOfRequestId;
  quoteRequest.reviewedByUserId = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  return sendSuccess(response, { quoteRequest }, 200, getApiMessage('QUOTE_REQUEST_UPDATED'));
}));

router.post('/:id/convert-to-quotes', requirePermission(Permission.QUOTES_CREATE), validateRequest(convertSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  const priorQuoteIds = quoteRequest.convertedQuoteIds ?? [];
  if (priorQuoteIds.length) {
    const activeQuotes = await Quote.find({ _id: { $in: priorQuoteIds }, deletedAt: null }).select('_id').lean();
    const activeQuoteIds = activeQuotes.map((quote) => quote._id);
    if (activeQuoteIds.length !== priorQuoteIds.length) {
      quoteRequest.convertedQuoteIds = activeQuoteIds;
      if (!activeQuoteIds.length && quoteRequest.status === 'converted') quoteRequest.status = 'in_review';
      quoteRequest.updatedBy = request.user!.id;
      await quoteRequest.save();
    }
  }
  if (['discarded', 'duplicated'].includes(quoteRequest.status)) throw new ApiError(422, 'QUOTE_REQUEST_NOT_CONVERTIBLE');
  const salonIds = uniqueIds([...(request.body.salonIds ?? []), ...(request.body.salonId ? [request.body.salonId] : [])]);
  await ensureAccessibleSalons(request, salonIds);
  const lead: any = quoteRequest.leadId ? await Lead.findOne({ _id: quoteRequest.leadId, deletedAt: null }) : null;
  const customer: any = quoteRequest.customerId ? await Customer.findOne({ _id: quoteRequest.customerId, deletedAt: null }) : null;
  if (!lead && !customer) throw new ApiError(404, 'LEAD_NOT_FOUND');
  const templates = request.body.packageTemplateId ? await Promise.all(salonIds.map((salonId) => getApplicableTemplate(request.body.packageTemplateId!, salonId))) : salonIds.map(() => ({}));
  const quotes = [];
  for (const [index, salonId] of salonIds.entries()) {
    const template = templates[index];
    const commercialKeys = ['durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
    const raw = {
      ...quoteTemplateValues(template),
      ...(request.body.applyCommercialOverrides || request.body.manualMode ? pickDefined(request.body, commercialKeys) : {}),
      salonId,
      leadId: lead?._id,
      customerId: customer?._id,
      source: customer ? 'customer' : 'quote_request',
      contactName: quoteRequest.contactName,
      phone: quoteRequest.phone ?? lead?.phone ?? customer?.phone,
      email: quoteRequest.email ?? lead?.email ?? customer?.email,
      eventType: quoteRequest.eventType ?? lead?.eventType,
      eventDate: quoteRequest.estimatedEventDate ?? lead?.eventDate,
      guestCount: quoteRequest.guestCount ?? lead?.guestCount,
      honoreeName: request.body.honoreeName,
      vegetarianCount: request.body.vegetarianCount,
      veganCount: request.body.veganCount,
      celiacCount: request.body.celiacCount,
      lactoseIntolerantCount: request.body.lactoseIntolerantCount,
      tableLinenColor: request.body.tableLinenColor,
      packageName: request.body.manualMode ? request.body.packageName : (template as { name?: string }).name,
      packageTemplateId: request.body.packageTemplateId,
      notes: [request.body.notes, quoteRequest.message].filter(Boolean).join('\n\n'),
      validUntil: await quoteValidUntil(salonId, request.body.validUntil),
      quoteNumber: quoteNumber(),
      createdBy: request.user!.id,
      updatedBy: request.user!.id,
      templateSnapshot: request.body.packageTemplateId ? template : undefined,
      packageSnapshot: request.body.packageTemplateId ? template : undefined,
      contactSnapshot: { leadId: lead?._id, customerId: customer?._id, contactName: quoteRequest.contactName, phone: quoteRequest.phone ?? lead?.phone ?? customer?.phone, email: quoteRequest.email ?? lead?.email ?? customer?.email }
    };
    const calculated = calculateQuote(raw);
    if (!calculated.guestCount || !calculated.totalAmount || (calculated.pricingMode === 'fixed' ? !calculated.finalFixedPrice : !calculated.finalPricePerPerson)) throw new ApiError(422, 'QUOTE_PRICING_REQUIRED');
    const quote: any = await Quote.create(calculated);
    const pdf = await generateAndUploadQuotePdf(quote.toObject ? quote.toObject() : quote);
    Object.assign(quote, pdf);
    await quote.save();
    await createRevision(quote, request);
    quotes.push(quote);
    await LeadActivity.create({ leadId: lead?._id, customerId: customer?._id, type: 'quote_created', title: 'Presupuesto creado desde solicitud', description: `Se creó el presupuesto ${quote.quoteNumber}.`, metadata: { quoteId: quote._id, quoteRequestId: quoteRequest._id, salonId }, createdBy: request.user!.id });
    await writeAuditLog(request, 'QUOTE_CREATE_FROM_REQUEST', 'Quote', quote._id.toString(), { leadId: lead?._id?.toString(), customerId: customer?._id?.toString(), quoteRequestId: quoteRequest._id.toString(), salonId });
  }
  quoteRequest.status = 'converted';
  quoteRequest.convertedQuoteIds = quotes.map((quote) => quote._id);
  quoteRequest.reviewedByUserId = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  if (lead) await Lead.updateOne({ _id: lead._id }, { $addToSet: { salonIds: { $each: salonIds } } });
  if (customer) await Customer.updateOne({ _id: customer._id }, { $addToSet: { salonIds: { $each: salonIds } } });
  return sendSuccess(response, { quoteRequest, quotes, leadId: lead?._id, customerId: customer?._id }, 201, getApiMessage('QUOTE_CREATED'));
}));

router.delete('/:id', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quoteRequest: any = await QuoteRequest.findOne({ _id: request.params.id, deletedAt: null });
  await ensureRequestAccess(request, quoteRequest);
  quoteRequest.deletedAt = new Date();
  quoteRequest.deletedBy = request.user!.id;
  quoteRequest.updatedBy = request.user!.id;
  await quoteRequest.save();
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('QUOTE_REQUEST_DELETED'));
}));

export default router;
