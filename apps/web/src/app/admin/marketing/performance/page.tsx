'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Globe2,
  Info,
  Layers3,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
  WifiOff,
} from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { analyticsSourceLabel } from '@/features/analytics/analytics-labels';

type Breakdown = { _id: string; value: number };
type AnalyticsSummary = {
  metrics: Record<string, number>;
  funnel: Array<{ id: string; label: string; value: number }>;
  breakdowns: { sources: Breakdown[]; devices: Breakdown[] };
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

type MetaSummary = InsightMetrics;
type MetaAccount = {
  id: string;
  name: string | null;
  businessName: string | null;
  currency: string | null;
  timezone: string | null;
  amountSpentLifetime: number;
  balance: number;
  spendCap: number | null;
  instagramAccounts: Array<{ id: string; username?: string }>;
};

type MetaCampaign = InsightMetrics & {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  stopTime: string | null;
  updatedTime: string | null;
  issues: unknown[];
};

type MetaAdSet = InsightMetrics & {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
};

type MetaAd = InsightMetrics & {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
};

type MetaDaily = InsightMetrics & { date: string };
type IntegrationHealth = {
  provider: string;
  status: 'connected' | 'degraded' | 'error';
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastStatusCode: number | null;
  updatedAt: string | null;
};

type PerformanceAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  title: string;
  message: string;
  code?: string;
  entityId?: string;
  entityName?: string;
  entityCount?: number;
  entities?: Array<{ id: string; name: string }>;
  detectedAt: string;
};

type MetaComparison = Record<'spend' | 'impressions' | 'reach' | 'clicks' | 'linkClicks' | 'ctr' | 'cpc' | 'cpm' | 'leads' | 'contacts', number | null>;
type OperationalCounts = {
  campaignsTotal: number;
  activeInMeta: number;
  deliveringRecent: number;
  withSpendInPeriod: number;
  adsetsWithInsights: number;
  adsWithInsights: number;
};

type MetaPerformance = {
  configured: boolean;
  connection: { status: 'connected' | 'pending' | 'error'; lastSyncAt: string | null };
  account: MetaAccount | null;
  summary: MetaSummary | null;
  comparison: MetaComparison | null;
  operationalCounts: OperationalCounts | null;
  campaigns: MetaCampaign[];
  adsets: MetaAdSet[];
  ads: MetaAd[];
  daily: MetaDaily[];
  alerts: PerformanceAlert[];
  integrationHealth: IntegrationHealth[];
  period?: { from: string; to: string; previousFrom?: string; previousTo?: string };
  monitoringPeriod?: { frequencyFrom: string; deliveryFrom: string; to: string };
};

type SearchConsoleMetricRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SearchConsoleSummary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SearchConsolePerformance = {
  configured: boolean;
  property: string | null;
  connection: { status: 'connected' | 'pending' | 'error'; lastSyncAt: string | null; message?: string | null };
  summary: SearchConsoleSummary | null;
  previousSummary: SearchConsoleSummary | null;
  queries: SearchConsoleMetricRow[];
  pages: SearchConsoleMetricRow[];
  devices: SearchConsoleMetricRow[];
  opportunities: SearchConsoleMetricRow[];
};

type MetricCard = {
  label: string;
  value: string;
  note: string;
  help: string;
  icon: typeof Globe2;
  muted?: boolean;
  delta?: number | null;
};
type CampaignFilter = 'all' | 'delivering' | 'spend' | 'active' | 'paused' | 'problems';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const HELP = {
  spend: 'Importe gastado por Meta Ads dentro del período seleccionado. No incluye otros canales ni honorarios.',
  results: 'Suma del resultado principal de cada campaña: conversación para campañas de mensajería y lead para campañas de captación.',
  costPerResult: 'Inversión dividida por resultados principales. Es más útil que CPL cuando conviven campañas de WhatsApp y campañas de leads.',
  reach: 'Cantidad estimada de personas únicas alcanzadas por los anuncios.',
  impressions: 'Cantidad total de veces que los anuncios se mostraron. Una misma persona puede generar varias impresiones.',
  linkClicks: 'Clics que llevan a un destino o acción del anuncio. Es más específico que Clics totales.',
  linkCtr: 'Porcentaje de impresiones que terminan en un clic de enlace. Ayuda a medir atractivo del anuncio y del CTA.',
  frequency: 'Promedio de veces que cada persona alcanzada vio el anuncio. Valores altos sostenidos pueden indicar saturación.',
  clicks: 'Todos los clics registrados por Meta, incluyendo interacciones que no necesariamente llevan a un destino.',
  ctr: 'CTR general: clics totales dividido por impresiones.',
  cpc: 'Costo medio por clic total.',
  cpm: 'Costo por cada mil impresiones. Sirve para observar el costo de comprar exposición.',
  leads: 'Eventos de lead atribuidos por Meta. Las campañas históricas de WhatsApp pueden tener 0 leads y aun así generar conversaciones.',
  contacts: 'Conversaciones o contactos de mensajería atribuidos por Meta, especialmente útiles para campañas a WhatsApp.',
  webLeads: 'Formularios efectivamente enviados en la web y registrados por la analítica propia de M&M.',
  webWhatsapp: 'Clics en botones de WhatsApp registrados directamente en la web.',
  webConversion: 'Porcentaje de sesiones web que terminan en consulta. Se calcula sobre sesiones, no sobre visitantes únicos.',
  balance: 'Saldo que Meta informa para la cuenta publicitaria. Su interpretación depende del tipo de facturación de la cuenta.',
  spendCap: 'Límite total de gasto configurado en Meta. Si no existe, se muestra “Sin tope”.',
  lifetimeSpend: 'Gasto histórico acumulado que Meta informa para la cuenta publicitaria.',
  activeMeta: 'Campañas cuyo estado administrativo actual en Meta figura ACTIVE. No significa que todas estén entregando anuncios hoy.',
  delivering: 'Campañas activas que tuvieron impresiones en el período seleccionado. Es el filtro inicial para evitar mezclar campañas viejas sin entrega.',
  withSpend: 'Campañas que registraron gasto dentro del período seleccionado.',
  adsets: 'Conjuntos de anuncios que tuvieron insights en el período. Es el nivel entre campaña y anuncio.',
  ads: 'Anuncios que tuvieron insights en el período seleccionado.',
  searchClicks: 'Clics desde resultados orgánicos de Google hacia páginas de M&M dentro del período seleccionado.',
  searchImpressions: 'Veces que una URL de M&M apareció en resultados orgánicos de Google.',
  searchCtr: 'Porcentaje de impresiones orgánicas que terminaron en un clic hacia el sitio.',
  searchPosition: 'Posición media de las URLs en Google. En esta métrica, un número más bajo es mejor.',
  searchOpportunity: 'Consultas con impresiones y posición media aproximada entre 4 y 15. Son oportunidades razonables para mejorar SEO.',
} as const;

