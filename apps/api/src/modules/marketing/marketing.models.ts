import { Schema, model, models } from 'mongoose';
import {
  MARKETING_AUDIENCE_SOURCES,
  MARKETING_CAMPAIGN_STATUSES,
  MARKETING_RECIPIENT_STATUSES,
  MARKETING_SEND_LOG_STATUSES,
  MARKETING_TEMPLATE_CATEGORIES,
  MARKETING_UNSUBSCRIBE_REASONS,
  PROMOTION_DISCOUNT_TYPES
} from '@mym/shared';

const auditBase = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
};

// ---------------------------------------------------------------------------
// Institutional settings — brand identity reused across every campaign/template.
// Reuses LandingSettings/Salon for contact channels (phone/whatsapp/instagram/
// address) instead of duplicating them here; only email-sending-specific and
// visual-identity fields (not modeled anywhere else) live on this document.
// ---------------------------------------------------------------------------
const marketingSettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    companyName: { type: String, default: 'M&M Eventos' },
    logoUrl: String,
    logoAlternativeUrl: String,
    primaryColor: { type: String, default: '#111827' },
    secondaryColor: { type: String, default: '#F59E0B' },
    buttonColor: { type: String, default: '#111827' },
    backgroundColor: { type: String, default: '#F4F4F5' },
    fontFamily: { type: String, default: 'Arial, Helvetica, sans-serif' },
    senderName: { type: String, default: 'M&M Eventos' },
    senderEmail: String,
    replyToEmail: String,
    legalFooterText: {
      type: String,
      default: 'M&M Eventos. Recibiste este correo porque nos dejaste tus datos de contacto.'
    },
    defaultImageUrl: String,
    ...auditBase
  },
  { timestamps: true }
);

export const MarketingSettings = models.MarketingSettings || model('MarketingSettings', marketingSettingsSchema);

// ---------------------------------------------------------------------------
// Template — reusable email design (block-based content JSON + rendered output).
// ---------------------------------------------------------------------------
const marketingTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: String,
    category: { type: String, enum: MARKETING_TEMPLATE_CATEGORIES, default: 'blank', index: true },
    thumbnailUrl: String,
    subject: { type: String, trim: true },
    preheader: String,
    contentJson: { type: Schema.Types.Mixed, required: true },
    renderedHtml: String,
    renderedText: String,
    isSystemTemplate: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
    version: { type: Number, default: 1 },
    tags: { type: [String], default: [] },
    ...auditBase
  },
  { timestamps: true }
);
marketingTemplateSchema.index({ isActive: 1, category: 1 });

export const MarketingTemplate = models.MarketingTemplate || model('MarketingTemplate', marketingTemplateSchema);

// ---------------------------------------------------------------------------
// Promotion — internal or public discount/benefit definition.
// ---------------------------------------------------------------------------
const promotionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    internalDescription: String,
    publicTitle: String,
    publicDescription: String,
    code: { type: String, trim: true, uppercase: true },
    discountType: { type: String, enum: PROMOTION_DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, default: 0 },
    minimumAmount: Number,
    maximumDiscount: Number,
    validFrom: Date,
    validUntil: Date,
    usageLimit: Number,
    usageLimitPerCustomer: Number,
    usedCount: { type: Number, default: 0 },
    applicableSalonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
    applicablePackageIds: { type: [{ type: Schema.Types.ObjectId, ref: 'PackageTemplate' }], default: [] },
    applicableServiceIds: { type: [Schema.Types.ObjectId], default: [] },
    eventTypes: { type: [String], default: [] },
    isPublic: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    archivedAt: { type: Date, default: null, index: true },
    termsAndConditions: String,
    bannerImageUrl: String,
    buttonLabel: String,
    buttonUrl: String,
    ...auditBase
  },
  { timestamps: true }
);
promotionSchema.index({ code: 1 }, { unique: true, sparse: true });
promotionSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

export const Promotion = models.Promotion || model('Promotion', promotionSchema);

// ---------------------------------------------------------------------------
// Audience — reusable, filter-driven (dynamic) or manually curated (static)
// definition of who a campaign can be sent to.
// ---------------------------------------------------------------------------
const manualAudienceMemberSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    firstName: String,
    lastName: String,
    sourceType: { type: String, enum: MARKETING_AUDIENCE_SOURCES, default: 'manual' },
    sourceId: Schema.Types.ObjectId
  },
  { _id: false }
);

