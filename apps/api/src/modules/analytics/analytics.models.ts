import { Schema, model, models } from 'mongoose';

export const analyticsEventNames = [
  'session_start', 'page_view', 'section_view', 'section_engagement', 'scroll_depth', 'click', 'cta_click',
  'whatsapp_click', 'phone_click', 'map_click', 'social_click', 'gallery_open', 'gallery_navigation',
  'form_start', 'form_field_interaction', 'form_submit', 'form_success', 'form_error',
  'promotion_view', 'promotion_click', 'salon_view', 'package_view',
] as const;

const analyticsEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  anonymousVisitorId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  attributionId: { type: String, required: true, index: true },
  eventName: { type: String, enum: analyticsEventNames, required: true, index: true },
  pagePath: { type: String, required: true, index: true },
  pageTitle: String,
  referrer: String,
  utmSource: { type: String, index: true }, utmMedium: String, utmCampaign: { type: String, index: true }, utmContent: String, utmTerm: String,
  deviceType: { type: String, enum: ['desktop', 'tablet', 'mobile', 'unknown'], index: true },
  browserFamily: String, operatingSystem: String, viewportWidth: Number, viewportHeight: Number, language: String, timezone: String,
  sectionId: { type: String, index: true }, elementId: { type: String, index: true },
  normalizedX: { type: Number, min: 0, max: 1 }, normalizedY: { type: Number, min: 0, max: 1 },
  scrollDepth: { type: Number, min: 0, max: 100 }, durationMs: { type: Number, min: 0, max: 3_600_000 },
  entityId: String,
  occurredAt: { type: Date, required: true, index: true },
  receivedAt: { type: Date, default: Date.now },
  pageVersion: { type: String, required: true, index: true },
  requestHash: String,
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: false });
analyticsEventSchema.index({ occurredAt: -1, eventName: 1, pagePath: 1 });
analyticsEventSchema.index({ pageVersion: 1, deviceType: 1, sectionId: 1, occurredAt: -1 });

const analyticsSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  anonymousVisitorId: { type: String, required: true, index: true },
  attributionId: { type: String, required: true, index: true },
  startedAt: { type: Date, required: true, index: true },
  lastActivityAt: { type: Date, required: true, index: true },
  pageViews: { type: Number, default: 0 },
  eventCount: { type: Number, default: 0 },
  entryPage: String, exitPage: String, source: { type: String, index: true }, medium: String, campaign: { type: String, index: true },
  deviceType: { type: String, index: true }, browserFamily: String, operatingSystem: String,
  converted: { type: Boolean, default: false, index: true }, convertedAt: Date,
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
analyticsSessionSchema.index({ startedAt: -1, deviceType: 1, source: 1 });

const analyticsDailyAggregateSchema = new Schema({
  dateKey: { type: String, required: true, index: true },
  pagePath: { type: String, required: true },
  pageVersion: { type: String, required: true },
  eventCounts: { type: Map, of: Number, default: {} },
  totalEvents: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });
analyticsDailyAggregateSchema.index({ dateKey: 1, pagePath: 1, pageVersion: 1 }, { unique: true });

const analyticsSectionAggregateSchema = new Schema({
  dateKey: { type: String, required: true, index: true },
  pagePath: { type: String, required: true },
  pageVersion: { type: String, required: true },
  sectionId: { type: String, required: true, index: true },
  deviceType: { type: String, required: true },
  source: { type: String, default: 'direct' },
  views: { type: Number, default: 0 }, interactions: { type: Number, default: 0 }, clicks: { type: Number, default: 0 },
  engagementMs: { type: Number, default: 0 }, conversionsAfter: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });
analyticsSectionAggregateSchema.index({ dateKey: 1, pagePath: 1, pageVersion: 1, sectionId: 1, deviceType: 1, source: 1 }, { unique: true });

const analyticsSettingsSchema = new Schema({
  key: { type: String, default: 'default', unique: true },
  enabled: { type: Boolean, default: true },
  consentRequired: { type: Boolean, default: true },
  retentionDays: { type: Number, min: 7, max: 730, default: 180 },
  collectClicks: { type: Boolean, default: true },
  collectSectionEngagement: { type: Boolean, default: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const AnalyticsEvent = models.AnalyticsEvent || model('AnalyticsEvent', analyticsEventSchema);
export const AnalyticsSession = models.AnalyticsSession || model('AnalyticsSession', analyticsSessionSchema);
export const AnalyticsDailyAggregate = models.AnalyticsDailyAggregate || model('AnalyticsDailyAggregate', analyticsDailyAggregateSchema);
export const AnalyticsSectionAggregate = models.AnalyticsSectionAggregate || model('AnalyticsSectionAggregate', analyticsSectionAggregateSchema);
export const AnalyticsSettings = models.AnalyticsSettings || model('AnalyticsSettings', analyticsSettingsSchema);
