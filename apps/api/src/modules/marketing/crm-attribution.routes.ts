import { Router } from 'express';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { AnalyticsSession } from '../analytics/analytics.models';
import { Contract, Event, Payment, Quote, QuoteRequest } from '../crm/crm.models';
import { Salon } from '../salons/salon.model';
import { parseReportPeriod, resolveReportScope } from '../reporting/report-filter';

const router = Router();
router.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));

type AttributionMethod = 'utm' | 'session' | 'crm_source' | 'unknown';
type AttributionIdentity = {
  source: string;
  medium: string | null;
  campaign: string | null;
  method: AttributionMethod;
  attributed: boolean;
};

type AggregateBucket = {
  key: string;
  source: string;
  medium: string | null;
  campaign?: string | null;
  requestIds: Set<string>;
  leadIds: Set<string>;
  quoteIds: Set<string>;
  acceptedQuoteIds: Set<string>;
  eventIds: Set<string>;
  bookedRevenue: number;
  collectedRevenue: number;
};

type SalonBucket = {
  salonId: string;
  name: string;
  requestIds: Set<string>;
  leadIds: Set<string>;
  quoteIds: Set<string>;
  acceptedQuoteIds: Set<string>;
  eventIds: Set<string>;
  bookedRevenue: number;
  collectedRevenue: number;
};

function idOf(value: unknown): string | null {
  if (!value) return null;
  const stringValue = typeof value === 'string' ? value : (value as any)?.toString?.();
  return stringValue ? String(stringValue) : null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function sourceLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    facebook: 'Facebook',
    fb: 'Facebook',
    instagram: 'Instagram',
    ig: 'Instagram',
    meta: 'Meta',
    google: 'Google',
    tiktok: 'TikTok',
    whatsapp: 'WhatsApp',
    phone: 'Teléfono',
    email: 'Email',
    referral: 'Referido',
    walk_in: 'Visita presencial',
    office: 'Oficina',
    direct: 'Directo / sin identificar',
    unknown: 'Desconocido',
  };
  return labels[normalized] ?? value;
}

function crmFallbackSource(source: unknown): string {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (['whatsapp', 'phone', 'office'].includes(normalized)) return normalized;
  return 'direct';
}

function sessionForRequest(sessions: any[], createdAt: Date): any | null {
  const tolerance = createdAt.getTime() + 5 * 60_000;
  return sessions.find((session) => {
    const startedAt = new Date(session.startedAt ?? 0).getTime();
    return startedAt > 0 && startedAt <= tolerance;
  }) ?? null;
}

function attributionForRequest(item: any, session: any | null): AttributionIdentity {
  const payload = item.originalPayload && typeof item.originalPayload === 'object' ? item.originalPayload : {};
  const payloadSource = text(payload.utmSource);
  const payloadMedium = text(payload.utmMedium);
  const payloadCampaign = text(payload.utmCampaign);
  if (payloadSource || payloadMedium || payloadCampaign) {
    const source = payloadSource ?? text(session?.source) ?? crmFallbackSource(item.source);
    return {
      source,
      medium: payloadMedium ?? text(session?.medium),
      campaign: payloadCampaign ?? text(session?.campaign),
      method: 'utm',
      attributed: source !== 'direct' || Boolean(payloadCampaign),
    };
  }

  const sessionSource = text(session?.source);
  const sessionMedium = text(session?.medium);
  const sessionCampaign = text(session?.campaign);
  if (sessionSource || sessionMedium || sessionCampaign) {
    const source = sessionSource ?? crmFallbackSource(item.source);
    return {
      source,
      medium: sessionMedium,
      campaign: sessionCampaign,
      method: 'session',
      attributed: source !== 'direct' || Boolean(sessionCampaign),
    };
  }

  const fallback = crmFallbackSource(item.source);
  if (fallback !== 'direct') {
    return { source: fallback, medium: null, campaign: null, method: 'crm_source', attributed: true };
  }
  return { source: 'direct', medium: null, campaign: null, method: 'unknown', attributed: false };
}

