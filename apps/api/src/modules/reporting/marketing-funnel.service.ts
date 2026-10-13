import type { Request } from 'express';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { userHasPermission } from '../../middlewares/auth';
import { Contract, Event, Lead, Payment, Quote, QuoteRequest } from '../crm/crm.models';
import { Salon } from '../salons/salon.model';
import { parseReportPeriod, periodMatch, resolveReportScope } from './report-filter';
import { MetaCampaignSalonAssignment } from './marketing-funnel.model';

type Column = { key: string; label: string; format?: 'date' | 'civilDate' | 'currency' | 'number' | 'percentage' | 'status'; };
type Definition = { columns: Column[]; key: string; title: string; description: string; };
type GraphEnvelope<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };
type MetaCampaign = { id: string; name: string; objective: string | null; spend: number; conversations: number; leads: number; };
type MetaConnection = { status: 'connected' | 'pending' | 'error'; currency: string | null; lastSyncAt: string | null; };
type CachedMetaResult = { expiresAt: number; value: { campaigns: MetaCampaign[]; connection: MetaConnection } };

const META_CACHE_TTL_MS = 5 * 60_000;
const metaCache = new Map<string, CachedMetaResult>();
const metaInFlight = new Map<string, Promise<{ campaigns: MetaCampaign[]; connection: MetaConnection }>>();

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(value: unknown): string | null {
  if (!value) return null;
  const id = typeof value === 'string' ? value : (value as { toString?: () => string }).toString?.();
  return id ? String(id) : null;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function normalized(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function actionMetric(actions: Array<{ action_type?: string; value?: string }> | undefined, candidates: string[]) {
  if (!actions?.length) return 0;
  for (const candidate of candidates) {
    const exact = actions.find((item) => item.action_type === candidate);
    if (exact) return numberValue(exact.value);
  }
  const partial = actions.find((item) => candidates.some((candidate) => item.action_type?.includes(candidate)));
  return numberValue(partial?.value);
}

function metaConversations(actions?: Array<{ action_type?: string; value?: string }>) {
  return actionMetric(actions, [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'contact',
  ]);
}

function metaLeads(actions?: Array<{ action_type?: string; value?: string }>) {
  return actionMetric(actions, ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead']);
}

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', env.META_MARKETING_ACCESS_TOKEN!);
  return url;
}

async function graphFetch<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.META_MARKETING_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
    if (!response.ok || payload.error) throw new Error(String(payload.error?.message || 'Meta Marketing API no respondió correctamente.'));
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function graphGetAll<T>(url: URL, maxPages = 4, maxItems = 1000) {
  const items: T[] = [];
  let nextUrl: URL | null = url;
  let pages = 0;
  while (nextUrl && pages < maxPages && items.length < maxItems) {
    const payload: GraphEnvelope<T> = await graphFetch<GraphEnvelope<T>>(nextUrl);
    items.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ? new URL(payload.paging.next) : null;
    pages += 1;
  }
  return items.slice(0, maxItems);
}

async function metaCampaignMetrics(from: string, to: string) {
  const accountId = env.META_AD_ACCOUNT_ID?.replace(/^act_/, '');
  if (!accountId || !env.META_MARKETING_ACCESS_TOKEN) {
    return { campaigns: [], connection: { status: 'pending', currency: null, lastSyncAt: null } satisfies MetaConnection };
  }
  const key = `${accountId}:${from}:${to}`;
  const cached = metaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const running = metaInFlight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const accountPath = `act_${accountId}`;
      const timeRange = JSON.stringify({ since: from, until: to });
      const [account, insights] = await Promise.all([
        graphFetch<{ currency?: string }>(graphUrl(accountPath, { fields: 'currency' })),
        graphGetAll<any>(graphUrl(`${accountPath}/insights`, {
          level: 'campaign',
          fields: 'campaign_id,campaign_name,objective,spend,actions',
          time_range: timeRange,
          limit: '500',
        })),
      ]);
      const value = {
        campaigns: insights.map((item) => ({
          id: String(item.campaign_id ?? ''),
          name: String(item.campaign_name ?? 'Campaña sin nombre'),
          objective: item.objective ? String(item.objective) : null,
          spend: numberValue(item.spend),
          conversations: metaConversations(item.actions),
          leads: metaLeads(item.actions),
        })).filter((item) => Boolean(item.id)).sort((left, right) => right.spend - left.spend || right.conversations - left.conversations),
        connection: { status: 'connected' as const, currency: account.currency ?? null, lastSyncAt: new Date().toISOString() },
      };
      metaCache.set(key, { expiresAt: Date.now() + META_CACHE_TTL_MS, value });
      while (metaCache.size > 12) {
        const oldest = metaCache.keys().next().value as string | undefined;
        if (!oldest) break;
        metaCache.delete(oldest);
      }
      return value;
    } catch {
      return { campaigns: [], connection: { status: 'error' as const, currency: null, lastSyncAt: null } };
    } finally {
      metaInFlight.delete(key);
    }
  })();
  metaInFlight.set(key, task);
  return task;
}

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function currentContractByEvent(contracts: any[]) {
  const result = new Map<string, any>();
  const ordered = [...contracts].sort((left, right) => numberValue(right.versionNumber) - numberValue(left.versionNumber)
    || new Date(right.approvedAt ?? right.updatedAt ?? 0).getTime() - new Date(left.approvedAt ?? left.updatedAt ?? 0).getTime());
  for (const contract of ordered) {
    const eventId = idOf(contract.eventId);
    if (eventId && !result.has(eventId)) result.set(eventId, contract);
  }
  return result;
}

