import { createHash, createHmac, randomBytes } from "crypto";
import QRCode from "qrcode";
import { ApiError } from "../../middlewares/errorHandler";
import {
  DigitalTicket,
  TicketOrder,
  TicketPayment,
  TicketDelivery,
  TicketPublication,
  TicketRefund,
  TicketStockReservation,
  TicketType,
} from "./ticket.models";
import { sendEmail } from "../email/email.service";
import { env } from "../../config/env";
import {
  getTicketPaymentProvider,
  type TicketProviderPaymentStatus,
} from "./ticket-payment.provider";

export const token = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const orderPublicId = () =>
  `TKT-${randomBytes(7).toString("hex").toUpperCase()}`;
const totalQuantity = (lines: Array<{ quantity: number }>) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);
const publicAppUrl = () => process.env.CORS_ORIGIN || "http://localhost:3000";
export const ticketTokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const signedToken = (value: string) =>
  createHmac("sha256", env.ACCESS_TOKEN_SECRET)
    .update(value)
    .digest("base64url");
const ticketCode = () =>
  `TKT-${new Date().getFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`;
export const ticketAccessToken = (ticket: {
  ticketCode: string;
  qrVersion?: number;
}) => signedToken(`ticket:${ticket.ticketCode}:${ticket.qrVersion ?? 1}`);
export const orderAccessToken = (order: {
  _id: unknown;
  createdAt?: Date;
  buyer?: { email?: string };
}) =>
  signedToken(
    `order:${String(order._id)}:${order.createdAt?.toISOString() ?? ""}:${order.buyer?.email ?? ""}`,
  );

export function isTicketPromotionActive(ticketType: any, at = new Date()) {
  if (
    ticketType.promotionalPrice === undefined ||
    ticketType.promotionalPrice === null
  )
    return false;
  const startsAt = ticketType.promotionalStartsAt
    ? new Date(ticketType.promotionalStartsAt)
    : undefined;
  const endsAt = ticketType.promotionalEndsAt
    ? new Date(ticketType.promotionalEndsAt)
    : undefined;
  return (!startsAt || startsAt <= at) && (!endsAt || endsAt >= at);
}

export function ticketEffectivePrice(ticketType: any, at = new Date()) {
  return isTicketPromotionActive(ticketType, at)
    ? ticketType.promotionalPrice
    : ticketType.price;
}