const externalProviders = [
  { name: 'Instagram orgánico', detail: 'Seguidores, alcance, engagement, reels, historias, guardados y compartidos.', icon: Video },
  { name: 'Facebook orgánico', detail: 'Seguidores, alcance, interacciones, publicaciones y video.', icon: Users },
  { name: 'Google Ads', detail: 'Costo, impresiones, clics, conversiones, CPC, CPA y campañas.', icon: Search },
  { name: 'Google Analytics 4', detail: 'Usuarios, sesiones, canales, engagement y atribución.', icon: BarChart3 },
  { name: 'Google Business Profile', detail: 'Vistas, búsquedas, llamadas, rutas, clics y reseñas.', icon: Target },
  { name: 'TikTok', detail: 'Seguidores, visualizaciones, retención y engagement.', icon: Video },
  { name: 'TikTok Ads', detail: 'Inversión, CPM, CTR, CPC, conversiones y CPA.', icon: Video },
  { name: 'YouTube', detail: 'Visualizaciones, tiempo de reproducción, suscriptores y tráfico.', icon: Video },
  { name: 'WhatsApp Business', detail: 'Conversaciones y atribución cuando la API lo permita.', icon: MessageCircle },
];

function asInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: asInputDate(from), to: asInputDate(to) };
}

