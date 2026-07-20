import { model, models, Schema } from "mongoose";

const objectId = Schema.Types.ObjectId;
const audit = {
  createdBy: { type: objectId, ref: "User" },
  updatedBy: { type: objectId, ref: "User" },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: objectId, ref: "User" },
};

const publicationSchema = new Schema(
  {
    internalName: { type: String, trim: true, maxlength: 180 },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: String,
    category: String,
    shortDescription: { type: String, trim: true, maxlength: 500 },
    fullDescription: { type: String, trim: true, maxlength: 12000 },
    tags: { type: [String], default: [] },
    coverImage: String,
    gallery: [String],
    startsAt: { type: Date, required: true },
    endsAt: Date,
    venueName: String,
    address: String,
    city: String,
    province: String,
    mapsUrl: String,
    accessInfo: String,
    restrictions: String,
    minimumAge: Number,
    dateSettings: {
      startDate: Date,
      endDate: Date,
      timezone: { type: String, default: "America/Argentina/Buenos_Aires" },
      doorsOpenAt: Date,
    },
    location: {
      venueName: String,
      addressLine1: String,
      addressLine2: String,
      locality: String,
      province: String,
      postalCode: String,
      country: String,
      latitude: Number,
      longitude: Number,
      mapsUrl: String,
      mapsEmbedUrl: String,
    },
    organizer: {
      name: String,
      email: String,
      phone: String,
      website: String,
      instagram: String,
    },
    termsAndConditions: String,
    cancellationPolicy: String,
    refundPolicy: String,
    salesOpenAt: Date,
    salesCloseAt: Date,
    capacity: { type: Number, min: 0, required: true },
    reservedCount: { type: Number, min: 0, default: 0 },
    soldCount: { type: Number, min: 0, default: 0 },
    maxTicketsPerOrder: { type: Number, min: 1, default: 10 },
    saleSettings: {
      saleStartsAt: Date,
      saleEndsAt: Date,
      minTicketsPerOrder: { type: Number, min: 1, default: 1 },
      maxTicketsPerOrder: { type: Number, min: 1, default: 10 },
      reservationMinutes: { type: Number, min: 1, max: 120, default: 20 },
      showRemainingStock: { type: Boolean, default: true },
      showSoldQuantity: { type: Boolean, default: false },
      allowDiscountCodes: { type: Boolean, default: true },
      allowWaitlist: { type: Boolean, default: false },
    },
    visibility: {
      isPublic: { type: Boolean, default: false },
      showInPublicCatalog: { type: Boolean, default: false },
      allowSearchEngineIndexing: { type: Boolean, default: false },
      publicationStartsAt: Date,
      publicationEndsAt: Date,
    },
    buyerRequirements: {
      requireFirstName: { type: Boolean, default: true },
      requireLastName: { type: Boolean, default: true },
      requireDni: { type: Boolean, default: false },
      requireEmail: { type: Boolean, default: true },
      requirePhone: { type: Boolean, default: false },
      requireAddress: { type: Boolean, default: false },
      requireAttendeeDataPerTicket: { type: Boolean, default: false },
      requireTermsAcceptance: { type: Boolean, default: false },
    },
    policies: {
      termsAndConditions: String,
      refundPolicy: String,
      cancellationPolicy: String,
      ageRestriction: String,
      accessNotes: String,
    },
    appearance: {
      primaryColor: String,
      secondaryColor: String,
      backgroundColor: String,
      textColor: String,
    },
    paymentSettings: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["mercado_pago"],
        default: "mercado_pago",
      },
    },
    totals: {
      capacity: { type: Number, min: 0, default: 0 },
      reserved: { type: Number, min: 0, default: 0 },
      sold: { type: Number, min: 0, default: 0 },
      available: { type: Number, min: 0, default: 0 },
      grossRevenue: { type: Number, min: 0, default: 0 },
      discountTotal: { type: Number, min: 0, default: 0 },
      refundedTotal: { type: Number, min: 0, default: 0 },
      netRevenue: { type: Number, default: 0 },
    },
    publishedAt: Date,
    pausedAt: Date,
    cancelledAt: Date,
    archivedAt: Date,
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "sold_out",
        "finished",
        "closed",
        "cancelled",
        "archived",
      ],
      default: "draft",
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    allowFreeTickets: { type: Boolean, default: true },
    paymentConfig: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["mercado_pago", "manual", "none"],
        default: "none",
      },
      reservationMinutes: { type: Number, min: 1, max: 120, default: 20 },
      feePayer: {
        type: String,
        enum: ["organizer", "buyer"],
        default: "organizer",
      },
    },
    qrConfig: {
      allowReentry: { type: Boolean, default: false },
      maxAccesses: { type: Number, min: 1, default: 1 },
      validFrom: Date,
      validUntil: Date,
      allowRevert: { type: Boolean, default: true },
    },
    ...audit,
  },
  { timestamps: true },
);

