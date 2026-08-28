'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Globe2,
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

type MetaSummary = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  leads: number;
  contacts: number;
  cpl: number | null;
};

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

type MetaCampaign = {
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
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  leads: number;
  contacts: number;
  cpl: number | null;
};

type MetaAd = {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  leads: number;
  contacts: number;
  cpl: number | null;
};

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
  detectedAt: string;
};

type MetaPerformance = {
  configured: boolean;
  connection: { status: 'connected' | 'pending' | 'error'; lastSyncAt: string | null };
  account: MetaAccount | null;
  summary: MetaSummary | null;
  campaigns: MetaCampaign[];
  ads: MetaAd[];
  alerts: PerformanceAlert[];
  integrationHealth: IntegrationHealth[];
};

type MetricCard = { label: string; value: string; note: string; icon: typeof Globe2; muted?: boolean };
type CampaignFilter = 'all' | 'active' | 'paused' | 'problems';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const externalProviders = [
  { name: 'Instagram orgánico', detail: 'Seguidores, alcance, engagement, reels, historias, guardados y compartidos.', icon: Video },
  { name: 'Facebook orgánico', detail: 'Seguidores, alcance, interacciones, publicaciones y video.', icon: Users },
  { name: 'Google Ads', detail: 'Costo, impresiones, clics, conversiones, CPC, CPA y campañas.', icon: Search },
  { name: 'Google Analytics 4', detail: 'Usuarios, sesiones, canales, engagement y atribución.', icon: BarChart3 },
  { name: 'Search Console', detail: 'Clics, impresiones, CTR, posición, consultas y páginas.', icon: Search },
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

export default function MarketingPerformancePage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [meta, setMeta] = useState<MetaPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [siteSummary, metaPerformance] = await Promise.all([
        api.get<AnalyticsSummary>(`/analytics/summary?from=${from}&to=${to}`),
        api.get<MetaPerformance>(`/marketing/performance/meta?from=${from}&to=${to}`),
      ]);
      setSummary(siteSummary);
      setMeta(metaPerformance);
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
  const filteredCampaigns = campaigns.filter((item) => {
    if (campaignFilter === 'active') return String(item.effectiveStatus).toUpperCase() === 'ACTIVE';
    if (campaignFilter === 'paused') return String(item.effectiveStatus).toUpperCase().includes('PAUSED');
    if (campaignFilter === 'problems') return item.issues.length > 0 || isProblemStatus(item.effectiveStatus);
    return true;
  });

  const executiveCards: MetricCard[] = [
    { label: 'Inversión Meta', value: metaSummary ? currency(metaSummary.spend, metaCurrency) : '—', note: meta?.configured ? 'Gasto del período seleccionado' : 'Pendiente Marketing API', icon: CircleDollarSign, muted: !metaSummary },
    { label: 'Impresiones Meta', value: metaSummary ? integer.format(metaSummary.impressions) : '—', note: 'Impresiones publicitarias', icon: Gauge, muted: !metaSummary },
    { label: 'Clics Meta', value: metaSummary ? integer.format(metaSummary.clicks) : '—', note: metaSummary ? `CTR ${number.format(metaSummary.ctr)}%` : 'Pendiente Marketing API', icon: MousePointerClick, muted: !metaSummary },
    { label: 'Leads Meta', value: metaSummary ? integer.format(metaSummary.leads) : '—', note: 'Leads atribuidos por Meta', icon: Target, muted: !metaSummary },
    { label: 'Leads web', value: metrics ? integer.format(metrics.formSuccess ?? 0) : '—', note: 'Formularios reales recibidos', icon: Target },
    { label: 'WhatsApp web', value: metrics ? integer.format(metrics.whatsappClicks ?? 0) : '—', note: 'Clics registrados en el sitio', icon: MessageCircle },
    { label: 'Costo por lead Meta', value: metaSummary?.cpl !== null && metaSummary?.cpl !== undefined ? currency(metaSummary.cpl, metaCurrency) : '—', note: 'Gasto Meta / leads atribuidos', icon: TrendingDown, muted: metaSummary?.cpl === null || !metaSummary },
    { label: 'Conversión web', value: metrics ? `${number.format(metrics.conversionRate ?? 0)}%` : '—', note: 'Sesiones que terminan en consulta', icon: TrendingUp },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Performance 360" description="Centro de control de marketing, campañas, APIs, web y conversiones." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>} />
      <MarketingTabs />

      <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        {[['Resumen', '#resumen'], ['Alertas', '#alertas'], ['Cuenta Meta', '#cuenta-meta'], ['Campañas', '#campanas-meta'], ['Anuncios', '#anuncios-meta'], ['Embudo', '#embudo'], ['Conexiones', '#conexiones']].map(([label, href]) => <a key={href} href={href} className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950">{label}</a>)}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="ml-auto text-right text-xs text-zinc-500">
          <p className="font-semibold text-zinc-700">Meta Ads: {meta?.connection.status === 'connected' ? 'conectado' : meta?.connection.status === 'error' ? 'con error' : 'pendiente'}</p>
          <p>{meta?.connection.lastSyncAt ? `Última sincronización: ${new Date(meta.connection.lastSyncAt).toLocaleString('es-AR')}` : 'Sin sincronización disponible'}</p>
        </div>
      </div>

      <section id="resumen" className="scroll-mt-24 space-y-3">
        <div><h2 className="text-lg font-semibold">Resumen ejecutivo</h2><p className="text-sm text-zinc-500">Cruza performance publicitaria con conversiones reales del sitio.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{executiveCards.map((card) => <Metric key={card.label} {...card} loading={loading} />)}</div>
      </section>

      <section id="alertas" className="scroll-mt-24">
        <AlertsPanel alerts={meta?.alerts ?? []} loading={loading} />
      </section>

      <section id="cuenta-meta" className="scroll-mt-24 space-y-4">
        <div><h2 className="text-lg font-semibold">Cuenta publicitaria y facturación Meta</h2><p className="text-sm text-zinc-500">Datos útiles de la cuenta: gasto, saldo, tope y estado de conexión. Las transacciones de pago siguen administrándose en Meta.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <AccountMetric label="Cuenta" value={meta?.account?.name || '—'} note={meta?.account?.id || 'Pendiente'} />
          <AccountMetric label="Campañas activas" value={meta?.configured ? integer.format(activeCampaigns.length) : '—'} note={`${campaigns.length} campañas detectadas`} />
          <AccountMetric label="Anuncios medidos" value={meta?.configured ? integer.format(meta?.ads.length ?? 0) : '—'} note="Con insights en el período" />
          <AccountMetric label="Saldo Meta" value={meta?.account ? currency(meta.account.balance, metaCurrency) : '—'} note="Saldo informado por la cuenta" />
          <AccountMetric label="Tope de gasto" value={meta?.account?.spendCap !== null && meta?.account?.spendCap !== undefined ? currency(meta.account.spendCap, metaCurrency) : 'Sin tope / —'} note="Límite configurado en Meta" />
          <AccountMetric label="Gasto histórico" value={meta?.account ? currency(meta.account.amountSpentLifetime, metaCurrency) : '—'} note={meta?.account?.timezone || 'Zona horaria pendiente'} />
        </div>
      </section>

      <section id="campanas-meta" className="scroll-mt-24">
        <Panel title="Campañas Meta Ads" subtitle="Campaña → inversión → alcance → clics → leads. Los datos aparecen automáticamente cuando la Marketing API está autorizada.">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {([
              ['all', `Todas (${campaigns.length})`],
              ['active', `Activas (${activeCampaigns.length})`],
              ['paused', `Pausadas (${pausedCampaigns.length})`],
              ['problems', `Problemas (${problemCampaigns.length})`],
            ] as Array<[CampaignFilter, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => setCampaignFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${campaignFilter === key ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{label}</button>)}
          </div>
          {meta?.configured && meta.connection.status === 'connected' ? <CampaignTable campaigns={filteredCampaigns} currencyCode={metaCurrency} /> : <ConnectorPlaceholder title="Meta Ads pendiente de autorización" text="La estructura ya está lista. Al configurar META_MARKETING_ACCESS_TOKEN con acceso de lectura, esta tabla mostrará campañas activas/pausadas, presupuesto, gasto, impresiones, alcance, clics, CTR, CPC, CPM, frecuencia, leads y CPL." />}
        </Panel>
      </section>

      <section id="anuncios-meta" className="scroll-mt-24 grid gap-4 2xl:grid-cols-[1.45fr_0.55fr]">
        <Panel title="Anuncios y creativos" subtitle="Permite detectar qué anuncio produce los leads y cuál consume presupuesto sin resultado.">
          {meta?.configured && meta.connection.status === 'connected' ? <AdsTable ads={meta.ads} currencyCode={metaCurrency} /> : <ConnectorPlaceholder title="Anuncios pendientes" text="Se completará junto con Meta Marketing API, con desglose por campaña y conjunto de anuncios." />}
        </Panel>
        <Panel title="Top / alertas creativas" subtitle="Lectura rápida para decidir qué mantener, revisar o rotar.">
          <TopAds ads={meta?.ads ?? []} currencyCode={metaCurrency} />
        </Panel>
      </section>

      <section id="embudo" className="scroll-mt-24 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Embudo Web → Cliente" subtitle="Datos propios de M&M, independientes de lo que atribuya cada plataforma.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{(summary?.funnel ?? []).map((item, index) => <div key={item.id} className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{index + 1}. {item.label}</p><p className="mt-2 text-2xl font-bold">{integer.format(item.value)}</p></div>)}</div>
        </Panel>
        <Panel title="Origen de visitas" subtitle="Fuente detectada por la analítica propia."><SourceBars items={summary?.breakdowns.sources ?? []} /></Panel>
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <Panel title="Publicidad paga — próximas conexiones" subtitle="Meta se completa primero; Google Ads y TikTok Ads usan la misma estructura de comparación."><PendingRows rows={['Google Ads', 'TikTok Ads']} /></Panel>
        <Panel title="Redes y contenido orgánico" subtitle="Seguidores, alcance, engagement y rendimiento de contenido."><PendingRows rows={['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Google Business Profile']} /></Panel>
      </section>

      <section id="conexiones" className="scroll-mt-24 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Centro de conexiones" subtitle="Todo convive dentro de Performance 360 y cada fuente informa si está conectada, degradada o pendiente.">
          <div className="grid gap-3 md:grid-cols-2">
            <ConnectionCard name="Web + CRM M&M" detail="Sesiones, formularios, WhatsApp, presupuestos y eventos confirmados." status="connected" icon={Globe2} />
            <ConnectionCard name="Meta Pixel" detail="Eventos browser-side del sitio." status="connected" icon={Activity} />
            <ConnectionCard name="Meta Conversions API" detail="Eventos server-side, deduplicación y monitoreo de fallos." status={healthStatus(meta?.integrationHealth, 'meta_capi')} icon={Activity} />
            <ConnectionCard name="Meta Ads" detail="Campañas, anuncios, inversión, clics y resultados." status={meta?.connection.status ?? 'pending'} icon={Target} />
            {externalProviders.map(({ name, detail, icon }) => <ConnectionCard key={name} name={name} detail={detail} status="pending" icon={icon} />)}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Qué vigila el centro de alertas" subtitle="No modifica campañas automáticamente: avisa para poder decidir rápido.">
            <ul className="space-y-2 text-sm text-zinc-600">{['Token/API sin acceso o vencido', 'Errores HTTP y timeouts', 'Campaña activa sin entrega', 'Campaña o anuncio rechazado/con problemas', 'CTR bajo con volumen suficiente', 'Frecuencia alta y posible fatiga', 'Gasto sin leads atribuidos', 'CAPI degradada o con rechazos'].map((item) => <li key={item} className="flex gap-2 rounded-xl bg-zinc-50 p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700" />{item}</li>)}</ul>
          </Panel>
          <Panel title="Siguiente capa" subtitle="Se irá habilitando sin cambiar esta pantalla.">
            <ol className="space-y-2 text-sm">{['Instagram + Facebook orgánico', 'Google Ads + GA4', 'Search Console + Business Profile', 'TikTok + TikTok Ads', 'YouTube + WhatsApp'].map((item, index) => <li key={item} className="flex gap-3 rounded-xl bg-zinc-50 p-3"><span className="font-bold">{index + 1}.</span><span>{item}</span></li>)}</ol>
          </Panel>
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, note, icon: Icon, muted, loading }: MetricCard & { loading: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${muted ? 'border-dashed border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white'}`}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><p className={`mt-2 text-2xl font-bold ${muted ? 'text-zinc-400' : ''}`}>{loading && !muted ? '…' : value}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-xs text-zinc-500">{note}</p></article>;
}

function AccountMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 break-words text-xl font-bold text-zinc-950">{value}</p><p className="mt-2 text-xs text-zinc-500">{note}</p></article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><header className="border-b border-zinc-100 px-5 py-4"><h2 className="font-semibold">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p> : null}</header><div className="p-4 sm:p-5">{children}</div></article>;
}

function AlertsPanel({ alerts, loading }: { alerts: PerformanceAlert[]; loading: boolean }) {
  const critical = alerts.filter((item) => item.severity === 'critical').length;
  const warnings = alerts.filter((item) => item.severity === 'warning').length;
  return <Panel title="Centro de alertas" subtitle="Errores técnicos + señales de performance para reaccionar rápido desde la misma sección.">
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <AccountMetric label="Críticas" value={loading ? '…' : integer.format(critical)} note="Requieren revisión prioritaria" />
      <AccountMetric label="Advertencias" value={loading ? '…' : integer.format(warnings)} note="Conviene revisar performance/configuración" />
      <AccountMetric label="Estado general" value={critical ? 'Atención' : warnings ? 'Revisar' : 'Correcto'} note={alerts.length ? `${alerts.length} alertas activas` : 'Sin alertas activas'} />
    </div>
    {loading ? <p className="py-6 text-center text-sm text-zinc-400">Revisando integraciones…</p> : alerts.length ? <div className="space-y-2">{alerts.slice(0, 20).map((alert) => <div key={alert.id} className={`rounded-xl border p-3 ${alert.severity === 'critical' ? 'border-red-200 bg-red-50' : alert.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-zinc-50'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-200 text-zinc-700'}`}>{alert.severity === 'critical' ? 'Crítico' : alert.severity === 'warning' ? 'Advertencia' : 'Info'}</span><span className="text-[11px] font-semibold uppercase text-zinc-500">{alert.source}</span>{alert.code ? <span className="text-[10px] text-zinc-400">{alert.code}</span> : null}</div><p className="mt-2 text-sm font-semibold text-zinc-950">{alert.title}</p><p className="mt-1 text-xs leading-5 text-zinc-600">{alert.message}</p></div><time className="text-[10px] text-zinc-400">{new Date(alert.detectedAt).toLocaleString('es-AR')}</time></div></div>)}</div> : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" /><div><p className="font-semibold">Sin alertas activas</p><p className="text-xs">Las integraciones monitoreadas no reportan problemas.</p></div></div>}
  </Panel>;
}

function CampaignTable({ campaigns, currencyCode }: { campaigns: MetaCampaign[]; currencyCode: string }) {
  if (!campaigns.length) return <p className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-400">No hay campañas para este filtro/período.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead><tr className="bg-zinc-50">{['Campaña', 'Estado', 'Objetivo', 'Presupuesto', 'Gastado', 'Alcance', 'Impresiones', 'Clics', 'CTR', 'CPC', 'CPM', 'Frecuencia', 'Leads', 'CPL'].map((header) => <th key={header} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{campaigns.map((item) => <tr key={item.id} className="align-top hover:bg-zinc-50/60"><td className="px-3 py-3"><p className="max-w-[260px] font-semibold text-zinc-950">{item.name}</p><p className="mt-1 text-[10px] text-zinc-400">{item.id}</p></td><td className="px-3 py-3"><EntityStatus status={item.effectiveStatus} /></td><td className="px-3 py-3 text-xs text-zinc-600">{item.objective || '—'}</td><td className="px-3 py-3">{item.dailyBudget ? `${currency(item.dailyBudget, currencyCode)}/día` : item.lifetimeBudget ? currency(item.lifetimeBudget, currencyCode) : '—'}</td><td className="px-3 py-3 font-semibold">{currency(item.spend, currencyCode)}</td><td className="px-3 py-3">{integer.format(item.reach)}</td><td className="px-3 py-3">{integer.format(item.impressions)}</td><td className="px-3 py-3">{integer.format(item.clicks)}</td><td className="px-3 py-3">{number.format(item.ctr)}%</td><td className="px-3 py-3">{currency(item.cpc, currencyCode)}</td><td className="px-3 py-3">{currency(item.cpm, currencyCode)}</td><td className="px-3 py-3">{number.format(item.frequency)}</td><td className="px-3 py-3 font-semibold">{integer.format(item.leads)}</td><td className="px-3 py-3 font-semibold">{item.cpl !== null ? currency(item.cpl, currencyCode) : '—'}</td></tr>)}</tbody></table></div>;
}

function AdsTable({ ads, currencyCode }: { ads: MetaAd[]; currencyCode: string }) {
  if (!ads.length) return <p className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-400">No hay anuncios con insights en este período.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead><tr className="bg-zinc-50">{['Anuncio', 'Campaña / conjunto', 'Estado', 'Gastado', 'Impresiones', 'Clics', 'CTR', 'CPC', 'Frecuencia', 'Leads', 'CPL'].map((header) => <th key={header} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{header}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{ads.slice(0, 100).map((item) => <tr key={item.id} className="align-top hover:bg-zinc-50/60"><td className="px-3 py-3"><p className="max-w-[240px] font-semibold">{item.name}</p><p className="mt-1 text-[10px] text-zinc-400">{item.id}</p></td><td className="px-3 py-3"><p className="max-w-[220px] text-xs font-medium">{item.campaignName || '—'}</p><p className="mt-1 text-[10px] text-zinc-400">{item.adsetName || 'Sin conjunto'}</p></td><td className="px-3 py-3"><EntityStatus status={item.effectiveStatus} /></td><td className="px-3 py-3 font-semibold">{currency(item.spend, currencyCode)}</td><td className="px-3 py-3">{integer.format(item.impressions)}</td><td className="px-3 py-3">{integer.format(item.clicks)}</td><td className="px-3 py-3">{number.format(item.ctr)}%</td><td className="px-3 py-3">{currency(item.cpc, currencyCode)}</td><td className="px-3 py-3">{number.format(item.frequency)}</td><td className="px-3 py-3 font-semibold">{integer.format(item.leads)}</td><td className="px-3 py-3 font-semibold">{item.cpl !== null ? currency(item.cpl, currencyCode) : '—'}</td></tr>)}</tbody></table></div>;
}

function TopAds({ ads, currencyCode }: { ads: MetaAd[]; currencyCode: string }) {
  if (!ads.length) return <p className="py-8 text-center text-sm text-zinc-400">Todavía no hay datos de anuncios.</p>;
  const byLeads = [...ads].sort((a, b) => b.leads - a.leads || (a.cpl ?? Number.MAX_VALUE) - (b.cpl ?? Number.MAX_VALUE)).slice(0, 5);
  return <div className="space-y-2">{byLeads.map((item, index) => <div key={item.id} className="rounded-xl bg-zinc-50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase text-zinc-400">#{index + 1} por leads</p><p className="mt-1 text-sm font-semibold">{item.name}</p><p className="mt-1 text-[11px] text-zinc-500">{item.campaignName || 'Sin campaña'}</p></div><span className="rounded-lg bg-zinc-950 px-2 py-1 text-xs font-bold text-white">{item.leads} leads</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-zinc-400">Gasto</p><p className="font-semibold">{currency(item.spend, currencyCode)}</p></div><div><p className="text-zinc-400">CTR</p><p className="font-semibold">{number.format(item.ctr)}%</p></div><div><p className="text-zinc-400">CPL</p><p className="font-semibold">{item.cpl !== null ? currency(item.cpl, currencyCode) : '—'}</p></div></div></div>)}</div>;
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

function ConnectorPlaceholder({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6"><div className="flex items-start gap-3"><WifiOff className="mt-0.5 h-5 w-5 text-zinc-400" /><div><p className="font-semibold text-zinc-700">{title}</p><p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">{text}</p></div></div></div>;
}

function PendingRows({ rows }: { rows: string[] }) {
  return <div className="space-y-2">{rows.map((row) => <div key={row} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3"><span className="text-sm font-semibold">{row}</span><span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-1 text-[10px] text-zinc-600"><WifiOff className="h-3 w-3" />Pendiente API</span></div>)}</div>;
}

function healthStatus(meta: IntegrationHealth[] | undefined, provider: string): 'connected' | 'error' | 'pending' {
  const row = meta?.find((item) => item.provider === provider);
  if (!row) return 'pending';
  return row.status === 'connected' ? 'connected' : 'error';
}

function ConnectionCard({ name, detail, status, icon: Icon }: { name: string; detail: string; status: 'connected' | 'pending' | 'error'; icon: typeof Globe2 }) {
  return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{name}</p>{status === 'connected' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Conectado</span> : status === 'error' ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700"><WifiOff className="h-3 w-3" />Error</span> : <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600"><WifiOff className="h-3 w-3" />Pendiente</span>}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p></div></div></div>;
}