export async function issueTicketsForPaidOrder(orderId: string) {
  const order: any = await TicketOrder.findById(orderId).lean();
  if (!order || order.status !== "paid" || order.paymentStatus !== "paid")
    throw new ApiError(
      409,
      "TICKET_ORDER_NOT_PAID",
      "La orden todavía no tiene un pago confirmado.",
    );
  if (order.totalAmount > 0) {
    const payment: any = await TicketPayment.findOne({
      orderId: order._id,
      status: "approved",
    }).lean();
    if (!payment)
      throw new ApiError(
        409,
        "TICKET_PAYMENT_NOT_APPROVED",
        "El proveedor aún no confirmó el pago.",
      );
  }
  const expected = order.lines.flatMap((line: any) =>
    Array.from({ length: line.quantity }, (_, unitIndex) => ({
      line,
      unitIndex,
    })),
  );
  const existing = await DigitalTicket.find({
    orderId: order._id,
    deletedAt: null,
  })
    .select("orderLineId unitIndex")
    .lean();
  const present = new Set(
    existing.map((ticket: any) => `${ticket.orderLineId}:${ticket.unitIndex}`),
  );
  for (const { line, unitIndex } of expected) {
    if (present.has(`${line.lineId}:${unitIndex}`)) continue;
    const code = ticketCode();
    const accessToken = ticketAccessToken({ ticketCode: code, qrVersion: 1 });
    try {
      await DigitalTicket.create({
        publicationId: order.publicationId,
        orderId: order._id,
        ticketTypeId: line.ticketTypeId,
        orderLineId: line.lineId,
        unitIndex,
        ticketCode: code,
        qrTokenHash: ticketTokenHash(accessToken),
        qrVersion: 1,
        ticketTypeSnapshot: { name: line.name, unitPrice: line.unitPrice },
        holder: {
          email: order.buyer.email,
          phone: order.buyer.phone,
          dni: order.buyer.documentNumber,
          firstName: order.buyer.firstName,
          lastName: order.buyer.lastName,
        },
        attendeeName: order.buyer.name,
        attendeeEmail: order.buyer.email,
        attendeeDocument: order.buyer.documentNumber,
        status: "issued",
        issuedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  const tickets = await DigitalTicket.find({
    orderId: order._id,
    deletedAt: null,
  })
    .sort({ orderLineId: 1, unitIndex: 1 })
    .lean();
  if (tickets.length !== expected.length)
    throw new ApiError(
      500,
      "TICKET_ISSUANCE_INCOMPLETE",
      "La emisión de entradas quedó incompleta.",
    );
  await TicketOrder.updateOne(
    { _id: order._id },
    { $set: { ticketsIssuedAt: new Date() } },
  );
  return { order, tickets };
}

const maskEmail = (email: string) =>
  email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
export async function sendOrderTicketsEmail(
  orderId: string,
  channel: "email" | "admin_resend" = "email",
  requestedBy?: string,
) {
  const delivery = await TicketDelivery.create({
    orderId,
    channel,
    destinationMasked: "",
    status: "processing",
    attemptNumber: (await TicketDelivery.countDocuments({ orderId })) + 1,
    requestedBy,
  });
  try {
    const { order, tickets } = await issueTicketsForPaidOrder(orderId);
    const publication: any = await TicketPublication.findById(
      order.publicationId,
    ).lean();
    const portalUrl = `${publicAppUrl()}/entradas/compra/${order.publicId}?token=${orderAccessToken(order)}`;
    const text = `Hola ${order.buyer.name}. Tu compra para ${publication?.title ?? "M&M Eventos"} fue confirmada. Orden: ${order.publicId}. Ver tus entradas: ${portalUrl}`;
    const html = `<main style="font-family:Arial,sans-serif;color:#18181b"><h1>Tu compra fue confirmada</h1><p>Hola ${order.buyer.name}, ya emitimos ${tickets.length} entrada${tickets.length === 1 ? "" : "s"} para <b>${publication?.title ?? "M&M Eventos"}</b>.</p><p>Orden: <b>${order.publicId}</b></p><p><a href="${portalUrl}">Ver mis entradas y códigos QR</a></p><ul>${tickets.map((ticket: any) => `<li>${ticket.ticketTypeSnapshot?.name ?? "Entrada"} · ${ticket.ticketCode}</li>`).join("")}</ul></main>`;
    const sent = await sendEmail({
      to: order.buyer.email,
      subject: `Tus entradas para ${publication?.title ?? "M&M Eventos"}`,
      text,
      html,
    });
    await TicketDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: sent ? "sent" : "failed",
          destinationMasked: maskEmail(order.buyer.email),
          provider: sent ? "smtp" : undefined,
          sentAt: sent ? new Date() : undefined,
          errorCode: sent ? undefined : "EMAIL_NOT_CONFIGURED",
          errorMessage: sent
            ? undefined
            : "El servicio de correo no está configurado.",
        },
      },
    );
    if (sent)
      await TicketOrder.updateOne(
        { _id: order._id },
        { $set: { lastTicketsEmailAt: new Date() } },
      );
    return { sent, tickets };
  } catch (error: any) {
    await TicketDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: "failed",
          errorCode: error?.code ?? "EMAIL_DELIVERY_FAILED",
          errorMessage: error?.message ?? "No se pudo entregar las entradas.",
        },
      },
    );
    throw error;
  }
}

export async function releaseOrderReservation(
  order: any,
  status: "expired" | "cancelled" = "expired",
) {
  const changed: any = await TicketOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ["pending", "payment_pending"] } },
    { $set: { status, cancelledAt: new Date() } },
    { new: true },
  );
  if (!changed) return false;
  for (const line of changed.lines)
    await TicketType.updateOne(
      { _id: line.ticketTypeId },
      { $inc: { reservedCount: -line.quantity } },
    );
  await TicketPublication.updateOne(
    { _id: changed.publicationId },
    { $inc: { reservedCount: -totalQuantity(changed.lines) } },
  );
  await TicketStockReservation.updateOne(
    { orderId: changed._id, status: "active" },
    { $set: { status: status === "expired" ? "expired" : "released" } },
  );
  await DigitalTicket.updateMany(
    { orderId: changed._id, status: "reserved" },
    { $set: { status: status === "expired" ? "expired" : "cancelled" } },
  );
  return true;
}

