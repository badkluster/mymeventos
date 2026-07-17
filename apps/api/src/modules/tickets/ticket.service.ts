import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { ApiError } from '../../middlewares/errorHandler';
import { DigitalTicket, TicketOrder, TicketSale, TicketType } from './ticket.models';

export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const orderPublicId = () => `TKT-${randomBytes(7).toString('hex').toUpperCase()}`;

export async function releaseOrderReservation(order: any, status: 'expired' | 'cancelled' = 'expired') {
  const changed: any = await TicketOrder.findOneAndUpdate({ _id: order._id, status: { $in: ['pending', 'payment_pending'] } }, { $set: { status, cancelledAt: new Date() } }, { new: true });
  if (!changed) return false;
  for (const line of changed.lines) await TicketType.updateOne({ _id: line.ticketTypeId }, { $inc: { reservedCount: -line.quantity } });
  await TicketSale.updateOne({ _id: changed.saleId }, { $inc: { reservedCount: -changed.lines.reduce((sum: number, line: any) => sum + line.quantity, 0) } });
  await DigitalTicket.updateMany({ orderId: changed._id, status: 'reserved' }, { $set: { status: status === 'expired' ? 'expired' : 'cancelled' } });
  return true;
}

export async function expirePendingOrders(saleId?: string) {
  const query: any = { status: { $in: ['pending', 'payment_pending'] }, expiresAt: { $lte: new Date() } };
  if (saleId) query.saleId = saleId;
  const orders = await TicketOrder.find(query);
  await Promise.all(orders.map((order) => releaseOrderReservation(order, 'expired')));
  return orders.length;
}

