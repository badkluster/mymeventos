import { createHash, createHmac, randomBytes } from "crypto";
import QRCode from "qrcode";
import { generateOrderTicketPdfs } from './ticket-pdf.service';
import { getSignedDownloadUrl } from '../uploads/cloudinary.service';
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
import {
  recordTicketOrderPayment,
  syncTicketOrderRefund,
} from "../crm/payments.service";

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
  channel: "email" | "admin_resend" | "automatic_retry" = "email",
  requestedBy?: string,
  retryDeliveryId?: string,
) {
  const retryAt = (attemptNumber: number) =>
    new Date(Date.now() + Math.min(24, 2 ** Math.max(0, attemptNumber - 1)) * 60 * 60_000);
  const delivery: any = retryDeliveryId
    ? await TicketDelivery.findOneAndUpdate(
        { _id: retryDeliveryId, orderId, status: "failed", attemptNumber: { $lt: 3 } },
        {
          $set: { status: "processing", lastAttemptAt: new Date(), nextRetryAt: undefined },
          $inc: { attemptNumber: 1 },
        },
        { new: true },
      )
    : await TicketDelivery.create({
        orderId,
        channel,
        destinationMasked: "",
        status: "processing",
        attemptNumber: 1,
        lastAttemptAt: new Date(),
        requestedBy,
      });
  if (!delivery) return { sent: false, tickets: [], skipped: true };
  try {
    const { order, tickets } = await issueTicketsForPaidOrder(orderId);
    await generateOrderTicketPdfs(orderId);
    const documentedOrder: any = await TicketOrder.findById(orderId).lean();
    const publication: any = await TicketPublication.findById(
      order.publicationId,
    ).lean();
    const portalUrl = `${publicAppUrl()}/entradas/compra/${order.publicId}?token=${orderAccessToken(order)}`;
    const text = `Hola ${order.buyer.name}. Tu compra para ${publication?.title ?? "M&M Eventos"} fue confirmada. Orden: ${order.publicId}. Ver tus entradas: ${portalUrl}`;
    const html = `<main style="font-family:Arial,sans-serif;color:#18181b"><h1>Tu compra fue confirmada</h1><p>Hola ${order.buyer.name}, ya emitimos ${tickets.length} entrada${tickets.length === 1 ? "" : "s"} para <b>${publication?.title ?? "M&M Eventos"}</b>.</p><p>Orden: <b>${order.publicId}</b></p><p><a href="${portalUrl}">Ver mis entradas y códigos QR</a></p><ul>${tickets.map((ticket: any) => `<li>${ticket.ticketTypeSnapshot?.name ?? "Entrada"} · ${ticket.ticketCode}</li>`).join("")}</ul></main>`;
    const attachment = documentedOrder?.ticketsPdf?.storageKey && documentedOrder.ticketsPdf.sizeBytes <= 7_000_000
      ? await fetch(getSignedDownloadUrl(documentedOrder.ticketsPdf.storageKey)).then(async (response) => response.ok ? Buffer.from(await response.arrayBuffer()) : undefined)
      : undefined;
    const sent = await sendEmail({
      to: order.buyer.email,
      subject: `Tus entradas para ${publication?.title ?? "M&M Eventos"}`,
      text,
      html,
      attachments: attachment ? [{ filename: documentedOrder.ticketsPdf.filename, content: attachment, contentType: 'application/pdf' }] : undefined,
    });
    await TicketDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: sent ? "sent" : "failed",
          destinationMasked: maskEmail(order.buyer.email),
          provider: sent ? "smtp" : undefined,
          sentAt: sent ? new Date() : undefined,
          nextRetryAt: sent ? undefined : retryAt(delivery.attemptNumber),
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
          nextRetryAt: retryAt(delivery.attemptNumber),
          errorCode: error?.code ?? "EMAIL_DELIVERY_FAILED",
          errorMessage: error?.message ?? "No se pudo entregar las entradas.",
        },
      },
    );
    throw error;
  }
}

type TicketLifecycleEmailChannel =
  | "payment_pending"
  | "payment_rejected"
  | "checkout_abandoned"
  | "refund_confirmation"
  | "event_reminder_48h"
  | "event_reminder_24h";

const lifecycleEmailChannels = new Set<TicketLifecycleEmailChannel>([
  "payment_pending",
  "payment_rejected",
  "checkout_abandoned",
  "refund_confirmation",
  "event_reminder_48h",
  "event_reminder_24h",
]);
const ticketEmailRetryLimit = 3;
const ticketEmailProcessingLockMs = 15 * 60_000;

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

