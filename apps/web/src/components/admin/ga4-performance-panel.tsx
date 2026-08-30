'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Eye, MousePointerClick, RefreshCw, Target, Users } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';

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

type Ga4Performance = {
  configured: boolean;
  propertyId: string | null;
  measurementId: string | null;
  connection: { status: 'connected' | 'pending' | 'error'; lastSyncAt: string | null; message?: string | null };
  summary: Ga4Summary | null;
  previousSummary: Ga4Summary | null;
  daily: Array<Ga4MetricRow & { date: string }>;
  channels: Ga4MetricRow[];
  landingPages: Ga4MetricRow[];
  events: Ga4MetricRow[];
  businessEvents: Record<string, Ga4MetricRow>;
};

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: inputDate(from), to: inputDate(to) };
}

function change(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function delta(value: number | null) {
  if (value === null) return 'sin base previa';
  return `${value > 0 ? '+' : ''}${decimal.format(value)}% vs. período anterior`;
}

function Kpi({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Users }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold text-zinc-950">{value}</p><p className="mt-2 text-xs text-zinc-500">{note}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span></div></article>;
}

function MetricRows({ rows, mode }: { rows: Ga4MetricRow[]; mode: 'channel' | 'landing' }) {
  if (!rows.length) return <p className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">Todavía no hay datos suficientes.</p>;
  return <div className="space-y-2">{rows.slice(0, 8).map((row) => <div key={`${mode}-${row.key}`} className="rounded-xl bg-zinc-50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900" title={row.key}>{row.key || '(sin identificar)'}</p><p className="mt-1 text-[11px] text-zinc-500">{integer.format(row.users)} usuarios · {integer.format(row.views)} vistas</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold">{integer.format(row.sessions)} sesiones</p><p className="mt-1 text-[11px] text-zinc-500">{integer.format(row.keyEvents)} eventos clave</p></div></div></div>)}</div>;
}

function BusinessEvents({ rows }: { rows: Record<string, Ga4MetricRow> }) {
  const labels: Record<string, string> = {
    whatsapp_click: 'WhatsApp',
    phone_click: 'Llamadas',
    form_start: 'Formulario iniciado',
    form_submit: 'Formulario enviado',
    generate_lead: 'Lead generado',
    salon_view: 'Vista de salón',
    package_view: 'Vista de paquete',
    promotion_click: 'Clic en promoción',
  };
  const order = ['whatsapp_click', 'generate_lead', 'form_submit', 'form_start', 'phone_click', 'salon_view', 'package_view', 'promotion_click'];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{order.map((name) => {
    const row = rows[name];
    return <div key={name} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{labels[name]}</p><p className="mt-2 text-xl font-bold text-zinc-950">{integer.format(row?.events ?? 0)}</p><p className="mt-1 text-[11px] text-zinc-500">evento GA4: {name}</p></div>;
  })}</div>;
}

export function Ga4PerformancePanel() {
  const { showToast } = useToast();
  const initial = useMemo(() => initialPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const [data, setData] = useState<Ga4Performance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range = applied) => {
    setLoading(true);
    try {
      const result = await api.get<Ga4Performance>(`/marketing/performance/ga4?from=${range.from}&to=${range.to}`);
      setData(result);
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar Google Analytics 4.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [applied, showToast]);

  useEffect(() => { void load(applied); }, [applied, load]);

  const summary = data?.summary;
  const previous = data?.previousSummary;
  const statusClass = data?.connection.status === 'connected' ? 'bg-emerald-50 text-emerald-700' : data?.connection.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  const statusLabel = data?.connection.status === 'connected' ? 'Conectado' : data?.connection.status === 'error' ? 'Error' : 'Pendiente';

  const apply = () => {
    if (!from || !to || from > to) {
      showToast({ message: 'Seleccioná un período válido para GA4.', variant: 'error' });
      return;
    }
    setApplied({ from, to });
  };

  return <section id="ga4" className="mt-6 scroll-mt-24 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /><h2 className="text-lg font-semibold">Google Analytics 4 · Sitio y conversiones</h2><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span></div><p className="mt-1 text-sm text-zinc-500">Usuarios, sesiones, engagement, canales y eventos comerciales medidos por GA4 dentro de Performance 360.</p></div>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar GA4</Button>
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <Button onClick={apply} disabled={loading}>Aplicar</Button>
      <div className="ml-auto text-right text-xs text-zinc-500"><p className="font-semibold text-zinc-800">{data?.measurementId || 'G-P6JD5EHBNG'}</p><p>{data?.connection.lastSyncAt ? `Sync: ${new Date(data.connection.lastSyncAt).toLocaleString('es-AR')}` : data?.connection.message || 'Esperando sincronización'}</p></div>
    </div>

    {summary ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Usuarios activos" value={integer.format(summary.activeUsers)} note={previous ? delta(change(summary.activeUsers, previous.activeUsers)) : 'sin base previa'} icon={Users} />
        <Kpi label="Sesiones" value={integer.format(summary.sessions)} note={previous ? delta(change(summary.sessions, previous.sessions)) : 'sin base previa'} icon={Activity} />
        <Kpi label="Tasa de interacción" value={`${decimal.format(summary.engagementRate)}%`} note={`${integer.format(summary.engagedSessions)} sesiones con interacción`} icon={MousePointerClick} />
        <Kpi label="Eventos clave" value={integer.format(summary.keyEvents)} note={`${integer.format(summary.eventCount)} eventos totales`} icon={Target} />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold">Eventos comerciales M&M</h3><p className="mt-1 text-xs text-zinc-500">Seguimiento de WhatsApp, formularios, leads, salones, paquetes y promociones. Los eventos aparecen automáticamente cuando empiezan a llegar a GA4.</p></div><BusinessEvents rows={data?.businessEvents ?? {}} /></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold">Canales de adquisición</h3><p className="mt-1 text-xs text-zinc-500">Cómo llegaron las sesiones: orgánico, directo, social, paid y otros canales definidos por Google.</p></div><MetricRows rows={data?.channels ?? []} mode="channel" /></div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold">Landing pages</h3><p className="mt-1 text-xs text-zinc-500">Qué páginas reciben sesiones y eventos clave para detectar las entradas comerciales más efectivas.</p></div><MetricRows rows={data?.landingPages ?? []} mode="landing" /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Vistas" value={integer.format(summary.views)} note="Vistas de páginas registradas por GA4" icon={Eye} />
        <Kpi label="Usuarios totales" value={integer.format(summary.totalUsers)} note="Usuarios únicos del período" icon={Users} />
        <Kpi label="Eventos" value={integer.format(summary.eventCount)} note="Interacciones registradas" icon={Activity} />
        <Kpi label="Eventos clave" value={integer.format(summary.keyEvents)} note="Conversiones principales configuradas en GA4" icon={Target} />
      </div>
    </> : !loading ? <div className={`rounded-2xl border p-5 ${data?.connection.status === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><p className="font-semibold text-zinc-900">GA4 instalado; conexión de lectura pendiente</p><p className="mt-2 text-sm leading-6 text-zinc-600">{data?.connection.message || 'Falta terminar la autorización de la API de Google Analytics para que Performance 360 pueda leer las métricas.'}</p></div> : null}

    {loading ? <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm"><RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />Sincronizando Google Analytics 4…</div> : null}
  </section>;
}