function currency(value: number | null | undefined, code = 'ARS') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: code || 'ARS', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${number.format(value)} ${code || ''}`.trim();
  }
}

function statusLabel(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase();
  const labels: Record<string, string> = {
    ACTIVE: 'Activa', PAUSED: 'Pausada', ARCHIVED: 'Archivada', DELETED: 'Eliminada',
    DISAPPROVED: 'Rechazada', WITH_ISSUES: 'Con problemas', ERROR: 'Error',
    PENDING_REVIEW: 'En revisión', IN_PROCESS: 'Procesando', CAMPAIGN_PAUSED: 'Pausada por campaña',
    ADSET_PAUSED: 'Pausada por conjunto', PREAPPROVED: 'Preaprobada',
  };
  return labels[normalized] ?? (normalized || 'Sin estado');
}

function isProblemStatus(status?: string | null) {
  return ['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'PENDING_REVIEW', 'IN_PROCESS'].includes(String(status ?? '').toUpperCase());
}

function resultLabel(type: ResultType) {
  if (type === 'conversation') return 'Conversaciones';
  if (type === 'lead') return 'Leads';
  return 'Resultados';
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default function MarketingPerformancePage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [meta, setMeta] = useState<MetaPerformance | null>(null);
  const [searchConsole, setSearchConsole] = useState<SearchConsolePerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('delivering');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignExpanded, setCampaignExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [siteSummary, metaPerformance, searchConsolePerformance] = await Promise.all([
        api.get<AnalyticsSummary>(`/analytics/summary?from=${from}&to=${to}`),
        api.get<MetaPerformance>(`/marketing/performance/meta?from=${from}&to=${to}`),
        api.get<SearchConsolePerformance>(`/marketing/performance/search-console?from=${from}&to=${to}`).catch(() => null),
      ]);
      setSummary(siteSummary);
      setMeta(metaPerformance);
      setSearchConsole(searchConsolePerformance);
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el panel de performance.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [from, to, showToast]);

  useEffect(() => { void load(); }, [load]);

  const metrics = summary?.metrics;
  const metaSummary = meta?.summary;
  const metaCurrency = meta?.account?.currency || 'ARS';
  const campaigns = meta?.campaigns ?? [];
  const activeCampaigns = campaigns.filter((item) => String(item.effectiveStatus).toUpperCase() === 'ACTIVE');
  const pausedCampaigns = campaigns.filter((item) => String(item.effectiveStatus).toUpperCase().includes('PAUSED'));
  const problemCampaigns = campaigns.filter((item) => item.issues.length > 0 || isProblemStatus(item.effectiveStatus));
  const deliveringCampaigns = campaigns.filter((item) => item.impressions > 0 && String(item.effectiveStatus).toUpperCase() === 'ACTIVE');
  const spendCampaigns = campaigns.filter((item) => item.spend > 0);
  const filteredCampaigns = campaigns
    .filter((item) => {
      if (campaignFilter === 'delivering') return item.impressions > 0 && String(item.effectiveStatus).toUpperCase() === 'ACTIVE';
      if (campaignFilter === 'spend') return item.spend > 0;
      if (campaignFilter === 'active') return String(item.effectiveStatus).toUpperCase() === 'ACTIVE';
      if (campaignFilter === 'paused') return String(item.effectiveStatus).toUpperCase().includes('PAUSED');
      if (campaignFilter === 'problems') return item.issues.length > 0 || isProblemStatus(item.effectiveStatus);
      return true;
    })
    .filter((item) => !campaignSearch.trim() || item.name.toLocaleLowerCase('es').includes(campaignSearch.trim().toLocaleLowerCase('es')))
    .sort((left, right) => right.spend - left.spend || right.results - left.results);
  const visibleCampaigns = campaignExpanded ? filteredCampaigns : filteredCampaigns.slice(0, 8);

  const searchSummary = searchConsole?.summary;
  const previousSearchSummary = searchConsole?.previousSummary;

  const executiveCards: MetricCard[] = [
    { label: 'Inversión Meta', value: metaSummary ? currency(metaSummary.spend, metaCurrency) : '—', note: 'Gasto del período seleccionado', help: HELP.spend, icon: CircleDollarSign, muted: !metaSummary, delta: meta?.comparison?.spend },
    { label: 'Resultados Meta', value: metaSummary ? integer.format(metaSummary.results) : '—', note: metaSummary ? `${integer.format(metaSummary.contacts)} conversaciones · ${integer.format(metaSummary.leads)} leads` : 'Pendiente Meta', help: HELP.results, icon: Target, muted: !metaSummary },
    { label: 'Costo por resultado', value: metaSummary?.costPerResult !== null && metaSummary?.costPerResult !== undefined ? currency(metaSummary.costPerResult, metaCurrency) : '—', note: 'Según objetivo de cada campaña', help: HELP.costPerResult, icon: TrendingDown, muted: metaSummary?.costPerResult === null || !metaSummary },
    { label: 'Alcance Meta', value: metaSummary ? integer.format(metaSummary.reach) : '—', note: 'Personas únicas estimadas', help: HELP.reach, icon: Users, muted: !metaSummary, delta: meta?.comparison?.reach },
    { label: 'Impresiones Meta', value: metaSummary ? integer.format(metaSummary.impressions) : '—', note: 'Exposiciones publicitarias', help: HELP.impressions, icon: Gauge, muted: !metaSummary, delta: meta?.comparison?.impressions },
    { label: 'Clics de enlace', value: metaSummary ? integer.format(metaSummary.linkClicks) : '—', note: metaSummary ? `CTR enlace ${number.format(metaSummary.linkCtr)}%` : 'Pendiente Meta', help: HELP.linkClicks, icon: MousePointerClick, muted: !metaSummary, delta: meta?.comparison?.linkClicks },
    { label: 'CPC de enlace', value: metaSummary ? currency(metaSummary.linkCpc, metaCurrency) : '—', note: 'Costo por clic de destino', help: HELP.cpc, icon: MousePointerClick, muted: !metaSummary },
    { label: 'Frecuencia', value: metaSummary ? `${number.format(metaSummary.frequency)}x` : '—', note: 'Exposición media por persona', help: HELP.frequency, icon: Activity, muted: !metaSummary },
  ];

  return (
    <TooltipPrimitive.Provider delayDuration={180}>
      <section className="space-y-6">
        <PageHeader title="Performance 360" description="Centro de control de marketing, campañas, SEO, APIs, web y conversiones." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>} />
        <MarketingTabs />

        <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          {[['Resumen', '#resumen'], ['SEO Google', '#seo-google'], ['Alertas', '#alertas'], ['Cuenta Meta', '#cuenta-meta'], ['Campañas', '#campanas-meta'], ['Conjuntos', '#conjuntos-meta'], ['Anuncios', '#anuncios-meta'], ['Embudo', '#embudo'], ['Conexiones', '#conexiones']].map(([label, href]) => <a key={href} href={href} className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950">{label}</a>)}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <div className="ml-auto grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 px-4 py-2 text-right">
              <p className="font-semibold text-zinc-800">Meta Ads: {meta?.connection.status === 'connected' ? 'conectado' : meta?.connection.status === 'error' ? 'con error' : 'pendiente'}</p>
              <p>{meta?.connection.lastSyncAt ? `Sync: ${new Date(meta.connection.lastSyncAt).toLocaleString('es-AR')}` : 'Sin sincronización'}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-4 py-2 text-right">
              <p className="font-semibold text-zinc-800">Search Console: {searchConsole?.connection.status === 'connected' ? 'conectado' : searchConsole?.connection.status === 'error' ? 'con error' : 'pendiente'}</p>
              <p>{searchConsole?.connection.lastSyncAt ? `Sync: ${new Date(searchConsole.connection.lastSyncAt).toLocaleString('es-AR')}` : 'Sin sincronización'}</p>
            </div>
          </div>
        </div>

        <section id="resumen" className="scroll-mt-24 space-y-4">
          <SectionHeading title="Resumen ejecutivo" subtitle="Primero resultados operativos; debajo, detalle técnico y comercial." help="Las métricas Meta y Search Console respetan el rango seleccionado. Las alertas de Meta usan ventanas recientes independientes para evitar falsos positivos históricos." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{executiveCards.map((card) => <Metric key={card.label} {...card} loading={loading} />)}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CompactMetric label="Leads web" value={metrics ? integer.format(metrics.formSuccess ?? 0) : '—'} help={HELP.webLeads} icon={Target} />
            <CompactMetric label="WhatsApp web" value={metrics ? integer.format(metrics.whatsappClicks ?? 0) : '—'} help={HELP.webWhatsapp} icon={MessageCircle} />
            <CompactMetric label="Conversión por sesión" value={metrics ? `${number.format(metrics.conversionRate ?? 0)}%` : '—'} help={HELP.webConversion} icon={TrendingUp} />
            <CompactMetric label="Clics orgánicos Google" value={searchSummary ? integer.format(searchSummary.clicks) : '—'} help={HELP.searchClicks} icon={Search} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Panel title="Evolución diaria" subtitle="Inversión y resultados del rango seleccionado.">
            <TrendChart items={meta?.daily ?? []} valueKey="spend" label="Inversión diaria" valueFormatter={(value) => currency(value, metaCurrency)} />
          </Panel>
          <Panel title="Resultados diarios" subtitle="Leads o conversaciones según el resultado principal disponible.">
            <TrendChart items={meta?.daily ?? []} valueKey="results" label="Resultados diarios" valueFormatter={(value) => integer.format(value)} />
          </Panel>
        </section>

        <section id="seo-google" className="scroll-mt-24 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading title="SEO Google · Search Console" subtitle="La visibilidad orgánica ya forma parte del tablero 360; la pantalla separada queda como detalle avanzado." help="Search Console muestra cómo aparece M&M en Google antes de que la persona llegue al sitio: consultas, impresiones, clics, CTR y posición media." />
            <a href="/admin/marketing/search-console" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50">Abrir detalle SEO</a>
          </div>
          {searchSummary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AccountMetric label="Clics orgánicos" value={integer.format(searchSummary.clicks)} note={previousSearchSummary ? `${formatDelta(percentChange(searchSummary.clicks, previousSearchSummary.clicks))} vs. período anterior` : 'Sin base previa'} help={HELP.searchClicks} />
                <AccountMetric label="Impresiones orgánicas" value={integer.format(searchSummary.impressions)} note={previousSearchSummary ? `${formatDelta(percentChange(searchSummary.impressions, previousSearchSummary.impressions))} vs. período anterior` : 'Sin base previa'} help={HELP.searchImpressions} />
                <AccountMetric label="CTR orgánico" value={`${number.format(searchSummary.ctr)}%`} note={previousSearchSummary ? `${formatDelta(percentChange(searchSummary.ctr, previousSearchSummary.ctr))} vs. período anterior` : 'Sin base previa'} help={HELP.searchCtr} />
                <AccountMetric label="Posición media" value={number.format(searchSummary.position)} note="Menor es mejor" help={HELP.searchPosition} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Búsquedas principales" subtitle="Consultas que ya generan visibilidad o clics desde Google.">
                  <SearchConsoleRows rows={searchConsole?.queries ?? []} empty="Todavía no hay consultas suficientes para este período." />
                </Panel>
                <Panel title="Oportunidades SEO" subtitle="Términos cerca de posiciones donde una optimización puede mover tráfico.">
                  <SearchConsoleRows rows={searchConsole?.opportunities ?? []} empty="Todavía no hay oportunidades con volumen suficiente." opportunity />
                </Panel>
              </div>
            </>
          ) : (
            <ConnectorPlaceholder title={searchConsole?.connection.status === 'error' ? 'Search Console con error' : 'Search Console pendiente'} text={searchConsole?.connection.message || 'La conexión está configurada, pero todavía no hay métricas disponibles para este rango.'} />
          )}
        </section>

        <section id="alertas" className="scroll-mt-24">
          <AlertsPanel alerts={meta?.alerts ?? []} loading={loading} monitoringPeriod={meta?.monitoringPeriod} />
        </section>

        <section id="cuenta-meta" className="scroll-mt-24 space-y-4">
          <SectionHeading title="Cuenta publicitaria Meta" subtitle="Separa estado administrativo de entrega real para evitar interpretaciones incorrectas." help="Una campaña puede figurar ACTIVE en Meta y no estar entregando anuncios. Por eso mostramos por separado activas, con entrega reciente y con gasto en el período." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <AccountMetric label="Cuenta" value={meta?.account?.name || '—'} note={meta?.account?.id || 'Pendiente'} help="Cuenta publicitaria consultada por Performance 360." />
            <AccountMetric label="Con entrega reciente" value={meta?.operationalCounts ? integer.format(meta.operationalCounts.deliveringRecent) : '—'} note="Últimos 3 días" help={HELP.delivering} />
            <AccountMetric label="Con gasto en período" value={meta?.operationalCounts ? integer.format(meta.operationalCounts.withSpendInPeriod) : '—'} note="Rango seleccionado" help={HELP.withSpend} />
            <AccountMetric label="Activas según Meta" value={meta?.operationalCounts ? integer.format(meta.operationalCounts.activeInMeta) : '—'} note={`${meta?.operationalCounts?.campaignsTotal ?? 0} totales`} help={HELP.activeMeta} />
            <AccountMetric label="Conjuntos medidos" value={meta?.operationalCounts ? integer.format(meta.operationalCounts.adsetsWithInsights) : '—'} note="Con insights" help={HELP.adsets} />
            <AccountMetric label="Anuncios medidos" value={meta?.operationalCounts ? integer.format(meta.operationalCounts.adsWithInsights) : '—'} note="Con insights" help={HELP.ads} />
            <AccountMetric label="Tope de gasto" value={meta?.account?.spendCap ? currency(meta.account.spendCap, metaCurrency) : 'Sin tope'} note="Configuración Meta" help={HELP.spendCap} />
            <AccountMetric label="Gasto histórico" value={meta?.account ? currency(meta.account.amountSpentLifetime, metaCurrency) : '—'} note={meta?.account?.timezone || 'Zona horaria pendiente'} help={HELP.lifetimeSpend} />
          </div>
        </section>

        <section id="campanas-meta" className="scroll-mt-24">
          <Panel title="Campañas Meta Ads" subtitle="Vista compacta por defecto: primero campañas con entrega, ordenadas por gasto.">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {([
                ['delivering', `Con entrega (${deliveringCampaigns.length})`],
                ['spend', `Con gasto (${spendCampaigns.length})`],
                ['active', `Activas Meta (${activeCampaigns.length})`],
                ['problems', `Problemas (${problemCampaigns.length})`],
                ['paused', `Pausadas (${pausedCampaigns.length})`],
                ['all', `Todas (${campaigns.length})`],
              ] as Array<[CampaignFilter, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => { setCampaignFilter(key); setCampaignExpanded(false); }} className={`rounded-xl px-3 py-2 text-xs font-semibold ${campaignFilter === key ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{label}</button>)}
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input className="w-full sm:w-80" value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignExpanded(false); }} placeholder="Buscar campaña por nombre…" />
              <p className="text-xs text-zinc-500">Mostrando {integer.format(visibleCampaigns.length)} de {integer.format(filteredCampaigns.length)} campañas del filtro.</p>
            </div>
            {meta?.configured && meta.connection.status === 'connected' ? <CampaignTable campaigns={visibleCampaigns} currencyCode={metaCurrency} /> : <ConnectorPlaceholder title="Meta Ads pendiente" text="Todavía no hay datos disponibles de Marketing API." />}
            {filteredCampaigns.length > 8 ? <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={() => setCampaignExpanded((current) => !current)}>{campaignExpanded ? 'Ver menos campañas' : `Ver las ${filteredCampaigns.length} campañas`}</Button></div> : null}
          </Panel>
        </section>

        <section id="conjuntos-meta" className="scroll-mt-24">
          <Panel title="Conjuntos de anuncios" subtitle="Nivel intermedio para comparar segmentación, presupuesto y eficiencia antes de mirar cada creativo.">
            <AdSetTable adsets={meta?.adsets ?? []} currencyCode={metaCurrency} />
          </Panel>
        </section>

        <section id="anuncios-meta" className="scroll-mt-24 grid gap-4 2xl:grid-cols-[1.45fr_0.55fr]">
          <Panel title="Anuncios" subtitle="Detalle por anuncio para detectar qué pieza genera resultados y cuál consume presupuesto.">
            <AdsTable ads={meta?.ads ?? []} currencyCode={metaCurrency} />
          </Panel>
          <Panel title="Ranking de anuncios" subtitle="Prioriza resultados y luego eficiencia de costo.">
            <TopAds ads={meta?.ads ?? []} currencyCode={metaCurrency} />
          </Panel>
        </section>

        <section id="embudo" className="scroll-mt-24 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Panel title="Embudo Web → Cliente" subtitle="Datos propios de M&M, independientes de la atribución que informe Meta.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{(summary?.funnel ?? []).map((item, index) => <div key={item.id} className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{index + 1}. {item.label}</p><p className="mt-2 text-2xl font-bold">{integer.format(item.value)}</p></div>)}</div>
          </Panel>
          <Panel title="Origen de visitas" subtitle="Fuente detectada por la analítica propia."><SourceBars items={summary?.breakdowns.sources ?? []} /></Panel>
        </section>

        <section id="conexiones" className="scroll-mt-24">
          <Panel title="Centro de conexiones" subtitle="Estado técnico de cada fuente. Las fuentes pendientes no generan métricas ficticias.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ConnectionCard name="Web + CRM M&M" detail="Sesiones, formularios, WhatsApp, presupuestos y eventos confirmados." status="connected" icon={Globe2} />
              <ConnectionCard name="Meta Pixel" detail="Eventos browser-side del sitio." status="connected" icon={Activity} />
              <ConnectionCard name="Meta Conversions API" detail="Eventos server-side, deduplicación y monitoreo de fallos." status={healthStatus(meta?.integrationHealth, 'meta_capi')} icon={Activity} />
              <ConnectionCard name="Meta Ads" detail="Campañas, conjuntos, anuncios, inversión, clics y resultados." status={meta?.connection.status ?? 'pending'} icon={Target} />
              <ConnectionCard name="Google Search Console" detail="Clics orgánicos, impresiones, CTR, posición, consultas y páginas." status={searchConsole?.connection.status ?? 'pending'} icon={Search} />
              {externalProviders.map(({ name, detail, icon }) => <ConnectionCard key={name} name={name} detail={detail} status="pending" icon={icon} />)}
            </div>
          </Panel>
        </section>
      </section>
    </TooltipPrimitive.Provider>
  );
}

