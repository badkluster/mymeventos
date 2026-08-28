import { Router } from 'express';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { addDays, parseReportPeriod } from '../reporting/report-filter';
import { getIntegrationHealth, markIntegrationFailure, markIntegrationSuccess } from './integration-health.service';

const router = Router();
router.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));

type GraphError = { message?: string; type?: string; code?: number; error_subcode?: number };
type GraphEnvelope<T> = { data?: T[]; paging?: { next?: string }; error?: GraphError };
type ActionValue = { action_type?: string; value?: string };
type AlertEntity = { id: string; name: string };
type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  title: string;
  message: string;
  code?: string;
  entityCount?: number;
  entities?: AlertEntity[];
  detectedAt: string;
};
type ResultType = 'lead' | 'conversation' | 'none';
type InsightMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  linkClicks: number;
  linkCtr: number;
  linkCpc: number;
  leads: number;
  contacts: number;
  results: number;
  resultType: ResultType;
  costPerResult: number | null;
};
type CacheEntry = { payload: any; expiresAt: number; storedAt: string };

type MetaApiError = Error & {
  statusCode?: number;
  graphCode?: number | string;
  graphSubcode?: number;
};

const META_CACHE_TTL_MS = 5 * 60_000;
const META_RATE_LIMIT_COOLDOWN_MS = 3 * 60_000;
const META_MIN_COLD_SYNC_GAP_MS = 10_000;
const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<any>>();
let rateLimitedUntil = 0;
let lastColdSyncAt = 0;
let lastSuccessfulEntry: CacheEntry | null = null;

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minorCurrency(value: unknown) {
  return numeric(value) / 100;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function actionMetric(actions: ActionValue[] | undefined, candidates: string[]) {
  if (!actions?.length) return 0;
  for (const candidate of candidates) {
    const exact = actions.find((item) => item.action_type === candidate);
    if (exact) return numeric(exact.value);
  }
  const partial = actions.find((item) => candidates.some((candidate) => item.action_type?.includes(candidate)));
  return numeric(partial?.value);
}

function metaLeadCount(actions?: ActionValue[]) {
  return actionMetric(actions, ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead']);
}

function metaContactCount(actions?: ActionValue[]) {
  return actionMetric(actions, [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'contact',
  ]);
}

function primaryResult(objective: unknown, leads: number, contacts: number) {
  const normalized = String(objective ?? '').toUpperCase();
  if ((normalized.includes('ENGAGEMENT') || normalized.includes('MESSAGES')) && contacts > 0) {
    return { resultType: 'conversation' as const, results: contacts };
  }
  if (normalized.includes('LEAD') && leads > 0) return { resultType: 'lead' as const, results: leads };
  if (leads > 0) return { resultType: 'lead' as const, results: leads };
  if (contacts > 0) return { resultType: 'conversation' as const, results: contacts };
  return { resultType: 'none' as const, results: 0 };
}

function insightMetrics(insight: any, objective?: unknown): InsightMetrics {
  const spend = numeric(insight?.spend);
  const leads = metaLeadCount(insight?.actions);
  const contacts = metaContactCount(insight?.actions);
  const result = primaryResult(objective, leads, contacts);
  const inlineLinkClicks = numeric(insight?.inline_link_clicks);
  const outboundClicks = actionMetric(insight?.outbound_clicks, ['outbound_click']);
  const linkClicks = inlineLinkClicks || outboundClicks;
  return {
    spend,
    impressions: numeric(insight?.impressions),
    reach: numeric(insight?.reach),
    clicks: numeric(insight?.clicks),
    ctr: numeric(insight?.ctr),
    cpc: numeric(insight?.cpc),
    cpm: numeric(insight?.cpm),
    frequency: numeric(insight?.frequency),
    linkClicks,
    linkCtr: numeric(insight?.inline_link_click_ctr),
    linkCpc: numeric(insight?.cost_per_inline_link_click),
    leads,
    contacts,
    results: result.results,
    resultType: result.resultType,
    costPerResult: result.results ? spend / result.results : null,
  };
}

function activeProblemStatus(status?: string) {
  return ['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'IN_PROCESS', 'PENDING_REVIEW'].includes(String(status ?? '').toUpperCase());
}

function wasRecentlyConfigured(campaign: { startTime?: unknown; updatedTime?: unknown }, now = Date.now()) {
  const relevantTimestamp = [campaign.updatedTime, campaign.startTime]
    .map((value) => Date.parse(String(value ?? '')))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  if (!relevantTimestamp) return false;
  return relevantTimestamp >= now - 30 * 24 * 60 * 60 * 1000;
}

function graphErrorMessage(error: GraphError | undefined, fallback: string) {
  return String(error?.message || fallback).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]').slice(0, 500);
}

function isRateLimitError(error: MetaApiError) {
  const code = Number(error.graphCode ?? 0);
  const message = String(error.message ?? '').toLowerCase();
  return [4, 17, 32, 613].includes(code) || message.includes('request limit') || message.includes('rate limit');
}

async function graphFetch<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.META_MARKETING_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as T & { error?: GraphError };
    if (!response.ok || payload.error) {
      const error = new Error(graphErrorMessage(payload.error, `Meta Marketing API respondió ${response.status}.`)) as MetaApiError;
      error.statusCode = response.status;
      error.graphCode = payload.error?.code;
      error.graphSubcode = payload.error?.error_subcode;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function graphUrl(path: string, params: Record<string, string>) {
  if (!env.META_MARKETING_ACCESS_TOKEN) throw new Error('META_MARKETING_ACCESS_TOKEN no configurado.');
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', env.META_MARKETING_ACCESS_TOKEN);
  return url;
}

async function graphGet<T>(path: string, params: Record<string, string>) {
  return graphFetch<T>(graphUrl(path, params));
}

async function graphGetAll<T>(path: string, params: Record<string, string>, maxPages = 4, maxItems = 2500) {
  const items: T[] = [];
  let nextUrl: URL | null = graphUrl(path, params);
  let pages = 0;
  while (nextUrl && pages < maxPages && items.length < maxItems) {
    const payload: GraphEnvelope<T> = await graphFetch<GraphEnvelope<T>>(nextUrl);
    items.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ? new URL(payload.paging.next) : null;
    pages += 1;
  }
  return items.slice(0, maxItems);
}

function groupedAlert(alerts: Alert[], input: Omit<Alert, 'entityCount' | 'entities'> & { entities: AlertEntity[] }) {
  if (!input.entities.length) return;
  alerts.push({ ...input, entityCount: input.entities.length, entities: input.entities.slice(0, 8) });
}

function cacheKey(accountId: string, from: string, to: string) {
  return `${accountId}:${from}:${to}`;
}

function remember(key: string, payload: any) {
  const entry: CacheEntry = {
    payload,
    expiresAt: Date.now() + META_CACHE_TTL_MS,
    storedAt: new Date().toISOString(),
  };
  responseCache.set(key, entry);
  lastSuccessfulEntry = entry;
  while (responseCache.size > 12) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
}

function stalePayload(entry: CacheEntry, message: string, code = 'META_RATE_LIMIT') {
  const warning: Alert = {
    id: 'meta-rate-limit-stale',
    severity: 'warning',
    source: 'meta_ads',
    title: 'Meta limitó temporalmente las consultas',
    message: `${message} Se muestran los últimos datos sincronizados para mantener el panel operativo.`,
    code,
    detectedAt: new Date().toISOString(),
  };
  return {
    ...entry.payload,
    connection: { ...entry.payload.connection, status: 'connected' },
    alerts: [warning, ...(entry.payload.alerts ?? []).filter((item: Alert) => item.id !== warning.id && item.id !== 'meta-ads-api-error')],
    cache: { stale: true, storedAt: entry.storedAt },
  };
}

async function buildPayload(period: ReturnType<typeof parseReportPeriod>, accountId: string) {
  const accountPath = `act_${accountId}`;
  const timeRange = JSON.stringify({ since: period.fromDate, until: period.toDate });
  const previousTimeRange = JSON.stringify({ since: period.previousFromDate, until: period.previousToDate });
  const today = period.toDate;
  const monitor7From = addDays(today, -6);
  const monitor7Range = JSON.stringify({ since: monitor7From, until: today });
  const insightFields = 'impressions,reach,clicks,ctr,cpc,cpm,frequency,spend,actions,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,outbound_clicks';

  const accessibleAccounts = await graphGet<GraphEnvelope<any>>('me/adaccounts', {
    fields: 'id,account_id,name,business_name,amount_spent,balance,currency,timezone_name,spend_cap',
    limit: '100',
  });
  const accountPayload = (accessibleAccounts.data ?? []).find((account: any) => (
    String(account.account_id ?? '').replace(/^act_/, '') === accountId || String(account.id ?? '') === accountPath
  ));
  if (!accountPayload) {
    const error = new Error(`La cuenta publicitaria ${accountPath} no aparece entre las cuentas accesibles por el System User.`) as MetaApiError;
    error.graphCode = 'META_AD_ACCOUNT_NOT_ACCESSIBLE';
    throw error;
  }

  const [campaignsRaw, accountInsightsPayload, previousInsightsPayload] = await Promise.all([
    graphGetAll<any>(`${accountPath}/campaigns`, {
      fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,updated_time',
      limit: '500',
    }),
    graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { fields: insightFields, time_range: timeRange, limit: '50' }),
    graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { fields: insightFields, time_range: previousTimeRange, limit: '50' }),
  ]);

  const [campaignInsightsRaw, adsetInsightsRaw, adInsightsRaw] = await Promise.all([
    graphGetAll<any>(`${accountPath}/insights`, { level: 'campaign', fields: `campaign_id,campaign_name,objective,${insightFields}`, time_range: timeRange, limit: '500' }),
    graphGetAll<any>(`${accountPath}/insights`, { level: 'adset', fields: `adset_id,adset_name,campaign_id,campaign_name,${insightFields}`, time_range: timeRange, limit: '500' }),
    graphGetAll<any>(`${accountPath}/insights`, { level: 'ad', fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${insightFields}`, time_range: timeRange, limit: '500' }),
  ]);

  const [dailyRaw, monitor7Raw] = await Promise.all([
    graphGetAll<any>(`${accountPath}/insights`, { fields: `date_start,date_stop,${insightFields}`, time_range: timeRange, time_increment: '1', limit: '500' }),
    graphGetAll<any>(`${accountPath}/insights`, { level: 'campaign', fields: `campaign_id,campaign_name,objective,${insightFields}`, time_range: monitor7Range, limit: '500' }),
  ]);

  const campaignInsightMap = new Map(campaignInsightsRaw.map((item: any) => [String(item.campaign_id), item]));
  const campaignObjectiveMap = new Map(campaignsRaw.map((item: any) => [String(item.id), item.objective]));
  const campaignNameMap = new Map(campaignsRaw.map((item: any) => [String(item.id), item.name]));

  const campaigns = campaignsRaw.map((campaign: any) => {
    const insight: any = campaignInsightMap.get(String(campaign.id)) ?? {};
    return {
      id: String(campaign.id),
      name: String(campaign.name ?? 'Campaña sin nombre'),
      objective: campaign.objective ?? null,
      status: campaign.status ?? null,
      effectiveStatus: campaign.effective_status ?? campaign.status ?? null,
      dailyBudget: campaign.daily_budget ? minorCurrency(campaign.daily_budget) : null,
      lifetimeBudget: campaign.lifetime_budget ? minorCurrency(campaign.lifetime_budget) : null,
      startTime: campaign.start_time ?? null,
      stopTime: campaign.stop_time ?? null,
      updatedTime: campaign.updated_time ?? null,
      issues: [],
      ...insightMetrics(insight, campaign.objective),
    };
  }).sort((left: any, right: any) => right.spend - left.spend);

  const adsets = adsetInsightsRaw.map((insight: any) => ({
    id: String(insight.adset_id),
    name: String(insight.adset_name ?? 'Conjunto sin nombre'),
    campaignId: insight.campaign_id ?? null,
    campaignName: insight.campaign_name ?? campaignNameMap.get(String(insight.campaign_id)) ?? null,
    status: null,
    effectiveStatus: null,
    dailyBudget: null,
    lifetimeBudget: null,
    ...insightMetrics(insight, campaignObjectiveMap.get(String(insight.campaign_id))),
  })).sort((left: any, right: any) => right.spend - left.spend);

  const ads = adInsightsRaw.map((insight: any) => ({
    id: String(insight.ad_id),
    name: String(insight.ad_name ?? 'Anuncio sin nombre'),
    status: null,
    effectiveStatus: null,
    adsetId: insight.adset_id ?? null,
    adsetName: insight.adset_name ?? null,
    campaignId: insight.campaign_id ?? null,
    campaignName: insight.campaign_name ?? campaignNameMap.get(String(insight.campaign_id)) ?? null,
    ...insightMetrics(insight, campaignObjectiveMap.get(String(insight.campaign_id))),
  })).sort((left: any, right: any) => right.spend - left.spend);

  const accountMetric = insightMetrics(accountInsightsPayload.data?.[0] ?? {});
  const previousMetric = insightMetrics(previousInsightsPayload.data?.[0] ?? {});
  const totalPrimaryResults = campaigns.reduce((sum: number, item: any) => sum + item.results, 0);
  const summary = {
    ...accountMetric,
    results: totalPrimaryResults || accountMetric.results,
    costPerResult: (totalPrimaryResults || accountMetric.results)
      ? accountMetric.spend / (totalPrimaryResults || accountMetric.results)
      : null,
  };

  const comparison = {
    spend: percentageChange(summary.spend, previousMetric.spend),
    impressions: percentageChange(summary.impressions, previousMetric.impressions),
    reach: percentageChange(summary.reach, previousMetric.reach),
    clicks: percentageChange(summary.clicks, previousMetric.clicks),
    linkClicks: percentageChange(summary.linkClicks, previousMetric.linkClicks),
    ctr: percentageChange(summary.ctr, previousMetric.ctr),
    cpc: percentageChange(summary.cpc, previousMetric.cpc),
    cpm: percentageChange(summary.cpm, previousMetric.cpm),
    leads: percentageChange(summary.leads, previousMetric.leads),
    contacts: percentageChange(summary.contacts, previousMetric.contacts),
  };

  const daily = dailyRaw.map((item: any) => ({ date: item.date_start, ...insightMetrics(item) }));
  const monitor7Map = new Map(monitor7Raw.map((item: any) => [String(item.campaign_id), item]));
  const activeCampaigns = campaigns.filter((item: any) => String(item.effectiveStatus).toUpperCase() === 'ACTIVE');
  const deliveringCampaigns = activeCampaigns.filter((item: any) => insightMetrics(monitor7Map.get(item.id), item.objective).impressions > 0);
  const spendingCampaigns = campaigns.filter((item: any) => item.spend > 0);
  const alerts: Alert[] = [];
  const detectedAt = new Date().toISOString();

  const statusProblems = campaigns
    .filter((item: any) => activeProblemStatus(item.effectiveStatus))
    .map((item: any) => ({ id: item.id, name: item.name }));
  groupedAlert(alerts, {
    id: 'meta-campaign-status-problems', severity: 'critical', source: 'meta_ads',
    title: 'Campañas con problemas de estado',
    message: `${statusProblems.length} campaña(s) requieren revisión por rechazo, error o revisión pendiente.`,
    code: 'CAMPAIGN_STATUS_PROBLEM', detectedAt, entities: statusProblems,
  });

  const noDelivery = activeCampaigns
    .filter((item: any) => wasRecentlyConfigured(item) && insightMetrics(monitor7Map.get(item.id), item.objective).impressions === 0)
    .map((item: any) => ({ id: item.id, name: item.name }));
  groupedAlert(alerts, {
    id: 'meta-active-no-delivery', severity: 'warning', source: 'meta_ads',
    title: 'Campañas activas sin entrega reciente',
    message: `${noDelivery.length} campaña(s) creadas o actualizadas en los últimos 30 días figuran activas en Meta pero no tuvieron impresiones en los últimos 7 días.`,
    code: 'ACTIVE_NO_DELIVERY', detectedAt, entities: noDelivery,
  });

  const highFrequency = activeCampaigns
    .filter((item: any) => {
      const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
      return metric.impressions >= 500 && metric.frequency >= 4;
    })
    .map((item: any) => ({ id: item.id, name: item.name }));
  groupedAlert(alerts, {
    id: 'meta-high-frequency', severity: 'warning', source: 'meta_ads',
    title: 'Posible fatiga de audiencia',
    message: `${highFrequency.length} campaña(s) superan frecuencia 4 en los últimos 7 días con volumen suficiente.`,
    code: 'HIGH_FREQUENCY', detectedAt, entities: highFrequency,
  });

  const lowCtr = activeCampaigns
    .filter((item: any) => {
      const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
      const ctr = metric.linkCtr || metric.ctr;
      return metric.impressions >= 1000 && ctr > 0 && ctr < 0.8 && metric.results === 0;
    })
    .map((item: any) => ({ id: item.id, name: item.name }));
  groupedAlert(alerts, {
    id: 'meta-low-ctr', severity: 'warning', source: 'meta_ads',
    title: 'CTR bajo con volumen suficiente',
    message: `${lowCtr.length} campaña(s) tienen CTR menor a 0,8% y no registraron resultados en los últimos 7 días.`,
    code: 'LOW_CTR', detectedAt, entities: lowCtr,
  });

  const spendWithoutResults = activeCampaigns
    .filter((item: any) => {
      const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
      return metric.spend >= 1000 && metric.results === 0;
    })
    .map((item: any) => ({ id: item.id, name: item.name }));
  groupedAlert(alerts, {
    id: 'meta-spend-without-results', severity: 'warning', source: 'meta_ads',
    title: 'Gasto sin resultados atribuibles',
    message: `${spendWithoutResults.length} campaña(s) gastaron en los últimos 7 días sin registrar el resultado principal esperado.`,
    code: 'SPEND_WITHOUT_RESULTS', detectedAt, entities: spendWithoutResults,
  });

  await markIntegrationSuccess('meta_ads', {
    accountId,
    campaignCount: campaigns.length,
    adsetCount: adsets.length,
    adCount: ads.length,
  });

  const severityRank: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 };
  return {
    configured: true,
    connection: { status: 'connected' as const, lastSyncAt: detectedAt },
    account: {
      id: accountPayload.id ?? accountPath,
      name: accountPayload.name ?? null,
      businessName: accountPayload.business_name ?? null,
      currency: accountPayload.currency ?? null,
      timezone: accountPayload.timezone_name ?? null,
      amountSpentLifetime: minorCurrency(accountPayload.amount_spent),
      balance: minorCurrency(accountPayload.balance),
      spendCap: numeric(accountPayload.spend_cap) > 0 ? minorCurrency(accountPayload.spend_cap) : null,
      instagramAccounts: [],
    },
    summary,
    comparison,
    operationalCounts: {
      campaignsTotal: campaigns.length,
      activeInMeta: activeCampaigns.length,
      deliveringRecent: deliveringCampaigns.length,
      withSpendInPeriod: spendingCampaigns.length,
      adsetsWithInsights: adsets.length,
      adsWithInsights: ads.length,
    },
    campaigns,
    adsets,
    ads,
    daily,
    alerts: alerts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]),
    integrationHealth: await getIntegrationHealth(),
    period: {
      from: period.fromDate,
      to: period.toDate,
      previousFrom: period.previousFromDate,
      previousTo: period.previousToDate,
    },
    monitoringPeriod: { frequencyFrom: monitor7From, deliveryFrom: monitor7From, to: today },
    cache: { stale: false },
  };
}

router.get('/meta', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const accountId = env.META_AD_ACCOUNT_ID?.replace(/^act_/, '');
  const configured = Boolean(accountId && env.META_MARKETING_ACCESS_TOKEN);

  if (!configured || !accountId) {
    return sendSuccess(response, {
      configured: false,
      connection: { status: 'pending', lastSyncAt: null },
      account: null,
      summary: null,
      comparison: null,
      operationalCounts: null,
      campaigns: [], adsets: [], ads: [], daily: [],
      alerts: [{
        id: 'meta-ads-not-configured', severity: 'warning', source: 'meta_ads',
        title: 'Meta Ads todavía no está conectado',
        message: 'Falta configurar la cuenta publicitaria y un token con permiso de lectura de anuncios.',
        code: 'META_ADS_NOT_CONFIGURED', detectedAt: new Date().toISOString(),
      }],
      integrationHealth: await getIntegrationHealth(),
      period: { from: period.fromDate, to: period.toDate },
    });
  }

  const key = cacheKey(accountId, period.fromDate, period.toDate);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return sendSuccess(response, { ...cached.payload, cache: { stale: false, storedAt: cached.storedAt, hit: true } });
  }

  if (Date.now() < rateLimitedUntil) {
    const fallback = cached ?? lastSuccessfulEntry;
    if (fallback) {
      return sendSuccess(response, stalePayload(fallback, 'La Marketing API está en período de enfriamiento por límite de solicitudes.'));
    }
  }

  const running = inFlight.get(key);
  if (running) {
    return sendSuccess(response, await running);
  }

  if (Date.now() - lastColdSyncAt < META_MIN_COLD_SYNC_GAP_MS && lastSuccessfulEntry) {
    return sendSuccess(response, stalePayload(lastSuccessfulEntry, 'Se evitó una sincronización repetida demasiado cercana para proteger la cuota de Meta.', 'META_SYNC_THROTTLED'));
  }

  lastColdSyncAt = Date.now();
  const task = buildPayload(period, accountId);
  inFlight.set(key, task);

  try {
    const payload = await task;
    remember(key, payload);
    return sendSuccess(response, payload);
  } catch (cause) {
    const error = (cause instanceof Error ? cause : new Error('No se pudo consultar Meta Marketing API.')) as MetaApiError;
    const message = error.message;
    const graphCode = String(error.graphCode ?? 'META_MARKETING_API_ERROR');
    const statusCode = numeric(error.statusCode) || undefined;

    if (isRateLimitError(error)) rateLimitedUntil = Date.now() + META_RATE_LIMIT_COOLDOWN_MS;

    await markIntegrationFailure('meta_ads', { code: graphCode, message, statusCode, context: { accountId } });

    const fallback = responseCache.get(key) ?? lastSuccessfulEntry;
    if (fallback && isRateLimitError(error)) {
      return sendSuccess(response, stalePayload(fallback, message, graphCode));
    }

    return sendSuccess(response, {
      configured: true,
      connection: { status: 'error', lastSyncAt: null },
      account: null,
      summary: null,
      comparison: null,
      operationalCounts: null,
      campaigns: [], adsets: [], ads: [], daily: [],
      alerts: [{
        id: 'meta-ads-api-error', severity: 'critical', source: 'meta_ads',
        title: isRateLimitError(error) ? 'Meta alcanzó temporalmente el límite de consultas' : 'Meta Ads no está sincronizando',
        message,
        code: graphCode,
        detectedAt: new Date().toISOString(),
      }],
      integrationHealth: await getIntegrationHealth(),
      period: { from: period.fromDate, to: period.toDate },
    });
  } finally {
    inFlight.delete(key);
  }
}));

router.get('/health', asyncHandler(async (_request, response) => {
  return sendSuccess(response, { items: await getIntegrationHealth() });
}));

export default router;
