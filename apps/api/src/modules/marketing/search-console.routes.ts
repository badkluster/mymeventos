import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Permission } from '@mym/shared';
import { env } from '../../config/env';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { parseReportPeriod } from '../reporting/report-filter';
import { markIntegrationFailure, markIntegrationSuccess } from './integration-health.service';

const router = Router();
router.use(requireAuth, requirePermission(Permission.ANALYTICS_VIEW));

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SEARCH_CONSOLE_API = 'https://www.googleapis.com/webmasters/v3';
const CACHE_TTL_MS = 10 * 60_000;
const TOKEN_SAFETY_WINDOW_MS = 5 * 60_000;

type SearchConsoleRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type MetricRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Summary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SearchConsolePayload = {
  configured: boolean;
  property: string | null;
  connection: {
    status: 'connected' | 'pending' | 'error';
    lastSyncAt: string | null;
    message?: string | null;
  };
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  summary: Summary | null;
  previousSummary: Summary | null;
  daily: Array<MetricRow & { date: string }>;
  queries: MetricRow[];
  pages: MetricRow[];
  devices: MetricRow[];
  opportunities: MetricRow[];
  cache?: { hit: boolean };
};

type CacheEntry = { expiresAt: number; payload: SearchConsolePayload };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SearchConsolePayload>>();
let accessTokenCache: { token: string; expiresAt: number } | null = null;

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}

function configured() {
  return Boolean(
    env.GOOGLE_SEARCH_CONSOLE_PROPERTY
    && env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL
    && env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY,
  );
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousPeriod(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);
  return { previousFrom: dateOnly(previousFrom), previousTo: dateOnly(previousTo) };
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + TOKEN_SAFETY_WINDOW_MS) {
    return accessTokenCache.token;
  }

  if (!env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || !env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY) {
    throw new Error('Credenciales de Google Search Console no configuradas.');
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    normalizePrivateKey(env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY),
    { algorithm: 'RS256' },
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GOOGLE_SEARCH_CONSOLE_TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || `Google OAuth respondió ${response.status}.`);
    }
    const expiresIn = Math.max(300, numeric(payload.expires_in) || 3600);
    accessTokenCache = { token: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function querySearchConsole(
  startDate: string,
  endDate: string,
  dimensions: string[] = [],
  rowLimit = 25_000,
): Promise<SearchConsoleRow[]> {
  if (!env.GOOGLE_SEARCH_CONSOLE_PROPERTY) throw new Error('GOOGLE_SEARCH_CONSOLE_PROPERTY no configurado.');
  const token = await getAccessToken();
  const site = encodeURIComponent(env.GOOGLE_SEARCH_CONSOLE_PROPERTY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GOOGLE_SEARCH_CONSOLE_TIMEOUT_MS);
  try {
    const response = await fetch(`${SEARCH_CONSOLE_API}/sites/${site}/searchAnalytics/query`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        searchType: 'web',
        rowLimit,
        dataState: 'final',
      }),
    });
    const payload = await response.json().catch(() => ({})) as { rows?: SearchConsoleRow[]; error?: { code?: number; message?: string; status?: string } };
    if (!response.ok || payload.error) {
      const message = String(payload.error?.message || `Search Console API respondió ${response.status}.`).slice(0, 500);
      const error = new Error(message) as Error & { statusCode?: number; code?: string };
      error.statusCode = response.status;
      error.code = payload.error?.status || String(payload.error?.code || 'SEARCH_CONSOLE_API_ERROR');
      throw error;
    }
    return payload.rows ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

function summaryFrom(rows: SearchConsoleRow[]): Summary {
  const row = rows[0] ?? {};
  return {
    clicks: numeric(row.clicks),
    impressions: numeric(row.impressions),
    ctr: numeric(row.ctr) * 100,
    position: numeric(row.position),
  };
}

function metricRows(rows: SearchConsoleRow[]): MetricRow[] {
  return rows.map((row) => ({
    key: String(row.keys?.[0] ?? 'Sin identificar'),
    clicks: numeric(row.clicks),
    impressions: numeric(row.impressions),
    ctr: numeric(row.ctr) * 100,
    position: numeric(row.position),
  }));
}