function campaignIdentity(item: any, byId: Map<string, MetaCampaign>, idsByName: Map<string, string[]>) {
  const payload = item.originalPayload && typeof item.originalPayload === 'object' ? item.originalPayload : {};
  const campaignId = String(payload.utmCampaignId || payload.utm_id || '').trim();
  if (campaignId && byId.has(campaignId)) return campaignId;
  const candidates = idsByName.get(normalized(payload.utmCampaign)) ?? [];
  return candidates.length === 1 ? candidates[0] : null;
}

function revenueForEvent(event: any, contracts: Map<string, any>, quotes: Map<string, any>) {
  const contract = contracts.get(String(event._id));
  if (contract && numberValue(contract.totalAmount) > 0) return numberValue(contract.totalAmount);
  if (numberValue(event.finalAmount) > 0) return numberValue(event.finalAmount);
  if (numberValue(event.estimatedAmount) > 0) return numberValue(event.estimatedAmount);
  const quoteId = idOf(event.sourceQuoteId) ?? idOf(event.createdFromQuoteId) ?? idOf(event.quoteId);
  return quoteId ? numberValue(quotes.get(quoteId)?.totalAmount) : 0;
}

type CampaignCrm = {
  leadIds: Set<string>;
  requestIds: Set<string>;
  quoteIds: Set<string>;
  acceptedQuoteIds: Set<string>;
  eventIds: Set<string>;
  bookedRevenue: number;
  collectedRevenue: number;
};

function emptyCampaignCrm(): CampaignCrm {
  return { leadIds: new Set(), requestIds: new Set(), quoteIds: new Set(), acceptedQuoteIds: new Set(), eventIds: new Set(), bookedRevenue: 0, collectedRevenue: 0 };
}

