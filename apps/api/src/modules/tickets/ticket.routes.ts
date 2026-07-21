import { Router } from "express";
import { z } from "zod";
import { Permission } from "@mym/shared";
import { requireAuth, requirePermission } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/api";
import { ApiError } from "../../middlewares/errorHandler";
import { writeAuditLog } from "../audit/audit.service";
import {
  DigitalTicket,
  TicketAccessAttempt,
  TicketOrder,
  TicketPayment,
  TicketDelivery,
  TicketPaymentWebhook,
  TicketPublication,
  TicketRefund,
  TicketType,
} from "./ticket.models";
import {
  claimTicketCheckIn,
  createTicketCheckout,
  expirePendingOrders,
  markOrderPaid,
  reconcileTicketPayment,
  refundTicketOrder,
  releaseOrderReservation,
  reservePublicOrder,
  isTicketPromotionActive,
  ticketEffectivePrice,
  ticketPublicView,
  issueTicketsForPaidOrder,
  orderAccessToken,
  sendOrderTicketsEmail,
  ticketAccessToken,
  ticketTokenHash,
  claimTicketCheckInById,
  regenerateTicketQr,
} from "./ticket.service";
import { getTicketPaymentProvider } from "./ticket-payment.provider";
import { env } from "../../config/env";
import { getSignedDownloadUrl } from "../uploads/cloudinary.service";
import { generateOrderTicketPdfs } from "./ticket-pdf.service";
const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const publicToken = z.string().regex(/^[A-Za-z0-9_-]{24,}$/);
const publicationBody = z.object({
  title: z.string().trim().min(2).max(180),
  slug,
  internalName: z.string().trim().max(180).optional(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(500).optional(),
  fullDescription: z.string().max(12000).optional(),
  category: z.string().max(80).optional(),
  coverImage: z.string().url().optional().or(z.literal("")),
  gallery: z.array(z.string().url()).max(12).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  venueName: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  mapsUrl: z.string().url().optional().or(z.literal("")),
  accessInfo: z.string().max(4000).optional(),
  restrictions: z.string().max(4000).optional(),
  minimumAge: z.coerce.number().int().min(0).max(120).optional(),
  termsAndConditions: z.string().max(10000).optional(),
  cancellationPolicy: z.string().max(4000).optional(),
  refundPolicy: z.string().max(4000).optional(),
  salesOpenAt: z.coerce.date().optional(),
  salesCloseAt: z.coerce.date().optional(),
  capacity: z.coerce.number().int().min(0),
  maxTicketsPerOrder: z.coerce.number().int().min(1).max(50).optional(),
  status: z
    .enum([
      "draft",
      "scheduled",
      "active",
      "paused",
      "sold_out",
      "closed",
      "cancelled",
      "archived",
    ])
    .optional(),
  allowFreeTickets: z.boolean().optional(),
  visibility: z
    .object({
      isPublic: z.boolean().optional(),
      showInPublicCatalog: z.boolean().optional(),
      allowSearchEngineIndexing: z.boolean().optional(),
    })
    .optional(),
  appearance: z
    .object({
      primaryColor: z.string().max(30).optional(),
      secondaryColor: z.string().max(30).optional(),
      backgroundColor: z.string().max(30).optional(),
      textColor: z.string().max(30).optional(),
    })
    .optional(),
  organizer: z
    .object({
      name: z.string().max(160).optional(),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().max(60).optional(),
      website: z.string().url().optional().or(z.literal("")),
      instagram: z.string().max(120).optional(),
    })
    .optional(),
  paymentConfig: z
    .object({
      enabled: z.boolean().optional(),
      provider: z.enum(["mercado_pago", "manual", "none"]).optional(),
      reservationMinutes: z.coerce.number().int().min(1).max(120).optional(),
      feePayer: z.enum(["organizer", "buyer"]).optional(),
    })
    .optional(),
  qrConfig: z
    .object({
      allowReentry: z.boolean().optional(),
      maxAccesses: z.coerce.number().int().min(1).optional(),
      validFrom: z.coerce.date().optional(),
      validUntil: z.coerce.date().optional(),
      allowRevert: z.boolean().optional(),
    })
    .optional(),
});
const typeBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  price: z.coerce.number().min(0),
  promotionalPrice: z.coerce.number().min(0).nullable().optional(),
  promotionalStartsAt: z.coerce.date().nullable().optional(),
  promotionalEndsAt: z.coerce.date().nullable().optional(),
  capacity: z.coerce.number().int().min(0),
  currency: z.string().length(3).optional(),
  minPerOrder: z.coerce.number().int().min(1).max(50).optional(),
  maxPerOrder: z.coerce.number().int().min(1).max(50).optional(),
  salesOpenAt: z.coerce.date().optional(),
  salesCloseAt: z.coerce.date().optional(),
  status: z.enum(["active", "inactive", "paused", "hidden"]).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  benefits: z.array(z.string().max(120)).max(12).optional(),
  color: z.string().max(30).optional(),
  isFree: z.boolean().optional(),
  isCourtesy: z.boolean().optional(),
  attendeeFields: z.array(z.string().max(50)).max(10).optional(),
});
function validateTicketPromotion(input: any) {
  if (
    input.promotionalPrice !== undefined &&
    input.promotionalPrice !== null &&
    input.promotionalPrice >= input.price
  )
    throw new ApiError(
      400,
      "TICKET_PROMOTION_PRICE_INVALID",
      "El precio promocional debe ser menor al precio de lista.",
    );
  if (
    input.promotionalStartsAt &&
    input.promotionalEndsAt &&
    new Date(input.promotionalStartsAt) > new Date(input.promotionalEndsAt)
  )
    throw new ApiError(
      400,
      "TICKET_PROMOTION_PERIOD_INVALID",
      "El inicio de la promoción debe ser anterior a su finalización.",
    );
}
const orderBody = z.object({
  buyer: z.object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional(),
    documentNumber: z.string().trim().max(50).optional(),
  }),
  selections: z
    .array(
      z.object({
        ticketTypeId: id,
        quantity: z.coerce.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(20),
  idempotencyKey: z.string().trim().min(12).max(200),
  expiresInMinutes: z.coerce.number().int().min(1).max(120).optional(),
});
const checkInBody = z.object({
  token: publicToken,
  accessPoint: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});
const mockPaymentActionBody = z.object({
  action: z.enum(["approve", "pending", "reject", "cancel"]),
});
const refundBody = z.object({
  amount: z.coerce.number().positive().optional(),
  reason: z.string().trim().min(3).max(500),
});
const defaultTicketPolicies = {
  termsAndConditions:
    "La compra de entradas implica la aceptación de las condiciones de acceso informadas por la organización. La entrada es válida únicamente para la fecha, horario y publicación indicados. La organización podrá solicitar documentación para validar la titularidad de la compra.",
  cancellationPolicy:
    "La organización podrá modificar horarios, artistas, actividades o ubicación por razones operativas, climáticas o de fuerza mayor. En caso de reprogramación, la entrada conservará su validez para la nueva fecha informada.",
  refundPolicy:
    "Las devoluciones se rigen por la política publicada para cada experiencia. Salvo cancelación definitiva atribuible a la organización o disposición legal aplicable, las entradas adquiridas no son reembolsables.",
};
const publicationListQuery = z.object({
  search: z.string().trim().max(160).optional(),
  status: z
    .enum([
      "draft",
      "scheduled",
      "active",
      "paused",
      "sold_out",
      "finished",
      "closed",
      "cancelled",
      "archived",
    ])
    .optional(),
  category: z.string().trim().max(80).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  visibility: z.enum(["public", "private", "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(["updatedAt", "startsAt", "title", "createdAt"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
const schema = (body: z.ZodTypeAny, params: z.ZodRawShape) =>
  z.object({
    body,
    params: z.object(params),
    query: z.object({}).passthrough(),
  });
const admin = Router();
const publicRouter = Router();

function webhookHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function webhookDataId(req: any): string | undefined {
  const queryValue = req.query?.["data.id"];
  const value = Array.isArray(queryValue)
    ? queryValue[0]
    : queryValue ?? req.body?.data?.id;
  return value === undefined || value === null ? undefined : String(value);
}

publicRouter.post(
  "/tickets/webhooks/mercado_pago",
  asyncHandler(async (req, res) => {
    const provider = getTicketPaymentProvider();
    if (provider.name !== "mercado_pago")
      throw new ApiError(404, "MERCADO_PAGO_NOT_CONFIGURED");

    const dataId = webhookDataId(req);
    const signature = webhookHeader(req.headers["x-signature"]);
    const requestId = webhookHeader(req.headers["x-request-id"]);
    const eventId = String(req.body?.id ?? requestId ?? dataId ?? "unknown");
    const topic = String(req.body?.type ?? req.body?.action ?? "unknown");
    const signatureValid = await provider.validateWebhook({
      requestId,
      signature,
      dataId,
    });
    const webhook: any = await TicketPaymentWebhook.findOneAndUpdate(
      { provider: "mercado_pago", providerEventId: eventId },
      {
        $setOnInsert: {
          provider: "mercado_pago",
          providerEventId: eventId,
        },
        $set: {
          topic,
          resourceId: dataId,
          signatureValid,
          payloadSummary: {
            action: req.body?.action,
            type: req.body?.type,
            liveMode: req.body?.live_mode,
          },
          $inc: { attempts: 1 },
        },
      },
      { upsert: true, new: true },
    );

    if (!signatureValid) {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "failed",
            errorCode: "INVALID_WEBHOOK_SIGNATURE",
            errorMessage: "La firma del webhook no es válida.",
          },
        },
      );
      throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Firma de webhook inválida.");
    }
    if (!dataId || !/^\d+$/.test(dataId)) {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "ignored",
            processedAt: new Date(),
            errorCode: "PAYMENT_ID_MISSING",
          },
        },
      );
      return sendSuccess(res, { received: true, ignored: true });
    }
    if (topic !== "payment" && topic !== "payment.updated") {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        { $set: { processingStatus: "ignored", processedAt: new Date() } },
      );
      return sendSuccess(res, { received: true, ignored: true });
    }
    // Mercado Pago's dashboard sends this signed fixture to validate the URL.
    // It is not a real payment and therefore must never create or update an order.
    if (req.body?.live_mode === false && dataId === "123456") {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "ignored",
            processedAt: new Date(),
            errorCode: "MERCADO_PAGO_TEST_NOTIFICATION",
          },
        },
      );
      return sendSuccess(res, { received: true, test: true });
    }

    const payment = await provider.getPayment(dataId);
    const orderId = payment.externalReference;
    if (!orderId || !id.safeParse(orderId).success) {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "ignored",
            processedAt: new Date(),
            errorCode: "TICKET_ORDER_REFERENCE_NOT_FOUND",
          },
        },
      );
      return sendSuccess(res, { received: true, ignored: true });
    }
    const order: any = await TicketOrder.findOne({ _id: orderId, deletedAt: null });
    if (!order) {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "ignored",
            processedAt: new Date(),
            errorCode: "TICKET_ORDER_NOT_FOUND",
          },
        },
      );
      return sendSuccess(res, { received: true, ignored: true });
    }
    if (
      payment.amount === undefined ||
      Number(payment.amount) !== Number(order.totalAmount) ||
      (payment.currency && payment.currency !== (order.currency ?? "ARS"))
    ) {
      await TicketPaymentWebhook.updateOne(
        { _id: webhook._id },
        {
          $set: {
            processingStatus: "failed",
            errorCode: "PAYMENT_AMOUNT_MISMATCH",
            errorMessage: "El importe o moneda informados no coinciden con la orden.",
          },
        },
      );
      throw new ApiError(422, "PAYMENT_AMOUNT_MISMATCH", "El pago no coincide con la orden.");
    }
    await reconcileTicketPayment(order, {
      status: payment.status,
      providerPaymentId: payment.providerPaymentId,
      paymentMethod: payment.paymentMethod ?? "mercado_pago",
      raw: payment.raw,
    });
    await TicketPaymentWebhook.updateOne(
      { _id: webhook._id },
      { $set: { processingStatus: "processed", processedAt: new Date() } },
    );
    return sendSuccess(res, { received: true });
  }),
);
async function publicationForUser(publicationId: string) {
  const publication: any = await TicketPublication.findOne({
    _id: publicationId,
    deletedAt: null,
  }).lean();
  if (!publication)
    throw new ApiError(
      404,
      "TICKET_PUBLICATION_NOT_FOUND",
      "La publicación no existe.",
    );
  return publication;
}
admin.use(requireAuth);
admin.get(
  "/dashboard",
  requirePermission(Permission.TICKETS_READ),
  asyncHandler(async (_req, res) => {
    await expirePendingOrders();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [publicationRows, orderRows, refunds, accesses] = await Promise.all([
      TicketPublication.aggregate([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            capacity: { $sum: "$capacity" },
          },
        },
      ]),
      TicketOrder.aggregate([
        { $match: { deletedAt: null } },
        {
          $project: {
            status: 1,
            paymentStatus: 1,
            totalAmount: 1,
            paidAt: 1,
            quantity: { $sum: "$lines.quantity" },
          },
        },
        {
          $group: {
            _id: null,
            sold: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["paid", "partially_refunded"]] },
                  "$quantity",
                  0,
                ],
              },
            },
            reserved: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "payment_pending"]] },
                  "$quantity",
                  0,
                ],
              },
            },
            grossRevenue: {
              $sum: { $cond: [{ $ne: ["$paidAt", null] }, "$totalAmount", 0] },
            },
            monthGrossRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$paidAt", null] },
                      { $gte: ["$paidAt", monthStart] },
                    ],
                  },
                  "$totalAmount",
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "payment_pending"]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      TicketRefund.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      TicketAccessAttempt.countDocuments({
        action: "check_in",
        result: "valid",
      }),
    ]);
    const publications = publicationRows.reduce(
      (acc: any, row: any) => ({
        capacity: acc.capacity + row.capacity,
        active: acc.active + (row._id === "active" ? row.count : 0),
      }),
      { capacity: 0, active: 0 },
    );
    const orders = orderRows[0] ?? {
      sold: 0,
      reserved: 0,
      grossRevenue: 0,
      monthGrossRevenue: 0,
      pending: 0,
    };
    const refunded = refunds[0]?.total ?? 0;
    return sendSuccess(res, {
      metrics: {
        activePublications: publications.active,
        ticketsSold: orders.sold,
        ticketsAvailable: Math.max(
          0,
          publications.capacity - orders.sold - orders.reserved,
        ),
        monthSales: Math.max(0, orders.monthGrossRevenue),
        revenue: Math.max(0, orders.grossRevenue - refunded),
        pendingPayments: orders.pending,
        refunds: refunded,
        checkIns: accesses,
      },
    });
  }),
);
admin.get(
  "/orders",
  requirePermission(Permission.TICKETS_READ),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const filter: any = { deletedAt: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.payment) filter.paymentStatus = req.query.payment;
    if (
      req.query.publicationId &&
      id.safeParse(req.query.publicationId).success
    )
      filter.publicationId = req.query.publicationId;
    if (req.query.search) {
      const escaped = String(req.query.search).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const match = new RegExp(escaped, "i");
      filter.$or = [
        { publicId: match },
        { "buyer.name": match },
        { "buyer.email": match },
        { "buyer.documentNumber": match },
      ];
    }
    if (req.query.date) {
      const start = new Date(`${req.query.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }
    const [orders, total] = await Promise.all([
      TicketOrder.find(filter)
        .populate("publicationId", "title slug")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TicketOrder.countDocuments(filter),
    ]);
    return sendSuccess(res, {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }),
);
admin.get(
  "/buyers",
  requirePermission(Permission.TICKETS_READ),
  asyncHandler(async (req, res) => {
    const escaped = req.query.search
      ? String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : undefined;
    const match: any = { deletedAt: null };
    if (escaped)
      match.$or = [
        { "buyer.name": new RegExp(escaped, "i") },
        { "buyer.email": new RegExp(escaped, "i") },
        { "buyer.documentNumber": new RegExp(escaped, "i") },
      ];
    const buyers = await TicketOrder.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $toLower: "$buyer.email" },
          name: { $first: "$buyer.name" },
          email: { $first: "$buyer.email" },
          documentNumber: { $first: "$buyer.documentNumber" },
          ordersCount: { $sum: 1 },
          ticketsCount: { $sum: { $sum: "$lines.quantity" } },
          totalSpent: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0] },
          },
          lastPurchaseAt: { $first: "$createdAt" },
        },
      },
      { $sort: { lastPurchaseAt: -1 } },
    ]);
    return sendSuccess(res, { buyers });
  }),
);
admin.get(
  "/orders/:orderId",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({
      _id: req.params.orderId,
      deletedAt: null,
    })
      .populate("publicationId", "title slug startsAt venueName")
      .lean();
    if (!order)
      throw new ApiError(404, "TICKET_ORDER_NOT_FOUND", "La orden no existe.");
    const [tickets, payment, refunds, attempts] = await Promise.all([
      DigitalTicket.find({ orderId: order._id, deletedAt: null })
        .populate("ticketTypeId", "name")
        .lean(),
      TicketPayment.findOne({ orderId: order._id }).lean(),
      TicketRefund.find({ orderId: order._id }).sort({ createdAt: -1 }).lean(),
      TicketAccessAttempt.find({
        ticketId: {
          $in: await DigitalTicket.find({ orderId: order._id }).distinct("_id"),
        },
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    return sendSuccess(res, { order, tickets, payment, refunds, attempts });
  }),
);
admin.post(
  "/orders/:orderId/refund",
  requirePermission(Permission.DIGITAL_TICKET_REFUNDS_CREATE),
  validateRequest(schema(refundBody, { orderId: id })),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({
      _id: req.params.orderId,
      deletedAt: null,
    });
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    const refund = await refundTicketOrder(
      order,
      req.body.amount,
      req.body.reason,
      req.user!.id,
    );
    await writeAuditLog(
      req,
      "ticket_order_refunded",
      "TicketOrder",
      String(order._id),
      { amount: req.body.amount, reason: req.body.reason },
    );
    return sendSuccess(res, { refund });
  }),
);
admin.get(
  "/payment-settings",
  requirePermission(Permission.DIGITAL_TICKET_SETTINGS_READ),
  asyncHandler(async (_req, res) => {
    const configuredByEnvironment = Boolean(
      env.MERCADO_PAGO_ACCESS_TOKEN &&
        env.MERCADO_PAGO_WEBHOOK_SECRET &&
        env.TICKET_PAYMENT_PROVIDER === "mercado_pago",
    );
    const provider = getTicketPaymentProvider();
    return sendSuccess(res, {
      provider: provider.name,
      status: configuredByEnvironment ? "connected" : "not_configured",
      environment: env.MERCADO_PAGO_ENVIRONMENT,
      credentialsConfigured: configuredByEnvironment,
      webhookUrl: `${env.CORS_ORIGIN}/api/public/tickets/webhooks/mercado_pago`,
    });
  }),
);
admin.post(
  "/payment-settings/test",
  requirePermission(Permission.DIGITAL_TICKET_SETTINGS_READ),
  asyncHandler(async (_req, res) => {
    const provider = getTicketPaymentProvider();
    return sendSuccess(res, {
      success: true,
      provider: provider.name,
      message:
        provider.name === "mock"
          ? "El simulador local está listo para usar."
          : "La configuración de Mercado Pago está lista para validar con credenciales reales.",
    });
  }),
);
admin.post(
  "/orders/:orderId/generate-documents",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(z.object({}).optional(), { orderId: id })),
  asyncHandler(async (req, res) => sendSuccess(res, await generateOrderTicketPdfs(req.params.orderId))),
);
admin.get(
  "/orders/:orderId/pdf",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findById(req.params.orderId).lean();
    if (!order?.ticketsPdf?.storageKey) throw new ApiError(404, "TICKET_DOCUMENT_NOT_FOUND");
    return sendSuccess(res, { url: getSignedDownloadUrl(order.ticketsPdf.storageKey), filename: order.ticketsPdf.filename, document: order.ticketsPdf });
  }),
);
admin.get(
  "/orders/:orderId/documents",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const [order, tickets, deliveries] = await Promise.all([
      TicketOrder.findById(req.params.orderId).lean(),
      DigitalTicket.find({ orderId: req.params.orderId, deletedAt: null }).select('ticketCode status pdf').lean(),
      TicketDelivery.find({ orderId: req.params.orderId }).sort({ createdAt: -1 }).lean(),
    ]);
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    return sendSuccess(res, { documentStatus: (order as any).documentStatus, combined: (order as any).ticketsPdf, tickets, deliveries });
  }),
);
admin.get(
  "/publications",
  requirePermission(Permission.TICKETS_READ),
  asyncHandler(async (req, res) => {
    const query = publicationListQuery.parse(req.query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.visibility === "public") filter["visibility.isPublic"] = true;
    if (query.visibility === "private")
      filter["visibility.isPublic"] = { $ne: true };
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.startsAt = { $gte: start, $lt: end };
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(escaped, "i");
      filter.$or = [
        { title: match },
        { internalName: match },
        { slug: match },
        { category: match },
        { venueName: match },
      ];
    }
    const [publications, total] = await Promise.all([
      TicketPublication.find(filter)
        .sort({ [query.sort]: query.direction === "asc" ? 1 : -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      TicketPublication.countDocuments(filter),
    ]);
    const publicationIds = publications.map(
      (publication: any) => publication._id,
    );
    const [sales, refundRows] = await Promise.all([
      TicketOrder.aggregate([
        {
          $match: {
            publicationId: { $in: publicationIds },
            deletedAt: null,
            paidAt: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$publicationId",
            grossRevenue: { $sum: "$totalAmount" },
          },
        },
      ]),
      TicketRefund.aggregate([
        { $match: { status: "approved" } },
        {
          $lookup: {
            from: "ticketorders",
            localField: "orderId",
            foreignField: "_id",
            as: "order",
          },
        },
        { $unwind: "$order" },
        {
          $match: {
            "order.publicationId": { $in: publicationIds },
            "order.deletedAt": null,
          },
        },
        {
          $group: {
            _id: "$order.publicationId",
            refunded: { $sum: "$amount" },
          },
        },
      ]),
    ]);
    const revenueByPublication = new Map(
      sales.map((row: any) => [String(row._id), row.grossRevenue]),
    );
    const refundedByPublication = new Map(
      refundRows.map((row: any) => [String(row._id), row.refunded]),
    );
    return sendSuccess(res, {
      publications: publications.map((publication: any) => ({
        ...publication,
        availableCount: Math.max(
          0,
          publication.capacity -
            publication.reservedCount -
            publication.soldCount,
        ),
        revenue: Math.max(
          0,
          (revenueByPublication.get(String(publication._id)) ?? 0) -
            (refundedByPublication.get(String(publication._id)) ?? 0),
        ),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  }),
);
admin.post(
  "/publications",
  requirePermission(Permission.TICKETS_CREATE),
  validateRequest(schema(publicationBody, {})),
  asyncHandler(async (req, res) => {
    const publication = await TicketPublication.create({
      ...defaultTicketPolicies,
      ...req.body,
      termsAndConditions:
        req.body.termsAndConditions || defaultTicketPolicies.termsAndConditions,
      cancellationPolicy:
        req.body.cancellationPolicy || defaultTicketPolicies.cancellationPolicy,
      refundPolicy: req.body.refundPolicy || defaultTicketPolicies.refundPolicy,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });
    await writeAuditLog(
      req,
      "ticket_publication_created",
      "TicketPublication",
      String(publication._id),
    );
    return sendSuccess(res, { publication }, 201);
  }),
);
admin.get(
  "/publications/:publicationId",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    await expirePendingOrders(String(publication._id));
    const types = await TicketType.find({
      publicationId: publication._id,
      deletedAt: null,
    })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    return sendSuccess(res, { publication, types });
  }),
);
admin.patch(
  "/publications/:publicationId",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(
    schema(
      publicationBody.partial().refine((v) => Object.keys(v).length > 0),
      { publicationId: id },
    ),
  ),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    const used = publication.soldCount + publication.reservedCount;
    if (req.body.capacity !== undefined && req.body.capacity < used)
      throw new ApiError(
        409,
        "TICKET_CAPACITY_TOO_LOW",
        "El cupo no puede ser menor a las entradas reservadas o vendidas.",
      );
    const updated = await TicketPublication.findByIdAndUpdate(
      publication._id,
      { $set: { ...req.body, updatedBy: req.user!.id } },
      { new: true },
    );
    await writeAuditLog(
      req,
      "ticket_publication_updated",
      "TicketPublication",
      String(publication._id),
      req.body,
    );
    return sendSuccess(res, { publication: updated });
  }),
);
admin.post(
  "/publications/:publicationId/activate",
  requirePermission(Permission.DIGITAL_TICKETS_PUBLISH),
  validateRequest(schema(z.object({}).optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    const activeTypes = await TicketType.countDocuments({
      publicationId: publication._id,
      deletedAt: null,
      status: "active",
    });
    if (!activeTypes)
      throw new ApiError(
        409,
        "TICKET_PUBLICATION_WITHOUT_TYPES",
        "Agregá al menos un tipo de entrada activo antes de publicar.",
      );
    const updated = await TicketPublication.findByIdAndUpdate(
      publication._id,
      {
        $set: {
          status: "active",
          publishedAt: new Date(),
          pausedAt: null,
          updatedBy: req.user!.id,
        },
      },
      { new: true },
    );
    await writeAuditLog(
      req,
      "ticket_publication_activated",
      "TicketPublication",
      String(publication._id),
    );
    return sendSuccess(res, { publication: updated });
  }),
);
admin.post(
  "/publications/:publicationId/pause",
  requirePermission(Permission.DIGITAL_TICKETS_PAUSE),
  validateRequest(schema(z.object({}).optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    if (publication.status !== "active" && publication.status !== "scheduled")
      throw new ApiError(
        409,
        "TICKET_PUBLICATION_NOT_ACTIVE",
        "Solo se pueden pausar publicaciones activas o programadas.",
      );
    const updated = await TicketPublication.findByIdAndUpdate(
      publication._id,
      {
        $set: {
          status: "paused",
          pausedAt: new Date(),
          updatedBy: req.user!.id,
        },
      },
      { new: true },
    );
    await writeAuditLog(
      req,
      "ticket_publication_paused",
      "TicketPublication",
      String(publication._id),
    );
    return sendSuccess(res, { publication: updated });
  }),
);
admin.post(
  "/publications/:publicationId/archive",
  requirePermission(Permission.DIGITAL_TICKETS_ARCHIVE),
  validateRequest(schema(z.object({}).optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    const updated = await TicketPublication.findByIdAndUpdate(
      publication._id,
      {
        $set: {
          status: "archived",
          archivedAt: new Date(),
          updatedBy: req.user!.id,
        },
      },
      { new: true },
    );
    await writeAuditLog(
      req,
      "ticket_publication_archived",
      "TicketPublication",
      String(publication._id),
    );
    return sendSuccess(res, { publication: updated, archived: true });
  }),
);
admin.delete(
  "/publications/:publicationId",
  requirePermission(Permission.DIGITAL_TICKETS_DELETE),
  validateRequest(schema(z.unknown().optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    const [orders, tickets] = await Promise.all([
      TicketOrder.countDocuments({
        publicationId: publication._id,
        deletedAt: null,
      }),
      DigitalTicket.countDocuments({
        publicationId: publication._id,
        deletedAt: null,
      }),
    ]);
    if (orders || tickets) {
      const archived = await TicketPublication.findByIdAndUpdate(
        publication._id,
        {
          $set: {
            status: "archived",
            archivedAt: new Date(),
            updatedBy: req.user!.id,
          },
        },
        { new: true },
      );
      await writeAuditLog(
        req,
        "ticket_publication_archived_from_delete",
        "TicketPublication",
        String(publication._id),
        { orders, tickets },
      );
      return sendSuccess(res, {
        deleted: false,
        archived: true,
        publication: archived,
      });
    }
    await Promise.all([
      TicketType.updateMany(
        { publicationId: publication._id, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedBy: req.user!.id } },
      ),
      TicketPublication.updateOne(
        { _id: publication._id },
        { $set: { deletedAt: new Date(), updatedBy: req.user!.id } },
      ),
    ]);
    await writeAuditLog(
      req,
      "ticket_publication_deleted",
      "TicketPublication",
      String(publication._id),
    );
    return sendSuccess(res, { deleted: true, archived: false });
  }),
);
admin.post(
  "/publications/:publicationId/types",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(typeBody, { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    if (req.body.capacity > publication.capacity)
      throw new ApiError(
        400,
        "TICKET_TYPE_CAPACITY_INVALID",
        "El cupo no puede superar el general.",
      );
    validateTicketPromotion(req.body);
    const ticketType = await TicketType.create({
      ...req.body,
      publicationId: publication._id,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });
    return sendSuccess(res, { ticketType }, 201);
  }),
);
admin.patch(
  "/publications/:publicationId/types/:typeId",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(
    schema(
      typeBody.partial().refine((v) => Object.keys(v).length > 0),
      { publicationId: id, typeId: id },
    ),
  ),
  asyncHandler(async (req, res) => {
    await publicationForUser(req.params.publicationId);
    const ticketType: any = await TicketType.findOne({
      _id: req.params.typeId,
      publicationId: req.params.publicationId,
      deletedAt: null,
    });
    if (!ticketType) throw new ApiError(404, "TICKET_TYPE_NOT_FOUND");
    if (
      req.body.capacity !== undefined &&
      req.body.capacity < ticketType.soldCount + ticketType.reservedCount
    )
      throw new ApiError(409, "TICKET_CAPACITY_TOO_LOW");
    validateTicketPromotion({
      ...ticketType.toObject(),
      ...req.body,
    });
    Object.assign(ticketType, req.body, { updatedBy: req.user!.id });
    await ticketType.save();
    return sendSuccess(res, { ticketType });
  }),
);
admin.delete(
  "/publications/:publicationId/types/:typeId",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(
    schema(z.unknown().optional(), { publicationId: id, typeId: id }),
  ),
  asyncHandler(async (req, res) => {
    await publicationForUser(req.params.publicationId);
    const ticketType: any = await TicketType.findOne({
      _id: req.params.typeId,
      publicationId: req.params.publicationId,
      deletedAt: null,
    });
    if (!ticketType) throw new ApiError(404, "TICKET_TYPE_NOT_FOUND");
    if (ticketType.soldCount || ticketType.reservedCount)
      throw new ApiError(
        409,
        "TICKET_TYPE_HAS_SALES",
        "No se puede eliminar un tipo con ventas o reservas. Podés pausarlo u ocultarlo.",
      );
    await TicketType.updateOne(
      { _id: ticketType._id },
      { $set: { deletedAt: new Date(), updatedBy: req.user!.id } },
    );
    return sendSuccess(res, { deleted: true });
  }),
);
admin.get(
  "/publications/:publicationId/orders",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { publicationId: id })),
  asyncHandler(async (req, res) => {
    await publicationForUser(req.params.publicationId);
    await expirePendingOrders(req.params.publicationId);
    return sendSuccess(res, {
      orders: await TicketOrder.find({
        publicationId: req.params.publicationId,
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .lean(),
    });
  }),
);
admin.post(
  "/orders/:orderId/mark-paid",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(
    schema(
      z.object({
        method: z.enum([
          "cash",
          "bank_transfer",
          "mercado_pago",
          "card",
          "other",
        ]),
        reference: z.string().trim().max(160).optional(),
      }),
      { orderId: id },
    ),
  ),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({
      _id: req.params.orderId,
      deletedAt: null,
    });
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    await publicationForUser(String(order.publicationId));
    return sendSuccess(res, {
      order: await markOrderPaid(order, { ...req.body, userId: req.user!.id }),
    });
  }),
);
admin.post(
  "/orders/:orderId/cancel",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(z.object({}).optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({
      _id: req.params.orderId,
      deletedAt: null,
    });
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    await publicationForUser(String(order.publicationId));
    if (!(await releaseOrderReservation(order, "cancelled")))
      throw new ApiError(409, "TICKET_ORDER_NOT_CANCELLABLE");
    return sendSuccess(res, { cancelled: true });
  }),
);
admin.post(
  "/orders/:orderId/issue-tickets",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(z.object({}).optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const result = await issueTicketsForPaidOrder(req.params.orderId);
    return sendSuccess(res, {
      issued: result.tickets.length,
      tickets: result.tickets,
    });
  }),
);
admin.post(
  "/orders/:orderId/resend-tickets",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(z.object({}).optional(), { orderId: id })),
  asyncHandler(async (req, res) => {
    const result = await sendOrderTicketsEmail(
      req.params.orderId,
      "admin_resend",
      req.user!.id,
    );
    return sendSuccess(res, {
      sent: result.sent,
      tickets: result.tickets.length,
    });
  }),
);
admin.get(
  "/orders/:orderId/deliveries",
  requirePermission(Permission.TICKETS_READ),
  validateRequest(schema(z.unknown().optional(), { orderId: id })),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      deliveries: await TicketDelivery.find({ orderId: req.params.orderId })
        .sort({ createdAt: -1 })
        .lean(),
    }),
  ),
);
admin.post(
  "/tickets/:ticketId/regenerate-qr",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(
    schema(z.object({ reason: z.string().trim().min(3).max(500) }), {
      ticketId: id,
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await regenerateTicketQr(req.params.ticketId, req.user!.id);
    await writeAuditLog(
      req,
      "digital_ticket_qr_regenerated",
      "DigitalTicket",
      req.params.ticketId,
      { reason: req.body.reason },
    );
    return sendSuccess(res, {
      ticket: result.ticket,
      accessToken: result.accessToken,
    });
  }),
);
admin.post(
  "/publications/:publicationId/check-in",
  requirePermission(Permission.TICKETS_VALIDATE),
  validateRequest(schema(checkInBody, { publicationId: id })),
  asyncHandler(async (req, res) => {
    await publicationForUser(req.params.publicationId);
    const payload = req.body;
    if (payload.idempotencyKey) {
      const prior: any = await TicketAccessAttempt.findOne({
        publicationId: req.params.publicationId,
        action: "check_in",
        idempotencyKey: payload.idempotencyKey,
      }).lean();
      if (prior)
        return sendSuccess(res, { result: prior.result, idempotent: true });
    }
    const existing: any = await DigitalTicket.findOne({
      publicationId: req.params.publicationId,
      $or: [
        { qrTokenHash: ticketTokenHash(payload.token) },
        { publicToken: payload.token },
        { ticketCode: payload.token },
      ],
      deletedAt: null,
    }).lean();
    const result = !existing
      ? "invalid"
      : ["issued", "valid"].includes(existing.status)
        ? "valid"
        : existing.status === "checked_in" || existing.status === "used"
          ? "already_checked_in"
          : existing.status;
    await TicketAccessAttempt.create({
      ticketId: existing?._id,
      publicationId: req.params.publicationId,
      operatorUserId: req.user!.id,
      action: "validate",
      result,
      accessPoint: payload.accessPoint,
      idempotencyKey: payload.idempotencyKey,
    });
    return sendSuccess(res, {
      result,
      ticket: existing
        ? {
            _id: existing._id,
            ticketCode: existing.ticketCode,
            attendeeName: existing.attendeeName,
            status: existing.status,
            ticketTypeName: existing.ticketTypeSnapshot?.name,
            checkedInAt: existing.checkedInAt ?? existing.validatedAt,
          }
        : undefined,
    });
  }),
);
admin.post(
  "/publications/:publicationId/check-in/confirm",
  requirePermission(Permission.TICKETS_VALIDATE),
  validateRequest(
    schema(
      z.object({
        ticketId: id,
        accessPoint: z.string().trim().max(120).optional(),
        idempotencyKey: z.string().trim().min(8).max(200).optional(),
      }),
      { publicationId: id },
    ),
  ),
  asyncHandler(async (req, res) => {
    await publicationForUser(req.params.publicationId);
    const ticket: any = await claimTicketCheckInById(
      req.params.publicationId,
      req.body.ticketId,
      req.user!.id,
      req.body.accessPoint,
    );
    const existing: any =
      ticket ?? (await DigitalTicket.findById(req.body.ticketId).lean());
    const result = ticket
      ? "accepted"
      : existing?.status === "checked_in" || existing?.status === "used"
        ? "already_checked_in"
        : (existing?.status ?? "invalid");
    await TicketAccessAttempt.create({
      ticketId: existing?._id,
      publicationId: req.params.publicationId,
      operatorUserId: req.user!.id,
      action: "check_in",
      result,
      accessPoint: req.body.accessPoint,
      idempotencyKey: req.body.idempotencyKey,
    });
    return sendSuccess(res, {
      result,
      ticket: ticket
        ? {
            _id: ticket._id,
            ticketCode: ticket.ticketCode,
            attendeeName: ticket.attendeeName,
            status: ticket.status,
            ticketTypeName: ticket.ticketTypeSnapshot?.name,
            checkedInAt: ticket.checkedInAt,
          }
        : undefined,
    });
  }),
);
admin.post(
  "/publications/:publicationId/check-in/revert",
  requirePermission(Permission.TICKETS_UPDATE),
  validateRequest(schema(checkInBody, { publicationId: id })),
  asyncHandler(async (req, res) => {
    const publication = await publicationForUser(req.params.publicationId);
    if (!publication.qrConfig?.allowRevert)
      throw new ApiError(409, "TICKET_REVERT_DISABLED");
    const ticket: any = await DigitalTicket.findOneAndUpdate(
      {
        publicationId: publication._id,
        publicToken: req.body.token,
        status: "used",
        deletedAt: null,
      },
      {
        $set: {
          status: "valid",
          validatedAt: null,
          validatedByUserId: null,
          updatedBy: req.user!.id,
        },
      },
      { new: true },
    );
    if (!ticket) throw new ApiError(409, "TICKET_NOT_USED");
    await TicketAccessAttempt.create({
      ticketId: ticket._id,
      publicationId: publication._id,
      operatorUserId: req.user!.id,
      action: "revert",
      result: "reverted",
      accessPoint: req.body.accessPoint,
      idempotencyKey: req.body.idempotencyKey,
    });
    return sendSuccess(res, { ticket });
  }),
);
publicRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const filter: any = {
      deletedAt: null,
      status: "active",
      "visibility.isPublic": { $ne: false },
    };
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.search) {
      const escaped = String(req.query.search).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const match = new RegExp(escaped, "i");
      filter.$or = [
        { title: match },
        { category: match },
        { venueName: match },
        { "location.locality": match },
      ];
    }
    if (req.query.date) {
      const start = new Date(`${req.query.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.startsAt = { $gte: start, $lt: end };
    }
    const publications = await TicketPublication.find(filter)
      .sort({ startsAt: 1 })
      .limit(100)
      .lean();
    const ids = publications.map((publication: any) => publication._id);
    const types = await TicketType.find({
      publicationId: { $in: ids },
      deletedAt: null,
      status: "active",
    }).lean();
    return sendSuccess(res, {
      publications: publications.map((publication: any) => {
        const publicationTypes = types.filter(
          (type: any) => String(type.publicationId) === String(publication._id),
        );
        return {
          ...publication,
          availableCount: Math.max(
            0,
            publication.capacity -
              publication.reservedCount -
              publication.soldCount,
          ),
          fromPrice: publicationTypes.length
            ? Math.min(
                ...publicationTypes.map((type: any) =>
                  ticketEffectivePrice(type),
                ),
              )
            : undefined,
          hasActivePromotion: publicationTypes.some((type: any) =>
            isTicketPromotionActive(type),
          ),
        };
      }),
    });
  }),
);
publicRouter.get(
  "/tickets/:slug",
  validateRequest(schema(z.unknown().optional(), { slug })),
  asyncHandler(async (req, res) => {
    await expirePendingOrders();
    const publication: any = await TicketPublication.findOne({
      slug: req.params.slug,
      deletedAt: null,
    }).lean();
    if (
      !publication ||
      publication.status !== "active" ||
      publication.visibility?.isPublic === false
    )
      throw new ApiError(404, "TICKET_PUBLICATION_NOT_FOUND");
    const types = await TicketType.find({
      publicationId: publication._id,
      status: "active",
      deletedAt: null,
    })
      .sort({ displayOrder: 1 })
      .lean();
    return sendSuccess(res, {
      publication: {
        ...publication,
        availableCount: Math.max(
          0,
          publication.capacity -
            publication.reservedCount -
            publication.soldCount,
        ),
      },
      types: types.map((type: any) => ({
        ...type,
        currentPrice: ticketEffectivePrice(type),
        isPromotionActive: isTicketPromotionActive(type),
        availableCount: Math.max(
          0,
          type.capacity - type.reservedCount - type.soldCount,
        ),
      })),
    });
  }),
);
publicRouter.get(
  "/ticket-orders/:orderCode",
  validateRequest(
    schema(z.unknown().optional(), {
      orderCode: z.string().trim().min(8).max(80),
    }),
  ),
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({
      publicId: req.params.orderCode,
      deletedAt: null,
    }).lean();
    if (
      !order ||
      !req.query.token ||
      String(req.query.token) !== orderAccessToken(order)
    )
      throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    const [publicationResult, tickets] = await Promise.all([
      TicketPublication.findById(order.publicationId).lean(),
      DigitalTicket.find({ orderId: order._id, deletedAt: null })
        .sort({ orderLineId: 1, unitIndex: 1 })
        .lean(),
    ]);
    const publication: any = publicationResult;
    return sendSuccess(res, {
      order: {
        publicId: order.publicId,
        buyer: { name: order.buyer.name, email: order.buyer.email },
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        createdAt: order.createdAt,
        documentStatus: order.documentStatus,
        combinedPdfAvailable: Boolean(order.ticketsPdf?.storageKey),
        combinedPdfUrl: order.ticketsPdf?.storageKey
          ? `/api/public/ticket-orders/${order.publicId}/pdf?token=${encodeURIComponent(String(req.query.token))}`
          : undefined,
      },
      publication: publication
        ? {
            title: publication.title,
            startsAt: publication.startsAt,
            venueName: publication.venueName,
            address: publication.address,
          }
        : undefined,
      tickets: tickets.map((ticket: any) => ({
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        attendeeName: ticket.attendeeName,
        ticketTypeName: ticket.ticketTypeSnapshot?.name,
        issuedAt: ticket.issuedAt,
        accessToken: ticketAccessToken(ticket),
        pdfAvailable: Boolean(ticket.pdf?.storageKey),
        pdfUrl: ticket.pdf?.storageKey
          ? `/api/public/tickets/${ticketAccessToken(ticket)}/pdf`
          : undefined,
      })),
    });
  }),
);
publicRouter.get(
  "/ticket-orders/:orderCode/pdf",
  asyncHandler(async (req, res) => {
    const order: any = await TicketOrder.findOne({ publicId: req.params.orderCode, deletedAt: null }).lean();
    if (!order || String(req.query.token ?? '') !== orderAccessToken(order) || !order.ticketsPdf?.storageKey) throw new ApiError(404, "TICKET_DOCUMENT_NOT_FOUND");
    return res.redirect(302, getSignedDownloadUrl(order.ticketsPdf.storageKey));
  }),
);
publicRouter.get(
  "/tickets/:token/pdf",
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const ticket: any = await DigitalTicket.findOne({ deletedAt: null, $or: [{ qrTokenHash: ticketTokenHash(token) }, { publicToken: token }] }).lean();
    if (!ticket?.pdf?.storageKey) throw new ApiError(404, "TICKET_DOCUMENT_NOT_FOUND");
    return res.redirect(302, getSignedDownloadUrl(ticket.pdf.storageKey));
  }),
);
publicRouter.post(
  "/tickets/:slug/orders",
  validateRequest(schema(orderBody, { slug })),
  asyncHandler(async (req, res) => {
    const publication: any = await TicketPublication.findOne({
      slug: req.params.slug,
      deletedAt: null,
    });
    if (!publication) throw new ApiError(404, "TICKET_PUBLICATION_NOT_FOUND");
    const result = await reservePublicOrder({ publication, ...req.body });
    const checkout = await createTicketCheckout(result.order, publication);
    return sendSuccess(
      res,
      { order: result.order, checkout, reused: result.reused },
      result.reused ? 200 : 201,
    );
  }),
);
publicRouter.get(
  "/tickets/mock-payment/:orderCode",
  validateRequest(
    schema(z.unknown().optional(), {
      orderCode: z.string().regex(/^TKT-[A-F0-9]+$/),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (getTicketPaymentProvider().name !== "mock")
      throw new ApiError(404, "MOCK_PAYMENT_UNAVAILABLE");
    const order: any = await TicketOrder.findOne({
      publicId: req.params.orderCode,
      deletedAt: null,
    })
      .populate("publicationId", "title")
      .lean();
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    return sendSuccess(res, { order, provider: "mock" });
  }),
);
publicRouter.post(
  "/tickets/mock-payment/:orderCode",
  validateRequest(
    schema(mockPaymentActionBody, {
      orderCode: z.string().regex(/^TKT-[A-F0-9]+$/),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (getTicketPaymentProvider().name !== "mock")
      throw new ApiError(404, "MOCK_PAYMENT_UNAVAILABLE");
    const order: any = await TicketOrder.findOne({
      publicId: req.params.orderCode,
      deletedAt: null,
    });
    if (!order) throw new ApiError(404, "TICKET_ORDER_NOT_FOUND");
    const statuses = {
      approve: "approved",
      pending: "pending",
      reject: "rejected",
      cancel: "cancelled",
    } as const;
    const action = req.body.action as keyof typeof statuses;
    const updated = await reconcileTicketPayment(order, {
      status: statuses[action],
      providerPaymentId: order.providerPaymentId,
      paymentMethod: "mock",
      raw: { simulation: true, action },
    });
    return sendSuccess(res, { order: updated, simulated: true });
  }),
);
publicRouter.get(
  "/ticket/:token",
  validateRequest(schema(z.unknown().optional(), { token: publicToken })),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await ticketPublicView(req.params.token)),
  ),
);
export { admin as ticketRoutes, publicRouter as publicTicketRoutes };