async function buildPayload(from: string, to: string): Promise<SearchConsolePayload> {
  const previous = previousPeriod(from, to);
  const [summaryRows, previousSummaryRows, dailyRows, queryRows, pageRows, deviceRows] = await Promise.all([
    querySearchConsole(from, to, [], 1),
    querySearchConsole(previous.previousFrom, previous.previousTo, [], 1),
    querySearchConsole(from, to, ['date'], 500),
    querySearchConsole(from, to, ['query'], 250),
    querySearchConsole(from, to, ['page'], 250),
    querySearchConsole(from, to, ['device'], 10),
  ]);

  const queries = metricRows(queryRows);
  const payload: SearchConsolePayload = {
    configured: true,
    property: env.GOOGLE_SEARCH_CONSOLE_PROPERTY ?? null,
    connection: { status: 'connected', lastSyncAt: new Date().toISOString(), message: null },
    period: { from, to, ...previous },
    summary: summaryFrom(summaryRows),
    previousSummary: summaryFrom(previousSummaryRows),
    daily: metricRows(dailyRows)
      .map((row) => ({ ...row, date: row.key }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    queries,
    pages: metricRows(pageRows),
    devices: metricRows(deviceRows),
    opportunities: queries
      .filter((row) => row.position >= 4 && row.position <= 15 && row.impressions >= 5)
      .sort((left, right) => right.impressions - left.impressions)
      .slice(0, 30),
  };

  await markIntegrationSuccess('search_console', {
    property: env.GOOGLE_SEARCH_CONSOLE_PROPERTY,
    from,
    to,
    queries: payload.queries.length,
    pages: payload.pages.length,
  });
  return payload;
}

router.get('/search-console', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const previous = previousPeriod(period.fromDate, period.toDate);

  if (!configured()) {
    return sendSuccess(response, {
      configured: false,
      property: env.GOOGLE_SEARCH_CONSOLE_PROPERTY ?? null,
      connection: { status: 'pending', lastSyncAt: null, message: 'Faltan credenciales de Search Console en el backend.' },
      period: { from: period.fromDate, to: period.toDate, ...previous },
      summary: null,
      previousSummary: null,
      daily: [],
      queries: [],
      pages: [],
      devices: [],
      opportunities: [],
    } satisfies SearchConsolePayload);
  }

  const key = `${env.GOOGLE_SEARCH_CONSOLE_PROPERTY}:${period.fromDate}:${period.toDate}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return sendSuccess(response, { ...cached.payload, cache: { hit: true } });
  }

  const running = inFlight.get(key);
  if (running) return sendSuccess(response, await running);

  const task = buildPayload(period.fromDate, period.toDate);
  inFlight.set(key, task);
  try {
    const payload = await task;
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    while (cache.size > 16) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
    return sendSuccess(response, payload);
  } catch (cause) {
    const error = cause as Error & { statusCode?: number; code?: string };
    const message = error instanceof Error ? error.message : 'No se pudo consultar Google Search Console.';
    await markIntegrationFailure('search_console', {
      code: error.code || 'SEARCH_CONSOLE_SYNC_FAILED',
      message,
      statusCode: error.statusCode,
      context: { property: env.GOOGLE_SEARCH_CONSOLE_PROPERTY, from: period.fromDate, to: period.toDate },
    });
    console.warn(JSON.stringify({ event: 'search_console_sync_failed', message }));
    return sendSuccess(response, {
      configured: true,
      property: env.GOOGLE_SEARCH_CONSOLE_PROPERTY ?? null,
      connection: { status: 'error', lastSyncAt: null, message: message.slice(0, 300) },
      period: { from: period.fromDate, to: period.toDate, ...previous },
      summary: null,
      previousSummary: null,
      daily: [],
      queries: [],
      pages: [],
      devices: [],
      opportunities: [],
    } satisfies SearchConsolePayload);
  } finally {
    inFlight.delete(key);
  }
}));

export default router;
