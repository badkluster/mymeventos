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
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const ANALYTICS_DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const CACHE_TTL_MS = 10 * 60_000;
const TOKEN_SAFETY_WINDOW_MS = 5 * 60_000;

type Ga4MetricRow = {
  key: string;
  users: number;
  sessions: number;
  views: number;
  events: number;
  keyEvents: number;
};

type Ga4Summary = {
  activeUsers: number;
  totalUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  views: number;
  eventCount: number;
  keyEvents: number;
};

type Ga4Payload = {
  configured: boolean;
  propertyId: string | null;
  measurementId: string | null;
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
  summary: Ga4Summary | null;
  previousSummary: Ga4Summary | null;
  daily: Array<Ga4MetricRow & { date: string }>;
  channels: Ga4MetricRow[];
  landingPages: Ga4MetricRow[];
  events: Ga4MetricRow[];
  businessEvents: Record<string, Ga4MetricRow>;
  cache?: { hit: boolean };
};

type DataApiValue = { value?: string };
type DataApiRow = { dimensionValues?: DataApiValue[]; metricValues?: DataApiValue[] };
type DataApiResponse = { rows?: DataApiRow[]; error?: { code?: number; message?: string; status?: string } };
type CacheEntry = { expiresAt: number; payload: Ga4Payload };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Ga4Payload>>();
let accessTokenCache: { token: string; expiresAt: number } | null = null;

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function clientEmail() {
  return env.GOOGLE_ANALYTICS_CLIENT_EMAIL || env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL;
}

function privateKey() {
  return env.GOOGLE_ANALYTICS_PRIVATE_KEY || env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY;
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}

function configured() {
  return Boolean(env.GOOGLE_ANALYTICS_PROPERTY_ID && clientEmail() && privateKey());
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + TOKEN_SAFETY_WINDOW_MS) return accessTokenCache.token;
  const email = clientEmail();
  const key = privateKey();
  if (!email || !key) throw new Error('Credenciales de Google Analytics no configuradas.');

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: email, scope: ANALYTICS_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
    normalizePrivateKey(key),
    { algorithm: 'RS256' },
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GOOGLE_ANALYTICS_TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || `Google OAuth respondió ${response.status}.`);
    const expiresIn = Math.max(300, numeric(payload.expires_in) || 3600);
    accessTokenCache = { token: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function runReport(input: {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
}): Promise<DataApiRow[]> {
  if (!env.GOOGLE_ANALYTICS_PROPERTY_ID) throw new Error('GOOGLE_ANALYTICS_PROPERTY_ID no configurado.');
  const token = await getAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GOOGLE_ANALYTICS_TIMEOUT_MS);
  try {
    const response = await fetch(`${ANALYTICS_DATA_API}/properties/${encodeURIComponent(env.GOOGLE_ANALYTICS_PROPERTY_ID)}:runReport`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
        dimensions: (input.dimensions ?? []).map((name) => ({ name })),
        metrics: input.metrics.map((name) => ({ name })),
        limit: String(input.limit ?? 250),
        keepEmptyRows: false,
      }),
    });
    const payload = await response.json().catch(() => ({})) as DataApiResponse;
    if (!response.ok || payload.error) {
      const message = String(payload.error?.message || `Google Analytics Data API respondió ${response.status}.`).slice(0, 500);
      const error = new Error(message) as Error & { statusCode?: number; code?: string };
      error.statusCode = response.status;
      error.code = payload.error?.status || String(payload.error?.code || 'GA4_DATA_API_ERROR');
      throw error;
    }
    return payload.rows ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

const summaryMetrics = ['activeUsers', 'totalUsers', 'sessions', 'engagedSessions', 'engagementRate', 'screenPageViews', 'eventCount', 'keyEvents'];

function summaryFrom(rows: DataApiRow[]): Ga4Summary {
  const values = rows[0]?.metricValues ?? [];
  return {
    activeUsers: numeric(values[0]?.value),
    totalUsers: numeric(values[1]?.value),
    sessions: numeric(values[2]?.value),
    engagedSessions: numeric(values[3]?.value),
    engagementRate: numeric(values[4]?.value) * 100,
    views: numeric(values[5]?.value),
    eventCount: numeric(values[6]?.value),
    keyEvents: numeric(values[7]?.value),
  };
}

function metricRows(rows: DataApiRow[], metricOrder: string[]): Ga4MetricRow[] {
  return rows.map((row) => {
    const metrics = row.metricValues ?? [];
    const value = (name: string) => numeric(metrics[metricOrder.indexOf(name)]?.value);
    return {
      key: String(row.dimensionValues?.[0]?.value || 'Sin identificar'),
      users: value('activeUsers'),
      sessions: value('sessions'),
      views: value('screenPageViews'),
      events: value('eventCount'),
      keyEvents: value('keyEvents'),
    };
  });
}