function InfoTip({ text }: { text: string }) {
  return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild><button type="button" aria-label="Más información" className="inline-grid h-5 w-5 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"><Info className="h-3.5 w-3.5" /></button></TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={6} className="z-[100] max-w-[300px] rounded-xl bg-zinc-950 px-3 py-2 text-xs leading-5 text-white shadow-xl"><TooltipPrimitive.Arrow className="fill-zinc-950" />{text}</TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>;
}

function SectionHeading({ title, subtitle, help }: { title: string; subtitle: string; help: string }) {
  return <div><div className="flex items-center gap-1.5"><h2 className="text-lg font-semibold">{title}</h2><InfoTip text={help} /></div><p className="text-sm text-zinc-500">{subtitle}</p></div>;
}

function ChangeBadge({ value }: { value?: number | null }) {
  if (value === undefined) return null;
  if (value === null) return <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500">sin base previa</span>;
  const positive = value > 0;
  const negative = value < 0;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-700' : negative ? 'bg-rose-50 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}>{positive ? <TrendingUp className="h-3 w-3" /> : negative ? <TrendingDown className="h-3 w-3" /> : null}{positive ? '+' : ''}{number.format(value)}%</span>;
}

function formatDelta(value: number | null) {
  if (value === null) return 'sin base';
  return `${value > 0 ? '+' : ''}${number.format(value)}%`;
}

