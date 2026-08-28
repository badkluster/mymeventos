import { Router } from 'express';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { parseReportPeriod } from '../reporting/report-filter';

const router = Router();
router.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));

type GraphError = { message?: string; code?: number; error_subcode?: number };
type GraphEnvelope<T> = { data?: T[]; paging?: { next?: string }; error?: GraphError };
type CacheEntry = { expiresAt: number; payload: MetaAttributionPayload };
type MetaAttributionPayload = {
  account: { currency: string | null } | null;
  campaigns: Array<{ id: string; name: string; spend: number }>;
  connection: { status: 'connected' | 'pending' | 'error'; lastSyncAt: string | null };
  cache?: { hit: boolean };
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MetaAttributionPayload>>();

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function graphUrl(path: string, params: Record<string, string>) {
  if (!env.META_MARKETING_ACCESS_TOKEN) throw new Error('META_MARKETING_ACCESS_TOKEN no configurado.');
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', env.META_MARKETING_ACCESS_TOKEN);
  return url;
}

async function graphFetch<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.META_MARKETING_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as T & { error?: GraphError };
    if (!response.ok || payload.error) {
      const message = String(payload.error?.message || `Meta Marketing API respondió ${response.status}.`).slice(0, 400);
      throw new Error(message);
    }
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

async function buildPayload(accountId: string, from: string, to: string): Promise<MetaAttributionPayload> {
  const accountPath = `act_${accountId}`;
  const timeRange = JSON.stringify({ since: from, until: to });
  const [account, campaignInsights] = await Promise.all([
    graphFetch<{ currency?: string }>(graphUrl(accountPath, { fields: 'currency' })),
    graphGetAll<any>(graphUrl(`${accountPath}/insights`, {
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend',
      time_range: timeRange,
      limit: '500',
    })),
  ]);

  return {
    account: { currency: account.currency ?? null },
    campaigns: campaignInsights
      .map((item: any) => ({
        id: String(item.campaign_id ?? ''),
        name: String(item.campaign_name ?? 'Campaña sin nombre'),
        spend: numeric(item.spend),
      }))
      .filter((item) => Boolean(item.id)),
    connection: { status: 'connected', lastSyncAt: new Date().toISOString() },
  };
}

router.get('/meta-attribution', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const accountId = env.META_AD_ACCOUNT_ID?.replace(/^act_/, '');

  if (!accountId || !env.META_MARKETING_ACCESS_TOKEN) {
    return sendSuccess(response, {
      account: null,
      campaigns: [],
      connection: { status: 'pending', lastSyncAt: null },
    } satisfies MetaAttributionPayload);
  }

  const key = `${accountId}:${period.fromDate}:${period.toDate}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return sendSuccess(response, { ...cached.payload, cache: { hit: true } });
  }

  const running = inFlight.get(key);
  if (running) return sendSuccess(response, await running);

  const task = buildPayload(accountId, period.fromDate, period.toDate);
  inFlight.set(key, task);
  try {
    const payload = await task;
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    while (cache.size > 12) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
    return sendSuccess(response, payload);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'No se pudo consultar Meta Marketing API.';
    console.warn(JSON.stringify({ event: 'meta_attribution_summary_failed', message }));
    return sendSuccess(response, {
      account: null,
      campaigns: [],
      connection: { status: 'error', lastSyncAt: null },
    } satisfies MetaAttributionPayload);
  } finally {
    inFlight.delete(key);
  }
}));

export default router;
