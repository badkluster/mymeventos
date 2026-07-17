import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { Event } from '../crm/crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { DigitalTicket, TicketAccessAttempt, TicketOrder, TicketSale, TicketType } from './ticket.models';
import { claimTicketCheckIn, expirePendingOrders, markOrderPaid, releaseOrderReservation, reservePublicOrder, ticketPublicView } from './ticket.service';

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const publicToken = z.string().regex(/^[A-Za-z0-9_-]{24,}$/);
const saleBody = z.object({ slug, capacity: z.coerce.number().int().min(0), status: z.enum(['draft', 'scheduled', 'active', 'paused', 'sold_out', 'closed', 'cancelled']).optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), maxTicketsPerOrder: z.coerce.number().int().min(1).max(50).optional(), refundPolicy: z.string().max(3000).optional(), publicText: z.string().max(5000).optional(), imageUrl: z.string().url().optional().or(z.literal('')), location: z.string().max(300).optional(), relevantInfo: z.string().max(5000).optional(), allowFreeTickets: z.boolean().optional(), allowManualRegistration: z.boolean().optional(), paymentConfig: z.unknown().optional() });
const typeBody = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).optional(), price: z.coerce.number().min(0), capacity: z.coerce.number().int().min(0), maxPerOrder: z.coerce.number().int().min(1).max(50).optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), status: z.enum(['active', 'inactive']).optional(), displayOrder: z.coerce.number().int().min(0).optional() });
const createOrderBody = z.object({ buyer: z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email(), phone: z.string().trim().max(40).optional(), documentNumber: z.string().trim().max(50).optional() }), selections: z.array(z.object({ ticketTypeId: id, quantity: z.coerce.number().int().min(1).max(50) })).min(1).max(20), idempotencyKey: z.string().trim().min(12).max(200), expiresInMinutes: z.coerce.number().int().min(1).max(60).optional() }).superRefine((body, ctx) => { if (new Set(body.selections.map((x) => x.ticketTypeId)).size !== body.selections.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'No puede repetir tipos de entrada.' }); });
const checkInBody = z.object({ token: publicToken, accessPoint: z.string().trim().max(120).optional(), idempotencyKey: z.string().trim().min(8).max(200).optional() });
const admin = Router(); const publicRouter = Router();
// Shared enum is updated by the coordinator; use its stable serialized value until the parallel change is visible to this checkout.
const ticketsUpdatePermission = Permission.TICKETS_UPDATE;
const bodySchema = (body: z.ZodTypeAny, params: z.ZodRawShape) => z.object({ body, params: z.object(params), query: z.object({}).passthrough() });