export async function expirePendingOrders(publicationId?: string) {
  const query: any = {
    status: { $in: ["pending", "payment_pending"] },
    expiresAt: { $lte: new Date() },
  };
  if (publicationId) query.publicationId = publicationId;
  const orders = await TicketOrder.find(query);
  await Promise.all(
    orders.map((order) => releaseOrderReservation(order, "expired")),
  );
  return orders.length;
}

export async function reservePublicOrder(input: {
  publication: any;
  buyer: any;
  selections: Array<{ ticketTypeId: string; quantity: number }>;
  idempotencyKey: string;
  expiresInMinutes?: number;
}) {
  const existing = await TicketOrder.findOne({
    publicationId: input.publication._id,
    idempotencyKey: input.idempotencyKey,
  }).lean();
  if (existing) return { order: existing, reused: true };
  await expirePendingOrders(String(input.publication._id));
  const now = new Date();
  const publication = input.publication;
  if (
    publication.status !== "active" ||
    (publication.salesOpenAt && publication.salesOpenAt > now) ||
    (publication.salesCloseAt && publication.salesCloseAt < now)
  )
    throw new ApiError(
      409,
      "TICKET_PUBLICATION_NOT_ACTIVE",
      "La publicación no está disponible.",
    );
  const quantity = totalQuantity(input.selections);
  if (!quantity || quantity > publication.maxTicketsPerOrder)
    throw new ApiError(
      400,
      "TICKET_QUANTITY_INVALID",
      "La cantidad de entradas no es válida.",
    );
  const reserved: Array<{ type: any; quantity: number }> = [];
  let publicationReserved = false;
  try {
    for (const selected of input.selections) {
      const type: any = await TicketType.findOneAndUpdate(
        {
          _id: selected.ticketTypeId,
          publicationId: publication._id,
          deletedAt: null,
          status: "active",
          $expr: {
            $lte: [
              { $add: ["$reservedCount", "$soldCount", selected.quantity] },
              "$capacity",
            ],
          },
        },
        { $inc: { reservedCount: selected.quantity } },
        { new: true },
      );
      if (
        !type ||
        (type.salesOpenAt && type.salesOpenAt > now) ||
        (type.salesCloseAt && type.salesCloseAt < now) ||
        selected.quantity > type.maxPerOrder ||
        selected.quantity < (type.minPerOrder ?? 1)
      )
        throw new ApiError(
          409,
          "TICKET_TYPE_UNAVAILABLE",
          "Uno de los tipos de entrada no está disponible.",
        );
      reserved.push({ type, quantity: selected.quantity });
    }
    const updated: any = await TicketPublication.findOneAndUpdate(
      {
        _id: publication._id,
        $expr: {
          $lte: [
            { $add: ["$reservedCount", "$soldCount", quantity] },
            "$capacity",
          ],
        },
      },
      { $inc: { reservedCount: quantity } },
      { new: true },
    );
    if (!updated)
      throw new ApiError(409, "TICKET_SOLD_OUT", "No hay cupos suficientes.");
    publicationReserved = true;
    const lines = reserved.map(({ type, quantity: count }) => {
      const unitPrice = ticketEffectivePrice(type, now);
      return {
        lineId: token(10),
        ticketTypeId: type._id,
        name: type.name,
        unitPrice,
        quantity: count,
        subtotal: unitPrice * count,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    if (!subtotal && !publication.allowFreeTickets)
      throw new ApiError(
        409,
        "FREE_TICKETS_DISABLED",
        "Las entradas gratuitas no están habilitadas.",
      );
    const expiresAt = subtotal
      ? new Date(
          Date.now() +
            (input.expiresInMinutes ??
              publication.paymentConfig?.reservationMinutes ??
              20) *
              60_000,
        )
      : undefined;
    const order: any = await TicketOrder.create({
      publicationId: updated._id,
      publicId: orderPublicId(),
      idempotencyKey: input.idempotencyKey,
      buyer: input.buyer,
      lines,
      subtotal,
      totalAmount: subtotal,
      status: subtotal ? "payment_pending" : "paid",
      paymentStatus: subtotal ? "pending" : "paid",
      paymentMethod: subtotal ? undefined : "free",
      expiresAt,
    });
    if (subtotal && expiresAt)
      await TicketStockReservation.create({
        publicationId: updated._id,
        orderId: order._id,
        items: lines.map((line) => ({
          ticketTypeId: line.ticketTypeId,
          quantity: line.quantity,
        })),
        expiresAt,
      });
    if (!subtotal) {
      for (const line of lines)
        await TicketType.updateOne(
          { _id: line.ticketTypeId },
          { $inc: { reservedCount: -line.quantity, soldCount: line.quantity } },
        );
      await TicketPublication.updateOne(
        { _id: updated._id },
        { $inc: { reservedCount: -quantity, soldCount: quantity } },
      );
      await issueTicketsForPaidOrder(String(order._id));
      void sendOrderTicketsEmail(String(order._id)).catch(() => undefined);
    }
    return { order, reused: false };
  } catch (error) {
    await Promise.all(
      reserved.map(({ type, quantity }) =>
        TicketType.updateOne(
          { _id: type._id },
          { $inc: { reservedCount: -quantity } },
        ),
      ),
    );
    if (publicationReserved)
      await TicketPublication.updateOne(
        { _id: publication._id },
        { $inc: { reservedCount: -quantity } },
      );
    throw error;
  }
}

export async function markOrderPaid(
  order: any,
  details: { method: string; reference?: string; userId?: string },
) {
  const paid: any = await TicketOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ["pending", "payment_pending"] } },
    {
      $set: {
        status: "paid",
        paymentStatus: "paid",
        paymentMethod: details.method,
        paymentReference: details.reference,
        paidAt: new Date(),
        updatedBy: details.userId,
      },
      $unset: { expiresAt: 1 },
    },
    { new: true },
  );
  if (!paid)
    throw new ApiError(
      409,
      "TICKET_ORDER_NOT_PAYABLE",
      "La orden no puede confirmarse.",
    );
  const quantity = totalQuantity(paid.lines);
  for (const line of paid.lines)
    await TicketType.updateOne(
      { _id: line.ticketTypeId },
      { $inc: { reservedCount: -line.quantity, soldCount: line.quantity } },
    );
  await TicketPublication.updateOne(
    { _id: paid.publicationId },
    { $inc: { reservedCount: -quantity, soldCount: quantity } },
  );
  await TicketStockReservation.updateOne(
    { orderId: paid._id, status: "active" },
    { $set: { status: "converted" } },
  );
  await TicketPayment.findOneAndUpdate(
    { orderId: paid._id },
    {
      $setOnInsert: {
        orderId: paid._id,
        provider: details.method === "mercado_pago" ? "mercado_pago" : "mock",
        amount: paid.totalAmount,
        currency: paid.currency ?? "ARS",
      },
      $set: { status: "approved", approvedAt: new Date() },
    },
    { upsert: true },
  );
  await DigitalTicket.updateMany(
    { orderId: paid._id, status: "reserved" },
    { $set: { status: "cancelled" } },
  );
  await issueTicketsForPaidOrder(String(paid._id));
  void sendOrderTicketsEmail(String(paid._id)).catch(() => undefined);
  return paid;
}