const ticketTypeSchema = new Schema(
  {
    publicationId: {
      type: objectId,
      ref: "TicketPublication",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: String,
    price: { type: Number, min: 0, required: true },
    promotionalPrice: { type: Number, min: 0 },
    promotionalStartsAt: Date,
    promotionalEndsAt: Date,
    currency: { type: String, default: "ARS" },
    capacity: { type: Number, min: 0, required: true },
    reservedCount: { type: Number, min: 0, default: 0 },
    soldCount: { type: Number, min: 0, default: 0 },
    maxPerOrder: { type: Number, min: 1, default: 10 },
    minPerOrder: { type: Number, min: 1, default: 1 },
    salesOpenAt: Date,
    salesCloseAt: Date,
    status: {
      type: String,
      enum: ["active", "paused", "sold_out", "hidden", "inactive"],
      default: "active",
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    color: String,
    benefits: { type: [String], default: [] },
    isFree: Boolean,
    isCourtesy: Boolean,
    attendeeFields: [String],
    ...audit,
  },
  { timestamps: true },
);
ticketTypeSchema.index(
  { publicationId: 1, name: 1, deletedAt: 1 },
  { unique: true },
);

const lineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    ticketTypeId: { type: objectId, ref: "TicketType", required: true },
    name: String,
    unitPrice: Number,
    quantity: Number,
    subtotal: Number,
  },
  { _id: false },
);
const orderSchema = new Schema(
  {
    publicationId: {
      type: objectId,
      ref: "TicketPublication",
      required: true,
      index: true,
    },
    publicId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true },
    buyer: {
      name: { type: String, required: true },
      firstName: String,
      lastName: String,
      email: { type: String, required: true },
      phone: String,
      documentNumber: String,
      address: {
        street: String,
        number: String,
        floor: String,
        apartment: String,
        locality: String,
        province: String,
        postalCode: String,
        country: String,
      },
    },
    lines: { type: [lineSchema], required: true },
    subtotal: { type: Number, min: 0, required: true },
    discounts: { type: Number, min: 0, default: 0 },
    fee: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, required: true },
    currency: { type: String, default: "ARS" },
    status: {
      type: String,
      enum: [
        "pending",
        "payment_pending",
        "paid",
        "expired",
        "cancelled",
        "refunded",
        "partially_refunded",
        "failed",
      ],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "manual_paid", "refunded", "failed"],
      default: "pending",
    },
    paymentMethod: String,
    paymentReference: String,
    providerPaymentId: String,
    expiresAt: { type: Date, index: true },
    paidAt: Date,
    cancelledAt: Date,
    notes: [
      {
        body: String,
        createdBy: { type: objectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    channel: { type: String, default: "public" },
    ticketsIssuedAt: Date,
    lastTicketsEmailAt: Date,
    ...audit,
  },
  { timestamps: true },
);
orderSchema.index({ publicationId: 1, idempotencyKey: 1 }, { unique: true });

const ticketSchema = new Schema(
  {
    publicationId: {
      type: objectId,
      ref: "TicketPublication",
      required: true,
      index: true,
    },
    orderId: {
      type: objectId,
      ref: "TicketOrder",
      required: true,
      index: true,
    },
    ticketTypeId: {
      type: objectId,
      ref: "TicketType",
      required: true,
      index: true,
    },
    orderLineId: { type: String, required: true },
    unitIndex: { type: Number, required: true },
    ticketCode: { type: String, required: true, unique: true, index: true },
    qrTokenHash: { type: String, required: true, unique: true, index: true },
    qrVersion: { type: Number, default: 1 },
    publicToken: { type: String, unique: true, sparse: true, index: true },
    qrPayload: String,
    ticketTypeSnapshot: {
      name: String,
      description: String,
      unitPrice: Number,
      benefits: [String],
    },
    holder: {
      firstName: String,
      lastName: String,
      dni: String,
      email: String,
      phone: String,
    },
    attendeeName: String,
    attendeeEmail: String,
    attendeeDocument: String,
    status: {
      type: String,
      enum: [
        "issued",
        "checked_in",
        "cancelled",
        "refunded",
        "expired",
        "transferred",
      ],
      default: "issued",
      index: true,
    },
    issuedAt: Date,
    checkedInAt: Date,
    checkedInBy: { type: objectId, ref: "User" },
    validatedAt: Date,
    accessCount: { type: Number, default: 0 },
    validatedByUserId: { type: objectId, ref: "User" },
    accessPoint: String,
    ...audit,
  },
  { timestamps: true },
);
const accessSchema = new Schema(
  {
    ticketId: { type: objectId, ref: "DigitalTicket", index: true },
    publicationId: {
      type: objectId,
      ref: "TicketPublication",
      required: true,
      index: true,
    },
    operatorUserId: { type: objectId, ref: "User", index: true },
    action: {
      type: String,
      enum: ["validate", "check_in", "revert"],
      required: true,
    },
    result: {
      type: String,
      enum: [
        "valid",
        "already_checked_in",
        "cancelled",
        "refunded",
        "expired",
        "wrong_publication",
        "invalid",
        "accepted",
        "reverted",
      ],
      required: true,
    },
    accessPoint: String,
    idempotencyKey: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ticketSchema.index(
  { orderId: 1, orderLineId: 1, unitIndex: 1 },
  { unique: true },
);
accessSchema.index(
  { ticketId: 1, action: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
const deliverySchema = new Schema(
  {
    orderId: {
      type: objectId,
      ref: "TicketOrder",
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ["email", "manual_download", "admin_resend"],
      required: true,
    },
    destinationMasked: String,
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
      index: true,
    },
    provider: String,
    providerMessageId: String,
    attemptNumber: { type: Number, required: true },
    errorCode: String,
    errorMessage: String,
    requestedBy: { type: objectId, ref: "User" },
    sentAt: Date,
  },
  { timestamps: true },
);

const paymentIntegrationSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["mercado_pago"],
      unique: true,
      required: true,
    },
    credentialMode: { type: String, enum: ["oauth", "manual"], required: true },
    environment: {
      type: String,
      enum: ["test", "production"],
      default: "test",
    },
    status: {
      type: String,
      enum: ["not_configured", "connected", "invalid", "disconnected", "error"],
      default: "not_configured",
    },
    accountId: String,
    accountEmailMasked: String,
    publicKey: String,
    encryptedAccessToken: { type: String, select: false },
    encryptedRefreshToken: { type: String, select: false },
    encryptedWebhookSecret: { type: String, select: false },
    tokenExpiresAt: Date,
    webhookUrl: String,
    lastWebhookAt: Date,
    lastValidatedAt: Date,
    lastErrorCode: String,
    lastErrorMessage: String,
    connectedBy: { type: objectId, ref: "User" },
    connectedAt: Date,
    ...audit,
  },
  { timestamps: true },
);
const paymentSchema = new Schema(
  {
    orderId: {
      type: objectId,
      ref: "TicketOrder",
      required: true,
      unique: true,
      index: true,
    },
    provider: { type: String, enum: ["mock", "mercado_pago"], required: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    providerPreferenceId: String,
    checkoutUrl: String,
    status: {
      type: String,
      enum: [
        "created",
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "expired",
        "refunded",
        "partially_refunded",
        "chargeback",
      ],
      default: "created",
      index: true,
    },
    statusDetail: String,
    amount: { type: Number, min: 0, required: true },
    currency: { type: String, default: "ARS" },
    paymentMethodId: String,
    paymentTypeId: String,
    installments: Number,
    payerEmailMasked: String,
    rawSnapshot: Schema.Types.Mixed,
    approvedAt: Date,
    lastSynchronizedAt: Date,
    ...audit,
  },
  { timestamps: true },
);
const reservationSchema = new Schema(
  {
    publicationId: {
      type: objectId,
      ref: "TicketPublication",
      required: true,
      index: true,
    },
    orderId: {
      type: objectId,
      ref: "TicketOrder",
      required: true,
      unique: true,
      index: true,
    },
    items: [
      {
        ticketTypeId: { type: objectId, ref: "TicketType", required: true },
        quantity: { type: Number, min: 1, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["active", "converted", "released", "expired"],
      default: "active",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    ...audit,
  },
  { timestamps: true },
);
const discountSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      required: true,
    },
    value: { type: Number, min: 0, required: true },
    publicationIds: [{ type: objectId, ref: "TicketPublication" }],
    ticketTypeIds: [{ type: objectId, ref: "TicketType" }],
    startsAt: Date,
    endsAt: Date,
    maxUses: Number,
    maxUsesPerBuyer: Number,
    minimumOrderAmount: Number,
    minimumTicketQuantity: Number,
    active: { type: Boolean, default: true },
    totalUses: { type: Number, default: 0 },
    ...audit,
  },
  { timestamps: true },
);
const refundSchema = new Schema(
  {
    orderId: {
      type: objectId,
      ref: "TicketOrder",
      required: true,
      index: true,
    },
    paymentId: {
      type: objectId,
      ref: "TicketPayment",
      required: true,
      index: true,
    },
    provider: { type: String, enum: ["mercado_pago"], required: true },
    providerRefundId: String,
    type: { type: String, enum: ["full", "partial"], required: true },
    status: {
      type: String,
      enum: ["requested", "processing", "approved", "rejected", "failed"],
      default: "requested",
      index: true,
    },
    amount: { type: Number, min: 0, required: true },
    ticketIds: [{ type: objectId, ref: "DigitalTicket" }],
    reason: { type: String, required: true },
    internalNotes: String,
    idempotencyKey: { type: String, required: true, unique: true },
    requestedBy: { type: objectId, ref: "User", required: true },
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
    providerStatus: String,
    errorCode: String,
    errorMessage: String,
  },
  { timestamps: true },
);
const webhookSchema = new Schema(
  {
    provider: { type: String, enum: ["mercado_pago"], required: true },
    providerEventId: { type: String, index: true, sparse: true },
    topic: String,
    resourceId: String,
    signatureValid: { type: Boolean, required: true },
    processingStatus: {
      type: String,
      enum: ["received", "processed", "ignored", "failed"],
      default: "received",
    },
    attempts: { type: Number, default: 0 },
    payloadSummary: Schema.Types.Mixed,
    processedAt: Date,
    errorCode: String,
    errorMessage: String,
  },
  { timestamps: true },
);
webhookSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, sparse: true },
);

