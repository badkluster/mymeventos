import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, QuoteLineItemSourceType, QuoteMode, Role, hasPermission } from '@mym/shared';
import { Customer, Lead, LeadActivity, PackageTemplate, Quote, QuoteRequest, QuoteRevision, VenuePackageRule } from './crm.models';
import { Salon } from '../salons/salon.model';
import { accessibleSalonIds, canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { generateAndUploadQuotePdf } from './quote-pdf.service';
import { convertQuoteToEvent } from './quote-to-event.service';
import { findOrCreateLead } from './lead-dedupe.service';
import { calculateCommercialQuote } from './quote-pricing';
import { civilDateInput } from '../../utils/argentina-date';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const quoteStatuses = ['draft', 'sent', 'follow_up', 'accepted', 'rejected', 'expired', 'converted'] as const;
const pricingModes = ['per_person', 'fixed'] as const;
const leadSources = ['web_form', 'quick_quote', 'whatsapp', 'phone', 'email', 'instagram', 'facebook', 'tiktok', 'google', 'referral', 'walk_in', 'manual', 'promotion', 'ticket', 'invitation', 'other'] as const;
const menuSectionsSchema = z.array(z.object({ title: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) }));
const civilDateSchema = z.preprocess(civilDateInput, z.coerce.date());