function formatTicketAmount(amount: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function lifecycleEmailContent(
  channel: TicketLifecycleEmailChannel,
  order: any,
  publication: any,
  portalUrl: string,
) {
  const buyer = escapeHtml(order.buyer?.name || "hola");
  const event = escapeHtml(publication?.title || "M&M Eventos");
  const eventDate = publication?.startsAt
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeStyle: "short" }).format(new Date(publication.startsAt))
    : "fecha a confirmar";
  const location = escapeHtml(publication?.venueName || publication?.address || "ubicación a confirmar");
  const amount = formatTicketAmount(Number(order.totalAmount ?? 0), order.currency ?? "ARS");
  const details = `<p><b>Orden:</b> ${escapeHtml(order.publicId)}<br/><b>Evento:</b> ${event}<br/><b>Fecha:</b> ${eventDate}<br/><b>Lugar:</b> ${location}</p>`;
  const link = `<p><a href="${portalUrl}">Ver el estado de mi compra</a></p>`;

  const messages: Record<TicketLifecycleEmailChannel, { subject: string; heading: string; body: string }> = {
    payment_pending: {
      subject: `Completá el pago de tu compra · ${publication?.title ?? "M&M Eventos"}`,
      heading: "Tu reserva está esperando el pago",
      body: `Reservamos tus entradas por ${amount}. Podés volver al checkout desde tu portal de compra antes de que venza la reserva.`,
    },
    payment_rejected: {
      subject: `No pudimos confirmar tu pago · ${publication?.title ?? "M&M Eventos"}`,
      heading: "Tu pago no pudo ser confirmado",
      body: "No se realizó ningún cargo confirmado para esta orden. Si querés intentarlo nuevamente, ingresá al portal y revisá el estado de tu compra.",
    },
    checkout_abandoned: {
      subject: `Tu reserva venció · ${publication?.title ?? "M&M Eventos"}`,
      heading: "La reserva de tus entradas venció",
      body: "Como no recibimos la confirmación del pago a tiempo, liberamos los cupos. Podés volver a la publicación si querés iniciar una nueva compra, sujeta a disponibilidad.",
    },
    refund_confirmation: {
      subject: `Reembolso confirmado · ${publication?.title ?? "M&M Eventos"}`,
      heading: "Tu reembolso fue confirmado",
      body: `El reembolso por ${amount} fue registrado. Los tiempos de acreditación dependen del medio de pago y de tu entidad financiera.`,
    },
    event_reminder_48h: {
      subject: `Faltan 48 horas · ${publication?.title ?? "M&M Eventos"}`,
      heading: "Faltan 48 horas para el evento",
      body: "Te recordamos los datos del evento. Desde el portal podés consultar tus entradas y sus códigos QR.",
    },
    event_reminder_24h: {
      subject: `Mañana es el evento · ${publication?.title ?? "M&M Eventos"}`,
      heading: "Mañana nos encontramos",
      body: "Tené a mano tus entradas y los códigos QR antes de llegar. Te recomendamos revisar la ubicación y el horario.",
    },
  };
  const message = messages[channel];
  return {
    subject: message.subject,
    text: `${message.heading}\n\nHola ${order.buyer?.name || ""}. ${message.body}\n\nOrden: ${order.publicId}\nEvento: ${publication?.title ?? "M&M Eventos"}\nFecha: ${eventDate}\nLugar: ${publication?.venueName || publication?.address || "A confirmar"}\n\n${portalUrl}`,
    html: `<main style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5"><h1>${message.heading}</h1><p>Hola ${buyer}.</p><p>${message.body}</p>${details}${link}</main>`,
  };
}

function retryAtForTicketEmail(attemptNumber: number) {
  return new Date(Date.now() + Math.min(24, 2 ** Math.max(0, attemptNumber - 1)) * 60 * 60_000);
}

