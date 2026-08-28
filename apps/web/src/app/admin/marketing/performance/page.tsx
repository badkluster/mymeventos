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

type MetricCard = { label: string; value: string; note: string; icon: typeof Globe2; muted?: boolean };
type ProviderStatus = 'connected' | 'pending';
type Provider = { name: string; area: string; status: ProviderStatus; detail: string; icon: typeof Globe2 };

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const providers: Provider[] = [
  { name: 'Web + CRM M&M', area: 'Sitio y negocio', status: 'connected', detail: 'Sesiones, WhatsApp, formularios, leads y embudo comercial.', icon: Globe2 },
  { name: 'Meta Pixel + CAPI', area: 'Medición Meta', status: 'connected', detail: 'PageView, Contact y Lead con navegador + servidor y deduplicación.', icon: Activity },
  { name: 'Meta Ads', area: 'Facebook + Instagram Ads', status: 'pending', detail: 'Inversión, campañas, anuncios, CTR, CPM, CPC, CPL y ROAS.', icon: Target },
  { name: 'Instagram', area: 'Orgánico', status: 'pending', detail: 'Seguidores, alcance, engagement, reels, historias, guardados y compartidos.', icon: Video },
  { name: 'Facebook', area: 'Orgánico', status: 'pending', detail: 'Seguidores, alcance, interacciones, publicaciones y video.', icon: Users },
  { name: 'Google Ads', area: 'Publicidad', status: 'pending', detail: 'Costo, impresiones, clics, conversiones, CPC, CPA y campañas.', icon: Search },
  { name: 'Google Analytics 4', area: 'Analítica', status: 'pending', detail: 'Usuarios, sesiones, canales, engagement y atribución.', icon: BarChart3 },
  { name: 'Search Console', area: 'SEO', status: 'pending', detail: 'Clics, impresiones, CTR, posición, consultas y páginas.', icon: Search },
  { name: 'Google Business Profile', area: 'Fichas', status: 'pending', detail: 'Vistas, búsquedas, llamadas, rutas, clics y reseñas.', icon: Target },
  { name: 'TikTok', area: 'Orgánico', status: 'pending', detail: 'Seguidores, visualizaciones, retención y engagement.', icon: Video },
  { name: 'TikTok Ads', area: 'Publicidad', status: 'pending', detail: 'Inversión, CPM, CTR, CPC, conversiones y CPA.', icon: Video },
  { name: 'YouTube', area: 'Video', status: 'pending', detail: 'Visualizaciones, tiempo de reproducción, suscriptores y tráfico.', icon: Video },
  { name: 'WhatsApp Business', area: 'Conversaciones', status: 'pending', detail: 'Conversaciones y atribución cuando la API lo permita.', icon: MessageCircle },
];

const paidPlatforms = ['Meta Ads', 'Google Ads', 'TikTok Ads'];
const organicPlatforms = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Google Business Profile'];

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