const packageFields = z.object({
  name: z.string().trim().min(2), active: z.boolean().optional(), isGlobal: z.boolean().optional(), salonIds: z.array(objectId).optional(),
  durationHours: z.coerce.number().positive().optional(), startTime: z.string().trim().optional(), endTime: z.string().trim().optional(),
  pricingMode: z.enum(pricingModes).optional(), pricePerPerson: z.coerce.number().min(0).optional(), fixedPrice: z.coerce.number().min(0).optional(), discountPercentage: z.coerce.number().min(0).max(100).optional(), finalPricePerPerson: z.coerce.number().min(0).optional(), finalFixedPrice: z.coerce.number().min(0).optional(),
  depositAmount: z.coerce.number().min(0).optional(), paymentTerms: z.string().trim().optional(), promotionText: z.string().trim().optional(), giftText: z.string().trim().optional(),
  menuSections: menuSectionsSchema.optional(), includedServices: z.array(z.string().trim().min(1)).optional(), notes: z.string().trim().optional()
});
const ruleFields = packageFields.pick({ active: true, pricingMode: true, pricePerPerson: true, fixedPrice: true, discountPercentage: true, finalPricePerPerson: true, finalFixedPrice: true, depositAmount: true, paymentTerms: true, promotionText: true, giftText: true, menuSections: true, includedServices: true, notes: true }).partial();
const quoteFields = z.object({
  leadId: objectId.optional(), customerId: objectId.optional(), salonId: objectId.optional(), salonIds: z.array(objectId).min(1).optional(), packageTemplateId: objectId.optional(),
  manualMode: z.boolean().optional(),
  applyCommercialOverrides: z.boolean().optional(),
  contactName: z.string().trim().min(2).optional(), firstName: z.string().trim().min(1).optional(), lastName: z.string().trim().min(1).optional(), phone: z.string().trim().min(6).optional(), email: z.string().trim().email().optional().or(z.literal('')),
  eventType: z.string().trim().min(1).optional(), eventDate: civilDateSchema.optional(), guestCount: z.coerce.number().int().positive().optional(),
  honoreeName: z.string().trim().optional(), vegetarianCount: z.coerce.number().int().min(0).optional(), veganCount: z.coerce.number().int().min(0).optional(), celiacCount: z.coerce.number().int().min(0).optional(), lactoseIntolerantCount: z.coerce.number().int().min(0).optional(), tableLinenColor: z.string().trim().optional(),
  packageName: z.string().trim().min(1).optional(), durationHours: z.coerce.number().positive().optional(), startTime: z.string().trim().optional(), endTime: z.string().trim().optional(),
  pricingMode: z.enum(pricingModes).optional(), pricePerPerson: z.coerce.number().min(0).optional(), fixedPrice: z.coerce.number().min(0).optional(), discountPercentage: z.coerce.number().min(0).max(100).optional(), finalPricePerPerson: z.coerce.number().min(0).optional(), finalFixedPrice: z.coerce.number().min(0).optional(), depositAmount: z.coerce.number().min(0).optional(),
  paymentTerms: z.string().trim().optional(), promotionText: z.string().trim().optional(), giftText: z.string().trim().optional(), menuSections: menuSectionsSchema.optional(), includedServices: z.array(z.string().trim().min(1)).optional(), notes: z.string().trim().optional(), validUntil: z.coerce.date().optional()
});
const createQuoteSchema = z.object({ body: quoteFields.refine((body) => Boolean(body.salonId || body.salonIds?.length), 'Debe seleccionar al menos un salón.').superRefine((body, context) => {
  if (!body.leadId && !body.customerId) {
    for (const field of ['phone', 'eventType', 'guestCount'] as const) if (body[field] === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Campo obligatorio para una persona nueva.' });
    if (!body.contactName && !(body.firstName && body.lastName)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['contactName'], message: 'Debe indicar el nombre de la persona.' });
  }
  if (!body.packageTemplateId && !body.manualMode) context.addIssue({ code: z.ZodIssueCode.custom, path: ['packageTemplateId'], message: 'Seleccione una plantilla o use Presupuesto manual.' });
  if (body.manualMode && body.pricingMode === 'fixed' && !body.fixedPrice) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedPrice'], message: 'En modalidad precio total debe indicar un importe mayor a cero.' });
  if (body.manualMode && body.pricingMode !== 'fixed' && !body.pricePerPerson) context.addIssue({ code: z.ZodIssueCode.custom, path: ['pricePerPerson'], message: 'En modalidad por persona debe indicar un importe mayor a cero.' });
}), params: z.object({}), query: z.object({}) });
const updateQuoteSchema = z.object({ body: quoteFields.omit({ leadId: true, customerId: true, salonIds: true }).partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo para actualizar.'), params: z.object({ id: objectId }), query: z.object({}) });
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(quoteStatuses) }), params: z.object({ id: objectId }), query: z.object({}) });
const convertToEventSchema = z.object({ body: z.object({ eventName: z.string().trim().optional(), notes: z.string().trim().optional() }).optional().default({}), params: z.object({ id: objectId }), query: z.object({}) });
const ruleSchema = z.object({ body: ruleFields, params: z.object({ id: objectId, salonId: objectId }), query: z.object({}) });
const lineItemSchema = z.object({
  sourceType: z.nativeEnum(QuoteLineItemSourceType).default(QuoteLineItemSourceType.MANUAL),
  catalogItemId: objectId.optional(),
  serviceExtraId: objectId.optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().min(0),
  unitOfMeasure: z.string().trim().min(1).default('unidad'),
  unitCost: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  affectsInventory: z.boolean().default(false),
  notes: z.string().trim().optional()
});
const customCalculationSchema = z.object({
  body: z.object({
    quoteMode: z.nativeEnum(QuoteMode).default(QuoteMode.CUSTOM),
    salonId: objectId.optional(),
    eventType: z.string().trim().optional(),
    guestCount: z.coerce.number().int().positive(),
    adultsCount: z.coerce.number().min(0).default(0),
    minorsCount: z.coerce.number().min(0).default(0),
    childrenCount: z.coerce.number().min(0).default(0),
    teenagersCount: z.coerce.number().min(0).default(0),
    adultsWithAlcoholCount: z.coerce.number().min(0).default(0),
    includesAlcohol: z.boolean().default(false),
    lineItems: z.array(lineItemSchema).min(1)
  }),
  params: z.object({}),
  query: z.object({})
});
const fromCustomCalculationSchema = z.object({
  body: quoteFields.pick({
    leadId: true,
    customerId: true,
    salonId: true,
    salonIds: true,
    contactName: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    eventType: true,
    eventDate: true,
    guestCount: true,
    depositAmount: true,
    paymentTerms: true,
    notes: true
  }).extend(customCalculationSchema.shape.body.shape).refine((body) => Boolean(body.salonId || body.salonIds?.length), 'Debe seleccionar al menos un salón.').superRefine((body, context) => {
    if (!body.leadId && !body.customerId) {
      for (const field of ['phone', 'eventType', 'guestCount'] as const) if (body[field] === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Campo obligatorio para una persona nueva.' });
      if (!body.contactName && !(body.firstName && body.lastName)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['contactName'], message: 'Debe indicar el nombre de la persona.' });
    }
  }),
  params: z.object({}),
  query: z.object({})
});
const lineItemsPatchSchema = z.object({ body: z.object({ lineItems: z.array(lineItemSchema).min(1) }), params: z.object({ id: objectId }), query: z.object({}) });

const router = Router();