function Metric({ label, value, note, help, icon: Icon, muted, loading, delta }: MetricCard & { loading: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${muted ? 'border-dashed border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white'}`}><div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1"><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><InfoTip text={help} /></div><p className={`mt-2 text-2xl font-bold ${muted ? 'text-zinc-400' : ''}`}>{loading && !muted ? '…' : value}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-zinc-500">{note}</p><ChangeBadge value={delta} /></div></article>;
}

function CompactMetric({ label, value, help, icon: Icon }: { label: string; value: string; help: string; icon: typeof Globe2 }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><div><div className="flex items-center gap-1"><p className="text-[11px] font-semibold uppercase text-zinc-500">{label}</p><InfoTip text={help} /></div><p className="mt-1 text-xl font-bold">{value}</p></div><span className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></span></div></article>;
}

function AccountMetric({ label, value, note, help }: { label: string; value: string; note: string; help: string }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p><InfoTip text={help} /></div><p className="mt-2 truncate text-lg font-bold" title={value}>{value}</p><p className="mt-2 text-[11px] text-zinc-500">{note}</p></article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="border-b border-zinc-100 px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-zinc-500">{subtitle}</p></div><div className="p-5">{children}</div></div>;
}

function SearchConsoleRows({ rows, empty, opportunity = false }: { rows: SearchConsoleMetricRow[]; empty: string; opportunity?: boolean }) {
  if (!rows.length) return <Empty text={empty} />;
  return <div className="space-y-2">{rows.slice(0, 6).map((row, index) => <div key={`${row.key}-${index}`} className="rounded-xl bg-zinc-50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold" title={row.key}>{row.key}</p><p className="mt-1 text-[11px] text-zinc-500">{integer.format(row.impressions)} impresiones · CTR {number.format(row.ctr)}%</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold">{integer.format(row.clicks)} clics</p><p className={`mt-1 text-[11px] ${opportunity ? 'font-semibold text-amber-700' : 'text-zinc-500'}`}>Pos. {number.format(row.position)}</p></div></div></div>)}</div>;
}

function AlertsPanel({ alerts, loading, monitoringPeriod }: { alerts: PerformanceAlert[]; loading: boolean; monitoringPeriod?: MetaPerformance['monitoringPeriod'] }) {
  const critical = alerts.filter((item) => item.severity === 'critical').length;
  const warnings = alerts.filter((item) => item.severity === 'warning').length;
  return <Panel title="Centro de alertas" subtitle="Solo muestra señales agrupadas y accionables; no repite una tarjeta por cada campaña histórica.">
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <AccountMetric label="Críticas" value={loading ? '…' : integer.format(critical)} note="Revisión prioritaria" help="Errores técnicos o estados que pueden impedir entrega o lectura correcta de datos." />
      <AccountMetric label="Advertencias" value={loading ? '…' : integer.format(warnings)} note="Señales para revisar" help="Alertas de performance agrupadas. Cada tarjeta puede representar varias campañas y muestra ejemplos al desplegarla." />
      <AccountMetric label="Estado general" value={critical ? 'Atención' : warnings ? 'Revisar' : 'Correcto'} note={alerts.length ? `${alerts.length} grupos de alertas` : 'Sin alertas activas'} help="Resumen del centro de alertas. No es la cantidad de campañas afectadas, sino la cantidad de tipos de problema activos." />
    </div>
    {monitoringPeriod ? <p className="mb-4 rounded-xl bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">Monitoreo independiente del filtro: entrega desde {monitoringPeriod.deliveryFrom}; frecuencia/CTR/resultados desde {monitoringPeriod.frequencyFrom}.</p> : null}
    {loading ? <p className="py-6 text-center text-sm text-zinc-400">Revisando integraciones…</p> : alerts.length ? <div className="space-y-2">{alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}</div> : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" /><div><p className="font-semibold">Sin alertas activas</p><p className="text-xs">Las integraciones monitoreadas no reportan problemas.</p></div></div>}
  </Panel>;
}

function AlertRow({ alert }: { alert: PerformanceAlert }) {
  const critical = alert.severity === 'critical';
  return <details className={`group rounded-xl border ${critical ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><summary className="cursor-pointer list-none p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{critical ? 'Crítico' : 'Advertencia'}</span><span className="text-[11px] font-semibold uppercase text-zinc-500">{alert.source}</span>{alert.code ? <span className="text-[10px] text-zinc-400">{alert.code}</span> : null}{alert.entityCount ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold text-zinc-700">{alert.entityCount} afectadas</span> : null}</div><p className="mt-2 text-sm font-semibold text-zinc-950">{alert.title}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{alert.message}</p></div><time className="text-[10px] text-zinc-400">{new Date(alert.detectedAt).toLocaleString('es-AR')}</time></div></summary>{alert.entities?.length ? <div className="border-t border-black/5 px-4 py-3"><p className="mb-2 text-[10px] font-semibold uppercase text-zinc-500">Ejemplos</p><div className="flex flex-wrap gap-2">{alert.entities.map((item) => <span key={item.id} className="max-w-full truncate rounded-lg bg-white/80 px-2 py-1 text-[11px] text-zinc-700" title={item.name}>{item.name}</span>)}</div></div> : null}</details>;
}

function CampaignTable({ campaigns, currencyCode }: { campaigns: MetaCampaign[]; currencyCode: string }) {
  if (!campaigns.length) return <Empty text="No hay campañas para este filtro/período." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1660px] text-sm"><thead><tr className="bg-zinc-50"><TableHead label="Campaña" help="Nombre e ID de la campaña en Meta." /><TableHead label="Estado" help={HELP.activeMeta} /><TableHead label="Objetivo" help="Objetivo configurado por Meta para la campaña." /><TableHead label="Presupuesto" help="Presupuesto diario o total informado por Meta, cuando existe a nivel campaña." /><TableHead label="Gastado" help={HELP.spend} /><TableHead label="Alcance" help={HELP.reach} /><TableHead label="Impresiones" help={HELP.impressions} /><TableHead label="Clics enlace" help={HELP.linkClicks} /><TableHead label="CTR enlace" help={HELP.linkCtr} /><TableHead label="CPC enlace" help={HELP.cpc} /><TableHead label="CPM" help={HELP.cpm} /><TableHead label="Frecuencia" help={HELP.frequency} /><TableHead label="Resultado" help={HELP.results} /><TableHead label="Costo/result." help={HELP.costPerResult} /></tr></thead><tbody className="divide-y divide-zinc-100">{campaigns.map((item) => <tr key={item.id} className="align-top hover:bg-zinc-50/60"><td className="px-3 py-3"><p className="max-w-[280px] font-semibold text-zinc-950">{item.name}</p><p className="mt-1 text-[10px] text-zinc-400">{item.id}</p></td><td className="px-3 py-3"><EntityStatus status={item.effectiveStatus} /></td><td className="px-3 py-3 text-xs text-zinc-600">{item.objective || '—'}</td><td className="px-3 py-3">{item.dailyBudget ? `${currency(item.dailyBudget, currencyCode)}/día` : item.lifetimeBudget ? currency(item.lifetimeBudget, currencyCode) : '—'}</td><td className="px-3 py-3 font-semibold">{currency(item.spend, currencyCode)}</td><td className="px-3 py-3">{integer.format(item.reach)}</td><td className="px-3 py-3">{integer.format(item.impressions)}</td><td className="px-3 py-3">{integer.format(item.linkClicks)}</td><td className="px-3 py-3">{number.format(item.linkCtr)}%</td><td className="px-3 py-3">{currency(item.linkCpc, currencyCode)}</td><td className="px-3 py-3">{currency(item.cpm, currencyCode)}</td><td className="px-3 py-3">{number.format(item.frequency)}</td><td className="px-3 py-3"><p className="font-semibold">{integer.format(item.results)}</p><p className="text-[10px] text-zinc-400">{resultLabel(item.resultType)}</p></td><td className="px-3 py-3 font-semibold">{item.costPerResult !== null ? currency(item.costPerResult, currencyCode) : '—'}</td></tr>)}</tbody></table></div>;
}

