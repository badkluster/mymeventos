import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role, StaffSubrole } from '@mym/shared';
import { Contract, Customer, Event, EventStaffAssignment, LeadActivity, Payment, Quote } from './crm.models';
import { User } from '../users/user.model';
import { Salon } from '../salons/salon.model';
import { accessibleSalonIds, canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { findOrCreateCustomer } from './contact-dedupe.service';
import { buildInitialResourcePlan } from './event-resource-plan';
import { createContractFromEvent } from './event-to-contract.service';
import { convertQuoteToEvent } from './quote-to-event.service';
import { createPayment, paymentSummary } from './payments.service';
import { generateAndUploadPaymentReceiptPdf } from './payment-receipt-pdf.service';
import { sendEmail } from '../email/email.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalObjectId = objectId.optional().or(z.literal(''));
const eventStatuses = ['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed', 'cancelled', 'lost'] as const;
const pricingModes = ['per_person', 'fixed'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const assignmentIdSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, assignmentId: objectId }), query: z.object({}) });
const menuSectionsSchema = z.array(z.object({ title: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) }));
const newCustomerSchema = z.object({
  fullName: z.string().trim().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  documentNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  occupation: z.string().trim().optional(),
  notes: z.string().trim().optional()
});
const createEventSchema = z.object({
  body: z.object({
    quoteId: optionalObjectId,
    customerId: optionalObjectId,
    customer: newCustomerSchema.optional(),
    createContract: z.boolean().optional(),
    salonId: optionalObjectId,
    eventType: z.string().trim().optional(),
    eventName: z.string().trim().optional(),
    eventDate: z.coerce.date().optional(),
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    honoreeName: z.string().trim().optional(),
    vegetarianCount: z.coerce.number().int().min(0).optional(),
    veganCount: z.coerce.number().int().min(0).optional(),
    celiacCount: z.coerce.number().int().min(0).optional(),
    lactoseIntolerantCount: z.coerce.number().int().min(0).optional(),
    tableLinenColor: z.string().trim().optional(),
    packageName: z.string().trim().optional(),
    pricingMode: z.enum(pricingModes).optional(),
    pricePerPerson: z.coerce.number().min(0).optional(),
    finalPricePerPerson: z.coerce.number().min(0).optional(),
    fixedPrice: z.coerce.number().min(0).optional(),
    finalFixedPrice: z.coerce.number().min(0).optional(),
    estimatedAmount: z.coerce.number().min(0).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    paymentTerms: z.string().trim().optional(),
    promotionText: z.string().trim().optional(),
    giftText: z.string().trim().optional(),
    menuSnapshot: menuSectionsSchema.optional(),
    servicesSnapshot: z.array(z.string().trim().min(1)).optional(),
    resourcePlanSnapshot: z.unknown().optional(),
    notes: z.string().trim().optional()
  }).superRefine((body, context) => {
    if (body.quoteId) return;
    if (!body.salonId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['salonId'], message: 'Debe seleccionar un salón.' });
    if (!body.customerId && !body.customer?.fullName && !body.customer?.firstName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['customer'], message: 'Debe seleccionar o crear un cliente.' });
    if (!body.eventName && !body.eventType) context.addIssue({ code: z.ZodIssueCode.custom, path: ['eventName'], message: 'Debe indicar nombre o tipo de evento.' });
  }),
  params: z.object({}),
  query: z.object({})
});
const assignmentBaseBody = z.object({
  staffUserId: objectId,
  roleLabel: z.string().trim().optional(),
  staffSubrole: z.nativeEnum(StaffSubrole).optional(),
  shiftStart: z.coerce.date().optional(),
  shiftEnd: z.coerce.date().optional(),
  status: z.enum(['proposed', 'assigned', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().trim().optional()
});
const assignmentBody = assignmentBaseBody.refine((body) => body.roleLabel || body.staffSubrole, 'Debe indicar rol o subrol.').refine((body) => !body.shiftStart || !body.shiftEnd || body.shiftEnd > body.shiftStart, 'El fin del turno debe ser posterior al inicio.');
const createAssignmentSchema = z.object({ body: assignmentBody, params: z.object({ id: objectId }), query: z.object({}) });
const updateAssignmentSchema = z.object({ body: assignmentBaseBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.').refine((body) => !body.shiftStart || !body.shiftEnd || body.shiftEnd > body.shiftStart, 'El fin del turno debe ser posterior al inicio.'), params: z.object({ id: objectId, assignmentId: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(eventStatuses) }), params: z.object({ id: objectId }), query: z.object({}) });
const updateSchema = z.object({
  body: z.object({
    eventType: z.string().trim().optional(),
    eventName: z.string().trim().optional(),
    eventDate: z.coerce.date().optional(),
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    honoreeName: z.string().trim().optional(), vegetarianCount: z.coerce.number().int().min(0).optional(), veganCount: z.coerce.number().int().min(0).optional(), celiacCount: z.coerce.number().int().min(0).optional(), lactoseIntolerantCount: z.coerce.number().int().min(0).optional(), tableLinenColor: z.string().trim().optional(),
    status: z.enum(eventStatuses).optional(),
    estimatedAmount: z.coerce.number().min(0).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().optional(),
    commercialSnapshot: z.unknown().optional(),
    menuSnapshot: z.unknown().optional(),
    servicesSnapshot: z.unknown().optional(),
    paymentSnapshot: z.unknown().optional(),
    paymentPlanSnapshot: z.unknown().optional(),
    resourcePlanSnapshot: z.unknown().optional(),
    contractReadyChecklist: z.unknown().optional()
  }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const eventPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
    method: z.enum(['cash', 'bank_transfer', 'mercado_pago', 'card', 'other']),
    type: z.enum(['deposit', 'installment', 'balance', 'extra', 'adjustment', 'other']).optional(),
    paidAt: z.coerce.date().optional(),
    reference: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    planInstallmentId: z.string().trim().optional()
  }),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const paymentReceiptSchema = z.object({ body: z.object({ email: z.string().trim().email().optional() }).optional(), params: z.object({ id: objectId, paymentId: objectId }), query: z.object({}) });

const router = Router();

function getQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanId(value?: string): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function pickDefined(source: Record<string, any>, keys: string[]): Record<string, any> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined && source[key] !== '').map((key) => [key, source[key]]));
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function ensureEventAccess(request: Request, event: any): Promise<void> {
  if (!event || event.deletedAt) throw new ApiError(404, 'EVENT_NOT_FOUND');
  if (event.salonId && !canAccessSalon(request.user!, event.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

async function ensureSalonAccess(request: Request, salonId: string): Promise<void> {
  if (!canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const salon = await Salon.findOne({ _id: salonId, active: true, deletedAt: null }).lean();
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
}

async function getAccessibleQuote(request: Request, quoteId: string): Promise<any> {
  const quote: any = await Quote.findOne({ _id: quoteId, deletedAt: null }).lean();
  if (!quote) throw new ApiError(404, 'QUOTE_NOT_FOUND');
  if (!canAccessSalon(request.user!, quote.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  return quote;
}

async function resolveCustomerForEvent(request: Request, body: any, salonId: string, quote?: any): Promise<any> {
  const customerId = cleanId(body.customerId) ?? quote?.customerId?.toString?.();
  if (customerId) {
    const customer: any = await Customer.findOne({ _id: customerId, deletedAt: null });
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
    const salonIds = (customer.salonIds ?? []).map((id: { toString(): string }) => id.toString());
    if (!request.user!.roles.includes(Role.ADMIN) && salonIds.length && !salonIds.some((id: string) => canAccessSalon(request.user!, id))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
    if (!salonIds.includes(salonId)) {
      customer.salonIds = uniqueIds([...salonIds, salonId]);
      customer.updatedBy = request.user!.id;
      await customer.save();
    }
    return customer;
  }

  const customerInput = body.customer ?? {};
  const contactName = customerInput.fullName || [customerInput.firstName, customerInput.lastName].filter(Boolean).join(' ') || quote?.contactName;
  const result = await findOrCreateCustomer({
    contactName,
    firstName: customerInput.firstName,
    lastName: customerInput.lastName,
    phone: customerInput.phone || quote?.phone,
    email: customerInput.email || quote?.email,
    eventType: body.eventType || quote?.eventType,
    estimatedEventDate: body.eventDate || quote?.eventDate,
    guestCount: body.guestCount || quote?.guestCount,
    salonIds: [salonId],
    quoteId: quote?._id?.toString?.(),
    message: customerInput.notes || body.notes || quote?.notes,
    userId: request.user!.id
  });
  const customer: any = result.customer;
  const customerPatch = pickDefined(customerInput, ['documentNumber', 'address', 'occupation', 'notes']);
  if (Object.keys(customerPatch).length) {
    Object.assign(customer, customerPatch, { updatedBy: request.user!.id });
    await customer.save();
  }
  return customer;
}

function commercialSnapshotFromBody(body: any): Record<string, unknown> {
  const pricingMode = body.pricingMode ?? (body.fixedPrice || body.finalFixedPrice ? 'fixed' : 'per_person');
  const perPersonTotal = Number(body.finalPricePerPerson ?? body.pricePerPerson ?? 0) * Number(body.guestCount ?? 0);
  const fixedTotal = Number(body.finalFixedPrice ?? body.fixedPrice ?? 0);
  const totalAmount = Number(body.finalAmount ?? body.estimatedAmount ?? (pricingMode === 'fixed' ? fixedTotal : perPersonTotal) ?? 0);
  const depositAmount = Number(body.depositAmount ?? 0);
  return {
    packageName: body.packageName,
    pricingMode,
    startTime: body.startTime,
    endTime: body.endTime,
    pricePerPerson: body.pricePerPerson,
    finalPricePerPerson: body.finalPricePerPerson ?? body.pricePerPerson,
    fixedPrice: body.fixedPrice,
    finalFixedPrice: body.finalFixedPrice ?? body.fixedPrice,
    totalAmount,
    depositAmount,
    balanceAmount: Math.max(0, totalAmount - depositAmount),
    paymentTerms: body.paymentTerms,
    promotionText: body.promotionText,
    giftText: body.giftText
  };
}

function eventPatchFromCreateBody(body: any): Record<string, unknown> {
  return pickDefined(body, [
    'eventType',
    'eventName',
    'eventDate',
    'startTime',
    'endTime',
    'guestCount',
    'honoreeName',
    'vegetarianCount',
    'veganCount',
    'celiacCount',
    'lactoseIntolerantCount',
    'tableLinenColor',
    'estimatedAmount',
    'finalAmount',
    'notes'
  ]);
}

function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) terms.push({ salonId: { $in: accessibleSalonIds(request.user!) } });
  const status = getQueryString(request.query.status);
  if (status && eventStatuses.includes(status as any)) terms.push({ status });
  const salonId = getQueryString(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const dateFrom = getQueryString(request.query.dateFrom);
  const dateTo = getQueryString(request.query.dateTo);
  const dateRange: Record<string, Date> = {};
  if (dateFrom) {
    const parsed = new Date(dateFrom);
    if (!Number.isNaN(parsed.getTime())) dateRange.$gte = parsed;
  }
  if (dateTo) {
    const parsed = new Date(dateTo);
    if (!Number.isNaN(parsed.getTime())) dateRange.$lte = parsed;
  }
  if (Object.keys(dateRange).length) terms.push({ eventDate: dateRange });
  const customerId = getQueryString(request.query.customerId);
  if (customerId && objectId.safeParse(customerId).success) terms.push({ customerId });
  const sourceQuoteId = getQueryString(request.query.sourceQuoteId);
  if (sourceQuoteId && objectId.safeParse(sourceQuoteId).success) terms.push({ sourceQuoteId });
  const term = getQueryString(request.query.search);
  if (term) terms.push({ $or: ['eventName', 'eventType', 'notes'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.EVENTS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(getQueryString(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(getQueryString(request.query.limit)) || 20));
  const sortBy = ['createdAt', 'eventDate', 'status', 'eventName'].includes(getQueryString(request.query.sortBy) ?? '') ? getQueryString(request.query.sortBy)! : 'createdAt';
  const sortOrder = getQueryString(request.query.sortOrder) === 'asc' ? 1 : -1;
  const query = buildQuery(request);
  const totalItems = await Event.countDocuments(query);
  const items = await Event.find(query)
    .populate('customerId', 'fullName phone email')
    .populate('salonId', 'name')
    .populate('sourceLeadId', 'fullName phone email')
    .populate('sourceQuoteId', 'quoteNumber totalAmount status')
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.EVENTS_CREATE), validateRequest(createEventSchema), asyncHandler(async (request, response) => {
  const quoteId = cleanId(request.body.quoteId);
  if (quoteId) {
    const quote = await getAccessibleQuote(request, quoteId);
    const result = await convertQuoteToEvent({ quoteId, userId: request.user!.id, eventName: request.body.eventName, notes: request.body.notes });
    const event: any = await Event.findOne({ _id: result.event._id, deletedAt: null });
    await ensureEventAccess(request, event);
    const patch = eventPatchFromCreateBody(request.body);
    if (request.body.resourcePlanSnapshot !== undefined) patch.resourcePlanSnapshot = request.body.resourcePlanSnapshot;
    if (request.body.menuSnapshot !== undefined) patch.menuSnapshot = request.body.menuSnapshot;
    if (request.body.servicesSnapshot !== undefined) patch.servicesSnapshot = request.body.servicesSnapshot;
    if (Object.keys(patch).length) {
      Object.assign(event, patch, { updatedBy: request.user!.id });
      await event.save();
    }
    let contract: any;
    let contractCreated = false;
    let contractError: string | undefined;
    if (request.body.createContract) {
      try {
        const contractResult = await createContractFromEvent({ eventId: event._id.toString(), userId: request.user!.id });
        contract = contractResult.contract;
        contractCreated = contractResult.created;
      } catch (error) {
        contractError = error instanceof ApiError ? error.message : getApiMessage('INTERNAL_ERROR');
      }
    }
    const freshEvent = await Event.findOne({ _id: event._id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('salonId', 'name').populate('sourceQuoteId', 'quoteNumber totalAmount status').lean();
    await writeAuditLog(request, result.createdEvent ? 'EVENT_CREATE_FROM_QUOTES_PAGE' : 'EVENT_LINK_EXISTING_QUOTE', 'Event', event._id.toString(), { quoteId: quote._id.toString(), contractCreated });
    return sendSuccess(response, { event: freshEvent, customer: result.customer, quote: result.quote, contract, contractCreated, contractError, createdFromQuote: true }, result.createdEvent ? 201 : 200, getApiMessage(result.createdEvent ? 'EVENT_CREATED_FROM_QUOTE' : 'EVENT_ALREADY_CREATED_FROM_QUOTE'));
  }

  const salonId = cleanId(request.body.salonId)!;
  await ensureSalonAccess(request, salonId);
  const customer = await resolveCustomerForEvent(request, request.body, salonId);
  const commercialSnapshot = commercialSnapshotFromBody(request.body);
  const totalAmount = Number(commercialSnapshot.totalAmount ?? 0);
  const resourcePlanSnapshot = request.body.resourcePlanSnapshot ?? buildInitialResourcePlan({ source: 'manual_event' });
  const event = await Event.create({
    customerId: customer._id,
    salonId,
    ...eventPatchFromCreateBody(request.body),
    eventName: request.body.eventName || `${request.body.eventType || 'Evento'} - ${customer.fullName || 'Cliente'}`,
    quoteMode: 'CUSTOM',
    status: 'draft',
    estimatedAmount: request.body.estimatedAmount ?? totalAmount,
    finalAmount: request.body.finalAmount ?? totalAmount,
    commercialSnapshot,
    menuSnapshot: request.body.menuSnapshot ?? [],
    servicesSnapshot: request.body.servicesSnapshot ?? [],
    resourcePlanSnapshot,
    paymentSnapshot: {
      depositAmount: commercialSnapshot.depositAmount,
      balanceAmount: commercialSnapshot.balanceAmount,
      paymentTerms: request.body.paymentTerms
    },
    contractReadyChecklist: {
      customerComplete: Boolean(customer.fullName && (customer.phone || customer.email)),
      document: Boolean(customer.documentNumber),
      address: Boolean(customer.address),
      salonDefined: true,
      dateDefined: Boolean(request.body.eventDate),
      timeDefined: Boolean(request.body.startTime && request.body.endTime),
      guestCount: Boolean(request.body.guestCount),
      totalPrice: Boolean(totalAmount),
      deposit: Boolean(request.body.depositAmount),
      paymentTerms: Boolean(request.body.paymentTerms),
      menu: Boolean(request.body.menuSnapshot?.length),
      includedServices: Boolean(request.body.servicesSnapshot?.length)
    },
    createdBy: request.user!.id,
    updatedBy: request.user!.id
  });
  await LeadActivity.create({ customerId: customer._id, eventId: event._id, type: 'event_created', title: 'Evento creado', description: `Se creó el evento ${event.eventName}.`, createdBy: request.user!.id });
  await writeAuditLog(request, 'EVENT_CREATE', 'Event', event._id.toString(), { customerId: customer._id.toString(), salonId });

  let contract: any;
  let contractCreated = false;
  let contractError: string | undefined;
  if (request.body.createContract) {
    try {
      const contractResult = await createContractFromEvent({ eventId: event._id.toString(), userId: request.user!.id });
      contract = contractResult.contract;
      contractCreated = contractResult.created;
    } catch (error) {
      contractError = error instanceof ApiError ? error.message : getApiMessage('INTERNAL_ERROR');
    }
  }
  const freshEvent = await Event.findOne({ _id: event._id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('salonId', 'name').lean();
  return sendSuccess(response, { event: freshEvent, customer, contract, contractCreated, contractError, createdFromQuote: false }, 201, getApiMessage('EVENT_CREATED'));
}));

router.get('/customers/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
  return sendSuccess(response, { customer });
}));

router.get('/:id/payments', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const items = await Payment.find({ eventId: request.params.id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('contractId', 'contractNumber totalAmount balanceAmount status').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).lean();
  const summary = await paymentSummary({ eventId: request.params.id });
  return sendSuccess(response, { items, summary });
}));

router.post('/:id/payments', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(eventPaymentSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  let contract: any = await Contract.findOne({ eventId: event._id, deletedAt: null, status: { $nin: ['cancelled', 'superseded'] } }).sort({ versionNumber: -1, createdAt: -1 });
  if (!contract) throw new ApiError(422, 'Primero debe generar un contrato para registrar cobros del evento.');

  const payment = await createPayment({
    ...request.body,
    type: request.body.type ?? 'installment',
    status: 'paid',
    eventId: event._id.toString(),
    contractId: contract._id.toString(),
    customerId: event.customerId?.toString(),
    salonId: event.salonId?.toString(),
    quoteId: event.quoteId?.toString()
  }, request.user!.id);
  contract = await Contract.findOne({ _id: contract._id, deletedAt: null });

  const plan = Array.isArray(event.paymentPlanSnapshot) ? event.paymentPlanSnapshot.map((item: any) => ({ ...item })) : [];
  if (plan.length) {
    const selectedIndex = request.body.planInstallmentId ? plan.findIndex((item: any) => item.id === request.body.planInstallmentId) : -1;
    const pendingIndexes = plan.map((item: any, index: number) => ({ item, index })).filter(({ item }: any) => !['paid', 'cancelled'].includes(item.status));
    const targetIndex = selectedIndex >= 0 ? selectedIndex : pendingIndexes[0]?.index;
    if (targetIndex !== undefined) {
      const target = plan[targetIndex];
      const remaining = Math.max(0, Number(target.amount || 0) - Number(target.paidAmount || 0));
      const applied = Math.min(Number(request.body.amount), remaining);
      target.paidAmount = Number(target.paidAmount || 0) + applied;
      target.status = target.paidAmount >= Number(target.amount || 0) ? 'paid' : 'partial';
      target.paymentId = payment._id.toString();
      const excess = Math.max(0, Number(request.body.amount) - applied);
      if (excess) {
        const lastOpen = [...plan].reverse().find((item: any, reverseIndex: number) => !['paid', 'cancelled'].includes(item.status) && plan.length - 1 - reverseIndex !== targetIndex);
        if (lastOpen) lastOpen.amount = Math.max(0, Number(lastOpen.amount || 0) - excess);
      }
    }
    event.paymentPlanSnapshot = plan;
    await event.save();
    contract.paymentPlanSnapshot = plan;
    await contract.save();
  }
  let receiptEmailSent = false;
  try {
    const customer: any = await Customer.findOne({ _id: event.customerId, deletedAt: null }).lean();
    const receipt = await generateAndUploadPaymentReceiptPdf(payment, event, customer, contract);
    Object.assign(payment, receipt);
    delete (payment as any).pdfBuffer;
    if (customer?.email) {
      receiptEmailSent = await sendEmail({ to: customer.email, subject: `Comprobante de pago ${payment.paymentNumber} · M&M Eventos`, text: `Hola ${customer.fullName ?? ''}, adjuntamos el comprobante de tu pago por ${Number(payment.amount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}. También podés verlo aquí: ${receipt.receiptPdfSecureUrl}`, attachments: [{ filename: `comprobante-${payment.paymentNumber}.pdf`, content: receipt.pdfBuffer, contentType: 'application/pdf' }] });
      if (receiptEmailSent) payment.receiptEmailSentAt = new Date();
    }
    await payment.save();
  } catch (error) { console.error('No se pudo generar o enviar el comprobante de pago:', error); }
  await writeAuditLog(request, 'EVENT_PAYMENT_CREATE', 'Payment', payment._id.toString(), { eventId: request.params.id, planInstallmentId: request.body.planInstallmentId });
  return sendSuccess(response, { payment, paymentPlanSnapshot: event.paymentPlanSnapshot, receiptEmailSent }, 201, getApiMessage('PAYMENT_CREATED'));
}));

router.post('/:id/payments/:paymentId/receipt-email', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(paymentReceiptSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean(); await ensureEventAccess(request, event);
  const payment: any = await Payment.findOne({ _id: request.params.paymentId, eventId: event._id, deletedAt: null }); if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  const [customer, contract] = await Promise.all([Customer.findOne({ _id: event.customerId, deletedAt: null }).lean(), Contract.findOne({ _id: payment.contractId, deletedAt: null }).lean()]);
  const email = request.body?.email ?? (customer as any)?.email; if (!email) throw new ApiError(422, 'El cliente no tiene un email registrado.');
  const receipt = await generateAndUploadPaymentReceiptPdf(payment, event, customer, contract); Object.assign(payment, receipt); delete (payment as any).pdfBuffer;
  const emailSent = await sendEmail({ to: email, subject: `Comprobante de pago ${payment.paymentNumber} · M&M Eventos`, text: `Adjuntamos tu comprobante de pago. También podés verlo aquí: ${receipt.receiptPdfSecureUrl}`, attachments: [{ filename: `comprobante-${payment.paymentNumber}.pdf`, content: receipt.pdfBuffer, contentType: 'application/pdf' }] });
  if (emailSent) payment.receiptEmailSentAt = new Date(); await payment.save();
  return sendSuccess(response, { payment, emailSent });
}));

router.get('/:id/staff', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const items = await EventStaffAssignment.find({ eventId: request.params.id, deletedAt: null }).populate('staffUserId', 'firstName lastName fullName phone email roles staffProfile salonIds active').populate('salonId', 'name').sort({ shiftStart: 1, createdAt: 1 }).lean();
  return sendSuccess(response, { items });
}));

router.post('/:id/staff', requirePermission(Permission.EVENTS_UPDATE), validateRequest(createAssignmentSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  if (['cancelled', 'lost'].includes(event.status)) throw new ApiError(422, 'EVENT_NOT_ASSIGNABLE');
  const staff: any = await User.findOne({ _id: request.body.staffUserId, active: true, deletedAt: null }).lean();
  if (!staff) throw new ApiError(422, 'STAFF_NOT_FOUND');
  const staffSalonIds = (staff.salonIds ?? []).map((id: { toString(): string }) => id.toString());
  const salonId = event.salonId?.toString();
  if (!staff.roles?.includes(Role.ADMIN) && salonId && !staffSalonIds.includes(salonId)) throw new ApiError(403, 'STAFF_SALON_SCOPE_FORBIDDEN');
  const duplicate = await EventStaffAssignment.exists({ eventId: request.params.id, staffUserId: request.body.staffUserId, shiftStart: request.body.shiftStart ?? null, shiftEnd: request.body.shiftEnd ?? null, deletedAt: null, status: { $nin: ['cancelled', 'no_show'] } });
  if (duplicate) throw new ApiError(409, 'STAFF_ASSIGNMENT_DUPLICATED');
  const assignment = await EventStaffAssignment.create({ ...request.body, eventId: request.params.id, salonId, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EVENT_STAFF_ASSIGN', 'EventStaffAssignment', assignment._id.toString(), { eventId: request.params.id, staffUserId: request.body.staffUserId });
  return sendSuccess(response, { assignment }, 201);
}));

router.patch('/:id/staff/:assignmentId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateAssignmentSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const assignment = await EventStaffAssignment.findOneAndUpdate({ _id: request.params.assignmentId, eventId: request.params.id, deletedAt: null }, { ...request.body, updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
  await writeAuditLog(request, 'EVENT_STAFF_UPDATE', 'EventStaffAssignment', request.params.assignmentId);
  return sendSuccess(response, { assignment });
}));

router.delete('/:id/staff/:assignmentId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(assignmentIdSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const assignment = await EventStaffAssignment.findOneAndUpdate({ _id: request.params.assignmentId, eventId: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id }, { new: true });
  if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
  await writeAuditLog(request, 'EVENT_STAFF_DELETE', 'EventStaffAssignment', request.params.assignmentId);
  return sendSuccess(response, { deleted: true });
}));

for (const [path, status] of [['confirm', 'confirmed'], ['cancel', 'cancelled']] as const) {
  router.post(`/:id/staff/:assignmentId/${path}`, requirePermission(Permission.EVENTS_UPDATE), validateRequest(assignmentIdSchema), asyncHandler(async (request, response) => {
    const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
    await ensureEventAccess(request, event);
    const assignment = await EventStaffAssignment.findOneAndUpdate({ _id: request.params.assignmentId, eventId: request.params.id, deletedAt: null }, { status, updatedBy: request.user!.id }, { new: true });
    if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
    await writeAuditLog(request, `EVENT_STAFF_${status.toUpperCase()}`, 'EventStaffAssignment', request.params.assignmentId);
    return sendSuccess(response, { assignment });
  }));
}

router.get('/:id/payment-summary', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, { summary: await paymentSummary({ eventId: request.params.id }) });
}));

router.get('/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null })
    .populate('customerId')
    .populate('salonId', 'name address locality city')
    .populate('leadId', 'fullName phone email eventType')
    .populate('quoteId')
    .populate('sourceLeadId', 'fullName phone email eventType')
    .populate('sourceQuoteId')
    .lean();
  await ensureEventAccess(request, event);
  const contracts = await Contract.find({ eventId: request.params.id, deletedAt: null }).select('contractNumber status eventId customerId salonId versionNumber supersedesContractId supersededByContractId totalAmount pdfSecureUrl createdAt sentAt signedAt approvedAt').sort({ versionNumber: -1, createdAt: -1 }).lean();
  return sendSuccess(response, { event, contract: contracts[0], contracts });
}));