function uniqueIds(ids: string[]): string[] { return [...new Set(ids)]; }
function getQueryString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function getQueryIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return uniqueIds(values.flatMap((item) => typeof item === 'string' ? item.split(',') : []).map((item) => item.trim()).filter(Boolean));
}
function hasQuoteApproval(request: Request): boolean { return request.user!.roles.some((role) => hasPermission(role, Permission.QUOTES_APPROVE, request.user!.permissionOverrides)); }
async function ensureAccessibleSalons(request: Request, salonIds: string[]): Promise<void> {
  if (!salonIds.length || salonIds.some((salonId) => !canAccessSalon(request.user!, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const count = await Salon.countDocuments({ _id: { $in: salonIds }, active: true, deletedAt: null });
  if (count !== salonIds.length) throw new ApiError(404, 'SALON_NOT_FOUND');
}
async function ensureQuoteAccess(request: Request, quote: any): Promise<void> {
  if (!quote || quote.deletedAt) throw new ApiError(404, 'QUOTE_NOT_FOUND');
  if (!canAccessSalon(request.user!, quote.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}
function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}
function quoteTemplateValues(template: Record<string, any>): Record<string, any> {
  const { _id, __v, createdAt, updatedAt, createdBy, updatedBy, deletedAt, deletedBy, ...values } = template;
  return values;
}
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
function calculateLineItems(lineItems: Array<Record<string, any>>): { lineItems: Array<Record<string, any>>; subtotalCost: number; totalAmount: number } {
  const calculated = lineItems.map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitCost = Number(item.unitCost ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const subtotalCost = quantity * unitCost;
    const subtotalPrice = quantity * unitPrice;
    const discountAmount = Number(item.discountAmount ?? 0);
    const totalPrice = Math.max(0, subtotalPrice - discountAmount);
    return { ...item, quantity, unitCost, unitPrice, subtotalCost, subtotalPrice, discountAmount, totalPrice };
  });
  return { lineItems: calculated, subtotalCost: calculated.reduce((sum, item) => sum + item.subtotalCost, 0), totalAmount: calculated.reduce((sum, item) => sum + item.totalPrice, 0) };
}
// Global template values are the commercial fallback. A venue rule is optional and
// only overrides those values when the salon needs a different configuration.
async function getApplicableTemplate(templateId: string, salonId: string): Promise<Record<string, any>> {
  const template: any = await PackageTemplate.findOne({ _id: templateId, active: true, deletedAt: null }).lean();
  if (!template || (!template.isGlobal && !(template.salonIds ?? []).some((id: { toString(): string }) => id.toString() === salonId))) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const rule: any = await VenuePackageRule.findOne({ packageTemplateId: templateId, salonId, deletedAt: null }).lean();
  if (rule && !rule.active) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const overrideKeys = ['name', 'durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
  return { ...template, ...(rule ? pickDefined(rule, overrideKeys) : {}), ruleConfigured: Boolean(rule) };
}
async function createRevision(quote: any, request: Request, changeReason: string): Promise<void> {
  const latest: any = await QuoteRevision.findOne({ quoteId: quote._id }).sort({ version: -1 }).lean();
  await QuoteRevision.create({ quoteId: quote._id, version: (latest?.version ?? 0) + 1, snapshot: quote.toObject ? quote.toObject() : quote, changeReason, createdBy: request.user!.id });
}
async function refreshQuotePdf(quote: any): Promise<void> {
  if (!quote.validUntil) quote.validUntil = await quoteValidUntil(quote.salonId.toString());
  const pdf = await generateAndUploadQuotePdf(quote.toObject ? quote.toObject() : quote);
  Object.assign(quote, pdf);
  await quote.save();
}
function quoteNumber(): string { return `P-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`; }
function serializeQuote(quote: any): Record<string, any> { const source = quote?.toObject ? quote.toObject() : quote; return { ...source, estimatedEventDate: source?.eventDate }; }
function buildListQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) terms.push({ salonId: { $in: accessibleSalonIds(request.user!) } });
  const status = getQueryString(request.query.status); if (status && quoteStatuses.includes(status as any)) terms.push({ status });
  const salonId = getQueryString(request.query.salonId); if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const leadId = getQueryString(request.query.leadId); if (leadId && objectId.safeParse(leadId).success) terms.push({ leadId });
  const customerId = getQueryString(request.query.customerId); if (customerId && objectId.safeParse(customerId).success) terms.push({ customerId });
  const packageTemplateId = getQueryString(request.query.packageTemplateId); if (packageTemplateId && objectId.safeParse(packageTemplateId).success) terms.push({ packageTemplateId });
  const term = getQueryString(request.query.search); if (term) terms.push({ $or: ['quoteNumber', 'contactName', 'phone', 'email', 'packageName', 'eventType'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/packages', requirePermission(Permission.QUOTES_READ), asyncHandler(async (request, response) => {
  const requestedSalonIds = getQueryIds(request.query.salonId);
  if (requestedSalonIds.some((salonId) => !objectId.safeParse(salonId).success)) throw new ApiError(400, 'VALIDATION_ERROR');
  if (requestedSalonIds.some((salonId) => !canAccessSalon(request.user!, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');

  const scopes: Record<string, any>[] = [];
  if (!request.user!.roles.includes(Role.ADMIN)) scopes.push({ $or: [{ isGlobal: true }, { salonIds: { $in: accessibleSalonIds(request.user!) } }] });
  // A single quote can be generated for each selected salon, so only offer packages
  // that are applicable to every one of them.
  if (requestedSalonIds.length) scopes.push({ $or: [{ isGlobal: true }, { salonIds: { $all: requestedSalonIds } }] });
  const scope = scopes.length === 1 ? scopes[0] : scopes.length > 1 ? { $and: scopes } : {};
  const packages = await PackageTemplate.find({ deletedAt: null, active: true, ...scope }).sort({ name: 1 }).lean();
  return sendSuccess(response, { packages });
}));

router.post('/packages', requirePermission(Permission.QUOTES_UPDATE), validateRequest(z.object({ body: packageFields, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const salonIds = uniqueIds(request.body.salonIds ?? []); if (!request.body.isGlobal) await ensureAccessibleSalons(request, salonIds);
  const item = await PackageTemplate.create({ ...request.body, salonIds, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'PACKAGE_TEMPLATE_CREATE', 'PackageTemplate', item._id.toString());
  return sendSuccess(response, { package: item }, 201, getApiMessage('PACKAGE_TEMPLATE_CREATED'));
}));

router.get('/packages/:id/salons/:salonId', requirePermission(Permission.QUOTES_READ), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, salonId: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  await ensureAccessibleSalons(request, [request.params.salonId]);
  return sendSuccess(response, { package: await getApplicableTemplate(request.params.id, request.params.salonId) });
}));

router.patch('/packages/:id', requirePermission(Permission.QUOTES_UPDATE), validateRequest(z.object({ body: packageFields.partial(), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  if (request.body.salonIds) await ensureAccessibleSalons(request, uniqueIds(request.body.salonIds));
  const item = await PackageTemplate.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...request.body, updatedBy: request.user!.id }, { new: true });
  if (!item) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_FOUND');
  await writeAuditLog(request, 'PACKAGE_TEMPLATE_UPDATE', 'PackageTemplate', item._id.toString());
  return sendSuccess(response, { package: item }, 200, getApiMessage('PACKAGE_TEMPLATE_UPDATED'));
}));

router.patch('/packages/:id/salons/:salonId', requirePermission(Permission.QUOTES_UPDATE), validateRequest(ruleSchema), asyncHandler(async (request, response) => {
  await ensureAccessibleSalons(request, [request.params.salonId]);
  const template = await PackageTemplate.exists({ _id: request.params.id, deletedAt: null }); if (!template) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_FOUND');
  const rule = await VenuePackageRule.findOneAndUpdate({ packageTemplateId: request.params.id, salonId: request.params.salonId }, { ...request.body, packageTemplateId: request.params.id, salonId: request.params.salonId, updatedBy: request.user!.id, deletedAt: null }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await writeAuditLog(request, 'VENUE_PACKAGE_RULE_UPDATE', 'VenuePackageRule', rule._id.toString());
  return sendSuccess(response, { rule }, 200, getApiMessage('PACKAGE_RULE_UPDATED'));
}));

router.delete('/packages/:id', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await PackageTemplate.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id }, { new: true });
  if (!item) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_FOUND');
  await writeAuditLog(request, 'PACKAGE_TEMPLATE_DELETE', 'PackageTemplate', item._id.toString());
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('PACKAGE_TEMPLATE_DELETED'));
}));

router.get('/', requirePermission(Permission.QUOTES_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(getQueryString(request.query.page)) || 1); const limit = Math.min(100, Math.max(1, Number(getQueryString(request.query.limit)) || 20));
  const allowedSorts = ['createdAt', 'eventDate', 'totalAmount', 'status', 'quoteNumber']; const sortBy = allowedSorts.includes(getQueryString(request.query.sortBy) ?? '') ? getQueryString(request.query.sortBy)! : 'createdAt';
  const query = buildListQuery(request); const totalItems = await Quote.countDocuments(query);
  const quotes = await Quote.find(query).populate('leadId', 'fullName firstName lastName phone email').populate('customerId', 'fullName firstName lastName phone email').sort({ [sortBy]: getQueryString(request.query.sortOrder) === 'asc' ? 1 : -1 }).skip((page - 1) * limit).limit(limit).lean();
  return sendSuccess(response, { items: quotes.map(serializeQuote), meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.post('/custom-calculate', requirePermission(Permission.QUOTES_CREATE), validateRequest(customCalculationSchema), asyncHandler(async (request, response) => {
  const calculation = calculateLineItems(request.body.lineItems);
  return sendSuccess(response, {
    quoteMode: request.body.quoteMode,
    guestBreakdown: {
      totalGuests: request.body.guestCount,
      adultsCount: request.body.adultsCount,
      minorsCount: request.body.minorsCount,
      childrenCount: request.body.childrenCount,
      teenagersCount: request.body.teenagersCount,
      adultsWithAlcoholCount: request.body.adultsWithAlcoholCount,
      includesAlcohol: request.body.includesAlcohol
    },
    ...calculation
  });
}));

router.post('/from-custom-calculation', requirePermission(Permission.QUOTES_CREATE), validateRequest(fromCustomCalculationSchema), asyncHandler(async (request, response) => {
  const salonIds = uniqueIds([...(request.body.salonIds ?? []), ...(request.body.salonId ? [request.body.salonId] : [])]);
  await ensureAccessibleSalons(request, salonIds);
  const calculation = calculateLineItems(request.body.lineItems);
  if (calculation.totalAmount <= 0) throw new ApiError(422, 'QUOTE_PRICING_REQUIRED');
  let lead: any = null;
  let customer: any = null;
  if (request.body.leadId) lead = await Lead.findOne({ _id: request.body.leadId, deletedAt: null });
  if (request.body.customerId) customer = await Customer.findOne({ _id: request.body.customerId, deletedAt: null });
  if (!lead && !customer) {
    const result = await findOrCreateLead({
      contactName: request.body.contactName ?? `${request.body.firstName ?? ''} ${request.body.lastName ?? ''}`.trim(),
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      phone: request.body.phone,
      email: request.body.email || undefined,
      eventType: request.body.eventType,
      estimatedEventDate: request.body.eventDate,
      guestCount: request.body.guestCount,
      salonIds,
      source: 'manual',
      userId: request.user!.id
    });
    lead = result.lead;
    customer = result.existingCustomer;
  }
  const quotes = [];
  for (const salonId of salonIds) {
    const totalAmount = calculation.totalAmount;
    const depositAmount = Number(request.body.depositAmount ?? 0);
    const quote: any = await Quote.create({
      quoteNumber: quoteNumber(),
      quoteMode: request.body.quoteMode,
      salonId,
      leadId: lead?._id,
      customerId: customer?._id,
      source: customer ? 'customer' : lead ? 'lead' : 'manual',
      contactName: request.body.contactName ?? lead?.fullName ?? customer?.fullName,
      phone: request.body.phone ?? lead?.phone ?? customer?.phone,
      email: request.body.email ?? lead?.email ?? customer?.email,
      eventType: request.body.eventType,
      eventDate: request.body.eventDate,
      guestCount: request.body.guestCount,
      totalGuests: request.body.guestCount,
      adultsCount: request.body.adultsCount,
      minorsCount: request.body.minorsCount,
      childrenCount: request.body.childrenCount,
      teenagersCount: request.body.teenagersCount,
      adultsWithAlcoholCount: request.body.adultsWithAlcoholCount,
      includesAlcohol: request.body.includesAlcohol,
      packageName: request.body.quoteMode === QuoteMode.HYBRID ? 'Híbrido personalizado' : 'Personalizado',
      pricingMode: 'fixed',
      fixedPrice: totalAmount,
      finalFixedPrice: totalAmount,
      pricePerPerson: request.body.guestCount ? Math.round(totalAmount / request.body.guestCount) : totalAmount,
      discountPercentage: 0,
      finalPricePerPerson: request.body.guestCount ? Math.round(totalAmount / request.body.guestCount) : totalAmount,
      totalAmount,
      depositAmount,
      balanceAmount: Math.max(0, totalAmount - depositAmount),
      lineItems: calculation.lineItems,
      customCalculationSnapshot: { ...request.body, ...calculation },
      paymentTerms: request.body.paymentTerms,
      notes: request.body.notes,
      validUntil: await quoteValidUntil(salonId),
      createdBy: request.user!.id,
      updatedBy: request.user!.id
    });
    await refreshQuotePdf(quote);
    await createRevision(quote, request, 'Presupuesto personalizado creado');
    quotes.push(quote);
  }
  return sendSuccess(response, { quotes, leadId: lead?._id, customerId: customer?._id }, 201, getApiMessage('QUOTE_CREATED'));
}));

router.post('/', requirePermission(Permission.QUOTES_CREATE), validateRequest(createQuoteSchema), asyncHandler(async (request, response) => {
  const salonIds = uniqueIds([...(request.body.salonIds ?? []), ...(request.body.salonId ? [request.body.salonId] : [])]);
  await ensureAccessibleSalons(request, salonIds);
  let lead: any;
  let customer: any;
  if (request.body.leadId) {
    lead = await Lead.findOne({ _id: request.body.leadId, deletedAt: null });
    if (!lead) throw new ApiError(404, 'LEAD_NOT_FOUND');
    const leadSalonIds = new Set([lead.salonId?.toString(), ...(lead.salonIds ?? []).map((id: { toString(): string }) => id.toString())]);
    if (![...leadSalonIds].some((salonId) => salonIds.includes(salonId as string))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
  if (request.body.customerId) {
    customer = await Customer.findOne({ _id: request.body.customerId, deletedAt: null });
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
    const customerSalonIds = (customer.salonIds ?? []).map((id: { toString(): string }) => id.toString());
    if (customerSalonIds.length && !customerSalonIds.some((salonId: string) => salonIds.includes(salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
  const templates: Array<Record<string, any>> = request.body.packageTemplateId ? await Promise.all(salonIds.map((salonId) => getApplicableTemplate(request.body.packageTemplateId!, salonId))) : salonIds.map(() => ({}));
  if (!lead && !customer) {
    const result = await findOrCreateLead({
      contactName: request.body.contactName ?? `${request.body.firstName ?? ''} ${request.body.lastName ?? ''}`.trim(),
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      phone: request.body.phone,
      email: request.body.email || undefined,
      eventType: request.body.eventType,
      estimatedEventDate: request.body.eventDate,
      guestCount: request.body.guestCount,
      salonIds,
      source: 'manual',
      userId: request.user!.id
    });
    lead = result.lead;
    customer = result.existingCustomer;
    if (lead && result.created) await writeAuditLog(request, 'LEAD_CREATE_FROM_QUOTE', 'Lead', lead._id.toString());
  }
  const quotes = [];
  for (const [index, salonId] of salonIds.entries()) {
    const template = templates[index];
    const { applyCommercialOverrides, manualMode, ...body } = request.body;
    const commercialFields = ['durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
    const nonCommercialBody = Object.fromEntries(Object.entries(body).filter(([key]) => !commercialFields.includes(key)));
    const contactName = request.body.contactName ?? lead?.fullName ?? customer?.fullName;
    const raw = { ...quoteTemplateValues(template), ...nonCommercialBody, ...(applyCommercialOverrides ? pickDefined(body, commercialFields) : {}), salonId, leadId: lead?._id, customerId: customer?._id, source: customer ? 'customer' : lead ? (request.body.leadId ? 'lead' : 'new_person') : 'manual', contactName, phone: request.body.phone ?? lead?.phone ?? customer?.phone, email: request.body.email ?? lead?.email ?? customer?.email, eventType: request.body.eventType ?? lead?.eventType, eventDate: request.body.eventDate ?? lead?.eventDate, guestCount: request.body.guestCount ?? lead?.guestCount, packageName: manualMode ? request.body.packageName : template.name, packageTemplateId: request.body.packageTemplateId, validUntil: await quoteValidUntil(salonId, request.body.validUntil), quoteNumber: quoteNumber(), createdBy: request.user!.id, updatedBy: request.user!.id, templateSnapshot: request.body.packageTemplateId ? template : undefined, packageSnapshot: request.body.packageTemplateId ? template : undefined, contactSnapshot: { leadId: lead?._id, customerId: customer?._id, contactName, phone: request.body.phone ?? lead?.phone ?? customer?.phone, email: request.body.email ?? lead?.email ?? customer?.email } };
    const calculated = calculateQuote(raw);
    if (!calculated.guestCount || !calculated.totalAmount || (calculated.pricingMode === 'fixed' ? !calculated.finalFixedPrice : !calculated.finalPricePerPerson)) throw new ApiError(422, 'QUOTE_PRICING_REQUIRED');
    const quote: any = await Quote.create(calculated);
    await refreshQuotePdf(quote);
    quotes.push(quote); await createRevision(quote, request, 'Presupuesto creado');
    await LeadActivity.create({ leadId: lead?._id, customerId: customer?._id, type: 'quote_created', title: 'Presupuesto creado', description: `Se creó el presupuesto ${quote.quoteNumber}.`, metadata: { quoteId: quote._id, salonId }, createdBy: request.user!.id });
    await writeAuditLog(request, 'QUOTE_CREATE', 'Quote', quote._id.toString(), { leadId: lead?._id?.toString(), customerId: customer?._id?.toString(), salonId });
  }
  return sendSuccess(response, { quotes, leadId: lead?._id, customerId: customer?._id }, 201, getApiMessage('QUOTE_CREATED'));
}));

router.get('/:id', requirePermission(Permission.QUOTES_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quote = await Quote.findOne({ _id: request.params.id, deletedAt: null }).populate('leadId', 'fullName phone email').populate('customerId', 'fullName phone email').populate('convertedCustomerId', 'fullName phone email').populate('convertedEventId', 'eventName eventType eventDate status').lean(); await ensureQuoteAccess(request, quote);
  return sendSuccess(response, { quote: serializeQuote(quote) });
}));

router.post('/:id/pdf', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null });
  await ensureQuoteAccess(request, quote);
  await refreshQuotePdf(quote);
  await createRevision(quote, request, 'PDF de presupuesto regenerado');
  return sendSuccess(response, { quote: serializeQuote(quote) }, 200, 'PDF generado correctamente.');
}));

router.patch('/:id/line-items', requirePermission(Permission.QUOTES_UPDATE), validateRequest(lineItemsPatchSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null });
  await ensureQuoteAccess(request, quote);
  const calculation = calculateLineItems(request.body.lineItems);
  quote.lineItems = calculation.lineItems;
  quote.customCalculationSnapshot = { ...(quote.customCalculationSnapshot ?? {}), ...calculation };
  quote.totalAmount = calculation.totalAmount;
  quote.balanceAmount = Math.max(0, calculation.totalAmount - Number(quote.depositAmount ?? 0));
  quote.updatedBy = request.user!.id;
  await quote.save();
  await refreshQuotePdf(quote);
  await createRevision(quote, request, 'Line items actualizados');
  return sendSuccess(response, { quote });
}));

router.post('/:id/recalculate', requirePermission(Permission.QUOTES_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null });
  await ensureQuoteAccess(request, quote);
  const calculation = calculateLineItems(quote.lineItems ?? []);
  quote.totalAmount = calculation.totalAmount;
  quote.balanceAmount = Math.max(0, calculation.totalAmount - Number(quote.depositAmount ?? 0));
  quote.customCalculationSnapshot = { ...(quote.customCalculationSnapshot ?? {}), ...calculation };
  quote.updatedBy = request.user!.id;
  await quote.save();
  await refreshQuotePdf(quote);
  await createRevision(quote, request, 'Presupuesto recalculado');
  return sendSuccess(response, { quote });
}));