export async function createTicketCheckout(order: any, publication: any) {
  if (!order.totalAmount)
    return {
      checkoutUrl: `${publicAppUrl()}/entradas/mock-payment/${order.publicId}`,
      provider: "free",
      providerPaymentId: undefined,
    };
  const existing: any = await TicketPayment.findOne({
    orderId: order._id,
  }).lean();
  if (existing?.checkoutUrl)
    return {
      checkoutUrl: existing.checkoutUrl,
      provider: existing.provider,
      providerPaymentId: existing.providerPaymentId,
    };
  const provider = getTicketPaymentProvider();
  const checkout = await provider.createCheckout({
    orderId: String(order._id),
    orderCode: order.publicId,
    title: publication.title,
    amount: order.totalAmount,
    currency: order.currency ?? "ARS",
    buyer: order.buyer,
    notificationUrl: `${publicAppUrl()}/api/public/tickets/webhooks/${provider.name}`,
  });
  await TicketPayment.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        orderId: order._id,
        provider: provider.name,
        amount: order.totalAmount,
        currency: order.currency ?? "ARS",
      },
      $set: {
        providerPaymentId: checkout.providerPaymentId,
        providerPreferenceId: checkout.providerPreferenceId,
        status: checkout.status,
        checkoutUrl: checkout.checkoutUrl,
      },
    },
    { upsert: true, new: true },
  );
  await TicketOrder.updateOne(
    { _id: order._id },
    { $set: { providerPaymentId: checkout.providerPaymentId } },
  );
  return {
    checkoutUrl: checkout.checkoutUrl,
    provider: provider.name,
    providerPaymentId: checkout.providerPaymentId,
  };
}

