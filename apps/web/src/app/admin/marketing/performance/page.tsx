'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Facebook,
  Gauge,
  Globe2,
  Instagram,
  Link2,
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

type ConnectionStatus = 'connected' | 'partial' | 'pending';
type Provider = {
  id: string;
  name: string;
  area: string;
  status: ConnectionStatus;
  detail: string;
  icon: typeof Globe2;
};

type MetricCard = {
  label: string;
  value: string;
  note: string;
  delta?: number | null;
  icon: typeof Globe2;
  muted?: boolean;
};

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const providers: Provider[] = [
  { id: 'web', name: 'Web + CRM M&M', area: 'Sitio y conversiones propias', status: 'connected', detail: 'Sesiones, WhatsApp, formularios, leads y embudo comercial.', icon: Globe2 },
  { id: 'meta-events', name: 'Meta Pixel + CAPI', area: 'Medición web Meta', status: 'connected', detail: 'PageView, Contact y Lead con navegador + servidor y deduplicación.', icon: Activity },
  { id: 'meta-ads', name: 'Meta Ads', area: 'Facebook e Instagram Ads', status: 'pending', detail: 'Falta conectar Marketing API para inversión, campañas, anuncios, CPL, CTR, CPM y ROAS.', icon: Facebook },
  { id: 'instagram', name: 'Instagram', area: 'Orgánico', status: 'pending', detail: 'Seguidores, alcance, engagement, reels, historias, guardados y compartidos.', icon: Instagram },
  { id: 'facebook', name: 'Facebook', area: 'Orgánico', status: 'pending', detail: 'Seguidores, alcance, interacciones, publicaciones y video.', icon: Facebook },
  { id: 'google-ads', name: 'Google Ads', area: 'Paid Search / Performance Max', status: 'pending', detail: 'Costo, impresiones, clics, conversiones, CPC, CPA, términos y campañas.', icon: Search },
  { id: 'ga4', name: 'Google Analytics 4', area: 'Analítica web', status: 'pending', detail: 'Usuarios, sesiones, canales, engagement y atribución complementaria.', icon: BarChart3 },
  { id: 'search-console', name: 'Search Console', area: 'SEO', status: 'pending', detail: 'Clics orgánicos, impresiones, CTR, posición, consultas y páginas.', icon: Search },
  { id: 'business-profile', name: 'Google Business Profile', area: 'Fichas de salones', status: 'pending', detail: 'Vistas, búsquedas, llamadas, rutas, clics al sitio y reseñas.', icon: Target },
  { id: 'tiktok', name: 'TikTok', area: 'Orgánico', status: 'pending', detail: 'Seguidores, visualizaciones, retención, engagement y publicaciones.', icon: Video },
  { id: 'tiktok-ads', name: 'TikTok Ads', area: 'Publicidad', status: 'pending', detail: 'Inversión, CPM, CTR, CPC, conversiones, CPA y campañas.', icon: Video },
  { id: 'youtube', name: 'YouTube', area: 'Video', status: 'pending', detail: 'Visualizaciones, tiempo de reproducción, suscriptores y tráfico.', icon: Video },
  { id: 'whatsapp', name: 'WhatsApp Business', area: 'Conversaciones', status: 'pending', detail: 'Conversaciones iniciadas, respondidas y atribución cuando la API lo permita.', icon: MessageCircle },
];

const paidRows = [
  { platform: 'Meta Ads', status: 'Pendiente API', note: 'Facebook + Instagram', icon: Facebook },
  { platform: 'Google Ads', status: 'Pendiente API', note: 'Search / PMax', icon: Search },
  { platform: 'TikTok Ads', status: 'Pendiente API', note: 'TikTok Ads', icon: Video },
];

const socialRows = [
  { platform: 'Instagram', status: 'Pendiente', icon: Instagram },
  { platform: 'Facebook', status: 'Pendiente', icon: Facebook },
  { platform: 'TikTok', status: 'Pendiente', icon: Video },
  { platform: 'YouTube', status: 'Pendiente', icon: Video },
  { platform: 'Google Business Profile', status: 'Pendiente', icon: Target },
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

function previousPeriod(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousTo = new Date(start);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - (days - 1));
  return { from: asInputDate(previousFrom), to: asInputDate(previousTo) };
}