router.patch('/:id', requirePermission(Permission.QUOTES_UPDATE), validateRequest(updateQuoteSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null }); await ensureQuoteAccess(request, quote);
  if (request.body.salonId) await ensureAccessibleSalons(request, [request.body.salonId]);
  const updated = calculateQuote({ ...quote.toObject(), ...request.body, updatedBy: request.user!.id }); Object.assign(quote, updated); await quote.save(); await refreshQuotePdf(quote); await createRevision(quote, request, 'Presupuesto actualizado');
  await LeadActivity.create({ leadId: quote.leadId, customerId: quote.customerId, type: 'system', title: 'Presupuesto actualizado', description: `Se actualizó el presupuesto ${quote.quoteNumber}.`, metadata: { quoteId: quote._id }, createdBy: request.user!.id });
  await writeAuditLog(request, 'QUOTE_UPDATE', 'Quote', quote._id.toString()); return sendSuccess(response, { quote }, 200, getApiMessage('QUOTE_UPDATED'));
}));

router.post('/:id/duplicate', requirePermission(Permission.QUOTES_CREATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const original: any = await Quote.findOne({ _id: request.params.id, deletedAt: null }); await ensureQuoteAccess(request, original);
  const duplicate = await Quote.create({ ...original.toObject(), _id: undefined, quoteNumber: quoteNumber(), status: 'draft', sentAt: undefined, acceptedAt: undefined, rejectedAt: undefined, pdfUrl: undefined, pdfSecureUrl: undefined, pdfPublicId: undefined, pdfGeneratedAt: undefined, createdAt: undefined, updatedAt: undefined, createdBy: request.user!.id, updatedBy: request.user!.id });
  await refreshQuotePdf(duplicate);
  await createRevision(duplicate, request, `Duplicado de ${original.quoteNumber}`); await LeadActivity.create({ leadId: duplicate.leadId, customerId: duplicate.customerId, type: 'quote_created', title: 'Presupuesto duplicado', description: `Se duplicó ${original.quoteNumber} como ${duplicate.quoteNumber}.`, metadata: { quoteId: duplicate._id }, createdBy: request.user!.id });
  await writeAuditLog(request, 'QUOTE_DUPLICATE', 'Quote', duplicate._id.toString(), { sourceQuoteId: original._id.toString() }); return sendSuccess(response, { quote: duplicate }, 201, getApiMessage('QUOTE_DUPLICATED'));
}));