function AdSetTable({ adsets, currencyCode }: { adsets: MetaAdSet[]; currencyCode: string }) {
  if (!adsets.length) return <Empty text="No hay conjuntos con insights en este período." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1550px] text-sm"><thead><tr className="bg-zinc-50"><TableHead label="Conjunto" help="Conjunto de anuncios: agrupa segmentación, ubicaciones, puja y presupuesto." /><TableHead label="Campaña" help="Campaña a la que pertenece el conjunto." /><TableHead label="Estado" help="Estado efectivo informado por Meta." /><TableHead label="Gastado" help={HELP.spend} /><TableHead label="Alcance" help={HELP.reach} /><TableHead label="Impresiones" help={HELP.impressions} /><TableHead label="Clics enlace" help={HELP.linkClicks} /><TableHead label="CTR enlace" help={HELP.linkCtr} /><TableHead label="CPC enlace" help={HELP.cpc} /><TableHead label="Frecuencia" help={HELP.frequency} /><TableHead label="Resultado" help={HELP.results} /><TableHead label="Costo/result." help={HELP.costPerResult} /></tr></thead><tbody className="divide-y divide-zinc-100">{adsets.map((item) => <tr key={item.id} className="hover:bg-zinc-50/60"><td className="px-3 py-3"><p className="max-w-[260px] font-semibold">{item.name}</p><p className="mt-1 text-[10px] text-zinc-400">{item.id}</p></td><td className="px-3 py-3 text-xs">{item.campaignName || '—'}</td><td className="px-3 py-3"><EntityStatus status={item.effectiveStatus} /></td><td className="px-3 py-3 font-semibold">{currency(item.spend, currencyCode)}</td><td className="px-3 py-3">{integer.format(item.reach)}</td><td className="px-3 py-3">{integer.format(item.impressions)}</td><td className="px-3 py-3">{integer.format(item.linkClicks)}</td><td className="px-3 py-3">{number.format(item.linkCtr)}%</td><td className="px-3 py-3">{currency(item.linkCpc, currencyCode)}</td><td className="px-3 py-3">{number.format(item.frequency)}</td><td className="px-3 py-3"><p className="font-semibold">{integer.format(item.results)}</p><p className="text-[10px] text-zinc-400">{resultLabel(item.resultType)}</p></td><td className="px-3 py-3 font-semibold">{item.costPerResult !== null ? currency(item.costPerResult, currencyCode) : '—'}</td></tr>)}</tbody></table></div>;
}

