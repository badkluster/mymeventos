import { createHash } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { parseReportPeriod } from '../reporting/report-filter';
import { QuoteRequest, Quote, Event } from '../crm/crm.models';
import { AnalyticsDailyAggregate, AnalyticsEvent, AnalyticsSectionAggregate, AnalyticsSession, AnalyticsSettings, analyticsEventNames } from './analytics.models';
import { writeAuditLog } from '../audit/audit.service';

const adminRouter = Router();
const publicRouter = Router();
const safeId = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const shortText = z.string().trim().max(240).optional().or(z.literal(''));
const collectEvent = z.object({
  eventId: safeId, anonymousVisitorId: safeId, sessionId: safeId, attributionId: safeId,
  eventName: z.enum(analyticsEventNames), pagePath: z.string().trim().min(1).max(300).startsWith('/'), pageTitle: shortText,
  referrer: z.string().trim().max(500).optional().or(z.literal('')), utmSource: shortText, utmMedium: shortText, utmCampaign: shortText, utmContent: shortText, utmTerm: shortText,
  deviceType: z.enum(['desktop', 'tablet', 'mobile', 'unknown']), browserFamily: shortText, operatingSystem: shortText,
  viewportWidth: z.number().int().min(0).max(10_000), viewportHeight: z.number().int().min(0).max(10_000),
  language: z.string().trim().max(40).optional(), timezone: z.string().trim().max(100).optional(),
  sectionId: safeId.optional(), elementId: safeId.optional(), normalizedX: z.number().min(0).max(1).optional(), normalizedY: z.number().min(0).max(1).optional(),
  scrollDepth: z.number().min(0).max(100).optional(), durationMs: z.number().int().min(0).max(3_600_000).optional(),
  entityId: safeId.optional(), occurredAt: z.coerce.date(), pageVersion: safeId,
}).strict();
const collectSchema = z.object({ body: z.object({ events: z.array(collectEvent).min(1).max(50) }).strict(), params: z.object({}), query: z.object({}) });

function dateKey(date: Date) {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function isBot(userAgent: string) {
  return /bot|crawler|spider|headless|lighthouse|pagespeed|preview/i.test(userAgent);
}
function requestHash(ip: string, occurredAt: Date) {
  return createHash('sha256').update(`${dateKey(occurredAt)}:${ip}:${env.ACCESS_TOKEN_SECRET}`).digest('hex').slice(0, 24);
}
async function settings() {
  return AnalyticsSettings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { enabled: true, consentRequired: true, retentionDays: 180, collectClicks: true, collectSectionEngagement: true } }, { upsert: true, new: true }).lean();
}