router.patch('/:id/status', requirePermission(Permission.QUOTES_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null }); await ensureQuoteAccess(request, quote);
  if (['accepted', 'rejected', 'converted'].includes(request.body.status) && !hasQuoteApproval(request)) throw new ApiError(403, 'FORBIDDEN');
  quote.status = request.body.status; quote.updatedBy = request.user!.id; if (request.body.status === 'sent') quote.sentAt = new Date(); if (request.body.status === 'accepted') quote.acceptedAt = new Date(); if (request.body.status === 'rejected') quote.rejectedAt = new Date(); await quote.save(); await createRevision(quote, request, 'Estado actualizado');
  await LeadActivity.create({ leadId: quote.leadId, customerId: quote.customerId, type: request.body.status === 'sent' ? 'quote_sent' : 'system', title: 'Estado de presupuesto actualizado', description: `El presupuesto ${quote.quoteNumber} cambió de estado.`, metadata: { quoteId: quote._id, status: quote.status }, createdBy: request.user!.id }); await writeAuditLog(request, 'QUOTE_STATUS_UPDATE', 'Quote', quote._id.toString(), { status: quote.status });
  return sendSuccess(response, { quote }, 200, getApiMessage('QUOTE_STATUS_UPDATED'));
}));

router.post('/:id/convert-to-event', requirePermission(Permission.EVENTS_CREATE), validateRequest(convertToEventSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureQuoteAccess(request, quote);
  const result = await convertQuoteToEvent({ quoteId: request.params.id, userId: request.user!.id, eventName: request.body.eventName, notes: request.body.notes });
  await writeAuditLog(request, 'QUOTE_CONVERT_TO_EVENT', 'Event', result.event._id.toString(), { quoteId: request.params.id, customerId: result.customer._id.toString() });
  return sendSuccess(response, result, result.createdEvent ? 201 : 200, getApiMessage(result.createdEvent ? 'EVENT_CREATED_FROM_QUOTE' : 'EVENT_ALREADY_CREATED_FROM_QUOTE'));
}));