export async function reconcileTicketPayment(
  order: any,
  input: {
    status: TicketProviderPaymentStatus;
    providerPaymentId?: string;
    paymentMethod?: string;
    raw?: unknown;
    userId?: string;
  },
) {
  const payment: any = await TicketPayment.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        orderId: order._id,
        provider: getTicketPaymentProvider().name,
        amount: order.totalAmount,
        currency: order.currency ?? "ARS",
      },
      $set: {
        status: input.status,
        providerPaymentId: input.providerPaymentId ?? order.providerPaymentId,
        rawSnapshot: input.raw,
        lastSynchronizedAt: new Date(),
        approvedAt: input.status === "approved" ? new Date() : undefined,
      },
    },
    { upsert: true, new: true },
  );
  if (input.providerPaymentId)
    await TicketOrder.updateOne(
      { _id: order._id },
      { $set: { providerPaymentId: input.providerPaymentId } },
    );
  if (input.status === "approved") {
    const current: any = await TicketOrder.findById(order._id);
    if (current?.status !== "paid")
      await markOrderPaid(current, {
        method: input.paymentMethod ?? payment.provider,
        reference: input.providerPaymentId,
        userId: input.userId,
      });
    else await issueTicketsForPaidOrder(String(current._id));
    return TicketOrder.findById(order._id);
  }
  if (["rejected", "cancelled", "expired"].includes(input.status))
    await releaseOrderReservation(
      order,
      input.status === "expired" ? "expired" : "cancelled",
    );
  return TicketOrder.findById(order._id);
}

export async function refundTicketOrder(
  order: any,
  amount: number | undefined,
  reason: string,
  userId: string,
) {
  if (order.status !== "paid")
    throw new ApiError(
      409,
      "TICKET_ORDER_NOT_REFUNDABLE",
      "Solo se pueden devolver órdenes pagadas.",
    );
  const payment: any = await TicketPayment.findOne({ orderId: order._id });
  if (!payment?.providerPaymentId)
    throw new ApiError(
      409,
      "TICKET_PAYMENT_NOT_FOUND",
      "No existe un pago para devolver.",
    );
  const providerRefund = await getTicketPaymentProvider().refundPayment({
    providerPaymentId: payment.providerPaymentId,
    amount,
    idempotencyKey: token(18),
  });
  const refundAmount = providerRefund.amount ?? order.totalAmount;
  const refund = await TicketRefund.create({
    orderId: order._id,
    paymentId: payment._id,
    provider: payment.provider,
    providerRefundId: providerRefund.providerRefundId,
    type: refundAmount < order.totalAmount ? "partial" : "full",
    status: providerRefund.status === "approved" ? "approved" : "processing",
    amount: refundAmount,
    reason,
    requestedBy: userId,
    idempotencyKey: token(18),
  });
  if (providerRefund.status === "approved") {
    const full = refundAmount >= order.totalAmount;
    await TicketOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          status: full ? "refunded" : "partially_refunded",
          paymentStatus: "refunded",
        },
      },
    );
    if (full)
      await DigitalTicket.updateMany(
        {
          orderId: order._id,
          status: { $in: ["issued", "checked_in", "valid", "used"] },
        },
        { $set: { status: "refunded" } },
      );
    await TicketPayment.updateOne(
      { _id: payment._id },
      { $set: { status: full ? "refunded" : "partially_refunded" } },
    );
  }
  return refund;
}

