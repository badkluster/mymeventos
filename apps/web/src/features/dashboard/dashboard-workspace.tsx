'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList,
  ChefHat, FilePlus2, FileText, LoaderCircle, RefreshCw, TrendingDown, TrendingUp, UsersRound,
} from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { displayLabel, eventStatusLabels, leadSourceLabels } from '@/lib/display-labels';

type Metric = {
  id: string;
  label: string;
  value: number | null;
  previousValue: number | null;
  changePercentage: number | null;
  format: 'integer' | 'decimal' | 'currency' | 'percentage';
  description: string;
  formula: string;
  drillDownHref?: string;
  drilldown?: string;
};
type Breakdown = { id: string; label: string; value: number };
type Summary = {
  meta: {
    period: { from: string; to: string };
    timeZone: string;
    selectedSalonId: string | null;
    lastUpdatedAt: string;
    financialVisible: boolean;
  };
  metrics: Metric[];
  funnel: Breakdown[];
  breakdowns: {
    eventsBySalon: Breakdown[];
    eventsByType: Breakdown[];
    leadsBySource: Breakdown[];
    expensesByCategory: Breakdown[];
  };
};
type AgendaItem = {
  id: string;
  type: string;
  title: string;
  at: string;
  time?: string;
  salon?: string;
  customer?: string;
  responsible?: string;
  status?: string;
  priority?: string;
  amount?: number;
  href: string;
};
type Agenda = { date: string; timeZone: string; items: AgendaItem[] };
type DashboardAlert = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendedAction: string;
  dueAt: string;
  salon?: string;
  href: string;
};
type Alerts = { generatedAt: string; items: DashboardAlert[] };
type Salon = { _id: string; name: string };

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: '2-digit', month: 'short' });

function argentinaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function initialPeriod() {
  const { year, month, day } = argentinaDateParts();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}

function formatMetric(metric: Metric) {
  if (metric.value === null) return 'Sin datos';
  if (metric.format === 'currency') return money.format(metric.value);
  if (metric.format === 'percentage') return `${number.format(metric.value)} %`;
  return number.format(metric.value);
}

function metricTone(id: string) {
  if (id.includes('overdue') || id.includes('pending')) return 'border-amber-200 bg-amber-50/55';
  if (id.includes('accepted') || id.includes('collected') || id.includes('confirmed')) return 'border-emerald-200 bg-emerald-50/45';
  return 'border-zinc-200 bg-white';
}

const severityStyle = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-zinc-200 bg-zinc-50 text-zinc-700',
};