function makeBucket(identity: AttributionIdentity, campaign: string | null = null): AggregateBucket {
  const source = sourceLabel(identity.source);
  return {
    key: [identity.source.toLowerCase(), identity.medium ?? '', campaign ?? ''].join('|'),
    source,
    medium: identity.medium,
    campaign,
    requestIds: new Set(),
    leadIds: new Set(),
    quoteIds: new Set(),
    acceptedQuoteIds: new Set(),
    eventIds: new Set(),
    bookedRevenue: 0,
    collectedRevenue: 0,
  };
}

function addToBucket(bucket: AggregateBucket, row: {
  requestId: string;
  leadId: string | null;
  quoteIds: string[];
  acceptedQuoteIds: string[];
  eventIds: string[];
  bookedRevenue: number;
  collectedRevenue: number;
}) {
  bucket.requestIds.add(row.requestId);
  if (row.leadId) bucket.leadIds.add(row.leadId);
  row.quoteIds.forEach((id) => bucket.quoteIds.add(id));
  row.acceptedQuoteIds.forEach((id) => bucket.acceptedQuoteIds.add(id));
  row.eventIds.forEach((id) => bucket.eventIds.add(id));
  bucket.bookedRevenue += row.bookedRevenue;
  bucket.collectedRevenue += row.collectedRevenue;
}

function serializeBucket(bucket: AggregateBucket) {
  const requests = bucket.requestIds.size;
  const confirmedEvents = bucket.eventIds.size;
  return {
    key: bucket.key,
    source: bucket.source,
    medium: bucket.medium,
    campaign: bucket.campaign ?? null,
    requests,
    leads: bucket.leadIds.size,
    quotes: bucket.quoteIds.size,
    acceptedQuotes: bucket.acceptedQuoteIds.size,
    confirmedEvents,
    bookedRevenue: Math.round(bucket.bookedRevenue * 100) / 100,
    collectedRevenue: Math.round(bucket.collectedRevenue * 100) / 100,
    quoteRate: percent(bucket.quoteIds.size ? requests : 0, requests),
    closeRate: percent(confirmedEvents, requests),
    averageTicket: confirmedEvents ? Math.round((bucket.bookedRevenue / confirmedEvents) * 100) / 100 : 0,
  };
}

function currentApprovedContracts(contracts: any[]): Map<string, any> {
  const map = new Map<string, any>();
  const sorted = [...contracts].sort((left, right) => {
    const version = numberValue(right.versionNumber) - numberValue(left.versionNumber);
    if (version) return version;
    return new Date(right.approvedAt ?? right.updatedAt ?? 0).getTime() - new Date(left.approvedAt ?? left.updatedAt ?? 0).getTime();
  });
  for (const contract of sorted) {
    const eventId = idOf(contract.eventId);
    if (eventId && !map.has(eventId)) map.set(eventId, contract);
  }
  return map;
}