async function claimLifecycleDelivery(orderId: string, channel: TicketLifecycleEmailChannel) {
  const automationKey = `ticket:${orderId}:${channel}`;
  const now = new Date();
  const existing: any = await TicketDelivery.findOne({ automationKey }).lean();
  if (existing?.status === "sent" || existing?.attemptNumber >= ticketEmailRetryLimit)
    return undefined;
  if (
    existing?.status === "processing" &&
    existing.lastAttemptAt &&
    new Date(existing.lastAttemptAt).getTime() > Date.now() - ticketEmailProcessingLockMs
  )
    return undefined;
  if (existing?.nextRetryAt && new Date(existing.nextRetryAt) > now)
    return undefined;
  if (existing) {
    return TicketDelivery.findOneAndUpdate(
      {
        _id: existing._id,
        status: { $in: ["pending", "failed", "processing"] },
        attemptNumber: { $lt: ticketEmailRetryLimit },
      },
      {
        $set: { status: "processing", lastAttemptAt: now, nextRetryAt: undefined, errorCode: undefined, errorMessage: undefined },
        $inc: { attemptNumber: 1 },
      },
      { new: true },
    );
  }
  try {
    return await TicketDelivery.create({
      orderId,
      channel,
      automationKey,
      status: "processing",
      attemptNumber: 1,
      lastAttemptAt: now,
    });
  } catch (error: any) {
    if (error?.code === 11000) return undefined;
    throw error;
  }
}