export const TicketPublication =
  models.TicketPublication || model("TicketPublication", publicationSchema);
export const TicketType =
  models.TicketType || model("TicketType", ticketTypeSchema);
export const TicketOrder =
  models.TicketOrder || model("TicketOrder", orderSchema);
export const DigitalTicket =
  models.DigitalTicket || model("DigitalTicket", ticketSchema);
export const TicketAccessAttempt =
  models.TicketAccessAttempt || model("TicketAccessAttempt", accessSchema);
export const TicketDelivery =
  models.TicketDelivery || model("TicketDelivery", deliverySchema);
export const TicketPaymentIntegration =
  models.TicketPaymentIntegration ||
  model("TicketPaymentIntegration", paymentIntegrationSchema);
export const TicketPayment =
  models.TicketPayment || model("TicketPayment", paymentSchema);
export const TicketStockReservation =
  models.TicketStockReservation ||
  model("TicketStockReservation", reservationSchema);
export const TicketDiscount =
  models.TicketDiscount || model("TicketDiscount", discountSchema);
export const TicketRefund =
  models.TicketRefund || model("TicketRefund", refundSchema);
export const TicketPaymentWebhook =
  models.TicketPaymentWebhook || model("TicketPaymentWebhook", webhookSchema);

export async function dropLegacyTicketTypeSaleIndex() {
  try {
    const indexes = await TicketType.collection.indexes();
    const legacy = indexes.find(
      (index) => index.name === "saleId_1_name_1_deletedAt_1",
    );
    if (legacy?.name) await TicketType.collection.dropIndex(legacy.name);
  } catch (error: any) {
    if (error?.codeName !== "NamespaceNotFound") throw error;
  }
}