function delta(current?: number, previous?: number) {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function currency(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

export default function MarketingPerformancePage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [previous, setPrevious] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const before = previousPeriod(from, to);
    try {
      const [current, prior] = await Promise.all([
        api.get<AnalyticsSummary>(`/analytics/summary?from=${from}&to=${to}`),
        api.get<AnalyticsSummary>(`/analytics/summary?from=${before.from}&to=${before.to}`),
      ]);
      setSummary(current);
      setPrevious(prior);
      setLastUpdated(new Date());
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el panel de performance.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [from, to, showToast]);

  useEffect(() => { void load(); }, [load]);

  const metrics = summary?.metrics;
  const priorMetrics = previous?.metrics;
  const executiveCards: MetricCard[] = [
    { label: 'Inversión publicitaria', value: '—', note: 'Disponible al conectar APIs de Ads', icon: CircleDollarSign, muted: true },
    { label: 'Impresiones pagas', value: '—', note: 'Meta + Google + TikTok Ads', icon: Gauge, muted: true },
    { label: 'Clics pagos', value: '—', note: 'Se unificará por plataforma', icon: MousePointerClick, muted: true },
    { label: 'Leads web', value: metrics ? integer.format(metrics.formSuccess ?? 0) : '—', note: 'Formulario enviado correctamente', icon: Target, delta: delta(metrics?.formSuccess, priorMetrics?.formSuccess) },
    { label: 'Conversión web', value: metrics ? `${number.format(metrics.conversionRate ?? 0)}%` : '—', note: 'Sesiones que terminan en consulta', icon: TrendingUp, delta: delta(metrics?.conversionRate, priorMetrics?.conversionRate) },
    { label: 'Contactos WhatsApp', value: metrics ? integer.format(metrics.whatsappClicks ?? 0) : '—', note: 'Clics registrados en la web', icon: MessageCircle, delta: delta(metrics?.whatsappClicks, priorMetrics?.whatsappClicks) },
    { label: 'Costo por lead', value: '—', note: 'Disponible al conectar inversión + conversiones', icon: BadgeDollarSign, muted: true },
    { label: 'ROAS', value: '—', note: 'Disponible al atribuir ingresos a campañas', icon: TrendingUp, muted: true },
  ];

  const websiteCards: MetricCard[] = [
    { label: 'Visitantes', value: metrics ? integer.format(metrics.visitors ?? 0) : '—', note: 'Personas anónimas únicas', icon: Users, delta: delta(metrics?.visitors, priorMetrics?.visitors) },
    { label: 'Sesiones', value: metrics ? integer.format(metrics.sessions ?? 0) : '—', note: 'Visitas al sitio', icon: Globe2, delta: delta(metrics?.sessions, priorMetrics?.sessions) },
    { label: 'Vistas de página', value: metrics ? integer.format(metrics.pageViews ?? 0) : '—', note: 'Total de páginas vistas', icon: BarChart3, delta: delta(metrics?.pageViews, priorMetrics?.pageViews) },
    { label: 'Formularios iniciados', value: metrics ? integer.format(metrics.formStarts ?? 0) : '—', note: 'Intención previa al lead', icon: MousePointerClick, delta: delta(metrics?.formStarts, priorMetrics?.formStarts) },
    { label: 'Leads', value: metrics ? integer.format(metrics.formSuccess ?? 0) : '—', note: 'Consultas enviadas', icon: Target, delta: delta(metrics?.formSuccess, priorMetrics?.formSuccess) },
    { label: 'WhatsApp', value: metrics ? integer.format(metrics.whatsappClicks ?? 0) : '—', note: 'Clics a conversación', icon: MessageCircle, delta: delta(metrics?.whatsappClicks, priorMetrics?.whatsappClicks) },
    { label: 'Tasa de rebote', value: metrics ? `${number.format(metrics.bounceRate ?? 0)}%` : '—', note: 'Sesiones sin interacción/conversión', icon: TrendingDown, delta: delta(metrics?.bounceRate, priorMetrics?.bounceRate) },
    { label: 'Páginas / sesión', value: metrics ? number.format(metrics.pagesPerSession ?? 0) : '—', note: 'Profundidad de navegación', icon: Activity, delta: delta(metrics?.pagesPerSession, priorMetrics?.pagesPerSession) },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        title="Performance 360"
        description="Panel unificado de marketing, redes, publicidad, web y conversiones. Cada fuente se habilita a medida que conectamos su API."
        action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
      />
      <MarketingTabs />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="ml-auto text-right text-xs text-zinc-500">
          <p className="font-medium text-zinc-700">Período comparativo automático</p>
          <p>Compara contra el período anterior de igual duración.</p>
          {lastUpdated ? <p className="mt-1">Actualizado: {lastUpdated.toLocaleString('es-AR')}</p> : null}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Resumen ejecutivo</h2><p className="text-sm text-zinc-500">KPIs principales. Los indicadores pagos se completarán al conectar las cuentas publicitarias.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{executiveCards.map((card) => <Metric key={card.label} {...card} loading={loading} />)}</div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Embudo completo Web → Cliente" subtitle="Datos propios de M&M. Más adelante se sumará atribución por campaña y plataforma.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(summary?.funnel ?? []).map((item, index) => {
              const max = Math.max(1, summary?.funnel?.[0]?.value ?? 1);
              const rate = item.value / max * 100;
              return <div key={item.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-zinc-600">{index + 1}. {item.label}</span><span className="text-[11px] text-zinc-400">{number.format(rate)}%</span></div>
                <p className="mt-2 text-2xl font-bold text-zinc-950">{integer.format(item.value)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-zinc-900" style={{ width: `${Math.min(100, rate)}%` }} /></div>
              </div>;
            })}
            {!summary?.funnel?.length ? <Empty text="Sin datos de embudo para este período." /> : null}
          </div>
        </Panel>

        <Panel title="Origen de visitas" subtitle="Fuente detectada por la analítica propia del sitio.">
          <SourceBars items={summary?.breakdowns.sources ?? []} />
        </Panel>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold text-zinc-950">Web y CRM</h2><p className="text-sm text-zinc-500">Estas métricas ya son reales y provienen de la medición propia de M&M.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{websiteCards.map((card) => <Metric key={card.label} {...card} loading={loading} />)}</div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <Panel title="Publicidad paga" subtitle="Vista normalizada para comparar plataformas sin cambiar de panel.">
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-zinc-100 bg-zinc-50/80">{['Plataforma', 'Estado', 'Inversión', 'Impresiones', 'Clics', 'CTR', 'Leads', 'CPL', 'ROAS'].map((label) => <th key={label} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{paidRows.map(({ platform, status, note, icon: Icon }) => <tr key={platform}><td className="px-3 py-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100"><Icon className="h-4 w-4" /></span><div><p className="font-semibold text-zinc-900">{platform}</p><p className="text-xs text-zinc-400">{note}</p></div></div></td><td className="px-3 py-3"><StatusBadge status="pending" label={status} /></td>{Array.from({ length: 7 }).map((_, index) => <td key={index} className="px-3 py-3 font-medium text-zinc-400">—</td>)}</tr>)}</tbody></table></div>
        </Panel>

        <Panel title="Redes y contenido orgánico" subtitle="Seguidores, alcance, engagement y rendimiento de publicaciones en un mismo formato.">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-zinc-100 bg-zinc-50/80">{['Canal', 'Estado', 'Seguidores', 'Alcance', 'Interacciones', 'Engagement', 'Video views', 'Publicaciones'].map((label) => <th key={label} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{socialRows.map(({ platform, status, icon: Icon }) => <tr key={platform}><td className="px-3 py-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100"><Icon className="h-4 w-4" /></span><span className="font-semibold text-zinc-900">{platform}</span></div></td><td className="px-3 py-3"><StatusBadge status="pending" label={status} /></td>{Array.from({ length: 6 }).map((_, index) => <td key={index} className="px-3 py-3 font-medium text-zinc-400">—</td>)}</tr>)}</tbody></table></div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Centro de conexiones" subtitle="Estado de todas las fuentes que vamos a incorporar al panel.">
          <div className="grid gap-3 md:grid-cols-2">{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}</div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Orden recomendado de conexión" subtitle="Prioridad para obtener valor rápido sin mezclar configuraciones.">
            <ol className="space-y-3 text-sm">
              {[
                ['1', 'Meta Ads', 'Campañas, inversión, anuncios, CPL y atribución.'],
                ['2', 'Instagram + Facebook', 'Orgánico, seguidores y contenido.'],
                ['3', 'Google Ads + GA4', 'Búsqueda paga y medición complementaria.'],
                ['4', 'Search Console + Business Profile', 'SEO y fichas de los salones.'],
                ['5', 'TikTok + TikTok Ads', 'Contenido y publicidad.'],
                ['6', 'YouTube + WhatsApp', 'Video y conversaciones cuando corresponda.'],
              ].map(([step, title, description]) => <li key={step} className="flex gap-3 rounded-xl bg-zinc-50 p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-950 text-xs font-bold text-white">{step}</span><div><p className="font-semibold text-zinc-900">{title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p></div></li>)}
            </ol>
          </Panel>

          <Panel title="Salud de medición" subtitle="Controles que deben mantenerse antes de lanzar campañas nuevas.">
            <div className="space-y-2 text-sm">
              <HealthRow ok label="Meta Pixel" detail="Configurado" />
              <HealthRow ok label="Conversions API" detail="Configurada" />
              <HealthRow ok label="Deduplicación" detail="Browser + Server" />
              <HealthRow ok label="Lead" detail="Evento principal disponible" />
              <HealthRow ok label="Contact" detail="Señal secundaria disponible" />
              <HealthRow label="Marketing APIs" detail="Pendientes de conectar" />
            </div>
          </Panel>
        </div>
      </section>

      <Panel title="Métricas que quedarán centralizadas" subtitle="Este es el alcance del panel cuando terminemos las conexiones.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricGroup title="Publicidad" items={['Inversión', 'Impresiones', 'Alcance', 'Frecuencia', 'Clics', 'CTR', 'CPC', 'CPM', 'Leads', 'CPL / CPA', 'Conversion value', 'ROAS']} />
          <MetricGroup title="Redes orgánicas" items={['Seguidores', 'Crecimiento', 'Alcance', 'Impresiones', 'Interacciones', 'Engagement', 'Guardados', 'Compartidos', 'Reproducciones', 'Retención', 'Top contenidos']} />
          <MetricGroup title="Web / SEO" items={['Usuarios', 'Sesiones', 'Canales', 'Landing pages', 'WhatsApp', 'Form starts', 'Leads', 'Conversión', 'Bounce', 'Consultas Google', 'Posición SEO', 'CTR orgánico']} />
          <MetricGroup title="Negocio / CRM" items={['Leads', 'Leads calificados', 'Presupuestos', 'Aceptados', 'Eventos confirmados', 'Facturación', 'Ticket promedio', 'CAC', 'ROAS real', 'Conversión por salón', 'Conversión por campaña']} />
        </div>
      </Panel>
    </section>
  );
}

function Metric({ label, value, note, delta: change, icon: Icon, muted, loading }: MetricCard & { loading: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${muted ? 'border-dashed border-zinc-200 bg-zinc-50/60' : 'border-zinc-200 bg-white'}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className={`mt-2 text-2xl font-bold ${muted ? 'text-zinc-400' : 'text-zinc-950'}`}>{loading && !muted ? '…' : value}</p></div><span className={`grid h-9 w-9 place-items-center rounded-xl ${muted ? 'bg-zinc-100 text-zinc-400' : 'bg-zinc-950 text-white'}`}><Icon className="h-4 w-4" /></span></div>
    <div className="mt-3 flex min-h-5 items-center justify-between gap-2"><p className="text-xs text-zinc-500">{note}</p>{change !== undefined && change !== null ? <Delta value={change} /> : null}</div>
  </article>;
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><Icon className="h-3 w-3" />{positive ? '+' : ''}{number.format(value)}%</span>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><header className="border-b border-zinc-100 px-5 py-4"><h2 className="font-semibold text-zinc-950">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p> : null}</header><div className="p-4 sm:p-5">{children}</div></article>;
}

function SourceBars({ items }: { items: Breakdown[] }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (!items.length) return <Empty text="Sin fuentes registradas para el período." />;
  return <div className="space-y-3">{items.slice(0, 8).map((item) => <div key={item._id}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-zinc-700">{analyticsSourceLabel(item._id)}</span><span className="font-semibold text-zinc-500">{integer.format(item.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-950" style={{ width: `${max ? item.value / max * 100 : 0}%` }} /></div></div>)}</div>;
}

function ProviderCard({ provider }: { provider: Provider }) {
  const Icon = provider.icon;
  return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-zinc-900">{provider.name}</p><StatusBadge status={provider.status} /></div><p className="mt-0.5 text-xs font-medium text-zinc-400">{provider.area}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{provider.detail}</p></div></div></div>;
}

function StatusBadge({ status, label }: { status: ConnectionStatus; label?: string }) {
  const config = status === 'connected'
    ? { text: label ?? 'Conectado', classes: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 }
    : status === 'partial'
      ? { text: label ?? 'Parcial', classes: 'bg-amber-50 text-amber-700', icon: Link2 }
      : { text: label ?? 'Pendiente', classes: 'bg-zinc-100 text-zinc-600', icon: WifiOff };
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${config.classes}`}><Icon className="h-3 w-3" />{config.text}</span>;
}

function HealthRow({ ok, label, detail }: { ok?: boolean; label: string; detail: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5"><div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-zinc-400" />}<span className="font-medium text-zinc-800">{label}</span></div><span className="text-xs text-zinc-500">{detail}</span></div>;
}

function MetricGroup({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-xl bg-zinc-50 p-4"><p className="font-semibold text-zinc-900">{title}</p><div className="mt-3 flex flex-wrap gap-1.5">{items.map((item) => <span key={item} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600">{item}</span>)}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <p className="col-span-full rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">{text}</p>;
}