router.delete('/:id', requirePermission(Permission.QUOTES_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const quote: any = await Quote.findOne({ _id: request.params.id, deletedAt: null }); await ensureQuoteAccess(request, quote); quote.deletedAt = new Date(); quote.deletedBy = request.user!.id; quote.updatedBy = request.user!.id; await quote.save();
  const linkedRequests: any[] = await QuoteRequest.find({ convertedQuoteIds: quote._id, deletedAt: null });
  await Promise.all(linkedRequests.map(async (quoteRequest) => {
    const remainingQuoteIds = (quoteRequest.convertedQuoteIds ?? []).filter((quoteId: { toString(): string }) => quoteId.toString() !== quote._id.toString());
    const activeQuotes = remainingQuoteIds.length ? await Quote.countDocuments({ _id: { $in: remainingQuoteIds }, deletedAt: null }) : 0;
    quoteRequest.convertedQuoteIds = remainingQuoteIds;
    if (!activeQuotes) quoteRequest.status = 'in_review';
    quoteRequest.updatedBy = request.user!.id;
    await quoteRequest.save();
  }));
  await LeadActivity.create({ leadId: quote.leadId, customerId: quote.customerId, type: 'system', title: 'Presupuesto eliminado', description: `Se eliminó el presupuesto ${quote.quoteNumber}.`, metadata: { quoteId: quote._id }, createdBy: request.user!.id }); await writeAuditLog(request, 'QUOTE_DELETE', 'Quote', quote._id.toString());
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('QUOTE_DELETED'));
}));

export default router;