async function eventForUser(request: Request, eventId: string) {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).lean();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
  if (event.salonId && !canAccessSalon(request.user!, String(event.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  return event;
}
async function saleForUser(request: Request, saleId: string) {
  const sale: any = await TicketSale.findOne({ _id: saleId, deletedAt: null }).lean();
  if (!sale) throw new ApiError(404, 'TICKET_SALE_NOT_FOUND', 'La configuración de venta no existe.');
  if (!canAccessSalon(request.user!, String(sale.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  return sale;
}

admin.use(requireAuth);
admin.get('/events/:eventId', requirePermission(Permission.TICKETS_READ), validateRequest(bodySchema(z.unknown().optional(), { eventId: id })), asyncHandler(async (req, res) => {
  await eventForUser(req, req.params.eventId); await expirePendingOrders();
  const sale: any = await TicketSale.findOne({ eventId: req.params.eventId, deletedAt: null }).lean();
  const types = sale ? await TicketType.find({ saleId: sale._id, deletedAt: null }).sort({ displayOrder: 1, createdAt: 1 }).lean() : [];
  return sendSuccess(res, { sale, types });
}));
admin.post('/events/:eventId', requirePermission(Permission.TICKETS_CREATE), validateRequest(bodySchema(saleBody, { eventId: id })), asyncHandler(async (req, res) => {
  const event = await eventForUser(req, req.params.eventId);
  const sale = await TicketSale.create({ ...req.body, eventId: event._id, salonId: event.salonId, customerId: event.customerId, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'ticket_sale_created', 'TicketSale', String(sale._id), { eventId: req.params.eventId });
  return sendSuccess(res, { sale }, 201);
}));
admin.patch('/sales/:saleId', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(saleBody.partial().refine((v) => Object.keys(v).length > 0), { saleId: id })), asyncHandler(async (req, res) => {
  const sale = await saleForUser(req, req.params.saleId);
  const used = sale.soldCount + sale.reservedCount;
  if (req.body.capacity !== undefined && req.body.capacity < used) throw new ApiError(409, 'TICKET_CAPACITY_TOO_LOW', 'El cupo no puede ser menor a las entradas reservadas o vendidas.');
  const updated = await TicketSale.findByIdAndUpdate(sale._id, { $set: { ...req.body, updatedBy: req.user!.id } }, { new: true });
  await writeAuditLog(req, 'ticket_sale_updated', 'TicketSale', String(sale._id), req.body);
  return sendSuccess(res, { sale: updated });
}));
admin.post('/sales/:saleId/types', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(typeBody, { saleId: id })), asyncHandler(async (req, res) => {
  const sale = await saleForUser(req, req.params.saleId);
  if (req.body.capacity > sale.capacity) throw new ApiError(400, 'TICKET_TYPE_CAPACITY_INVALID', 'El cupo del tipo no puede superar el cupo total.');
  const ticketType = await TicketType.create({ ...req.body, saleId: sale._id, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'ticket_type_created', 'TicketType', String(ticketType._id), { saleId: sale._id });
  return sendSuccess(res, { ticketType }, 201);
}));
admin.patch('/sales/:saleId/types/:typeId', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(typeBody.partial().refine((v) => Object.keys(v).length > 0), { saleId: id, typeId: id })), asyncHandler(async (req, res) => {
  await saleForUser(req, req.params.saleId); const existing: any = await TicketType.findOne({ _id: req.params.typeId, saleId: req.params.saleId, deletedAt: null });
  if (!existing) throw new ApiError(404, 'TICKET_TYPE_NOT_FOUND', 'El tipo de entrada no existe.');
  if (req.body.capacity !== undefined && req.body.capacity < existing.soldCount + existing.reservedCount) throw new ApiError(409, 'TICKET_CAPACITY_TOO_LOW', 'El cupo no puede ser menor a las entradas reservadas o vendidas.');
  Object.assign(existing, req.body, { updatedBy: req.user!.id }); await existing.save(); return sendSuccess(res, { ticketType: existing });
}));
admin.get('/sales/:saleId/orders', requirePermission(Permission.TICKETS_READ), validateRequest(bodySchema(z.unknown().optional(), { saleId: id })), asyncHandler(async (req, res) => { await saleForUser(req, req.params.saleId); await expirePendingOrders(req.params.saleId); const orders = await TicketOrder.find({ saleId: req.params.saleId, deletedAt: null }).sort({ createdAt: -1 }).lean(); return sendSuccess(res, { orders }); }));
admin.post('/orders/:orderId/mark-paid', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(z.object({ method: z.enum(['cash', 'bank_transfer', 'mercado_pago', 'card', 'other']), reference: z.string().trim().max(160).optional() }), { orderId: id })), asyncHandler(async (req, res) => { const order: any = await TicketOrder.findOne({ _id: req.params.orderId, deletedAt: null }); if (!order) throw new ApiError(404, 'TICKET_ORDER_NOT_FOUND', 'La orden no existe.'); await saleForUser(req, String(order.saleId)); const paid = await markOrderPaid(order, { ...req.body, userId: req.user!.id }); await writeAuditLog(req, 'ticket_order_manual_payment', 'TicketOrder', String(order._id), req.body); return sendSuccess(res, { order: paid }); }));
admin.post('/orders/:orderId/cancel', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(z.object({}).optional(), { orderId: id })), asyncHandler(async (req, res) => { const order: any = await TicketOrder.findOne({ _id: req.params.orderId, deletedAt: null }); if (!order) throw new ApiError(404, 'TICKET_ORDER_NOT_FOUND', 'La orden no existe.'); await saleForUser(req, String(order.saleId)); const released = await releaseOrderReservation(order, 'cancelled'); if (!released) throw new ApiError(409, 'TICKET_ORDER_NOT_CANCELLABLE', 'La orden no puede cancelarse.'); await writeAuditLog(req, 'ticket_order_cancelled', 'TicketOrder', String(order._id)); return sendSuccess(res, { cancelled: true }); }));
admin.post('/events/:eventId/check-in', requirePermission(Permission.TICKETS_VALIDATE), validateRequest(bodySchema(checkInBody, { eventId: id })), asyncHandler(async (req, res) => {
  await eventForUser(req, req.params.eventId); const payload = req.body;
  if (payload.idempotencyKey) { const prior: any = await TicketAccessAttempt.findOne({ action: 'check_in', idempotencyKey: payload.idempotencyKey }).lean(); if (prior) return sendSuccess(res, { result: prior.result, idempotent: true }); }
  const ticket: any = await claimTicketCheckIn(req.params.eventId, payload.token, req.user!.id, payload.accessPoint);
  const existing: any = !ticket ? await DigitalTicket.findOne({ eventId: req.params.eventId, publicToken: payload.token, deletedAt: null }).lean() : null;
  const result = ticket ? 'valid' : existing?.status === 'used' ? 'used' : 'invalid';
  await TicketAccessAttempt.create({ ticketId: ticket?._id ?? existing?._id, eventId: req.params.eventId, operatorUserId: req.user!.id, action: 'check_in', result, accessPoint: payload.accessPoint, idempotencyKey: payload.idempotencyKey });
  await writeAuditLog(req, 'ticket_check_in', 'DigitalTicket', String(ticket?._id ?? existing?._id ?? ''), { result, accessPoint: payload.accessPoint });
  return sendSuccess(res, { result, ticket: ticket ?? existing });
}));
admin.post('/events/:eventId/check-in/revert', requirePermission(ticketsUpdatePermission), validateRequest(bodySchema(checkInBody, { eventId: id })), asyncHandler(async (req, res) => { await eventForUser(req, req.params.eventId); const ticket: any = await DigitalTicket.findOneAndUpdate({ eventId: req.params.eventId, publicToken: req.body.token, status: 'used', deletedAt: null }, { $set: { status: 'valid', validatedAt: null, validatedByUserId: null, updatedBy: req.user!.id } }, { new: true }); if (!ticket) throw new ApiError(409, 'TICKET_NOT_USED', 'La entrada no está registrada como utilizada.'); await TicketAccessAttempt.create({ ticketId: ticket._id, eventId: ticket.eventId, operatorUserId: req.user!.id, action: 'revert', result: 'reverted', accessPoint: req.body.accessPoint, idempotencyKey: req.body.idempotencyKey }); await writeAuditLog(req, 'ticket_check_in_reverted', 'DigitalTicket', String(ticket._id)); return sendSuccess(res, { ticket }); }));

publicRouter.get('/tickets/:slug', validateRequest(bodySchema(z.unknown().optional(), { slug })), asyncHandler(async (req, res) => { await expirePendingOrders(); const sale: any = await TicketSale.findOne({ slug: req.params.slug, deletedAt: null }).populate('eventId', 'eventName eventType eventDate startTime endTime').lean(); if (!sale || sale.status !== 'active') throw new ApiError(404, 'TICKET_SALE_NOT_FOUND', 'La venta no está disponible.'); const event: any = sale.eventId; const types = await TicketType.find({ saleId: sale._id, status: 'active', deletedAt: null }).sort({ displayOrder: 1 }).lean(); return sendSuccess(res, { sale: { ...sale, title: event?.eventName || event?.eventType || 'Evento', eventDate: event?.eventDate, startTime: event?.startTime, endTime: event?.endTime, availableCount: Math.max(0, sale.capacity - sale.reservedCount - sale.soldCount) }, types: types.map((type: any) => ({ ...type, availableCount: Math.max(0, type.capacity - type.reservedCount - type.soldCount) })) }); }));
publicRouter.post('/tickets/:slug/orders', validateRequest(bodySchema(createOrderBody, { slug })), asyncHandler(async (req, res) => { const sale: any = await TicketSale.findOne({ slug: req.params.slug, deletedAt: null }); if (!sale) throw new ApiError(404, 'TICKET_SALE_NOT_FOUND', 'La venta no existe.'); const result = await reservePublicOrder({ sale, ...req.body }); return sendSuccess(res, { order: result.order, reused: result.reused }, result.reused ? 200 : 201); }));
publicRouter.get('/ticket/:token', validateRequest(bodySchema(z.unknown().optional(), { token: publicToken })), asyncHandler(async (req, res) => sendSuccess(res, await ticketPublicView(req.params.token))));

export { admin as ticketRoutes, publicRouter as publicTicketRoutes };