function AdsTable({ ads, currencyCode }: { ads: MetaAd[]; currencyCode: string }) {
  if (!ads.length) return <Empty text="No hay anuncios con insights en este período." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-sm"><thead><tr className="bg-zinc-50"><TableHead label="Anuncio" help="Pieza individual dentro de un conjunto de anuncios." /><TableHead label="Campaña / conjunto" help="Jerarquía donde vive el anuncio." /><TableHead label="Estado" help="Estado efectivo del anuncio." /><TableHead label="Gastado" help={HELP.spend} /><TableHead label="Impresiones" help={HELP.impressions} /><TableHead label="Clics enlace" help={HELP.linkClicks} /><TableHead label="CTR enlace" help={HELP.linkCtr} /><TableHead label="CPC enlace" help={HELP.cpc} /><TableHead label="Frecuencia" help={HELP.frequency} /><TableHead label="Resultado" help={HELP.results} /><TableHead label="Costo/result." help={HELP.costPerResult} /></tr></thead><tbody className="divide-y divide-zinc-100">{ads.map((item) => <tr key={item.id} className="align-top hover:bg-zinc-50/60"><td className="px-3 py-3"><p className="max-w-[240px] font-semibold">{item.name}</p><p className="mt-1 text-[10px] text-zinc-400">{item.id}</p></td><td className="px-3 py-3"><p className="max-w-[220px] text-xs font-medium">{item.campaignName || '—'}</p><p className="mt-1 text-[10px] text-zinc-400">{item.adsetName || 'Sin conjunto'}</p></td><td className="px-3 py-3"><EntityStatus status={item.effectiveStatus} /></td><td className="px-3 py-3 font-semibold">{currency(item.spend, currencyCode)}</td><td className="px-3 py-3">{integer.format(item.impressions)}</td><td className="px-3 py-3">{integer.format(item.linkClicks)}</td><td className="px-3 py-3">{number.format(item.linkCtr)}%</td><td className="px-3 py-3">{currency(item.linkCpc, currencyCode)}</td><td className="px-3 py-3">{number.format(item.frequency)}</td><td className="px-3 py-3"><p className="font-semibold">{integer.format(item.results)}</p><p className="text-[10px] text-zinc-400">{resultLabel(item.resultType)}</p></td><td className="px-3 py-3 font-semibold">{item.costPerResult !== null ? currency(item.costPerResult, currencyCode) : '—'}</td></tr>)}</tbody></table></div>;
}