router.post('/:id/create-contract', requirePermission(Permission.CONTRACTS_CREATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const result = await createContractFromEvent({ eventId: request.params.id, userId: request.user!.id });
  await writeAuditLog(request, result.created ? 'EVENT_CREATE_CONTRACT' : 'EVENT_GET_EXISTING_CONTRACT', 'Contract', result.contract._id.toString(), { eventId: request.params.id });
  return sendSuccess(response, { contract: result.contract, created: result.created }, result.created ? 201 : 200, result.created ? getApiMessage('CONTRACT_CREATED') : getApiMessage('CONTRACT_ALREADY_EXISTS'));
}));

router.patch('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  const contractSensitiveFields = ['eventType', 'eventName', 'eventDate', 'startTime', 'endTime', 'guestCount', 'honoreeName', 'vegetarianCount', 'veganCount', 'celiacCount', 'lactoseIntolerantCount', 'tableLinenColor', 'estimatedAmount', 'finalAmount', 'commercialSnapshot', 'menuSnapshot', 'servicesSnapshot', 'paymentSnapshot', 'paymentPlanSnapshot'];
  const hasSensitiveChanges = contractSensitiveFields.some((field) => Object.prototype.hasOwnProperty.call(request.body, field) && JSON.stringify(event[field]) !== JSON.stringify(request.body[field]));
  Object.assign(event, request.body, { updatedBy: request.user!.id });
  await event.save();
  if (!hasSensitiveChanges) {
    await writeAuditLog(request, 'EVENT_UPDATE', 'Event', event._id.toString(), { contractAffected: false });
    return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
  }
  const contracts: any[] = await Contract.find({ eventId: event._id, deletedAt: null }).sort({ versionNumber: -1, createdAt: -1 });
  const draft = contracts.find((item) => ['draft', 'pending_approval', 'requires_changes'].includes(item.status));
  const sync = (contract: any) => {
    contract.eventSnapshot = { ...(contract.eventSnapshot ?? {}), eventType: event.eventType, eventName: event.eventName, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime, guestCount: event.guestCount, honoreeName: event.honoreeName, vegetarianCount: event.vegetarianCount, veganCount: event.veganCount, celiacCount: event.celiacCount, lactoseIntolerantCount: event.lactoseIntolerantCount, tableLinenColor: event.tableLinenColor };
    contract.commercialSnapshot = { ...(contract.commercialSnapshot ?? {}), ...(event.commercialSnapshot ?? {}), totalAmount: event.finalAmount ?? event.estimatedAmount ?? contract.commercialSnapshot?.totalAmount };
    contract.menuSnapshot = event.menuSnapshot ?? contract.menuSnapshot;
    contract.servicesSnapshot = event.servicesSnapshot ?? contract.servicesSnapshot;
    contract.paymentPlanSnapshot = event.paymentPlanSnapshot ?? event.paymentSnapshot?.paymentPlan ?? contract.paymentPlanSnapshot;
    contract.baseAmount = event.finalAmount ?? event.estimatedAmount ?? contract.baseAmount;
    contract.updatedBy = request.user!.id;
  };
  if (draft) { sync(draft); await draft.save(); }
  else {
    const approved = contracts.find((item) => item.status === 'approved');
    if (approved) {
      const nextVersion = Math.max(...contracts.map((item) => Number(item.versionNumber ?? 1))) + 1;
      const revision = new Contract({ ...approved.toObject(), _id: undefined, contractNumber: `${approved.contractNumber}-V${nextVersion}`, contractFamilyId: approved.contractFamilyId ?? approved._id, versionNumber: nextVersion, supersedesContractId: approved._id, supersededByContractId: undefined, status: 'draft', approvedAt: undefined, approvedByUserId: undefined, pdfUrl: undefined, pdfSecureUrl: undefined, pdfPublicId: undefined, pdfGeneratedAt: undefined, createdAt: undefined, updatedAt: undefined, createdBy: request.user!.id, updatedBy: request.user!.id });
      sync(revision); await revision.save(); approved.supersededByContractId = revision._id; await approved.save();
    }
  }
  await writeAuditLog(request, 'EVENT_UPDATE', 'Event', event._id.toString(), { contractAffected: true });
  return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
}));

router.patch('/:id/status', requirePermission(Permission.EVENTS_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  event.status = request.body.status;
  event.updatedBy = request.user!.id;
  await event.save();
  await writeAuditLog(request, 'EVENT_STATUS_UPDATE', 'Event', event._id.toString(), { status: event.status });
  return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
}));

export default router;
