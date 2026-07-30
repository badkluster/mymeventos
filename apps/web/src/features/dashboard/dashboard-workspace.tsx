'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertOctagon, AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign,
  ChefHat, FilePlus2, Funnel as FunnelIcon, Gauge, Info, LoaderCircle, RefreshCw, TrendingDown,
  TrendingUp, UsersRound, type LucideIcon,
} from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { displayLabel, leadSourceLabels } from '@/lib/display-labels';
import { FunnelChart, Meter, meterTone, money, number, RankedBars, Sparkline, type MeterTone, type TrendPoint } from './dashboard-charts';

type Metric = {
  id: string;
  label: string;
  value: number | null;
  previousValue: number | null;
  changePercentage: number | null;
  format: 'integer' | 'decimal' | 'currency' | 'percentage';
  description: string;
  formula: string;
  attributionDate?: string;
  drillDownHref?: string;
  drilldown?: string;
};
type Breakdown = { id: string; label: string; value: number };
type TrendPointRaw = { date: string; leads: number; events: number; revenue: number | null };
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
  trend: { bucketSizeDays: number; points: TrendPointRaw[] };
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
type Severity = 'critical' | 'high' | 'medium' | 'low';
type DashboardAlert = {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  recommendedAction: string;
  dueAt: string;
  salon?: string;
  href: string;
};
type Alerts = { generatedAt: string; items: DashboardAlert[] };
type Salon = { _id: string; name: string };

const dateTime = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: '2-digit', month: 'short' });
const compactMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });
const priorityMetricIds = ['events.upcoming', 'leads.pending', 'payments.overdue', 'production.pending'];
const meterMetricIds = ['quotes.acceptanceRate', 'finance.profitMargin', 'production.readiness'];
const pulseMetricIds = ['leads.new', 'events.confirmed', 'payments.collected'];

const severityMeta: Record<Severity, { label: string; icon: LucideIcon; color: string }> = {
  critical: { label: 'Crítica', icon: AlertOctagon, color: 'var(--chart-critical)' },
  high: { label: 'Alta', icon: AlertTriangle, color: 'var(--chart-serious)' },
  medium: { label: 'Media', icon: AlertCircle, color: 'var(--chart-warning)' },
  low: { label: 'Baja', icon: Info, color: 'var(--chart-line-muted)' },
};

const meterConfigs: Record<string, { bands: { min: number; tone: MeterTone }[]; caption: string }> = {
  'quotes.acceptanceRate': { bands: [{ min: 45, tone: 'good' }, { min: 30, tone: 'warning' }, { min: 15, tone: 'serious' }, { min: -Infinity, tone: 'critical' }], caption: 'Meta de referencia: 45% o más de lo enviado' },
  'finance.profitMargin': { bands: [{ min: 15, tone: 'good' }, { min: 8, tone: 'warning' }, { min: 0, tone: 'serious' }, { min: -Infinity, tone: 'critical' }], caption: 'Meta de referencia: 15% o más de margen sobre lo cobrado' },
  'production.readiness': { bands: [{ min: 80, tone: 'good' }, { min: 60, tone: 'warning' }, { min: 40, tone: 'serious' }, { min: -Infinity, tone: 'critical' }], caption: 'Meta de referencia: 80% o más de los eventos con producción lista' },
};

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

function formatPrevious(metric: Metric) {
  if (metric.format === 'currency') return money.format(metric.previousValue ?? 0);
  if (metric.format === 'percentage') return `${number.format(metric.previousValue ?? 0)} %`;
  return number.format(metric.previousValue ?? 0);
}

function metricTone(id: string) {
  if (id.includes('overdue') || id.includes('pending')) return 'border-warning-border bg-warning-bg';
  if (id.includes('accepted') || id.includes('collected') || id.includes('confirmed')) return 'border-success-border bg-success-bg';
  return 'border-border bg-card';
}

function DeltaBadge({ item }: { item: Metric }) {
  if (item.attributionDate === 'current_snapshot') return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Estado actual</span>;
  if (item.changePercentage === null) return <span className="text-xs text-muted-foreground">Sin base</span>;
  return item.changePercentage >= 0
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success-foreground"><TrendingUp className="h-3.5 w-3.5" />{number.format(item.changePercentage)}%</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-foreground"><TrendingDown className="h-3.5 w-3.5" />{number.format(Math.abs(item.changePercentage))}%</span>;
}

