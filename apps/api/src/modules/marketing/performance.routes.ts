import { Router } from 'express';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { parseReportPeriod } from '../reporting/report-filter';
import { getIntegrationHealth, markIntegrationFailure, markIntegrationSuccess } from './integration-health.service';

const router = Router();
router.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));

type GraphError = { message?: string; type?: string; code?: number; error_subcode?: number };
type GraphEnvelope<T> = { data?: T[]; error?: GraphError };
type ActionValue = { action_type?: string; value?: string };

type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  title: string;
  message: string;
  code?: string;
  entityId?: string;
  entityName?: string;
  detectedAt: string;
};

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minorCurrency(value: unknown) {
  return numeric(value) / 100;
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
  return actionMetric(actions, ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped']);
}

function metaContactCount(actions?: ActionValue[]) {
  return actionMetric(actions, ['contact', 'onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d']);
}

function activeProblemStatus(status?: string) {
  return ['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'IN_PROCESS', 'PENDING_REVIEW'].includes(String(status ?? '').toUpperCase());
}

function graphErrorMessage(error: GraphError | undefined, fallback: string) {
  return String(error?.message || fallback).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]').slice(0, 500);
}

async function graphGet<T>(path: string, params: Record<string, string>) {
  if (!env.META_MARKETING_ACCESS_TOKEN) throw new Error('META_MARKETING_ACCESS_TOKEN no configurado.');
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', env.META_MARKETING_ACCESS_TOKEN);
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
      campaigns: [],
      ads: [],
      alerts,
      integrationHealth: health,
      period: { from: period.fromDate, to: period.toDate },
    });
  }

  const accountPath = `act_${accountId}`;
  const timeRange = JSON.stringify({ since: period.fromDate, until: period.toDate });
  try {
    const [accountPayload, campaignsPayload, accountInsightsPayload, campaignInsightsPayload, adsPayload, adInsightsPayload] = await Promise.all([
      graphGet<any>(accountPath, { fields: 'id,name,business_name,amount_spent,balance,currency,timezone_name,instagram_accounts{id,username},spend_cap' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/campaigns`, { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,updated_time,issues_info', limit: '200' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { fields: 'impressions,reach,clicks,ctr,cpc,cpm,frequency,spend,actions,action_values', time_range: timeRange, limit: '20' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { level: 'campaign', fields: 'campaign_id,campaign_name,impressions,reach,clicks,ctr,cpc,cpm,frequency,spend,actions,action_values', time_range: timeRange, limit: '200' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/ads`, { fields: 'id,name,status,effective_status,adset_id,campaign_id', limit: '200' }),
      graphGet<GraphEnvelope<any>>(`${accountPath}/insights`, { level: 'ad', fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,reach,clicks,ctr,cpc,cpm,frequency,spend,actions,action_values', time_range: timeRange, limit: '200' }),
    ]);

    const accountInsight = accountInsightsPayload.data?.[0] ?? {};
    const summaryLeads = metaLeadCount(accountInsight.actions);
    const summarySpend = numeric(accountInsight.spend);
    const summary = {
      spend: summarySpend,
      impressions: numeric(accountInsight.impressions),
      reach: numeric(accountInsight.reach),
      clicks: numeric(accountInsight.clicks),
      ctr: numeric(accountInsight.ctr),
      cpc: numeric(accountInsight.cpc),
      cpm: numeric(accountInsight.cpm),
      frequency: numeric(accountInsight.frequency),
      leads: summaryLeads,
      contacts: metaContactCount(accountInsight.actions),
      cpl: summaryLeads ? summarySpend / summaryLeads : null,
    };

    const campaignInsightMap = new Map((campaignInsightsPayload.data ?? []).map((item: any) => [String(item.campaign_id), item]));
    const campaigns = (campaignsPayload.data ?? []).map((campaign: any) => {
      const insight: any = campaignInsightMap.get(String(campaign.id)) ?? {};
      const spend = numeric(insight.spend);
      const leads = metaLeadCount(insight.actions);
      const row = {
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
        issues: Array.isArray(campaign.issues_info) ? campaign.issues_info : [],
        spend,
        impressions: numeric(insight.impressions),
        reach: numeric(insight.reach),
        clicks: numeric(insight.clicks),
        ctr: numeric(insight.ctr),
        cpc: numeric(insight.cpc),
        cpm: numeric(insight.cpm),
        frequency: numeric(insight.frequency),
        leads,
        contacts: metaContactCount(insight.actions),
        cpl: leads ? spend / leads : null,
      };

      if (row.issues.length || activeProblemStatus(row.effectiveStatus)) alerts.push({
        id: `campaign-status-${row.id}`,
        severity: ['DISAPPROVED', 'ERROR', 'WITH_ISSUES'].includes(String(row.effectiveStatus).toUpperCase()) ? 'critical' : 'warning',
        source: 'meta_ads',
        title: 'Campaña con problema de entrega o revisión',
        message: `${row.name}: estado ${row.effectiveStatus || 'desconocido'}. Revisar antes de aumentar presupuesto.`,
        code: String(row.effectiveStatus || 'CAMPAIGN_ISSUE'), entityId: row.id, entityName: row.name, detectedAt: new Date().toISOString(),
      });
      if (String(row.effectiveStatus).toUpperCase() === 'ACTIVE' && row.impressions === 0) alerts.push({
        id: `campaign-no-delivery-${row.id}`, severity: 'warning', source: 'meta_ads', title: 'Campaña activa sin entrega',
        message: `${row.name} figura activa pero no registró impresiones en el período seleccionado.`, code: 'ACTIVE_NO_DELIVERY', entityId: row.id, entityName: row.name, detectedAt: new Date().toISOString(),
      });
      if (row.impressions >= 1000 && row.ctr > 0 && row.ctr < 0.8) alerts.push({
        id: `campaign-low-ctr-${row.id}`, severity: 'warning', source: 'meta_ads', title: 'CTR bajo',
        message: `${row.name} tiene CTR de ${row.ctr.toFixed(2)}% con más de 1.000 impresiones. Conviene revisar creativo, copy o segmentación.`, code: 'LOW_CTR', entityId: row.id, entityName: row.name, detectedAt: new Date().toISOString(),
      });
      if (row.frequency >= 4) alerts.push({
        id: `campaign-frequency-${row.id}`, severity: 'warning', source: 'meta_ads', title: 'Posible fatiga de audiencia',
        message: `${row.name} alcanzó frecuencia ${row.frequency.toFixed(1)}. Revisar saturación y rotación creativa.`, code: 'HIGH_FREQUENCY', entityId: row.id, entityName: row.name, detectedAt: new Date().toISOString(),
      });
      if (row.spend >= 1000 && row.leads === 0) alerts.push({
        id: `campaign-no-leads-${row.id}`, severity: 'warning', source: 'meta_ads', title: 'Gasto sin leads atribuidos',
        message: `${row.name} registra gasto pero ningún lead atribuido en el período. Revisar objetivo, medición y calidad del tráfico.`, code: 'SPEND_WITHOUT_LEADS', entityId: row.id, entityName: row.name, detectedAt: new Date().toISOString(),
      });
      return row;
    }).sort((left: any, right: any) => right.spend - left.spend);

    const adDetailsMap = new Map((adsPayload.data ?? []).map((item: any) => [String(item.id), item]));
    const ads = (adInsightsPayload.data ?? []).map((insight: any) => {
      const detail: any = adDetailsMap.get(String(insight.ad_id)) ?? {};
      const spend = numeric(insight.spend);
      const leads = metaLeadCount(insight.actions);
      return {
        id: String(insight.ad_id),
        name: insight.ad_name ?? detail.name ?? 'Anuncio sin nombre',
        status: detail.status ?? null,
        effectiveStatus: detail.effective_status ?? detail.status ?? null,
        adsetId: insight.adset_id ?? detail.adset_id ?? null,
        adsetName: insight.adset_name ?? null,
        campaignId: insight.campaign_id ?? detail.campaign_id ?? null,
        campaignName: insight.campaign_name ?? null,
        spend,
        impressions: numeric(insight.impressions),
        reach: numeric(insight.reach),
        clicks: numeric(insight.clicks),
        ctr: numeric(insight.ctr),
        cpc: numeric(insight.cpc),
        cpm: numeric(insight.cpm),
        frequency: numeric(insight.frequency),
        leads,
        contacts: metaContactCount(insight.actions),
        cpl: leads ? spend / leads : null,
      };
    }).sort((left: any, right: any) => right.spend - left.spend);

    await markIntegrationSuccess('meta_ads', { accountId, campaignCount: campaigns.length, adCount: ads.length });
    const severityRank: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 };
    return sendSuccess(response, {
      configured: true,
      connection: { status: 'connected', lastSyncAt: new Date().toISOString() },
      account: {
        id: accountPayload.id ?? `act_${accountId}`,
        name: accountPayload.name ?? null,
        businessName: accountPayload.business_name ?? null,
        currency: accountPayload.currency ?? null,
        timezone: accountPayload.timezone_name ?? null,
        amountSpentLifetime: minorCurrency(accountPayload.amount_spent),
        balance: minorCurrency(accountPayload.balance),
        spendCap: accountPayload.spend_cap ? minorCurrency(accountPayload.spend_cap) : null,
        instagramAccounts: accountPayload.instagram_accounts?.data ?? [],
      },
      summary,
      campaigns,
      ads,
      alerts: alerts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]),
      integrationHealth: health,
      period: { from: period.fromDate, to: period.toDate },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar Meta Marketing API.';
    const statusCode = numeric(error?.statusCode) || undefined;
    const graphCode = error?.graphCode ? String(error.graphCode) : 'META_MARKETING_API_ERROR';
    await markIntegrationFailure('meta_ads', { code: graphCode, message, statusCode, context: { accountId } });
    alerts.unshift({
      id: 'meta-ads-api-error', severity: 'critical', source: 'meta_ads', title: 'Meta Ads no está sincronizando',
      message, code: graphCode, detectedAt: new Date().toISOString(),
    });
    return sendSuccess(response, {
      configured: true,
      connection: { status: 'error', lastSyncAt: null },
      account: null,
      summary: null,
      campaigns: [],
      ads: [],
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