export async function reservePublicOrder(input: { sale: any; buyer: any; selections: Array<{ ticketTypeId: string; quantity: number }>; idempotencyKey: string; expiresInMinutes?: number }) {
  const existing = await TicketOrder.findOne({ saleId: input.sale._id, idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return { order: existing, reused: true };
  await expirePendingOrders(input.sale._id.toString());
  const now = new Date();
  if (input.sale.status !== 'active' || (input.sale.startsAt && input.sale.startsAt > now) || (input.sale.endsAt && input.sale.endsAt < now)) throw new ApiError(409, 'TICKET_SALE_NOT_ACTIVE', 'La venta no está disponible.');
  const totalQuantity = input.selections.reduce((sum, line) => sum + line.quantity, 0);
  if (!totalQuantity || totalQuantity > input.sale.maxTicketsPerOrder) throw new ApiError(400, 'TICKET_QUANTITY_INVALID', 'La cantidad de entradas no es válida.');
  const reservedTypes: Array<{ type: any; quantity: number }> = [];
  let saleReserved = false;
  try {
    for (const selected of input.selections) {
      const type: any = await TicketType.findOneAndUpdate({ _id: selected.ticketTypeId, saleId: input.sale._id, deletedAt: null, status: 'active', $expr: { $lte: [{ $add: ['$reservedCount', '$soldCount', selected.quantity] }, '$capacity'] } }, { $inc: { reservedCount: selected.quantity } }, { new: true });
      if (!type || (type.startsAt && type.startsAt > now) || (type.endsAt && type.endsAt < now) || selected.quantity > type.maxPerOrder) throw new ApiError(409, 'TICKET_TYPE_UNAVAILABLE', 'Uno de los tipos de entrada ya no está disponible.');
      reservedTypes.push({ type, quantity: selected.quantity });
    }
    const sale: any = await TicketSale.findOneAndUpdate({ _id: input.sale._id, $expr: { $lte: [{ $add: ['$reservedCount', '$soldCount', totalQuantity] }, '$capacity'] } }, { $inc: { reservedCount: totalQuantity } }, { new: true });
    if (!sale) throw new ApiError(409, 'TICKET_SOLD_OUT', 'No hay cupos suficientes.');
    saleReserved = true;
    const lines = reservedTypes.map(({ type, quantity }) => ({ ticketTypeId: type._id, name: type.name, unitPrice: type.price, quantity, subtotal: type.price * quantity }));
    const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
    if (totalAmount === 0 && !sale.allowFreeTickets) throw new ApiError(409, 'FREE_TICKETS_DISABLED', 'Las entradas gratuitas no están habilitadas.');
    const order: any = await TicketOrder.create({ saleId: sale._id, eventId: sale.eventId, salonId: sale.salonId, publicId: orderPublicId(), idempotencyKey: input.idempotencyKey, buyer: input.buyer, lines, totalAmount, status: totalAmount ? 'payment_pending' : 'paid', paymentStatus: totalAmount ? 'pending' : 'paid', paymentMethod: totalAmount ? undefined : 'free', expiresAt: totalAmount ? new Date(Date.now() + (input.expiresInMinutes ?? 20) * 60_000) : undefined });
    await DigitalTicket.insertMany(lines.flatMap((line) => Array.from({ length: line.quantity }, () => {
      const publicToken = token();
      return { saleId: sale._id, orderId: order._id, eventId: sale.eventId, ticketTypeId: line.ticketTypeId, publicToken, qrPayload: publicToken, attendeeName: input.buyer.name, status: totalAmount ? 'reserved' : 'valid', issuedAt: totalAmount ? undefined : new Date() };
    })));
    if (!totalAmount) {
      for (const line of lines) await TicketType.updateOne({ _id: line.ticketTypeId }, { $inc: { reservedCount: -line.quantity, soldCount: line.quantity } });
      await TicketSale.updateOne({ _id: sale._id }, { $inc: { reservedCount: -totalQuantity, soldCount: totalQuantity } });
    }
    return { order, reused: false };
  } catch (error) {
    await Promise.all(reservedTypes.map(({ type, quantity }) => TicketType.updateOne({ _id: type._id }, { $inc: { reservedCount: -quantity } })));
    if (saleReserved) await TicketSale.updateOne({ _id: input.sale._id }, { $inc: { reservedCount: -totalQuantity } });
    throw error;
  }
}

export async function markOrderPaid(order: any, details: { method: string; reference?: string; userId?: string }) {
  const paid: any = await TicketOrder.findOneAndUpdate({ _id: order._id, status: { $in: ['pending', 'payment_pending'] } }, { $set: { status: 'paid', paymentStatus: 'manual_paid', paymentMethod: details.method, paymentReference: details.reference, paidAt: new Date(), updatedBy: details.userId }, $unset: { expiresAt: 1 } }, { new: true });
  if (!paid) throw new ApiError(409, 'TICKET_ORDER_NOT_PAYABLE', 'La orden no puede confirmarse.');
  const quantity = paid.lines.reduce((sum: number, line: any) => sum + line.quantity, 0);
  for (const line of paid.lines) await TicketType.updateOne({ _id: line.ticketTypeId }, { $inc: { reservedCount: -line.quantity, soldCount: line.quantity } });
  await TicketSale.updateOne({ _id: paid.saleId }, { $inc: { reservedCount: -quantity, soldCount: quantity } });
  await DigitalTicket.updateMany({ orderId: paid._id, status: 'reserved' }, { $set: { status: 'valid', issuedAt: new Date() } });
  return paid;
}

export async function ticketPublicView(publicToken: string) {
  const ticket: any = await DigitalTicket.findOne({ publicToken, deletedAt: null }).populate('eventId', 'eventName eventType eventDate startTime salonId').populate('ticketTypeId', 'name').lean();
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'La entrada no existe.');
  return { ticket: { publicToken: ticket.publicToken, attendeeName: ticket.attendeeName, status: ticket.status, issuedAt: ticket.issuedAt, validatedAt: ticket.validatedAt, ticketTypeName: ticket.ticketTypeId?.name, eventName: ticket.eventId?.eventName || ticket.eventId?.eventType, eventDate: ticket.eventId?.eventDate, startTime: ticket.eventId?.startTime, event: ticket.eventId }, qrDataUrl: await QRCode.toDataURL(ticket.qrPayload, { margin: 1, width: 280 }) };
}

/** Atomically consumes a valid ticket. A second simultaneous scan receives null. */
export function claimTicketCheckIn(eventId: string, publicToken: string, operatorUserId: string, accessPoint?: string) {
  return DigitalTicket.findOneAndUpdate({ eventId, publicToken, status: 'valid', deletedAt: null }, { $set: { status: 'used', validatedAt: new Date(), validatedByUserId: operatorUserId, accessPoint, updatedBy: operatorUserId } }, { new: true });
}