router.get('/attribution', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const requestConditions: Record<string, unknown>[] = [
    { deletedAt: null },
    { createdAt: { $gte: period.from, $lt: period.toExclusive } },
  ];
  if (scope.selectedSalonId) requestConditions.push({ interestedSalonIds: scope.selectedSalonId });
  else if (!scope.unrestricted) requestConditions.push({ interestedSalonIds: { $in: scope.salonIds ?? [] } });

  const quoteRequests: any[] = await QuoteRequest.find({ $and: requestConditions })
    .select('_id leadId source status originalPayload interestedSalonIds convertedQuoteIds createdAt')
    .sort({ createdAt: 1 })
    .lean();

  if (!quoteRequests.length) {
    return sendSuccess(response, {
      period: { from: period.fromDate, to: period.toDate },
      summary: {
        requests: 0, leads: 0, attributedRequests: 0, attributionCoverage: 0, quotes: 0,
        acceptedQuotes: 0, confirmedEvents: 0, bookedRevenue: 0, collectedRevenue: 0,
        quoteRate: 0, closeRate: 0, averageTicket: 0,
      },
      sources: [], campaigns: [], salons: [],
      methodology: { cohort: 'quote_request_created_at', revenue: 'approved_contract_then_confirmed_event_then_quote', historicalUnknownIsNotGuessed: true },
    });
  }

  const attributionIds = [...new Set(quoteRequests
    .map((item) => text(item.originalPayload?.attributionId))
    .filter((value): value is string => Boolean(value)))];
  const sessions: any[] = attributionIds.length
    ? await AnalyticsSession.find({ attributionId: { $in: attributionIds } })
      .select('attributionId startedAt lastActivityAt source medium campaign')
      .sort({ startedAt: -1 })
      .lean()
    : [];
  const sessionsByAttribution = new Map<string, any[]>();
  for (const session of sessions) {
    const key = String(session.attributionId);
    const list = sessionsByAttribution.get(key) ?? [];
    list.push(session);
    sessionsByAttribution.set(key, list);
  }

  const quoteIds = [...new Set(quoteRequests.flatMap((item) => (item.convertedQuoteIds ?? []).map(idOf).filter(Boolean) as string[]))];
  const quotes: any[] = quoteIds.length
    ? await Quote.find({ _id: { $in: quoteIds }, deletedAt: null })
      .select('_id leadId salonId status totalAmount acceptedAt convertedEventId createdAt')
      .lean()
    : [];
  const quotesById = new Map(quotes.map((quote) => [String(quote._id), quote]));

  const events: any[] = quoteIds.length
    ? await Event.find({
      deletedAt: null,
      $or: [
        { quoteId: { $in: quoteIds } },
        { sourceQuoteId: { $in: quoteIds } },
        { createdFromQuoteId: { $in: quoteIds } },
      ],
    }).select('_id salonId status quoteId sourceQuoteId createdFromQuoteId finalAmount estimatedAmount createdAt').lean()
    : [];
  const closedEvents = events.filter((event) => ['reserved', 'confirmed'].includes(String(event.status ?? '').toLowerCase()));
  const eventIds = closedEvents.map((event) => String(event._id));

  const contracts: any[] = eventIds.length
    ? await Contract.find({ eventId: { $in: eventIds }, status: 'approved', deletedAt: null })
      .select('_id eventId totalAmount versionNumber approvedAt updatedAt')
      .lean()
    : [];
  const approvedContractByEvent = currentApprovedContracts(contracts);
  const contractIds = [...approvedContractByEvent.values()].map((contract) => String(contract._id));

  const payments: any[] = eventIds.length
    ? await Payment.find({
      deletedAt: null,
      status: 'paid',
      type: { $ne: 'security_deposit' },
      $or: [{ eventId: { $in: eventIds } }, ...(contractIds.length ? [{ contractId: { $in: contractIds } }] : [])],
    }).select('_id eventId contractId amount refundedAmount affectsContractBalance').lean()
    : [];
  const contractEventMap = new Map(contracts.map((contract) => [String(contract._id), String(contract.eventId)]));
  const collectedByEvent = new Map<string, number>();
  for (const payment of payments) {
    if (payment.affectsContractBalance === false) continue;
    const eventId = idOf(payment.eventId) ?? (payment.contractId ? contractEventMap.get(String(payment.contractId)) ?? null : null);
    if (!eventId) continue;
    const net = Math.max(0, numberValue(payment.amount) - numberValue(payment.refundedAmount));
    collectedByEvent.set(eventId, (collectedByEvent.get(eventId) ?? 0) + net);
  }

  const eventsByQuote = new Map<string, any[]>();
  for (const event of closedEvents) {
    const linkedQuoteIds = [idOf(event.quoteId), idOf(event.sourceQuoteId), idOf(event.createdFromQuoteId)].filter((value): value is string => Boolean(value));
    for (const quoteId of linkedQuoteIds) {
      const list = eventsByQuote.get(quoteId) ?? [];
      if (!list.some((item) => String(item._id) === String(event._id))) list.push(event);
      eventsByQuote.set(quoteId, list);
    }
  }

  const revenueForEvent = (event: any): number => {
    const eventId = String(event._id);
    const contract = approvedContractByEvent.get(eventId);
    if (contract && numberValue(contract.totalAmount) > 0) return numberValue(contract.totalAmount);
    if (numberValue(event.finalAmount) > 0) return numberValue(event.finalAmount);
    if (numberValue(event.estimatedAmount) > 0) return numberValue(event.estimatedAmount);
    const quoteId = idOf(event.sourceQuoteId) ?? idOf(event.createdFromQuoteId) ?? idOf(event.quoteId);
    return quoteId ? numberValue(quotesById.get(quoteId)?.totalAmount) : 0;
  };

  const sourceBuckets = new Map<string, AggregateBucket>();
  const campaignBuckets = new Map<string, AggregateBucket>();
  const attributedRequestIds = new Set<string>();
  const allLeadIds = new Set<string>();
  const allQuoteIds = new Set<string>();
  const allAcceptedQuoteIds = new Set<string>();
  const allEventIds = new Set<string>();
  let bookedRevenue = 0;
  let collectedRevenue = 0;

  const requestRows: Array<{
    requestId: string;
    leadId: string | null;
    identity: AttributionIdentity;
    quoteIds: string[];
    acceptedQuoteIds: string[];
    eventIds: string[];
    events: any[];
    quotes: any[];
    bookedRevenue: number;
    collectedRevenue: number;
    interestedSalonIds: string[];
  }> = [];

  for (const item of quoteRequests) {
    const requestId = String(item._id);
    const leadId = idOf(item.leadId);
    const attributionId = text(item.originalPayload?.attributionId);
    const matchingSessions = attributionId ? sessionsByAttribution.get(attributionId) ?? [] : [];
    const session = sessionForRequest(matchingSessions, new Date(item.createdAt));
    const identity = attributionForRequest(item, session);
    if (identity.attributed) attributedRequestIds.add(requestId);
    if (leadId) allLeadIds.add(leadId);

    const rowQuotes = (item.convertedQuoteIds ?? [])
      .map(idOf)
      .filter((value): value is string => Boolean(value))
      .map((id) => quotesById.get(id))
      .filter(Boolean);
    const rowQuoteIds = rowQuotes.map((quote) => String(quote._id));
    const acceptedQuoteIds = rowQuotes
      .filter((quote) => ['accepted', 'converted'].includes(String(quote.status ?? '').toLowerCase()) || Boolean(quote.acceptedAt))
      .map((quote) => String(quote._id));
    rowQuoteIds.forEach((id) => allQuoteIds.add(id));
    acceptedQuoteIds.forEach((id) => allAcceptedQuoteIds.add(id));

    const rowEventsMap = new Map<string, any>();
    for (const quoteId of rowQuoteIds) {
      for (const event of eventsByQuote.get(quoteId) ?? []) rowEventsMap.set(String(event._id), event);
    }
    const rowEvents = [...rowEventsMap.values()];
    const rowEventIds = rowEvents.map((event) => String(event._id));
    rowEventIds.forEach((id) => allEventIds.add(id));
    const rowBookedRevenue = rowEvents.reduce((total, event) => total + revenueForEvent(event), 0);
    const rowCollectedRevenue = rowEvents.reduce((total, event) => total + (collectedByEvent.get(String(event._id)) ?? 0), 0);
    bookedRevenue += rowBookedRevenue;
    collectedRevenue += rowCollectedRevenue;

    const row = {
      requestId,
      leadId,
      identity,
      quoteIds: rowQuoteIds,
      acceptedQuoteIds,
      eventIds: rowEventIds,
      events: rowEvents,
      quotes: rowQuotes,
      bookedRevenue: rowBookedRevenue,
      collectedRevenue: rowCollectedRevenue,
      interestedSalonIds: (item.interestedSalonIds ?? []).map(idOf).filter((value): value is string => Boolean(value)),
    };
    requestRows.push(row);

    const sourceKey = [identity.source.toLowerCase(), identity.medium ?? ''].join('|');
    const sourceBucket = sourceBuckets.get(sourceKey) ?? makeBucket(identity);
    addToBucket(sourceBucket, row);
    sourceBuckets.set(sourceKey, sourceBucket);

    const campaignName = identity.campaign ?? '(sin campaña identificada)';
    const campaignKey = [identity.source.toLowerCase(), identity.medium ?? '', campaignName.toLowerCase()].join('|');
    const campaignBucket = campaignBuckets.get(campaignKey) ?? makeBucket(identity, identity.campaign);
    addToBucket(campaignBucket, row);
    campaignBuckets.set(campaignKey, campaignBucket);
  }

  const salonIds = [...new Set(requestRows.flatMap((row) => [
    ...row.interestedSalonIds,
    ...row.quotes.map((quote) => idOf(quote.salonId)).filter(Boolean) as string[],
    ...row.events.map((event) => idOf(event.salonId)).filter(Boolean) as string[],
  ]))];
  const salons: any[] = salonIds.length ? await Salon.find({ _id: { $in: salonIds } }).select('_id name').lean() : [];
  const salonNameMap = new Map(salons.map((salon) => [String(salon._id), String(salon.name)]));
  const salonBuckets = new Map<string, SalonBucket>();
  const salonBucket = (salonId: string): SalonBucket => {
    const existing = salonBuckets.get(salonId);
    if (existing) return existing;
    const created: SalonBucket = {
      salonId,
      name: salonNameMap.get(salonId) ?? 'Salón sin identificar',
      requestIds: new Set(), leadIds: new Set(), quoteIds: new Set(), acceptedQuoteIds: new Set(), eventIds: new Set(),
      bookedRevenue: 0, collectedRevenue: 0,
    };
    salonBuckets.set(salonId, created);
    return created;
  };

  for (const row of requestRows) {
    const requestSalonId = row.interestedSalonIds[0] ?? idOf(row.quotes[0]?.salonId) ?? idOf(row.events[0]?.salonId);
    if (requestSalonId) {
      const bucket = salonBucket(requestSalonId);
      bucket.requestIds.add(row.requestId);
      if (row.leadId) bucket.leadIds.add(row.leadId);
    }
    for (const quote of row.quotes) {
      const salonId = idOf(quote.salonId);
      if (!salonId) continue;
      const bucket = salonBucket(salonId);
      bucket.quoteIds.add(String(quote._id));
      if (row.acceptedQuoteIds.includes(String(quote._id))) bucket.acceptedQuoteIds.add(String(quote._id));
    }
    for (const event of row.events) {
      const salonId = idOf(event.salonId);
      if (!salonId) continue;
      const bucket = salonBucket(salonId);
      const eventId = String(event._id);
      bucket.eventIds.add(eventId);
      bucket.bookedRevenue += revenueForEvent(event);
      bucket.collectedRevenue += collectedByEvent.get(eventId) ?? 0;
    }
  }

  const requests = quoteRequests.length;
  const requestsWithQuotes = requestRows.filter((row) => row.quoteIds.length > 0).length;
  const requestsClosed = requestRows.filter((row) => row.eventIds.length > 0).length;
  const sources = [...sourceBuckets.values()].map(serializeBucket)
    .sort((left, right) => right.bookedRevenue - left.bookedRevenue || right.requests - left.requests);
  const campaigns = [...campaignBuckets.values()].map(serializeBucket)
    .sort((left, right) => right.bookedRevenue - left.bookedRevenue || right.requests - left.requests);
  const salonRows = [...salonBuckets.values()].map((bucket) => ({
    salonId: bucket.salonId,
    name: bucket.name,
    requests: bucket.requestIds.size,
    leads: bucket.leadIds.size,
    quotes: bucket.quoteIds.size,
    acceptedQuotes: bucket.acceptedQuoteIds.size,
    confirmedEvents: bucket.eventIds.size,
    bookedRevenue: Math.round(bucket.bookedRevenue * 100) / 100,
    collectedRevenue: Math.round(bucket.collectedRevenue * 100) / 100,
    closeRate: percent(bucket.eventIds.size, bucket.requestIds.size),
  })).sort((left, right) => right.bookedRevenue - left.bookedRevenue || right.requests - left.requests);

  return sendSuccess(response, {
    period: { from: period.fromDate, to: period.toDate },
    summary: {
      requests,
      leads: allLeadIds.size,
      attributedRequests: attributedRequestIds.size,
      attributionCoverage: percent(attributedRequestIds.size, requests),
      quotes: allQuoteIds.size,
      acceptedQuotes: allAcceptedQuoteIds.size,
      confirmedEvents: allEventIds.size,
      bookedRevenue: Math.round(bookedRevenue * 100) / 100,
      collectedRevenue: Math.round(collectedRevenue * 100) / 100,
      quoteRate: percent(requestsWithQuotes, requests),
      closeRate: percent(requestsClosed, requests),
      averageTicket: allEventIds.size ? Math.round((bookedRevenue / allEventIds.size) * 100) / 100 : 0,
    },
    sources,
    campaigns,
    salons: salonRows,
    methodology: {
      cohort: 'quote_request_created_at',
      revenue: 'approved_contract_then_confirmed_event_then_quote',
      collected: 'paid_non_security_deposit_payments_net_of_refunds',
      historicalUnknownIsNotGuessed: true,
    },
  });
}));

export default router;