export async function sendTicketLifecycleEmail(orderId: string, channel: TicketLifecycleEmailChannel) {
  if (!lifecycleEmailChannels.has(channel)) throw new Error("Canal de email de entradas no soportado.");
  const delivery: any = await claimLifecycleDelivery(orderId, channel);
  if (!delivery) return { sent: false, skipped: true };
  try {
    const order: any = await TicketOrder.findById(orderId).lean();
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    const publication: any = await TicketPublication.findById(order.publicationId).lean();
    const portalUrl = `${publicAppUrl()}/entradas/compra/${order.publicId}?token=${orderAccessToken(order)}`;
    const content = lifecycleEmailContent(channel, order, publication, portalUrl);
    const sent = await sendEmail({ to: order.buyer.email, ...content });
    await TicketDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: sent ? "sent" : "failed",
          destinationMasked: maskEmail(order.buyer.email),
          provider: sent ? "smtp" : undefined,
          sentAt: sent ? new Date() : undefined,
          nextRetryAt: sent ? undefined : retryAtForTicketEmail(delivery.attemptNumber),
          errorCode: sent ? undefined : "EMAIL_NOT_CONFIGURED",
          errorMessage: sent ? undefined : "El servicio de correo no está configurado.",
        },
      },
    );
    return { sent, skipped: false };
  } catch (error: any) {
    await TicketDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: "failed",
          nextRetryAt: retryAtForTicketEmail(delivery.attemptNumber),
          errorCode: error?.code ?? "EMAIL_DELIVERY_FAILED",
          errorMessage: error?.message ?? "No se pudo enviar el correo.",
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
  if (status === "expired" && changed.paymentStatus === "pending" && changed.totalAmount > 0)
    void sendTicketLifecycleEmail(String(changed._id), "checkout_abandoned").catch(() => undefined);
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

export async function processTicketAutomationTick(now = new Date()) {
  const expiredReservations = await expirePendingOrders();
  const lifecycleRetries: any[] = await TicketDelivery.find({
    channel: { $in: [...lifecycleEmailChannels] },
    status: "failed",
    attemptNumber: { $lt: ticketEmailRetryLimit },
    nextRetryAt: { $lte: now },
  })
    .sort({ nextRetryAt: 1 })
    .limit(50)
    .lean();
  const ticketEmailRetries: any[] = await TicketDelivery.find({
    channel: "email",
    status: "failed",
    attemptNumber: { $lt: ticketEmailRetryLimit },
    nextRetryAt: { $lte: now },
  })
    .sort({ nextRetryAt: 1 })
    .limit(50)
    .lean();

  let lifecycleRetried = 0;
  for (const delivery of lifecycleRetries) {
    try {
      const result = await sendTicketLifecycleEmail(
        String(delivery.orderId),
        delivery.channel as TicketLifecycleEmailChannel,
      );
      if (!result.skipped) lifecycleRetried += 1;
    } catch {
      // The attempt is persisted as failed by sendTicketLifecycleEmail and can be
      // retried by the next tick until its configured limit is reached.
    }
  }

  let ticketEmailsRetried = 0;
  for (const delivery of ticketEmailRetries) {
    try {
      const result = await sendOrderTicketsEmail(
        String(delivery.orderId),
        "automatic_retry",
        undefined,
        String(delivery._id),
      );
      if (!result.skipped) ticketEmailsRetried += 1;
    } catch {
      // sendOrderTicketsEmail records the failed attempt and its next retry time.
    }
  }

  const windows = [
    { channel: "event_reminder_48h" as const, fromHours: 47, toHours: 49 },
    { channel: "event_reminder_24h" as const, fromHours: 23, toHours: 25 },
  ];
  let remindersQueued = 0;
  for (const window of windows) {
    const startsAt = new Date(now.getTime() + window.fromHours * 60 * 60_000);
    const endsAt = new Date(now.getTime() + window.toHours * 60 * 60_000);
    const publications: any[] = await TicketPublication.find({
      deletedAt: null,
      startsAt: { $gte: startsAt, $lt: endsAt },
    })
      .select("_id")
      .lean();
    if (!publications.length) continue;
    const orders: any[] = await TicketOrder.find({
      publicationId: { $in: publications.map((publication) => publication._id) },
      status: "paid",
      paymentStatus: { $in: ["paid", "manual_paid"] },
      deletedAt: null,
    })
      .select("_id")
      .limit(500)
      .lean();
    for (const order of orders) {
      try {
        const result = await sendTicketLifecycleEmail(String(order._id), window.channel);
        if (!result.skipped) remindersQueued += 1;
      } catch {
        // Failures are visible in TicketDelivery and will enter the retry queue.
      }
    }
  }
  return { expiredReservations, lifecycleRetried, ticketEmailsRetried, remindersQueued };
}

export async function reservePublicOrder(input: {
  publication: any;
  buyer: any;
  selections: Array<{ ticketTypeId: string; quantity: number }>;
  idempotencyKey: string;
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
      const candidate: any = await TicketType.findOne({
        _id: selected.ticketTypeId,
        publicationId: publication._id,
        deletedAt: null,
        status: "active",
      }).lean();
      if (
        !candidate ||
        (candidate.salesOpenAt && candidate.salesOpenAt > now) ||
        (candidate.salesCloseAt && candidate.salesCloseAt < now) ||
        selected.quantity > candidate.maxPerOrder ||
        selected.quantity < (candidate.minPerOrder ?? 1)
      )
        throw new ApiError(
          409,
          "TICKET_TYPE_UNAVAILABLE",
          "Uno de los tipos de entrada no está disponible.",
        );
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
      if (!type)
        throw new ApiError(
          409,
          "TICKET_SOLD_OUT",
          "No hay cupos suficientes para uno de los tipos de entrada.",
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
            (publication.paymentConfig?.reservationMinutes ?? 5) * 60_000,
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
  await recordTicketOrderPayment(paid, {
    method: details.method,
    reference: details.reference,
    userId: details.userId,
  });
  await issueTicketsForPaidOrder(String(paid._id));
  void sendOrderTicketsEmail(String(paid._id)).catch(() => undefined);
  return paid;
}

export async function createTicketCheckout(order: any, publication: any) {
  if (!order.totalAmount)
    // Free orders are issued immediately (see reservePublicOrder) — send the
    // buyer straight to their tickets, not through any payment provider page.
    return {
      checkoutUrl: `${publicAppUrl()}/entradas/compra/${order.publicId}?token=${encodeURIComponent(orderAccessToken(order))}`,
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
    returnUrl: `${publicAppUrl()}/entradas/compra/${order.publicId}?token=${encodeURIComponent(orderAccessToken(order))}`,
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
  void sendTicketLifecycleEmail(String(order._id), "payment_pending").catch(() => undefined);
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
  if (input.status === "rejected")
    void sendTicketLifecycleEmail(String(order._id), "payment_rejected").catch(() => undefined);
  return TicketOrder.findById(order._id);
}

export async function refundTicketOrder(
  order: any,
  input: {
    amount?: number;
    reason: string;
    ticketIds?: string[];
    force?: boolean;
  },
  userId: string,
) {
  const { amount, reason, ticketIds, force } = input;
  // Atomically claim the order so two concurrent/duplicate refund requests
  // can't both pass the "paid" check and both trigger a real provider refund.
  const claimed: any = await TicketOrder.findOneAndUpdate(
    { _id: order._id, status: "paid" },
    { $set: { status: "refund_processing" } },
    { new: true },
  );
  if (!claimed)
    throw new ApiError(
      409,
      "TICKET_ORDER_NOT_REFUNDABLE",
      "Solo se pueden devolver órdenes pagadas, o ya hay una devolución en curso para esta orden.",
    );
  try {
    if (
      amount !== undefined &&
      amount < claimed.totalAmount &&
      !ticketIds?.length
    )
      throw new ApiError(
        400,
        "TICKET_REFUND_TICKETS_REQUIRED",
        "Para un reembolso parcial indicá qué entradas se devuelven.",
      );
    const affectedTickets = await DigitalTicket.find({
      orderId: claimed._id,
      deletedAt: null,
      ...(ticketIds?.length ? { _id: { $in: ticketIds } } : {}),
    }).lean();
    if (affectedTickets.some((t: any) => t.status === "checked_in") && !force)
      throw new ApiError(
        409,
        "TICKET_ALREADY_CHECKED_IN",
        "Una o más entradas ya tuvieron ingreso registrado. Confirmá explícitamente para devolverlas igual.",
      );
    const payment: any = await TicketPayment.findOne({ orderId: claimed._id });
    if (!payment)
      throw new ApiError(
        409,
        "TICKET_PAYMENT_NOT_FOUND",
        "No existe un pago para devolver.",
      );
    // A payment without providerPaymentId was recorded manually (efectivo/transferencia,
    // ver markOrderPaid) — no hay cargo online que reversar en el proveedor.
    const providerRefund = payment.providerPaymentId
      ? await getTicketPaymentProvider().refundPayment({
          providerPaymentId: payment.providerPaymentId,
          amount,
          idempotencyKey: `refund:${claimed._id}`,
        })
      : { providerRefundId: undefined, status: "approved" as const, amount };
    const refundAmount = providerRefund.amount ?? claimed.totalAmount;
    const full = !ticketIds?.length && refundAmount >= claimed.totalAmount;
    const refund = await TicketRefund.create({
      orderId: claimed._id,
      paymentId: payment._id,
      provider: payment.provider,
      providerRefundId: providerRefund.providerRefundId,
      type: full ? "full" : "partial",
      status: providerRefund.status === "approved" ? "approved" : "processing",
      amount: refundAmount,
      ticketIds: affectedTickets.map((t: any) => t._id),
      reason,
      requestedBy: userId,
      idempotencyKey: `refund:${claimed._id}`,
    });
    if (providerRefund.status === "approved") {
      await TicketOrder.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: full ? "refunded" : "partially_refunded",
            paymentStatus: "refunded",
          },
        },
      );
      if (affectedTickets.length)
        await DigitalTicket.updateMany(
          { _id: { $in: affectedTickets.map((t: any) => t._id) } },
          { $set: { status: "refunded" } },
        );
      await TicketPayment.updateOne(
        { _id: payment._id },
        { $set: { status: full ? "refunded" : "partially_refunded" } },
      );
      await syncTicketOrderRefund(claimed._id, {
        full,
        refundAmount,
        userId,
      });
      void sendTicketLifecycleEmail(String(claimed._id), "refund_confirmation").catch(() => undefined);
    } else {
      // El proveedor no aprobó de inmediato: liberamos el candado para permitir reintentar.
      await TicketOrder.updateOne(
        { _id: claimed._id, status: "refund_processing" },
        { $set: { status: "paid" } },
      );
    }
    return refund;
  } catch (error) {
    await TicketOrder.updateOne(
      { _id: claimed._id, status: "refund_processing" },
      { $set: { status: "paid" } },
    );
    throw error;
  }
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

export function findTicketForValidation(publicToken: string) {
  return DigitalTicket.findOne({
    $or: [
      { qrTokenHash: ticketTokenHash(publicToken) },
      { publicToken },
      { ticketCode: publicToken },
    ],
    deletedAt: null,
  }).lean();
}

// Centralizes the full validation procedure so both the scan step and the confirm
// step agree on the outcome: wrong-event tickets and tickets scanned past the
// publication's qrConfig.validUntil window are surfaced explicitly instead of
// falling through to a generic "invalid" (or, for confirm, an unrecognized status
// string that would fail the TicketAccessAttempt.result enum).
export function resolveCheckInResult(
  ticket: any,
  publicationId: string,
  publication?: { qrConfig?: { validUntil?: Date | string | null } },
) {
  if (!ticket) return "invalid";
  if (String(ticket.publicationId) !== String(publicationId))
    return "wrong_publication";
  if (ticket.status === "checked_in") return "already_checked_in";
  if (["cancelled", "refunded", "transferred", "expired"].includes(ticket.status))
    return ticket.status;
  const validUntil = publication?.qrConfig?.validUntil;
  if (validUntil && new Date(validUntil).getTime() < Date.now()) return "expired";
  return ticket.status === "issued" ? "valid" : ticket.status;
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
      status: "issued",
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
      status: "issued",
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
  if (current.status !== "issued")
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