const audienceExclusionSchema = new Schema(
  {
    sourceType: { type: String, enum: MARKETING_AUDIENCE_SOURCES, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true }
  },
  { _id: false }
);

const marketingAudienceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: String,
    sourceTypes: { type: [{ type: String, enum: MARKETING_AUDIENCE_SOURCES }], required: true, default: [] },
    filters: { type: Schema.Types.Mixed, default: {} },
    manualRecipients: { type: [manualAudienceMemberSchema], default: [] },
    excludedMembers: { type: [audienceExclusionSchema], default: [] },
    estimatedCount: { type: Number, default: 0 },
    lastCalculatedAt: Date,
    salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
    isDynamic: { type: Boolean, default: true },
    ...auditBase
  },
  { timestamps: true }
);
marketingAudienceSchema.index({ salonId: 1, isDynamic: 1 });

export const MarketingAudience = models.MarketingAudience || model('MarketingAudience', marketingAudienceSchema);

// ---------------------------------------------------------------------------
// Campaign — the sendable unit. Freezes snapshots of template/promotion/
// audience/sender at prepare-time so later edits never alter campaign history.
// ---------------------------------------------------------------------------
const marketingCampaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    internalDescription: String,
    status: { type: String, enum: MARKETING_CAMPAIGN_STATUSES, default: 'draft', index: true },
    channel: { type: String, enum: ['email'], default: 'email' },
    subject: { type: String, trim: true },
    preheader: String,
    senderName: String,
    replyTo: String,
    templateId: { type: Schema.Types.ObjectId, ref: 'MarketingTemplate' },
    promotionId: { type: Schema.Types.ObjectId, ref: 'Promotion' },
    audienceId: { type: Schema.Types.ObjectId, ref: 'MarketingAudience' },
    excludedRecipientEmails: { type: [String], default: [] },
    salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
    scheduledAt: { type: Date, index: true },
    startedAt: Date,
    completedAt: Date,
    timezone: { type: String, default: 'America/Argentina/Buenos_Aires' },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancellationReason: String,

    contentJson: Schema.Types.Mixed,
    renderedHtml: String,
    renderedText: String,
    designVersion: { type: Number, default: 1 },

    estimatedRecipients: { type: Number, default: 0 },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    clickedCount: { type: Number, default: 0 },
    unsubscribedCount: { type: Number, default: 0 },

    templateSnapshot: Schema.Types.Mixed,
    promotionSnapshot: Schema.Types.Mixed,
    audienceSnapshot: Schema.Types.Mixed,
    senderSnapshot: Schema.Types.Mixed,

    trackingEnabled: { type: Boolean, default: true },
    openTrackingEnabled: { type: Boolean, default: true },
    clickTrackingEnabled: { type: Boolean, default: true },
    unsubscribeEnabled: { type: Boolean, default: true },
    batchSize: Number,
    sendRateLimit: Number,
    tags: { type: [String], default: [] },

    // Batch-processing coordination (Mongo-based lock, see marketing-campaign.service.ts).
    lockedAt: Date,
    lockedBy: String,
    lockExpiresAt: Date,
    nextAttemptAt: Date,
    attemptCount: { type: Number, default: 0 },

    ...auditBase
  },
  { timestamps: true }
);
marketingCampaignSchema.index({ status: 1, scheduledAt: 1 });
marketingCampaignSchema.index({ status: 1, nextAttemptAt: 1 });

export const MarketingCampaign = models.MarketingCampaign || model('MarketingCampaign', marketingCampaignSchema);