publicRouter.get('/settings', asyncHandler(async (_request, response) => {
  const current: any = await settings();
  return sendSuccess(response, { enabled: current.enabled, consentRequired: current.consentRequired, collectClicks: current.collectClicks, collectSectionEngagement: current.collectSectionEngagement });
}));
publicRouter.post('/collect', validateRequest(collectSchema), asyncHandler(async (request, response) => {
  const current: any = await settings();
  if (!current.enabled || isBot(request.get('user-agent') || '')) return sendSuccess(response, { accepted: 0 });
  const expiresAt = new Date(Date.now() + Number(current.retentionDays || 180) * 86_400_000);
  const accepted: any[] = [];
  for (const event of request.body.events) {
    if (!current.collectClicks && ['click', 'cta_click', 'whatsapp_click', 'phone_click', 'map_click', 'social_click'].includes(event.eventName)) continue;
    if (!current.collectSectionEngagement && ['section_view', 'section_engagement'].includes(event.eventName)) continue;
    const result = await AnalyticsEvent.updateOne({ eventId: event.eventId }, { $setOnInsert: { ...event, requestHash: requestHash(request.ip || '', event.occurredAt), receivedAt: new Date(), expiresAt } }, { upsert: true });
    if (result.upsertedCount) accepted.push(event);
  }
  if (!accepted.length) return sendSuccess(response, { accepted: 0 });
  const sessionGroups = new Map<string, any[]>();
  for (const event of accepted) sessionGroups.set(event.sessionId, [...(sessionGroups.get(event.sessionId) ?? []), event]);
  await Promise.all([...sessionGroups.entries()].map(async ([sessionId, events]) => {
    const ordered = events.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    const first = ordered[0]; const last = ordered[ordered.length - 1]; const converted = events.some((event) => event.eventName === 'form_success');
    await AnalyticsSession.updateOne({ sessionId }, {
      $setOnInsert: { sessionId, anonymousVisitorId: first.anonymousVisitorId, attributionId: first.attributionId, startedAt: first.occurredAt, entryPage: first.pagePath, source: first.utmSource || (first.referrer ? 'referral' : 'direct'), medium: first.utmMedium, campaign: first.utmCampaign, deviceType: first.deviceType, browserFamily: first.browserFamily, operatingSystem: first.operatingSystem },
      $set: { lastActivityAt: last.occurredAt, exitPage: last.pagePath, expiresAt, ...(converted ? { converted: true, convertedAt: last.occurredAt } : {}) },
      $inc: { pageViews: events.filter((event) => event.eventName === 'page_view').length, eventCount: events.length },
    }, { upsert: true });
  }));
  for (const event of accepted) {
    await AnalyticsDailyAggregate.updateOne({ dateKey: dateKey(event.occurredAt), pagePath: event.pagePath, pageVersion: event.pageVersion }, { $inc: { [`eventCounts.${event.eventName}`]: 1, totalEvents: 1 }, $set: { updatedAt: new Date() } }, { upsert: true });
    if (event.sectionId) {
      const increments: Record<string, number> = {};
      if (event.eventName === 'section_view') increments.views = 1;
      if (event.eventName === 'section_engagement') increments.engagementMs = event.durationMs || 0;
      if (['click', 'cta_click', 'whatsapp_click', 'phone_click', 'map_click', 'social_click'].includes(event.eventName)) increments.clicks = 1;
      if (event.eventName === 'form_success') increments.conversionsAfter = 1;
      if (Object.keys(increments).length) await AnalyticsSectionAggregate.updateOne({ dateKey: dateKey(event.occurredAt), pagePath: event.pagePath, pageVersion: event.pageVersion, sectionId: event.sectionId, deviceType: event.deviceType, source: event.utmSource || 'direct' }, { $inc: increments, $set: { updatedAt: new Date() } }, { upsert: true });
    }
  }
  return sendSuccess(response, { accepted: accepted.length });
}));

