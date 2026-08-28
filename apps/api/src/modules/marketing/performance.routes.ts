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
type GraphPaging = { next?: string; cursors?: { before?: string; after?: string } };
type GraphEnvelope<T> = { data?: T[]; paging?: GraphPaging; error?: GraphError };
type ActionValue = { action_type?: string; value?: string };

type AlertEntity = { id: string; name: string };
type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  title: string;
  message: string;
  code?: string;
  entityId?: string;
  entityName?: string;
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
  return actionMetric(actions, [
    'lead',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.lead_grouped',
    'onsite_conversion.lead',
  ]);
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
  const linkCtr = numeric(insight?.inline_link_click_ctr);
  const linkCpc = numeric(insight?.cost_per_inline_link_click);
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
    linkCtr,
    linkCpc,
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

function graphErrorMessage(error: GraphError | undefined, fallback: string) {
  return String(error?.message || fallback).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]').slice(0, 500);
}

async function graphFetch<T>(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.META_MARKETING_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as T & { error?: GraphError };
    if (!response.ok || payload.error) {
      const error = new Error(graphErrorMessage(payload.error, `Meta Marketing API respondió ${response.status}.`));
      Object.assign(error, { statusCode: response.status, graphCode: payload.error?.code, graphSubcode: payload.error?.error_subcode });
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

async function graphGetAll<T>(path: string, params: Record<string, string>, maxPages = 25) {
  const items: T[] = [];
  let nextUrl: URL | null = graphUrl(path, params);
  let pages = 0;
  while (nextUrl && pages < maxPages) {
    const payload: GraphEnvelope<T> = await graphFetch<GraphEnvelope<T>>(nextUrl);
    items.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ? new URL(payload.paging.next) : null;
    pages += 1;
  }
  return items;
}

function integrationAlerts(health: Awaited<ReturnType<typeof getIntegrationHealth>>) {
  const now = new Date().toISOString();
  return health.flatMap((item) => {
    const lastFailure = item.lastFailureAt ? new Date(item.lastFailureAt).getTime() : 0;
    const lastSuccess = item.lastSuccessAt ? new Date(item.lastSuccessAt).getTime() : 0;
    if (!lastFailure || lastSuccess >= lastFailure) return [];
    return [{
      id: `integration-${item.provider}`,
      severity: item.status === 'error' ? 'critical' as const : 'warning' as const,
      source: item.provider,
      title: item.status === 'error' ? 'Integración con errores repetidos' : 'Integración degradada',
      message: item.lastErrorMessage || 'La última comunicación con el proveedor falló.',
      code: item.lastErrorCode || undefined,
      detectedAt: item.lastFailureAt ? new Date(item.lastFailureAt).toISOString() : now,
    }];
  });
}

function groupedAlert(
  alerts: Alert[],
  input: Omit<Alert, 'entityCount' | 'entities'> & { entities: AlertEntity[] },
) {
  if (!input.entities.length) return;
  alerts.push({
    ...input,
    entityCount: input.entities.length,
    entities: input.entities.slice(0, 8),
  });
}

router.get('/meta', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const health = await getIntegrationHealth();
  const alerts: Alert[] = integrationAlerts(health);
  const accountId = env.META_AD_ACCOUNT_ID?.replace(/^act_/, '');
  const configured = Boolean(accountId && env.META_MARKETING_ACCESS_TOKEN);

  if (!configured) {
    alerts.unshift({
      id: 'meta-ads-not-configured',
      severity: 'warning',
      source: 'meta_ads',
      title: 'Meta Ads todavía no está conectado',
      message: 'Falta configurar la cuenta publicitaria y un token con permiso de lectura de anuncios. El panel queda preparado y no inventa métricas.',
      code: 'META_ADS_NOT_CONFIGURED',
      detectedAt: new Date().toISOString(),
    });
    return sendSuccess(response, {
      configured: false,
      connection: { status: 'pending', lastSyncAt: null },
      account: null,
      summary: null,
      comparison: null,
      operationalCounts: null,
      campaigns: [],
      adsets: [],
      ads: [],
      daily: [],
      alerts,
      integrationHealth: health,
      period: { from: period.fromDate, to: period.toDate },
    });
  }

  const accountPath = `act_${accountId}`;
  const timeRange = JSON.stringify({ since: period.fromDate, until: period.toDate });
  const previousTimeRange = JSON.stringify({ since: period.previousFromDate, until: period.previousToDate });
  const today = period.toDate;
  const monitor7From = addDays(today, -6);
  const monitor3From = addDays(today, -2);
  const monitor7Range = JSON.stringify({ since: monitor7From, until: today });
  const monitor3Range = JSON.stringify({ since: monitor3From, until: today });
  const insightFields = 'impressions,reach,clicks,ctr,cpc,cpm,frequency,spend,actions,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,outbound_clicks';

  try {
    const accessibleAccounts = await graphGet<GraphEnvelope<any>>('me/adaccounts', {
      fields: 'id,account_id,name,business_name,amount_spent,balance,currency,timezone_name,spend_cap',
      limit: '100',
    });
    const accountPayload = (accessibleAccounts.data ?? []).find((account: any) => (
      String(account.account_id ?? '').replace(/^act_/, '') === accountId || String(account.id ?? '') === accountPath
    ));
    if (!accountPayload) {
      const error = new Error(`La cuenta publicitaria ${accountPath} no aparece entre las cuentas accesibles por el System User.`);
      Object.assign(error, { graphCode: 'META_AD_ACCOUNT_NOT_ACCESSIBLE' });
      throw error;
    }

    const [
      campaignsRaw,
      adsetsRaw,
      adsRaw,
      accountInsightsPayload,
      previousInsightsPayload,
      campaignInsightsRaw,
      adsetInsightsRaw,
      adInsightsRaw,
      dailyRaw,
      monitor7Raw,
      monitor3Raw,
    ] = await Promise.all([
      graphGetAll<any>(`${accountPath}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,updated_time', limit: '100' }),
      graphGetAll<any>(`${accountPath}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time', limit: '100' }),
      graphGetAll<any>(`${accountPath}/ads`, { fields: 'id,name,status,effective_status,adset_id,campaign_id', limit: '100' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { fields: insightFields, time_range: timeRange, limit: '20' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { fields: insightFields, time_range: previousTimeRange, limit: '20' }),
      graphGetAll<any>(`${accountPath}/insights`, { level: 'campaign', fields: `campaign_id,campaign_name,objective,${insightFields}`, time_range: timeRange, limit: '100' }),
      graphGetAll<any>(`${accountPath}/insights`, { level: 'adset', fields: `adset_id,adset_name,campaign_id,campaign_name,${insightFields}`, time_range: timeRange, limit: '100' }),
      graphGetAll<any>(`${accountPath}/insights`, { level: 'ad', fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${insightFields}`, time_range: timeRange, limit: '100' }),
      graphGetAll<any>(`${accountPath}/insights`, { fields: `date_start,date_stop,${insightFields}`, time_range: timeRange, time_increment: '1', limit: '100' }),
      graphGetAll<any>(`${accountPath}/insights`, { level: 'campaign', fields: `campaign_id,campaign_name,objective,${insightFields}`, time_range: monitor7Range, limit: '100' }),
      graphGetAll<any>(`${accountPath}/insights`, { level: 'campaign', fields: `campaign_id,campaign_name,objective,${insightFields}`, time_range: monitor3Range, limit: '100' }),
    ]);

    const campaignDetailMap = new Map(campaignsRaw.map((item: any) => [String(item.id), item]));
    const campaignInsightMap = new Map(campaignInsightsRaw.map((item: any) => [String(item.campaign_id), item]));
    const campaignObjectiveMap = new Map(campaignsRaw.map((item: any) => [String(item.id), item.objective]));
    const adsetDetailMap = new Map(adsetsRaw.map((item: any) => [String(item.id), item]));
    const adDetailMap = new Map(adsRaw.map((item: any) => [String(item.id), item]));

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

    const adsets = adsetInsightsRaw.map((insight: any) => {
      const detail: any = adsetDetailMap.get(String(insight.adset_id)) ?? {};
      const objective = campaignObjectiveMap.get(String(insight.campaign_id));
      return {
        id: String(insight.adset_id),
        name: String(insight.adset_name ?? detail.name ?? 'Conjunto sin nombre'),
        campaignId: insight.campaign_id ?? detail.campaign_id ?? null,
        campaignName: insight.campaign_name ?? campaignDetailMap.get(String(insight.campaign_id))?.name ?? null,
        status: detail.status ?? null,
        effectiveStatus: detail.effective_status ?? detail.status ?? null,
        dailyBudget: detail.daily_budget ? minorCurrency(detail.daily_budget) : null,
        lifetimeBudget: detail.lifetime_budget ? minorCurrency(detail.lifetime_budget) : null,
        ...insightMetrics(insight, objective),
      };
    }).sort((left: any, right: any) => right.spend - left.spend);

    const ads = adInsightsRaw.map((insight: any) => {
      const detail: any = adDetailMap.get(String(insight.ad_id)) ?? {};
      const objective = campaignObjectiveMap.get(String(insight.campaign_id));
      return {
        id: String(insight.ad_id),
        name: insight.ad_name ?? detail.name ?? 'Anuncio sin nombre',
        status: detail.status ?? null,
        effectiveStatus: detail.effective_status ?? detail.status ?? null,
        adsetId: insight.adset_id ?? detail.adset_id ?? null,
        adsetName: insight.adset_name ?? null,
        campaignId: insight.campaign_id ?? detail.campaign_id ?? null,
        campaignName: insight.campaign_name ?? null,
        ...insightMetrics(insight, objective),
      };
    }).sort((left: any, right: any) => right.spend - left.spend);

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

    const daily = dailyRaw.map((item: any) => ({
      date: item.date_start,
      ...insightMetrics(item),
    }));

    const monitor7Map = new Map(monitor7Raw.map((item: any) => [String(item.campaign_id), item]));
    const monitor3Map = new Map(monitor3Raw.map((item: any) => [String(item.campaign_id), item]));
    const activeCampaigns = campaigns.filter((item: any) => String(item.effectiveStatus).toUpperCase() === 'ACTIVE');
    const deliveringCampaigns = activeCampaigns.filter((item: any) => insightMetrics(monitor3Map.get(item.id), item.objective).impressions > 0);
    const spendingCampaigns = campaigns.filter((item: any) => item.spend > 0);

    const statusProblems = campaigns
      .filter((item: any) => activeProblemStatus(item.effectiveStatus))
      .map((item: any) => ({ id: item.id, name: item.name }));
    groupedAlert(alerts, {
      id: 'meta-campaign-status-problems',
      severity: 'critical',
      source: 'meta_ads',
      title: 'Campañas con problemas de estado',
      message: `${statusProblems.length} campaña(s) requieren revisión por rechazo, error o revisión pendiente.`,
      code: 'CAMPAIGN_STATUS_PROBLEM',
      detectedAt: new Date().toISOString(),
      entities: statusProblems,
    });

    const noDelivery = activeCampaigns
      .filter((item: any) => insightMetrics(monitor3Map.get(item.id), item.objective).impressions === 0)
      .map((item: any) => ({ id: item.id, name: item.name }));
    groupedAlert(alerts, {
      id: 'meta-active-no-delivery',
      severity: 'warning',
      source: 'meta_ads',
      title: 'Campañas activas sin entrega reciente',
      message: `${noDelivery.length} campaña(s) figuran activas en Meta pero no tuvieron impresiones en los últimos 3 días. Puede tratarse de campañas históricas que conviene ordenar o pausar.`,
      code: 'ACTIVE_NO_DELIVERY',
      detectedAt: new Date().toISOString(),
      entities: noDelivery,
    });

    const highFrequency = activeCampaigns
      .filter((item: any) => {
        const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
        return metric.impressions >= 500 && metric.frequency >= 4;
      })
      .map((item: any) => ({ id: item.id, name: item.name }));
    groupedAlert(alerts, {
      id: 'meta-high-frequency',
      severity: 'warning',
      source: 'meta_ads',
      title: 'Posible fatiga de audiencia',
      message: `${highFrequency.length} campaña(s) superan frecuencia 4 en los últimos 7 días con volumen suficiente. Revisar saturación y rotación creativa.`,
      code: 'HIGH_FREQUENCY',
      detectedAt: new Date().toISOString(),
      entities: highFrequency,
    });

    const lowCtr = activeCampaigns
      .filter((item: any) => {
        const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
        const ctr = metric.linkCtr || metric.ctr;
        return metric.impressions >= 1000 && ctr > 0 && ctr < 0.8;
      })
      .map((item: any) => ({ id: item.id, name: item.name }));
    groupedAlert(alerts, {
      id: 'meta-low-ctr',
      severity: 'warning',
      source: 'meta_ads',
      title: 'CTR bajo con volumen suficiente',
      message: `${lowCtr.length} campaña(s) tienen CTR menor a 0,8% en los últimos 7 días. Conviene revisar creativo, copy o segmentación.`,
      code: 'LOW_CTR',
      detectedAt: new Date().toISOString(),
      entities: lowCtr,
    });

    const spendWithoutResults = activeCampaigns
      .filter((item: any) => {
        const metric = insightMetrics(monitor7Map.get(item.id), item.objective);
        return metric.spend >= 1000 && metric.results === 0;
      })
      .map((item: any) => ({ id: item.id, name: item.name }));
    groupedAlert(alerts, {
      id: 'meta-spend-without-results',
      severity: 'warning',
      source: 'meta_ads',
      title: 'Gasto sin resultados atribuibles',
      message: `${spendWithoutResults.length} campaña(s) gastaron en los últimos 7 días sin registrar el resultado principal esperado (lead o conversación, según objetivo).`,
      code: 'SPEND_WITHOUT_RESULTS',
      detectedAt: new Date().toISOString(),
      entities: spendWithoutResults,
    });

    await markIntegrationSuccess('meta_ads', {
      accountId,
      campaignCount: campaigns.length,
      adsetCount: adsets.length,
      adCount: ads.length,
    });
    const freshHealth = await getIntegrationHealth();
    const successfulAlerts = alerts.filter((alert) => alert.id !== 'integration-meta_ads');
    const severityRank: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 };

    return sendSuccess(response, {
      configured: true,
      connection: { status: 'connected', lastSyncAt: new Date().toISOString() },
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
      alerts: successfulAlerts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]),
      integrationHealth: freshHealth,
      period: {
        from: period.fromDate,
        to: period.toDate,
        previousFrom: period.previousFromDate,
        previousTo: period.previousToDate,
      },
      monitoringPeriod: {
        frequencyFrom: monitor7From,
        deliveryFrom: monitor3From,
        to: today,
      },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar Meta Marketing API.';
    const statusCode = numeric(error?.statusCode) || undefined;
    const graphCode = error?.graphCode ? String(error.graphCode) : 'META_MARKETING_API_ERROR';
    await markIntegrationFailure('meta_ads', { code: graphCode, message, statusCode, context: { accountId } });
    alerts.unshift({
      id: 'meta-ads-api-error',
      severity: 'critical',
      source: 'meta_ads',
      title: 'Meta Ads no está sincronizando',
      message,
      code: graphCode,
      detectedAt: new Date().toISOString(),
    });
    return sendSuccess(response, {
      configured: true,
      connection: { status: 'error', lastSyncAt: null },
      account: null,
      summary: null,
      comparison: null,
      operationalCounts: null,
      campaigns: [],
      adsets: [],
      ads: [],
      daily: [],
      alerts,
      integrationHealth: await getIntegrationHealth(),
      period: { from: period.fromDate, to: period.toDate },
    });
  }
}));

router.get('/health', asyncHandler(async (_request, response) => {
  return sendSuccess(response, { items: await getIntegrationHealth() });
}));

export default router;