export async function marketingFunnelReport(request: Request, definition: Definition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const leadQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'createdAt') };
  const requestQuery = { deletedAt: null, ...scope.match('interestedSalonIds'), ...periodMatch(period, 'createdAt') };
  const quoteQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'createdAt') };
  const acceptedQuoteQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'acceptedAt'), status: { $in: ['accepted', 'converted'] } };
  const eventQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'createdAt'), status: { $in: ['reserved', 'confirmed'] } };
  const approvedContractQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'approvedAt'), status: 'approved' };
  const paymentQuery = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'paidAt'), status: 'paid', type: { $ne: 'security_deposit' } };

  const [meta, assignments, salons, newLeads, quoteRequests, monthlyQuotes, acceptedQuotes, monthlyEvents, approvedContracts, collectedPayments] = await Promise.all([
    metaCampaignMetrics(period.fromDate, period.toDate),
    MetaCampaignSalonAssignment.find({ active: true }).select('campaignId salonId').lean(),
    Salon.find({ deletedAt: null, ...(scope.selectedSalonId ? { _id: scope.selectedSalonId } : !scope.unrestricted ? { _id: { $in: scope.salonIds ?? [] } } : {}) }).select('_id name').sort({ name: 1 }).lean(),
    Lead.find(leadQuery).select('_id salonId salonIds source').lean(),
    QuoteRequest.find(requestQuery).select('_id leadId interestedSalonIds convertedQuoteIds originalPayload').lean(),
    Quote.find(quoteQuery).select('_id salonId totalAmount').lean(),
    Quote.find(acceptedQuoteQuery).select('_id salonId totalAmount').lean(),
    Event.find(eventQuery).select('_id salonId status').lean(),
    Contract.find(approvedContractQuery).select('_id salonId totalAmount').lean(),
    Payment.find(paymentQuery).select('_id salonId amount refundedAmount affectsContractBalance').lean(),
  ]);

  const campaignById = new Map(meta.campaigns.map((campaign) => [campaign.id, campaign]));
  const idsByName = new Map<string, string[]>();
  for (const campaign of meta.campaigns) {
    const key = normalized(campaign.name);
    idsByName.set(key, [...(idsByName.get(key) ?? []), campaign.id]);
  }
  const assignmentByCampaignId = new Map(assignments.map((assignment: any) => [String(assignment.campaignId), idOf(assignment.salonId)]));
  const salonById = new Map(salons.map((salon: any) => [String(salon._id), String(salon.name)]));

  const cohortQuoteIds = unique(quoteRequests.flatMap((item: any) => (item.convertedQuoteIds ?? []).map(idOf).filter((id: string | null): id is string => Boolean(id))));
  const [cohortQuotes, cohortEvents] = await Promise.all([
    cohortQuoteIds.length ? Quote.find({ _id: { $in: cohortQuoteIds }, deletedAt: null, ...scope.match('salonId') }).select('_id salonId totalAmount status acceptedAt').lean() : [],
    cohortQuoteIds.length ? Event.find({
      deletedAt: null,
      ...scope.match('salonId'),
      $or: [{ quoteId: { $in: cohortQuoteIds } }, { sourceQuoteId: { $in: cohortQuoteIds } }, { createdFromQuoteId: { $in: cohortQuoteIds } }],
    }).select('_id salonId status quoteId sourceQuoteId createdFromQuoteId finalAmount estimatedAmount').lean() : [],
  ]);
  const cohortQuotesById = new Map(cohortQuotes.map((quote: any) => [String(quote._id), quote]));
  const validQuoteIds = new Set(cohortQuotes.map((quote: any) => String(quote._id)));
  const closedEvents = cohortEvents.filter((event: any) => ['reserved', 'confirmed'].includes(String(event.status)));
  const eventIds = closedEvents.map((event: any) => String(event._id));
  const [eventContracts, eventPayments] = await Promise.all([
    eventIds.length ? Contract.find({ deletedAt: null, status: 'approved', eventId: { $in: eventIds } }).select('_id eventId totalAmount versionNumber approvedAt updatedAt').lean() : [],
    eventIds.length ? Payment.find({ deletedAt: null, status: 'paid', type: { $ne: 'security_deposit' }, eventId: { $in: eventIds } }).select('_id eventId amount refundedAmount affectsContractBalance').lean() : [],
  ]);
  const contractsByEvent = currentContractByEvent(eventContracts);
  const collectedByEvent = new Map<string, number>();
  for (const payment of eventPayments) {
    if (payment.affectsContractBalance === false) continue;
    const eventId = idOf(payment.eventId);
    if (!eventId) continue;
    collectedByEvent.set(eventId, (collectedByEvent.get(eventId) ?? 0) + Math.max(0, numberValue(payment.amount) - numberValue(payment.refundedAmount)));
  }
  const eventsByQuoteId = new Map<string, any[]>();
  for (const event of closedEvents) {
    for (const quoteId of unique([idOf(event.quoteId), idOf(event.sourceQuoteId), idOf(event.createdFromQuoteId)].filter((id): id is string => Boolean(id)))) {
      if (!validQuoteIds.has(quoteId)) continue;
      eventsByQuoteId.set(quoteId, [...(eventsByQuoteId.get(quoteId) ?? []), event]);
    }
  }

  const crmByCampaign = new Map<string, CampaignCrm>();
  const getCampaignCrm = (campaignId: string) => {
    const current = crmByCampaign.get(campaignId) ?? emptyCampaignCrm();
    crmByCampaign.set(campaignId, current);
    return current;
  };
  for (const requestItem of quoteRequests) {
    const campaignId = campaignIdentity(requestItem, campaignById, idsByName);
    if (!campaignId) continue;
    const bucket = getCampaignCrm(campaignId);
    bucket.requestIds.add(String(requestItem._id));
    const leadId = idOf(requestItem.leadId);
    if (leadId) bucket.leadIds.add(leadId);
    const quoteIds = (requestItem.convertedQuoteIds ?? []).map(idOf).filter((id: string | null): id is string => id !== null && validQuoteIds.has(id));
    for (const quoteId of quoteIds) {
      const quote = cohortQuotesById.get(quoteId);
      if (!quote) continue;
      bucket.quoteIds.add(quoteId);
      if (['accepted', 'converted'].includes(String(quote.status)) || quote.acceptedAt) bucket.acceptedQuoteIds.add(quoteId);
      for (const event of eventsByQuoteId.get(quoteId) ?? []) {
        const eventId = String(event._id);
        if (bucket.eventIds.has(eventId)) continue;
        bucket.eventIds.add(eventId);
        bucket.bookedRevenue += revenueForEvent(event, contractsByEvent, cohortQuotesById);
        bucket.collectedRevenue += collectedByEvent.get(eventId) ?? 0;
      }
    }
  }

  const campaignIsVisible = (campaign: MetaCampaign) => {
    const salonId = assignmentByCampaignId.get(campaign.id);
    if (!salonId) return scope.unrestricted;
    if (scope.selectedSalonId) return salonId === scope.selectedSalonId;
    return scope.unrestricted || Boolean(scope.salonIds?.includes(salonId));
  };
  const assignedCampaigns = meta.campaigns.filter(campaignIsVisible);
  // Una campaña sin asignación no se puede acotar a un salón. Sólo el alcance
  // global puede verla y configurarla; para el resto se omite por privacidad.
  const unassignedCampaigns = meta.campaigns.filter((campaign) => !assignmentByCampaignId.get(campaign.id) && scope.unrestricted);
  const rows = assignedCampaigns.map((campaign) => {
    const crm = crmByCampaign.get(campaign.id) ?? emptyCampaignCrm();
    const salonId = assignmentByCampaignId.get(campaign.id) ?? null;
    return {
      id: campaign.id, campaign: campaign.name, salon: salonId ? salonById.get(salonId) ?? 'Salón sin identificar' : 'Sin asignar', salonId,
      conversations: campaign.conversations, metaLeads: campaign.leads, spend: campaign.spend,
      crmLeads: crm.leadIds.size, requests: crm.requestIds.size, quotes: crm.quoteIds.size, acceptedQuotes: crm.acceptedQuoteIds.size, events: crm.eventIds.size,
      bookedRevenue: Math.round(crm.bookedRevenue * 100) / 100, collectedRevenue: Math.round(crm.collectedRevenue * 100) / 100,
      observableCaptureRate: percentage(crm.requestIds.size, campaign.conversations), quoteRate: percentage(crm.quoteIds.size, crm.requestIds.size), closeRate: percentage(crm.eventIds.size, crm.requestIds.size),
      costPerConversation: campaign.conversations ? campaign.spend / campaign.conversations : 0,
      roas: campaign.spend ? crm.bookedRevenue / campaign.spend : 0,
    };
  }).sort((left, right) => right.spend - left.spend || right.conversations - left.conversations);

  const totalMeta = assignedCampaigns.filter((campaign) => Boolean(assignmentByCampaignId.get(campaign.id))).reduce((sum, campaign) => ({
    conversations: sum.conversations + campaign.conversations, leads: sum.leads + campaign.leads, spend: sum.spend + campaign.spend,
  }), { conversations: 0, leads: 0, spend: 0 });
  const assignedRows = rows.filter((row) => Boolean(row.salonId));
  const totalCohort = assignedRows.reduce((sum, row) => ({ requests: sum.requests + row.requests, quotes: sum.quotes + row.quotes, events: sum.events + row.events, revenue: sum.revenue + row.bookedRevenue }), { requests: 0, quotes: 0, events: 0, revenue: 0 });
  const linkedLeadIds = new Set(assignedCampaigns
    .filter((campaign) => Boolean(assignmentByCampaignId.get(campaign.id)))
    .flatMap((campaign) => [...(crmByCampaign.get(campaign.id)?.leadIds ?? [])]));

  const salonRows = salons.map((salon: any) => {
    const salonId = String(salon._id);
    const salonCampaigns = meta.campaigns.filter((campaign) => assignmentByCampaignId.get(campaign.id) === salonId);
    const requests = quoteRequests.filter((item: any) => (item.interestedSalonIds ?? []).some((id: unknown) => idOf(id) === salonId));
    const metaLinkedRequests = requests.filter((item: any) => Boolean(campaignIdentity(item, campaignById, idsByName)));
    const linkedLeads = new Set(metaLinkedRequests.map((item: any) => idOf(item.leadId)).filter((id: string | null): id is string => Boolean(id)));
    const payments = collectedPayments.filter((item: any) => idOf(item.salonId) === salonId && item.affectsContractBalance !== false)
      .reduce((sum: number, item: any) => sum + Math.max(0, numberValue(item.amount) - numberValue(item.refundedAmount)), 0);
    const conversations = salonCampaigns.reduce((sum, campaign) => sum + campaign.conversations, 0);
    const spend = salonCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const events = monthlyEvents.filter((item: any) => idOf(item.salonId) === salonId).length;
    return {
      id: salonId, salon: String(salon.name), conversations, metaLeads: salonCampaigns.reduce((sum, campaign) => sum + campaign.leads, 0), spend,
      crmLeads: newLeads.filter((lead: any) => idOf(lead.salonId) === salonId).length,
      requests: requests.length, metaLinkedRequests: metaLinkedRequests.length, metaLinkedLeads: linkedLeads.size,
      quotes: monthlyQuotes.filter((quote: any) => idOf(quote.salonId) === salonId).length,
      acceptedQuotes: acceptedQuotes.filter((quote: any) => idOf(quote.salonId) === salonId).length,
      events,
      bookedRevenue: approvedContracts.filter((contract: any) => idOf(contract.salonId) === salonId).reduce((sum: number, contract: any) => sum + numberValue(contract.totalAmount), 0),
      collectedRevenue: payments,
      observableCaptureRate: percentage(metaLinkedRequests.length, conversations),
      costPerConversation: conversations ? spend / conversations : 0,
    };
  });

  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = exportAll ? 10_000 : Math.min(100, Math.max(10, Number(request.query.limit) || 25));
  const paginatedRows = exportAll ? rows : rows.slice((page - 1) * limit, page * limit);
  const metaUnassigned = unassignedCampaigns.reduce((sum, campaign) => sum + campaign.conversations, 0);
  return {
    columns: definition.columns,
    rows: paginatedRows,
    summary: [
      { id: 'conversations', label: 'Conversaciones Meta asignadas', value: totalMeta.conversations, format: 'number' },
      { id: 'crmLeads', label: 'Leads creados en CRM', value: newLeads.length, format: 'number' },
      { id: 'requests', label: 'Solicitudes creadas', value: quoteRequests.length, format: 'number' },
      { id: 'quotes', label: 'Presupuestos creados', value: monthlyQuotes.length, format: 'number' },
      { id: 'events', label: 'Eventos ingresados cerrados', value: monthlyEvents.length, format: 'number' },
      { id: 'booked', label: 'Contratado en el período', value: approvedContracts.reduce((sum: number, contract: any) => sum + numberValue(contract.totalAmount), 0), format: 'currency' },
    ],
    breakdowns: {},
    data: {
      connection: meta.connection,
      currency: meta.connection.currency ?? 'ARS',
      summary: {
        metaConversations: totalMeta.conversations, metaLeads: totalMeta.leads, metaSpend: totalMeta.spend,
        metaConversationsUnassigned: metaUnassigned, crmLeads: newLeads.length, metaLinkedLeads: linkedLeadIds.size,
        requests: quoteRequests.length, metaLinkedRequests: totalCohort.requests, quotes: monthlyQuotes.length, acceptedQuotes: acceptedQuotes.length,
        events: monthlyEvents.length, bookedRevenue: approvedContracts.reduce((sum: number, contract: any) => sum + numberValue(contract.totalAmount), 0),
        collectedRevenue: collectedPayments.filter((item: any) => item.affectsContractBalance !== false).reduce((sum: number, item: any) => sum + Math.max(0, numberValue(item.amount) - numberValue(item.refundedAmount)), 0),
        observableCaptureRate: percentage(totalCohort.requests, totalMeta.conversations),
      },
      salons: salonRows,
      campaigns: rows,
      unassignedCampaigns: unassignedCampaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, conversations: campaign.conversations, spend: campaign.spend })),
      methodology: {
        activity: 'Las métricas CRM cuentan altas, aprobaciones y cobros dentro del período seleccionado.',
        campaign: 'El detalle de campaña sigue solicitudes creadas en el período con utm_campaign_id o un nombre UTM único; sus avances pueden ocurrir después.',
        attribution: 'Las conversaciones de Meta se asignan sólo mediante una configuración explícita campaña → salón. Las campañas sin asignar no se distribuyen.',
      },
    },
    meta: {
      report: { key: definition.key, title: definition.title, description: definition.description },
      period: { from: period.fromDate, to: period.toDate },
      filters: Object.fromEntries(Object.entries(request.query).filter(([, value]) => typeof value === 'string' && value)),
      generatedAt: new Date().toISOString(), page, limit, totalItems: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / limit)), hasNextPage: page * limit < rows.length, hasPreviousPage: page > 1,
    },
  };
}

export function canManageCampaignAssignments(request: Request) {
  return Boolean(request.user && userHasPermission(request.user, Permission.ANALYTICS_SETTINGS_MANAGE));
}