export default function MarketingPerformancePage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await api.get<AnalyticsSummary>(`/analytics/summary?from=${from}&to=${to}`));
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el panel de performance.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [from, to, showToast]);

  useEffect(() => { void load(); }, [load]);

  const metrics = summary?.metrics;
  const executiveCards: MetricCard[] = [
    { label: 'Inversión publicitaria', value: '—', note: 'Se habilita al conectar APIs de Ads', icon: CircleDollarSign, muted: true },
    { label: 'Impresiones pagas', value: '—', note: 'Meta + Google + TikTok Ads', icon: Gauge, muted: true },
    { label: 'Clics pagos', value: '—', note: 'Se unificará por plataforma', icon: MousePointerClick, muted: true },
    { label: 'Leads web', value: metrics ? integer.format(metrics.formSuccess ?? 0) : '—', note: 'Formularios enviados', icon: Target },
    { label: 'Conversión web', value: metrics ? `${number.format(metrics.conversionRate ?? 0)}%` : '—', note: 'Sesiones que terminan en consulta', icon: TrendingUp },
    { label: 'WhatsApp', value: metrics ? integer.format(metrics.whatsappClicks ?? 0) : '—', note: 'Clics registrados en la web', icon: MessageCircle },
    { label: 'Costo por lead', value: '—', note: 'Pendiente inversión + conversiones', icon: TrendingDown, muted: true },
    { label: 'ROAS', value: '—', note: 'Pendiente atribución de ingresos', icon: TrendingUp, muted: true },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Performance 360" description="Panel unificado de marketing, redes, publicidad, web y conversiones." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>} />
      <MarketingTabs />

      <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Resumen ejecutivo</h2><p className="text-sm text-zinc-500">Los valores externos quedan pendientes hasta conectar cada API.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{executiveCards.map((card) => <Metric key={card.label} {...card} loading={loading} />)}</div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Embudo Web → Cliente" subtitle="Datos propios de M&M.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{(summary?.funnel ?? []).map((item, index) => <div key={item.id} className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{index + 1}. {item.label}</p><p className="mt-2 text-2xl font-bold">{integer.format(item.value)}</p></div>)}</div>
        </Panel>
        <Panel title="Origen de visitas" subtitle="Fuente detectada por la analítica propia."><SourceBars items={summary?.breakdowns.sources ?? []} /></Panel>
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <Panel title="Publicidad paga" subtitle="Comparación normalizada de plataformas."><SimpleTable headers={['Plataforma', 'Estado', 'Inversión', 'Impresiones', 'Clics', 'CTR', 'Leads', 'CPL', 'ROAS']} rows={paidPlatforms} /></Panel>
        <Panel title="Redes y contenido orgánico" subtitle="Seguidores, alcance y engagement."><SimpleTable headers={['Canal', 'Estado', 'Seguidores', 'Alcance', 'Interacciones', 'Engagement', 'Video views', 'Publicaciones']} rows={organicPlatforms} /></Panel>
      </section>

      <Panel title="Centro de conexiones" subtitle="Fuentes disponibles y pendientes de integrar.">
        <div className="grid gap-3 md:grid-cols-2">{providers.map((provider) => <ProviderCard key={provider.name} provider={provider} />)}</div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Salud de medición" subtitle="Debe quedar verde antes de lanzar campañas nuevas.">
          <div className="space-y-2"><Health ok label="Meta Pixel" /><Health ok label="Conversions API" /><Health ok label="Deduplicación navegador + servidor" /><Health ok label="Lead" /><Health ok label="Contact" /><Health label="Marketing APIs" /></div>
        </Panel>
        <Panel title="Orden de conexión" subtitle="Prioridad recomendada.">
          <ol className="space-y-2 text-sm">{['Meta Ads', 'Instagram + Facebook', 'Google Ads + GA4', 'Search Console + Business Profile', 'TikTok + TikTok Ads', 'YouTube + WhatsApp'].map((item, index) => <li key={item} className="flex gap-3 rounded-xl bg-zinc-50 p-3"><span className="font-bold">{index + 1}.</span><span>{item}</span></li>)}</ol>
        </Panel>
      </section>
    </section>
  );
}

function Metric({ label, value, note, icon: Icon, muted, loading }: MetricCard & { loading: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${muted ? 'border-dashed bg-zinc-50' : 'bg-white'}`}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-zinc-500">{label}</p><p className={`mt-2 text-2xl font-bold ${muted ? 'text-zinc-400' : ''}`}>{loading && !muted ? '…' : value}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-xs text-zinc-500">{note}</p></article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><header className="border-b border-zinc-100 px-5 py-4"><h2 className="font-semibold">{title}</h2>{subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}</header><div className="p-4 sm:p-5">{children}</div></article>;
}

function SourceBars({ items }: { items: Breakdown[] }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (!items.length) return <p className="py-8 text-center text-sm text-zinc-400">Sin datos.</p>;
  return <div className="space-y-3">{items.slice(0, 8).map((item) => <div key={item._id}><div className="mb-1 flex justify-between text-xs"><span>{analyticsSourceLabel(item._id)}</span><span>{integer.format(item.value)}</span></div><div className="h-2 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-950" style={{ width: `${max ? item.value / max * 100 : 0}%` }} /></div></div>)}</div>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-zinc-50">{headers.map((header) => <th key={header} className="px-3 py-3 text-left text-xs uppercase text-zinc-500">{header}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row}><td className="px-3 py-3 font-semibold">{row}</td><td className="px-3 py-3"><Status pending /></td>{Array.from({ length: headers.length - 2 }).map((_, index) => <td key={index} className="px-3 py-3 text-zinc-400">—</td>)}</tr>)}</tbody></table></div>;
}

function ProviderCard({ provider }: { provider: Provider }) {
  const Icon = provider.icon;
  return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100"><Icon className="h-4 w-4" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{provider.name}</p><Status pending={provider.status === 'pending'} /></div><p className="text-xs text-zinc-400">{provider.area}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{provider.detail}</p></div></div></div>;
}

function Status({ pending }: { pending?: boolean }) {
  return pending ? <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600"><WifiOff className="h-3 w-3" />Pendiente</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3 w-3" />Conectado</span>;
}

function Health({ ok, label }: { ok?: boolean; label: string }) {
  return <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 text-sm"><span>{label}</span>{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-zinc-400" />}</div>;
}