function BreakdownBars({ items, format = 'number' }: { items: Breakdown[]; format?: 'number' | 'currency' }) {
  const max = Math.max(...items.map((item) => item.value), 0);
  if (!items.length) return <EmptyCompact text="No hay información para este período." />;
  return <div className="space-y-3">
    {items.slice(0, 8).map((item) => <div key={item.id}>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-zinc-700">{item.label}</span>
        <span className="shrink-0 tabular-nums text-zinc-500">{format === 'currency' ? money.format(item.value) : number.format(item.value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-zinc-900" style={{ width: `${max ? Math.max(3, (item.value / max) * 100) : 0}%` }} />
      </div>
    </div>)}
  </div>;
}

function EmptyCompact({ text }: { text: string }) {
  return <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center text-sm text-zinc-500">{text}</div>;
}

function LoadingBlock() {
  return <div className="grid min-h-72 place-items-center rounded-2xl border border-zinc-200 bg-white">
    <span className="inline-flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Actualizando indicadores…</span>
  </div>;
}

export function DashboardWorkspace() {
  const { user } = useSession();
  const initial = useMemo(() => initialPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [salonId, setSalonId] = useState('');
  const [salons, setSalons] = useState<Salon[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canSeeAllSalons = userCanAccess(user, [Permission.DASHBOARD_ALL_SALONS_VIEW]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to });
    if (salonId) params.set('salonId', salonId);
    try {
      const [nextSummary, nextAgenda, nextAlerts] = await Promise.all([
        api.get<Summary>(`/dashboard/summary?${params}`),
        api.get<Agenda>(`/dashboard/agenda?${params}`),
        api.get<Alerts>(`/dashboard/alerts?${params}`),
      ]);
      setSummary(nextSummary);
      setAgenda(nextAgenda);
      setAlerts(nextAlerts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, [from, to, salonId]);

  useEffect(() => {
    void api.get<{ salons?: Salon[] } | Salon[]>('/salons?limit=100')
      .then((result) => setSalons(Array.isArray(result) ? result : result.salons ?? []))
      .catch(() => setSalons([]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const quickActions = [
    { label: 'Nuevo lead', href: '/admin/leads?create=1', icon: UsersRound, permission: Permission.LEADS_CREATE },
    { label: 'Nuevo presupuesto', href: '/admin/quotes?create=1', icon: FilePlus2, permission: Permission.QUOTES_CREATE },
    { label: 'Nuevo evento', href: '/admin/events?create=1', icon: CalendarDays, permission: Permission.EVENTS_CREATE },
    { label: 'Gestionar pagos', href: '/admin/payments', icon: CircleDollarSign, permission: Permission.PAYMENTS_READ },
    { label: 'Generar producción', href: '/admin/production?generate=1', icon: ChefHat, permission: Permission.PRODUCTION_GENERATE },
  ].filter((action) => userCanAccess(user, [action.permission]));

  return <section className="space-y-6">
    <PageHeader
      title={`Hola, ${user?.firstName || 'equipo'}`}
      description="Una vista accionable del negocio y la operación. Todos los indicadores respetan el período y salón seleccionados."
      action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
    />

    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <label className="min-w-40 flex-1 text-xs font-medium text-zinc-600">Desde<Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1.5" /></label>
      <label className="min-w-40 flex-1 text-xs font-medium text-zinc-600">Hasta<Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1.5" /></label>
      <label className="min-w-52 flex-[1.3] text-xs font-medium text-zinc-600">Salón
        <Select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="mt-1.5">
          {canSeeAllSalons ? <option value="">Todos los salones</option> : null}
          {!canSeeAllSalons && !salonId ? <option value="">Mi alcance asignado</option> : null}
          {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
        </Select>
      </label>
      {summary ? <p className="pb-2 text-xs text-zinc-400">Actualizado {dateTime.format(new Date(summary.meta.lastUpdatedAt))}</p> : null}
    </div>

    {quickActions.length ? <div className="flex flex-wrap gap-2">
      {quickActions.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"><Icon className="h-4 w-4" />{label}</Link>)}
    </div> : null}

    {error ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span><strong>No pudimos actualizar el dashboard.</strong> {error}</span><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : null}
    {loading && !summary ? <LoadingBlock /> : null}

    {summary ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.metrics.map((item) => <Link key={item.id} href={item.drillDownHref || item.drilldown || '/admin/reports'} title={`${item.description} Fórmula: ${item.formula}`} className={`group rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${metricTone(item.id)}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.label}</p>
            {item.changePercentage === null ? <span className="text-xs text-zinc-400">Sin base</span> : item.changePercentage >= 0
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><TrendingUp className="h-3.5 w-3.5" />{number.format(item.changePercentage)}%</span>
              : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><TrendingDown className="h-3.5 w-3.5" />{number.format(Math.abs(item.changePercentage))}%</span>}
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{formatMetric(item)}</p>
          <p className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>Período anterior: {item.format === 'currency' ? money.format(item.previousValue ?? 0) : number.format(item.previousValue ?? 0)}</span><ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" /></p>
        </Link>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-zinc-950">Embudo comercial</h2><p className="mt-1 text-xs text-zinc-500">Volumen por etapa dentro del período.</p></div><ClipboardList className="h-5 w-5 text-zinc-400" /></div>
          <div className="grid gap-2 sm:grid-cols-5">
            {summary.funnel.map((stage, index) => <div key={stage.id} className="relative rounded-xl bg-zinc-50 p-3">
              <span className="text-[11px] font-medium text-zinc-500">{stage.label}</span>
              <p className="mt-2 text-xl font-semibold tabular-nums">{number.format(stage.value)}</p>
              {index < summary.funnel.length - 1 ? <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-zinc-300 sm:block" /> : null}
            </div>)}
          </div>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Eventos por salón</h2>
          <p className="mb-5 mt-1 text-xs text-zinc-500">Eventos activos cuya fecha cae en el período.</p>
          <BreakdownBars items={summary.breakdowns.eventsBySalon} />
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Eventos por tipo</h2><p className="mb-5 mt-1 text-xs text-zinc-500">Distribución de la operación.</p><BreakdownBars items={summary.breakdowns.eventsByType.map((item) => ({ ...item, label: item.label || 'Sin especificar' }))} /></article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Origen de leads</h2><p className="mb-5 mt-1 text-xs text-zinc-500">Canales que generaron consultas.</p><BreakdownBars items={summary.breakdowns.leadsBySource.map((item) => ({ ...item, label: displayLabel(leadSourceLabels, item.label) }))} /></article>
        {summary.meta.financialVisible ? <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Gastos por categoría</h2><p className="mb-5 mt-1 text-xs text-zinc-500">Gastos pagados durante el período.</p><BreakdownBars items={summary.breakdowns.expensesByCategory} format="currency" /></article> : <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5"><h2 className="font-semibold">Información financiera restringida</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Tu rol puede consultar la operación, pero no importes financieros.</p></article>}
      </div>
    </> : null}

    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><h2 className="font-semibold">Agenda de hoy</h2><p className="mt-1 text-xs text-zinc-500">{agenda ? dateOnly.format(new Date(`${agenda.date}T12:00:00-03:00`)) : 'Eventos, tareas y vencimientos'}</p></div><CalendarDays className="h-5 w-5 text-zinc-400" /></header>
        <div className="divide-y divide-zinc-100">
          {agenda?.items.length ? agenda.items.slice(0, 10).map((item) => <Link key={`${item.type}-${item.id}`} href={item.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50">
            <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-zinc-600">{item.time || dateTime.format(new Date(item.at)).split(', ')[1]}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-zinc-900">{item.title}</span><span className="block truncate text-xs text-zinc-500">{[item.salon, item.customer, item.responsible].filter(Boolean).join(' · ') || 'Sin detalle adicional'}</span></span>
            {item.amount ? <span className="text-xs font-semibold">{money.format(item.amount)}</span> : null}<ArrowRight className="h-4 w-4 text-zinc-300" />
          </Link>) : <div className="p-5"><EmptyCompact text="No hay actividades ni vencimientos para hoy." /></div>}
        </div>
        <footer className="border-t border-zinc-100 p-3"><Link href="/admin/calendar" className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-950">Ver calendario completo <ArrowRight className="h-4 w-4" /></Link></footer>
      </article>

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><h2 className="font-semibold">Alertas y pendientes</h2><p className="mt-1 text-xs text-zinc-500">Ordenados por prioridad y fecha.</p></div>{alerts?.items.length ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}</header>
        <div className="max-h-[34rem] divide-y divide-zinc-100 overflow-y-auto">
          {alerts?.items.length ? alerts.items.slice(0, 14).map((item) => <Link key={item.id} href={item.href} className="block px-5 py-3.5 transition hover:bg-zinc-50">
            <div className="flex items-center justify-between gap-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${severityStyle[item.severity]}`}>{item.severity === 'critical' ? 'Crítica' : item.severity === 'high' ? 'Alta' : item.severity === 'medium' ? 'Media' : 'Baja'}</span><span className="text-[11px] text-zinc-400">{dateOnly.format(new Date(item.dueAt))}</span></div>
            <p className="mt-2 text-sm font-semibold text-zinc-900">{item.title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-500">{item.description}</p><p className="mt-1.5 text-xs font-medium text-zinc-700">{item.recommendedAction}</p>
          </Link>) : <div className="p-5"><EmptyCompact text="No hay alertas operativas dentro del alcance actual." /></div>}
        </div>
      </article>
    </div>
  </section>;
}