export async function ticketPublicView(publicToken: string) {
  const ticket: any = await DigitalTicket.findOne({
    $or: [{ qrTokenHash: ticketTokenHash(publicToken) }, { publicToken }],
    deletedAt: null,
  })
    .populate("publicationId", "title startsAt venueName address")
    .populate("ticketTypeId", "name")
    .lean();
  if (!ticket)
    throw new ApiError(404, "TICKET_NOT_FOUND", "La entrada no existe.");
  return {
    ticket: {
      publicToken,
      ticketCode: ticket.ticketCode,
      attendeeName: ticket.attendeeName,
      status: ticket.status,
      issuedAt: ticket.issuedAt,
      validatedAt: ticket.validatedAt,
      ticketTypeName: ticket.ticketTypeId?.name,
      publicationName: ticket.publicationId?.title,
      startsAt: ticket.publicationId?.startsAt,
      venueName: ticket.publicationId?.venueName,
      address: ticket.publicationId?.address,
    },
    qrDataUrl: await QRCode.toDataURL(
      `${publicAppUrl()}/entrada/${publicToken}`,
      {
        margin: 1,
        width: 280,
      },
    ),
  };
}

export function claimTicketCheckIn(
  publicationId: string,
  publicToken: string,
  operatorUserId: string,
  accessPoint?: string,
) {
  return DigitalTicket.findOneAndUpdate(
    {
      publicationId,
      $or: [
        { qrTokenHash: ticketTokenHash(publicToken) },
        { publicToken },
        { ticketCode: publicToken },
      ],
      status: { $in: ["issued", "valid"] },
      deletedAt: null,
    },
    {
      $set: {
        status: "checked_in",
        checkedInAt: new Date(),
        checkedInBy: operatorUserId,
        validatedAt: new Date(),
        validatedByUserId: operatorUserId,
        accessPoint,
        updatedBy: operatorUserId,
      },
      $inc: { accessCount: 1 },
    },
    { new: true },
  );
}

export function claimTicketCheckInById(
  publicationId: string,
  ticketId: string,
  operatorUserId: string,
  accessPoint?: string,
) {
  return DigitalTicket.findOneAndUpdate(
    {
      _id: ticketId,
      publicationId,
      status: { $in: ["issued", "valid"] },
      deletedAt: null,
    },
    {
      $set: {
        status: "checked_in",
        checkedInAt: new Date(),
        checkedInBy: operatorUserId,
        validatedAt: new Date(),
        validatedByUserId: operatorUserId,
        accessPoint,
        updatedBy: operatorUserId,
      },
      $inc: { accessCount: 1 },
    },
    { new: true },
  );
}

export async function regenerateTicketQr(ticketId: string, userId: string) {
  const current: any = await DigitalTicket.findOne({
    _id: ticketId,
    deletedAt: null,
  });
  if (!current)
    throw new ApiError(404, "TICKET_NOT_FOUND", "La entrada no existe.");
  if (!["issued", "valid"].includes(current.status))
    throw new ApiError(
      409,
      "TICKET_QR_NOT_REGENERABLE",
      "Solo se puede regenerar el QR de una entrada válida.",
    );
  const nextVersion = (current.qrVersion ?? 1) + 1;
  const accessToken = ticketAccessToken({
    ticketCode: current.ticketCode,
    qrVersion: nextVersion,
  });
  const ticket: any = await DigitalTicket.findOneAndUpdate(
    {
      _id: current._id,
      qrVersion: current.qrVersion ?? 1,
      status: current.status,
    },
    {
      $set: {
        qrVersion: nextVersion,
        qrTokenHash: ticketTokenHash(accessToken),
        updatedBy: userId,
      },
    },
    { new: true },
  );
  if (!ticket)
    throw new ApiError(
      409,
      "TICKET_QR_REGENERATION_CONFLICT",
      "La entrada cambió mientras se regeneraba el QR.",
    );
  return { ticket, accessToken };
}