function TopAds({ ads, currencyCode }: { ads: MetaAd[]; currencyCode: string }) {
  if (!ads.length) return <p className="py-8 text-center text-sm text-zinc-400">Todavía no hay datos de anuncios.</p>;
  const ranked = [...ads].filter((item) => item.spend > 0).sort((a, b) => b.results - a.results || (a.costPerResult ?? Number.MAX_VALUE) - (b.costPerResult ?? Number.MAX_VALUE)).slice(0, 6);
  return <div className="space-y-2">{ranked.map((item, index) => <div key={item.id} className="rounded-xl bg-zinc-50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase text-zinc-400">#{index + 1}</p><p className="mt-1 text-sm font-semibold">{item.name}</p><p className="mt-1 text-[11px] text-zinc-500">{item.campaignName || 'Sin campaña'}</p></div><span className="rounded-lg bg-zinc-950 px-2 py-1 text-xs font-bold text-white">{item.results} {resultLabel(item.resultType).toLowerCase()}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-zinc-400">Gasto</p><p className="font-semibold">{currency(item.spend, currencyCode)}</p></div><div><p className="text-zinc-400">CTR enlace</p><p className="font-semibold">{number.format(item.linkCtr)}%</p></div><div><p className="text-zinc-400">Costo/result.</p><p className="font-semibold">{item.costPerResult !== null ? currency(item.costPerResult, currencyCode) : '—'}</p></div></div></div>)}</div>;
}

function TableHead({ label, help }: { label: string; help: string }) {
  return <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><span className="inline-flex items-center gap-1">{label}<InfoTip text={help} /></span></th>;
}

function TrendChart({ items, valueKey, label, valueFormatter }: { items: MetaDaily[]; valueKey: 'spend' | 'results'; label: string; valueFormatter: (value: number) => string }) {
  if (!items.length) return <Empty text="Todavía no hay datos diarios para este período." />;
  const values = items.map((item) => numericClient(item[valueKey]));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = items.length === 1 ? 50 : (index / (items.length - 1)) * 100;
    const y = 90 - (value / max) * 75;
    return `${x},${y}`;
  }).join(' ');
  const total = values.reduce((sum, value) => sum + value, 0);
  return <div><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-bold">{valueFormatter(total)}</p></div><p className="text-[10px] text-zinc-400">{items[0]?.date} → {items.at(-1)?.date}</p></div><div className="rounded-xl bg-zinc-50 p-3"><svg viewBox="0 0 100 100" className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={label}><line x1="0" y1="90" x2="100" y2="90" stroke="currentColor" className="text-zinc-200" vectorEffect="non-scaling-stroke" /><polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-zinc-900" vectorEffect="non-scaling-stroke" /></svg></div></div>;
}

function numericClient(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function EntityStatus({ status }: { status?: string | null }) {
  const normalized = String(status ?? '').toUpperCase();
  const problem = isProblemStatus(normalized);
  const active = normalized === 'ACTIVE';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : problem ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'}`}>{statusLabel(status)}</span>;
}

function SourceBars({ items }: { items: Breakdown[] }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (!items.length) return <p className="py-8 text-center text-sm text-zinc-400">Sin datos.</p>;
  return <div className="space-y-3">{items.slice(0, 8).map((item) => <div key={item._id}><div className="mb-1 flex justify-between text-xs"><span>{analyticsSourceLabel(item._id)}</span><span>{integer.format(item.value)}</span></div><div className="h-2 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-950" style={{ width: `${max ? item.value / max * 100 : 0}%` }} /></div></div>)}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-400">{text}</p>;
}

function ConnectorPlaceholder({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6"><div className="flex items-start gap-3"><WifiOff className="mt-0.5 h-5 w-5 text-zinc-400" /><div><p className="font-semibold text-zinc-700">{title}</p><p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">{text}</p></div></div></div>;
}

function healthStatus(meta: IntegrationHealth[] | undefined, provider: string): 'connected' | 'error' | 'pending' {
  const row = meta?.find((item) => item.provider === provider);
  if (!row) return 'pending';
  return row.status === 'connected' ? 'connected' : 'error';
}

function ConnectionCard({ name, detail, status, icon: Icon }: { name: string; detail: string; status: 'connected' | 'pending' | 'error'; icon: typeof Globe2 }) {
  return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{name}</p>{status === 'connected' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Conectado</span> : status === 'error' ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700"><AlertTriangle className="h-3 w-3" />Error</span> : <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600"><WifiOff className="h-3 w-3" />Pendiente</span>}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p></div></div></div>;
}