function MetricCard({ item }: { item: Metric }) {
  const currentSnapshot = item.attributionDate === 'current_snapshot';
  return <Link href={item.drillDownHref || item.drilldown || '/admin/reports'} title={`${item.description} Fórmula: ${item.formula}`} className={`group rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${metricTone(item.id)}`}>
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
      <DeltaBadge item={item} />
    </div>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{formatMetric(item)}</p>
    <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{currentSnapshot ? item.description : `Período anterior: ${formatPrevious(item)}`}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" /></p>
  </Link>;
}

function MeterMetricCard({ item }: { item: Metric }) {
  const config = meterConfigs[item.id];
  const value = item.value ?? 0;
  const tone = config ? meterTone(config.bands, value) : 'good';
  return <Link href={item.drillDownHref || item.drilldown || '/admin/reports'} title={`${item.description} Fórmula: ${item.formula}`} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
      <DeltaBadge item={item} />
    </div>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{formatMetric(item)}</p>
    <div className="mt-3"><Meter value={value} tone={tone} caption={config?.caption ?? ''} /></div>
  </Link>;
}

function PulseTile({ item, color, points, format, index }: { item: Metric; color: string; points: TrendPoint[]; format: 'integer' | 'currency'; index: number }) {
  return <article style={{ animationDelay: `${index * 60}ms` }} className="mym-rise rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
      <DeltaBadge item={item} />
    </div>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatMetric(item)}</p>
    <div className="mt-3"><Sparkline points={points} accent={color} format={format} /></div>
  </article>;
}

function QuickActionTile({ label, href, icon: Icon, badge, index }: { label: string; href: string; icon: LucideIcon; badge?: string; index: number }) {
  return <Link
    href={href}
    style={{ animationDelay: `${index * 40}ms` }}
    className="mym-rise group relative flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"
  >
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition group-hover:opacity-90"><Icon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-foreground">{label}</span>
      {badge ? <span className="mt-0.5 block truncate text-xs font-semibold text-warning-foreground">{badge}</span> : null}
    </span>
  </Link>;
}

function EmptyCompact({ text }: { text: string }) {
  return <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-border bg-muted/70 px-4 text-center text-sm text-muted-foreground">{text}</div>;
}