adminRouter.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));
adminRouter.get('/summary', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const match: any = { startedAt: { $gte: period.from, $lt: period.toExclusive } };
  if (request.query.deviceType) match.deviceType = String(request.query.deviceType);
  if (request.query.source) match.source = String(request.query.source);
  const [sessionTotals, visitors, sources, devices, eventCounts, scroll, visitorFrequency] = await Promise.all([
    AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: null, sessions: { $sum: 1 }, pageViews: { $sum: '$pageViews' }, durationMs: { $sum: { $subtract: ['$lastActivityAt', '$startedAt'] } }, bounces: { $sum: { $cond: [{ $and: [{ $lte: ['$pageViews', 1] }, { $eq: ['$converted', false] }] }, 1, 0] } }, conversions: { $sum: { $cond: ['$converted', 1, 0] } } } }]),
    AnalyticsSession.distinct('anonymousVisitorId', match),
    AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$source', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$deviceType', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    AnalyticsEvent.aggregate([{ $match: { occurredAt: { $gte: period.from, $lt: period.toExclusive } } }, { $group: { _id: '$eventName', value: { $sum: 1 } } }]),
    AnalyticsEvent.aggregate([{ $match: { occurredAt: { $gte: period.from, $lt: period.toExclusive }, eventName: 'scroll_depth' } }, { $group: { _id: null, average: { $avg: '$scrollDepth' } } }]),
    AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$anonymousVisitorId', sessions: { $sum: 1 } } }, { $group: { _id: null, newVisitors: { $sum: { $cond: [{ $eq: ['$sessions', 1] }, 1, 0] } }, recurrentVisitors: { $sum: { $cond: [{ $gt: ['$sessions', 1] }, 1, 0] } } } }]),
  ]);
  const totals = sessionTotals[0] ?? { sessions: 0, pageViews: 0, durationMs: 0, bounces: 0, conversions: 0 };
  const events = new Map(eventCounts.map((item: any) => [item._id, item.value]));
  const attributionIds = await AnalyticsSession.distinct('attributionId', match);
  const quoteRequests: any[] = await QuoteRequest.find({
    'originalPayload.attributionId': { $in: attributionIds },
    createdAt: { $gte: period.from, $lt: period.toExclusive },
    deletedAt: null,
  })
    .select('convertedQuoteIds interestedSalonIds interestedPackageName')
    .populate('interestedSalonIds', 'name publicTitle')
    .lean();
  const quoteIds = quoteRequests.flatMap((item) => item.convertedQuoteIds ?? []);
  const [quotesCreated, quotesAccepted, confirmedEvents, packageViews] = await Promise.all([
    Quote.countDocuments({ _id: { $in: quoteIds }, deletedAt: null }),
    Quote.countDocuments({ _id: { $in: quoteIds }, deletedAt: null, status: { $in: ['accepted', 'converted'] } }),
    Event.countDocuments({ sourceQuoteId: { $in: quoteIds }, deletedAt: null, status: 'confirmed' }),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: period.from, $lt: period.toExclusive }, eventName: 'package_view' } },
      { $group: { _id: { $ifNull: ['$elementId', 'Sin identificar'] }, value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: 10 },
    ]),
  ]);
  const salonConsultationMap = new Map<string, number>();
  for (const quoteRequest of quoteRequests) {
    for (const salon of quoteRequest.interestedSalonIds ?? []) {
      const name = String(salon?.publicTitle || salon?.name || 'Sin identificar');
      salonConsultationMap.set(name, (salonConsultationMap.get(name) ?? 0) + 1);
    }
  }
  const salonConsultations = [...salonConsultationMap.entries()]
    .map(([_id, value]) => ({ _id, value }))
    .sort((left, right) => right.value - left.value);
  return sendSuccess(response, {
    metrics: {
      visitors: visitors.length, sessions: totals.sessions, pageViews: totals.pageViews, pagesPerSession: totals.sessions ? totals.pageViews / totals.sessions : 0,
      averageDurationSeconds: totals.sessions ? totals.durationMs / totals.sessions / 1000 : 0, bounceRate: totals.sessions ? (totals.bounces / totals.sessions) * 100 : 0,
      conversions: totals.conversions, conversionRate: totals.sessions ? (totals.conversions / totals.sessions) * 100 : 0,
      newVisitors: visitorFrequency[0]?.newVisitors ?? 0, recurrentVisitors: visitorFrequency[0]?.recurrentVisitors ?? 0,
      formStarts: events.get('form_start') ?? 0, formSuccess: events.get('form_success') ?? 0, formErrors: events.get('form_error') ?? 0,
      whatsappClicks: events.get('whatsapp_click') ?? 0, phoneClicks: events.get('phone_click') ?? 0, mapClicks: events.get('map_click') ?? 0,
      averageScrollDepth: scroll[0]?.average ?? 0,
    },
    funnel: [
      { id: 'landing', label: 'Visitas al sitio', value: totals.sessions },
      { id: 'sections', label: 'Secciones vistas', value: events.get('section_view') ?? 0 },
      { id: 'cta', label: 'Botones de acción', value: events.get('cta_click') ?? 0 },
      { id: 'formStart', label: 'Formulario iniciado', value: events.get('form_start') ?? 0 },
      { id: 'lead', label: 'Consulta enviada', value: events.get('form_success') ?? 0 },
      { id: 'quote', label: 'Presupuesto creado', value: quotesCreated },
      { id: 'accepted', label: 'Presupuesto aceptado', value: quotesAccepted },
      { id: 'event', label: 'Evento confirmado', value: confirmedEvents },
    ],
    breakdowns: {
      sources,
      devices,
      salonConsultations,
      packageViews: packageViews.map((item: any) => ({ _id: item._id, value: item.value })),
    },
    period: { from: period.fromDate, to: period.toDate },
  });
}));
adminRouter.get('/sections', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const query: any = { dateKey: { $gte: period.fromDate, $lte: period.toDate } };
  if (request.query.pagePath) query.pagePath = String(request.query.pagePath);
  if (request.query.pageVersion) query.pageVersion = String(request.query.pageVersion);
  if (request.query.deviceType) query.deviceType = String(request.query.deviceType);
  if (request.query.source) query.source = String(request.query.source);
  const items = await AnalyticsSectionAggregate.aggregate([{ $match: query }, { $group: { _id: '$sectionId', views: { $sum: '$views' }, clicks: { $sum: '$clicks' }, engagementMs: { $sum: '$engagementMs' }, conversionsAfter: { $sum: '$conversionsAfter' } } }, { $sort: { views: -1 } }]);
  const sessions = await AnalyticsSession.countDocuments({ startedAt: { $gte: period.from, $lt: period.toExclusive } });
  return sendSuccess(response, { items: items.map((item) => ({ sectionId: item._id, views: item.views, clicks: item.clicks, averageEngagementSeconds: item.views ? item.engagementMs / item.views / 1000 : 0, reachPercentage: sessions ? (item.views / sessions) * 100 : 0, conversionsAfter: item.conversionsAfter })) });
}));
adminRouter.get('/heatmap', requirePermission(Permission.ANALYTICS_HEATMAP_VIEW), asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const match: any = { occurredAt: { $gte: period.from, $lt: period.toExclusive }, eventName: { $in: ['click', 'cta_click', 'whatsapp_click', 'phone_click', 'map_click', 'social_click'] } };
  if (request.query.pagePath) match.pagePath = String(request.query.pagePath);
  if (request.query.pageVersion) match.pageVersion = String(request.query.pageVersion);
  if (request.query.deviceType) match.deviceType = String(request.query.deviceType);
  if (request.query.source) match.utmSource = String(request.query.source);
  const [sections, elements, versions] = await Promise.all([
    AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$sectionId', 'unidentified'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$elementId', 'unidentified'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 100 }]),
    AnalyticsEvent.distinct('pageVersion', { occurredAt: { $gte: period.from, $lt: period.toExclusive } }),
  ]);
  return sendSuccess(response, { sections: sections.map((item) => ({ id: item._id, value: item.value })), elements: elements.map((item) => ({ id: item._id, value: item.value })), versions });
}));
adminRouter.get('/settings', requirePermission(Permission.ANALYTICS_SETTINGS_MANAGE), asyncHandler(async (_request, response) => sendSuccess(response, { settings: await settings() })));
adminRouter.patch('/settings', requirePermission(Permission.ANALYTICS_SETTINGS_MANAGE), validateRequest(z.object({ body: z.object({ enabled: z.boolean().optional(), consentRequired: z.boolean().optional(), retentionDays: z.coerce.number().int().min(7).max(730).optional(), collectClicks: z.boolean().optional(), collectSectionEngagement: z.boolean().optional() }).refine((body) => Object.keys(body).length > 0), params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const updated = await AnalyticsSettings.findOneAndUpdate({ key: 'default' }, { ...request.body, updatedBy: request.user!.id }, { upsert: true, new: true, runValidators: true });
  await writeAuditLog(request, 'ANALYTICS_SETTINGS_UPDATE', 'AnalyticsSettings', updated._id.toString(), request.body);
  return sendSuccess(response, { settings: updated });
}));
adminRouter.delete('/visitor/:id', requirePermission(Permission.ANALYTICS_SETTINGS_MANAGE), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: safeId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const sessions = await AnalyticsSession.find({ anonymousVisitorId: request.params.id }).select('sessionId').lean();
  const result = await AnalyticsEvent.deleteMany({ anonymousVisitorId: request.params.id });
  await AnalyticsSession.deleteMany({ anonymousVisitorId: request.params.id });
  await writeAuditLog(request, 'ANALYTICS_VISITOR_DELETE', 'AnalyticsVisitor', request.params.id, { sessions: sessions.length, events: result.deletedCount });
  return sendSuccess(response, { deleted: true, sessions: sessions.length, events: result.deletedCount });
}));

export { publicRouter as publicAnalyticsRoutes };
export default adminRouter;