async function buildPayload(from: string, to: string): Promise<Ga4Payload> {
  const previous = previousPeriod(from, to);
  const dailyMetrics = ['activeUsers', 'sessions', 'screenPageViews', 'keyEvents'];
  const channelMetrics = ['activeUsers', 'sessions', 'keyEvents'];
  const landingMetrics = ['activeUsers', 'sessions', 'screenPageViews', 'keyEvents'];
  const eventMetrics = ['activeUsers', 'eventCount', 'keyEvents'];

  const [summaryRows, previousRows, dailyRows, channelRows, landingRows, eventRows] = await Promise.all([
    runReport({ startDate: from, endDate: to, metrics: summaryMetrics, limit: 1 }),
    runReport({ startDate: previous.previousFrom, endDate: previous.previousTo, metrics: summaryMetrics, limit: 1 }),
    runReport({ startDate: from, endDate: to, dimensions: ['date'], metrics: dailyMetrics, limit: 500 }),
    runReport({ startDate: from, endDate: to, dimensions: ['sessionDefaultChannelGroup'], metrics: channelMetrics, limit: 50 }),
    runReport({ startDate: from, endDate: to, dimensions: ['landingPagePlusQueryString'], metrics: landingMetrics, limit: 100 }),
    runReport({ startDate: from, endDate: to, dimensions: ['eventName'], metrics: eventMetrics, limit: 250 }),
  ]);

  const events = metricRows(eventRows, eventMetrics).sort((left, right) => right.events - left.events);
  const businessEventNames = ['whatsapp_click', 'phone_click', 'form_start', 'form_submit', 'generate_lead', 'salon_view', 'package_view', 'promotion_click'];
  const eventMap = new Map(events.map((row) => [row.key, row]));
  const empty = (key: string): Ga4MetricRow => ({ key, users: 0, sessions: 0, views: 0, events: 0, keyEvents: 0 });
  const businessEvents = Object.fromEntries(businessEventNames.map((name) => [name, eventMap.get(name) ?? empty(name)]));

  const payload: Ga4Payload = {
    configured: true,
    propertyId: env.GOOGLE_ANALYTICS_PROPERTY_ID ?? null,
    measurementId: env.GOOGLE_ANALYTICS_MEASUREMENT_ID ?? null,
    connection: { status: 'connected', lastSyncAt: new Date().toISOString(), message: null },
    period: { from, to, ...previous },
    summary: summaryFrom(summaryRows),
    previousSummary: summaryFrom(previousRows),
    daily: metricRows(dailyRows, dailyMetrics)
      .map((row) => ({ ...row, date: row.key }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    channels: metricRows(channelRows, channelMetrics).sort((left, right) => right.sessions - left.sessions),
    landingPages: metricRows(landingRows, landingMetrics).sort((left, right) => right.sessions - left.sessions),
    events,
    businessEvents,
  };

  await markIntegrationSuccess('ga4', {
    propertyId: env.GOOGLE_ANALYTICS_PROPERTY_ID,
    from,
    to,
    users: payload.summary.activeUsers,
    sessions: payload.summary.sessions,
    keyEvents: payload.summary.keyEvents,
  });
  return payload;
}

router.get('/ga4', asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const previous = previousPeriod(period.fromDate, period.toDate);

  if (!configured()) {
    return sendSuccess(response, {
      configured: false,
      propertyId: env.GOOGLE_ANALYTICS_PROPERTY_ID ?? null,
      measurementId: env.GOOGLE_ANALYTICS_MEASUREMENT_ID ?? null,
      connection: {
        status: 'pending',
        lastSyncAt: null,
        message: 'GA4 está instalado en el sitio. Falta configurar el Property ID y dar acceso de lectura a la cuenta de servicio para leer métricas en Performance 360.',
      },
      period: { from: period.fromDate, to: period.toDate, ...previous },
      summary: null,
      previousSummary: null,
      daily: [], channels: [], landingPages: [], events: [], businessEvents: {},
    } satisfies Ga4Payload);
  }

  const key = `${env.GOOGLE_ANALYTICS_PROPERTY_ID}:${period.fromDate}:${period.toDate}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return sendSuccess(response, { ...cached.payload, cache: { hit: true } });
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
    const message = error instanceof Error ? error.message : 'No se pudo consultar Google Analytics 4.';
    await markIntegrationFailure('ga4', {
      code: error.code || 'GA4_SYNC_FAILED',
      message,
      statusCode: error.statusCode,
      context: { propertyId: env.GOOGLE_ANALYTICS_PROPERTY_ID, from: period.fromDate, to: period.toDate },
    });
    console.warn(JSON.stringify({ event: 'ga4_sync_failed', message }));
    return sendSuccess(response, {
      configured: true,
      propertyId: env.GOOGLE_ANALYTICS_PROPERTY_ID ?? null,
      measurementId: env.GOOGLE_ANALYTICS_MEASUREMENT_ID ?? null,
      connection: { status: 'error', lastSyncAt: null, message: message.slice(0, 300) },
      period: { from: period.fromDate, to: period.toDate, ...previous },
      summary: null,
      previousSummary: null,
      daily: [], channels: [], landingPages: [], events: [], businessEvents: {},
    } satisfies Ga4Payload);
  } finally {
    inFlight.delete(key);
  }
}));

export default router;