function LoadingBlock() {
  return <div className="grid min-h-72 place-items-center rounded-2xl border border-border bg-card">
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Actualizando indicadores…</span>
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
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null);

  const canSeeAllSalons = userCanAccess(user, [Permission.DASHBOARD_ALL_SALONS_VIEW]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to });
    if (salonId) params.set('salonId', salonId);
    try {
      const result = await api.get<{ summary: Summary; agenda: Agenda; alerts: Alerts }>(`/dashboard/initial?${params}`);
      setSummary(result.summary);
      setAgenda(result.agenda);
      setAlerts(result.alerts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, [from, to, salonId]);

  useEffect(() => {
    void api.get<{ salons?: Salon[] } | Salon[]>('/salons?limit=100&summary=true')
      .then((result) => setSalons(Array.isArray(result) ? result : result.salons ?? []))
      .catch(() => setSalons([]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metricById = useMemo(() => new Map(summary?.metrics.map((item) => [item.id, item]) ?? []), [summary]);
  const quickActions = [
    { label: 'Nuevo lead', href: '/admin/leads?create=1', icon: UsersRound, permission: Permission.LEADS_CREATE, badge: (() => { const value = metricById.get('leads.pending')?.value; return value ? `${number.format(value)} pendientes` : undefined; })() },
    { label: 'Nuevo presupuesto', href: '/admin/quotes?create=1', icon: FilePlus2, permission: Permission.QUOTES_CREATE, badge: undefined as string | undefined },
    { label: 'Nuevo evento', href: '/admin/events?create=1', icon: CalendarDays, permission: Permission.EVENTS_CREATE, badge: undefined as string | undefined },
    { label: 'Gestionar ingresos', href: '/admin/payments', icon: CircleDollarSign, permission: Permission.PAYMENTS_READ, badge: (() => { const value = metricById.get('payments.overdue')?.value; return value ? `${compactMoney.format(value)} vencido` : undefined; })() },
    { label: 'Generar producción', href: '/admin/production?generate=1', icon: ChefHat, permission: Permission.PRODUCTION_GENERATE, badge: (() => { const value = metricById.get('production.pending')?.value; return value ? `${number.format(value)} pendientes` : undefined; })() },
  ].filter((action) => userCanAccess(user, [action.permission]));

  const priorityMetrics = summary ? priorityMetricIds.map((id) => metricById.get(id)).filter((metric): metric is Metric => Boolean(metric)) : [];
  const pulseSeries: { id: string; color: string; key: 'leads' | 'events' | 'revenue'; format: 'integer' | 'currency' }[] = [
    { id: 'leads.new', color: 'var(--chart-blue)', key: 'leads', format: 'integer' },
    { id: 'events.confirmed', color: 'var(--chart-orange)', key: 'events', format: 'integer' },
    ...(summary?.meta.financialVisible ? [{ id: 'payments.collected', color: 'var(--chart-aqua)', key: 'revenue' as const, format: 'currency' as const }] : []),
  ];
  const pulseTiles = summary ? pulseSeries.map((series) => ({ series, metric: metricById.get(series.id) })).filter((entry): entry is { series: typeof pulseSeries[number]; metric: Metric } => Boolean(entry.metric)) : [];
  const meterMetrics = meterMetricIds.map((id) => metricById.get(id)).filter((metric): metric is Metric => Boolean(metric));
  const excludedFromSecondary = new Set([...priorityMetricIds, ...pulseMetricIds, ...meterMetricIds]);
  const secondaryMetrics = summary?.metrics.filter((metric) => !excludedFromSecondary.has(metric.id)) ?? [];
  const overallConversion = summary && summary.funnel.length ? (summary.funnel[0]!.value > 0 ? Math.round((summary.funnel[summary.funnel.length - 1]!.value / summary.funnel[0]!.value) * 100) : 0) : 0;

  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  alerts?.items.forEach((item) => { severityCounts[item.severity] += 1; });
  const visibleAlerts = severityFilter ? alerts?.items.filter((item) => item.severity === severityFilter) : alerts?.items;

  return <section className="mym-dashboard space-y-6">
    <PageHeader
      title={`Hola, ${user?.firstName || 'equipo'}`}
      description="Primero se muestran las acciones y pendientes que requieren atención. El análisis detallado queda disponible sin recargar la vista diaria."
      action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
    />

    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
      <label className="min-w-40 flex-1 text-xs font-medium text-muted-foreground">Desde<Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1.5" /></label>
      <label className="min-w-40 flex-1 text-xs font-medium text-muted-foreground">Hasta<Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1.5" /></label>
      <label className="min-w-52 flex-[1.3] text-xs font-medium text-muted-foreground">Salón
        <Select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="mt-1.5">
          {canSeeAllSalons ? <option value="">Todos los salones</option> : null}
          {!canSeeAllSalons && !salonId ? <option value="">Mi alcance asignado</option> : null}
          {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
        </Select>
      </label>
      {summary ? <p className="text-xs text-muted-foreground sm:pb-2">Actualizado {dateTime.format(new Date(summary.meta.lastUpdatedAt))}</p> : null}
    </div>

    {quickActions.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {quickActions.map((action, index) => <QuickActionTile key={action.href} label={action.label} href={action.href} icon={action.icon} badge={action.badge} index={index} />)}
    </div> : null}

    {error ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-foreground"><span><strong>No pudimos actualizar el dashboard.</strong> {error}</span><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : null}
    {loading && !summary ? <LoadingBlock /> : null}

    {priorityMetrics.length ? <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Necesita tu atención</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{priorityMetrics.map((item) => <MetricCard key={item.id} item={item} />)}</div>
    </div> : null}

    {pulseTiles.length ? <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Activity className="h-3.5 w-3.5" />Pulso del período</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pulseTiles.map(({ series, metric }, index) => <PulseTile
          key={series.id}
          item={metric}
          color={series.color}
          format={series.format}
          index={index}
          points={summary!.trend.points.map((point) => ({ date: point.date, value: point[series.key] }))}
        />)}
      </div>
    </div> : null}

    {summary && summary.funnel.length ? <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold text-foreground"><FunnelIcon className="h-4 w-4 text-muted-foreground" />Pipeline de conversión</h2><p className="mt-1 text-xs text-muted-foreground">De la primera consulta al evento confirmado, en el orden real del proceso comercial.</p></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">{overallConversion}% llega a evento confirmado</span>
      </header>
      <FunnelChart stages={summary.funnel} />
    </article> : null}

    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold text-foreground">Agenda de hoy</h2><p className="mt-1 text-xs text-muted-foreground">{agenda ? dateOnly.format(new Date(`${agenda.date}T12:00:00-03:00`)) : 'Eventos, tareas y vencimientos'}</p></div><CalendarDays className="h-5 w-5 text-muted-foreground" /></header>
        <div className="divide-y divide-border">
          {agenda?.items.length ? agenda.items.slice(0, 10).map((item) => <Link key={`${item.type}-${item.id}`} href={item.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-muted">
            <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{item.time || dateTime.format(new Date(item.at)).split(', ')[1]}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{[item.salon, item.customer, item.responsible].filter(Boolean).join(' · ') || 'Sin detalle adicional'}</span></span>
            {item.amount ? <span className="text-xs font-semibold text-foreground">{money.format(item.amount)}</span> : null}<ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>) : <div className="p-5"><EmptyCompact text="No hay actividades ni vencimientos para hoy." /></div>}
        </div>
        <footer className="border-t border-border p-3"><Link href="/admin/calendar" className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">Ver calendario completo <ArrowRight className="h-4 w-4" /></Link></footer>
      </article>

      <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-foreground">Alertas y pendientes</h2>{alerts?.items.length ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}</div>
          <p className="mt-1 text-xs text-muted-foreground">Ordenados por prioridad y fecha.</p>
          {alerts?.items.length ? <div className="mt-3 flex flex-wrap gap-1.5">
            {(Object.keys(severityMeta) as Severity[]).filter((severity) => severityCounts[severity] > 0).map((severity) => {
              const meta = severityMeta[severity];
              const Icon = meta.icon;
              const active = severityFilter === severity;
              return <button key={severity} type="button" onClick={() => setSeverityFilter(active ? null : severity)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-foreground/30'}`}>
                <Icon className="h-3 w-3" style={{ color: active ? undefined : meta.color }} />{meta.label} · {severityCounts[severity]}
              </button>;
            })}
          </div> : null}
        </header>
        <div className="max-h-120 divide-y divide-border overflow-y-auto">
          {visibleAlerts?.length ? visibleAlerts.slice(0, 20).map((item) => {
            const meta = severityMeta[item.severity];
            const Icon = meta.icon;
            return <Link key={item.id} href={item.href} style={{ borderLeft: `3px solid ${meta.color}` }} className="block px-5 py-3.5 transition hover:bg-muted">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><Icon className="h-3 w-3" style={{ color: meta.color }} />{meta.label}</span>
                <span className="text-[11px] text-muted-foreground">{dateOnly.format(new Date(item.dueAt))}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.description}</p><p className="mt-1.5 text-xs font-medium text-muted-foreground">{item.recommendedAction}</p>
            </Link>;
          }) : <div className="p-5"><EmptyCompact text={severityFilter ? 'No hay alertas de esta severidad.' : 'No hay alertas operativas dentro del alcance actual.'} /></div>}
        </div>
      </article>
    </div>

    {summary ? <details className="group rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-foreground"><span>Ver análisis completo del período</span><span className="text-xs font-normal text-muted-foreground group-open:hidden">{secondaryMetrics.length + meterMetrics.length} indicadores y distribuciones</span><span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Ocultar análisis</span></summary>
      <div className="space-y-5 border-t border-border p-5">
        {meterMetrics.length ? <div>
          <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-foreground"><Gauge className="h-4 w-4 text-muted-foreground" />Indicadores de salud</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{meterMetrics.map((item) => <MeterMetricCard key={item.id} item={item} />)}</div>
        </div> : null}
        {secondaryMetrics.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{secondaryMetrics.map((item) => <MetricCard key={item.id} item={item} />)}</div> : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold text-foreground">Eventos por salón</h2><p className="mb-5 mt-1 text-xs text-muted-foreground">Eventos activos cuya fecha cae en el período.</p><RankedBars items={summary.breakdowns.eventsBySalon} /></article>
          <article className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold text-foreground">Eventos por tipo</h2><p className="mb-5 mt-1 text-xs text-muted-foreground">Distribución de la operación.</p><RankedBars items={summary.breakdowns.eventsByType.map((item) => ({ ...item, label: item.label || 'Sin especificar' }))} /></article>
          <article className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold text-foreground">Origen de leads</h2><p className="mb-5 mt-1 text-xs text-muted-foreground">Canales que generaron consultas.</p><RankedBars items={summary.breakdowns.leadsBySource.map((item) => ({ ...item, label: displayLabel(leadSourceLabels, item.label) }))} /></article>
        </div>
        {summary.meta.financialVisible ? <article className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold text-foreground">Gastos por categoría</h2><p className="mb-5 mt-1 text-xs text-muted-foreground">Gastos pagados durante el período.</p><RankedBars items={summary.breakdowns.expensesByCategory} format="currency" /></article> : <article className="rounded-2xl border border-border bg-muted p-5"><h2 className="font-semibold text-foreground">Información financiera restringida</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Tu rol puede consultar la operación, pero no importes financieros.</p></article>}
      </div>
    </details> : null}
  </section>;
}