// ---------------------------------------------------------------------------
// Recipient — one row per (campaign, contact). The unit of send/track/retry.
// ---------------------------------------------------------------------------
const marketingRecipientSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'MarketingCampaign', required: true, index: true },
    sourceType: { type: String, enum: MARKETING_AUDIENCE_SOURCES, required: true },
    sourceId: Schema.Types.ObjectId,
    email: { type: String, required: true, trim: true },
    normalizedEmail: { type: String, required: true, index: true },
    firstName: String,
    lastName: String,
    fullName: String,
    salonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
    status: { type: String, enum: MARKETING_RECIPIENT_STATUSES, default: 'pending', index: true },
    providerMessageId: String,
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    failedAt: Date,
    failureReason: String,
    skipReason: String,
    unsubscribeToken: { type: String, index: true, sparse: true },
    personalizationData: Schema.Types.Mixed,
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: Date,
    lockedAt: Date,
    lockExpiresAt: Date
  },
  { timestamps: true }
);
marketingRecipientSchema.index({ campaignId: 1, normalizedEmail: 1 }, { unique: true });
marketingRecipientSchema.index({ campaignId: 1, status: 1 });
marketingRecipientSchema.index({ status: 1, lockExpiresAt: 1 });

export const MarketingRecipient = models.MarketingRecipient || model('MarketingRecipient', marketingRecipientSchema);

// ---------------------------------------------------------------------------
// Unsubscribe — cross-campaign suppression list. A normalized email present
// here and active is excluded from every future commercial campaign,
// regardless of which audience/source it originally came from.
// ---------------------------------------------------------------------------
const marketingUnsubscribeSchema = new Schema(
  {
    email: { type: String, required: true, trim: true },
    // Uniqueness (and the lookup index) is declared once below via schema.index()
    // — no `index: true` here, to avoid Mongoose's duplicate-index warning.
    normalizedEmail: { type: String, required: true },
    sourceType: { type: String, enum: MARKETING_AUDIENCE_SOURCES },
    sourceId: Schema.Types.ObjectId,
    reason: { type: String, enum: MARKETING_UNSUBSCRIBE_REASONS },
    reasonDetail: String,
    campaignId: { type: Schema.Types.ObjectId, ref: 'MarketingCampaign' },
    unsubscribedAt: { type: Date, default: Date.now },
    resubscribedAt: Date,
    isActive: { type: Boolean, default: true, index: true },
    metadata: Schema.Types.Mixed
  },
  { timestamps: true }
);
marketingUnsubscribeSchema.index({ normalizedEmail: 1 }, { unique: true });

export const MarketingUnsubscribe = models.MarketingUnsubscribe || model('MarketingUnsubscribe', marketingUnsubscribeSchema);

// ---------------------------------------------------------------------------
// Send log — technical attempt trail per recipient. Never stores provider
// secrets/credentials, only request/response metadata for diagnostics.
// ---------------------------------------------------------------------------
const marketingSendLogSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'MarketingCampaign', required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'MarketingRecipient', required: true, index: true },
    provider: { type: String, enum: ['mock', 'resend'], required: true },
    providerMessageId: String,
    attempt: { type: Number, required: true },
    status: { type: String, enum: MARKETING_SEND_LOG_STATUSES, required: true },
    requestMetadata: Schema.Types.Mixed,
    responseMetadata: Schema.Types.Mixed,
    errorCode: String,
    errorMessage: String
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
marketingSendLogSchema.index({ campaignId: 1, recipientId: 1 });

export const MarketingSendLog = models.MarketingSendLog || model('MarketingSendLog', marketingSendLogSchema);

// ---------------------------------------------------------------------------
// Webhook event — dedupe ledger for provider callbacks, mirroring the
// TicketPaymentWebhook pattern (unique provider+eventId, signature verified
// before any side effect).
// ---------------------------------------------------------------------------
const marketingWebhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ['resend'], required: true },
    providerEventId: { type: String, index: true, sparse: true },
    type: String,
    recipientEmail: String,
    campaignId: { type: Schema.Types.ObjectId, ref: 'MarketingCampaign' },
    recipientId: { type: Schema.Types.ObjectId, ref: 'MarketingRecipient' },
    signatureValid: { type: Boolean, required: true },
    processingStatus: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received' },
    attempts: { type: Number, default: 0 },
    payloadSummary: Schema.Types.Mixed,
    processedAt: Date,
    errorCode: String,
    errorMessage: String
  },
  { timestamps: true }
);
marketingWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true, sparse: true });

export const MarketingWebhookEvent = models.MarketingWebhookEvent || model('MarketingWebhookEvent', marketingWebhookEventSchema);
