'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Eye,
  FileText,
  Gauge,
  Info,
  MonitorSmartphone,
  MousePointerClick,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

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

type Kpi = {
  label: string;
  value: string;
  note: string;
  help: string;
  icon: typeof Search;
  delta?: number | null;
  inverseDelta?: boolean;
};

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

const HELP = {
  clicks: 'Clics desde resultados orgánicos de Google hacia páginas de M&M durante el período seleccionado.',
  impressions: 'Cantidad de veces que una URL de M&M apareció en resultados de búsqueda de Google.',
  ctr: 'CTR orgánico: clics divididos por impresiones. Ayuda a medir qué tan atractivo es el resultado que ve la persona en Google.',
  position: 'Posición media de las URLs en los resultados donde tuvieron impresiones. En esta métrica, un número más bajo es mejor.',
  query: 'Búsqueda escrita por una persona en Google que generó impresiones o clics para M&M.',
  page: 'Página de M&M que Google mostró en resultados de búsqueda.',
  opportunity: 'Consulta con posición media aproximada entre 4 y 15. Son términos cercanos a la primera página o al Top 3 y suelen ser buenos candidatos para optimización SEO.',
  device: 'Distribución del rendimiento orgánico según dispositivo informado por Search Console.',
  delay: 'Search Console no es tiempo real. Google suele consolidar los datos con demora, por lo que los últimos días pueden aparecer incompletos.',
} as const;

function asInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 27);
  return { from: asInputDate(from), to: asInputDate(to) };
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function InfoLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <Tooltip label={help}>
        <button type="button" aria-label={`Información sobre ${label}`} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900">
          <Info className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </span>
  );
}

function Delta({ value, inverse = false }: { value?: number | null; inverse?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-zinc-400">Sin comparación</span>;
  const good = inverse ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.05;
  return (
    <span className={neutral ? 'text-zinc-500' : good ? 'text-emerald-700' : 'text-amber-700'}>
      {value > 0 ? '+' : ''}{decimal.format(value)}% vs. período anterior
    </span>
  );
}

function KpiCard({ item }: { item: Kpi }) {
  const Icon = item.icon;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500"><InfoLabel label={item.label} help={item.help} /></div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">{item.value}</div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.note}</p>
      <div className="mt-2 text-[11px] font-medium"><Delta value={item.delta} inverse={item.inverseDelta} /></div>
    </div>
  );
}

function MetricTable({ rows, kind, limit = 25 }: { rows: MetricRow[]; kind: 'query' | 'page' | 'opportunity'; limit?: number }) {
  if (!rows.length) return <div className="p-6 text-sm text-zinc-500">Todavía no hay datos suficientes para este bloque.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3"><InfoLabel label={kind === 'page' ? 'Página' : 'Consulta'} help={kind === 'page' ? HELP.page : kind === 'opportunity' ? HELP.opportunity : HELP.query} /></th>
            <th className="px-4 py-3 text-right">Clics</th>
            <th className="px-4 py-3 text-right">Impresiones</th>
            <th className="px-4 py-3 text-right">CTR</th>
            <th className="px-4 py-3 text-right">Posición</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.slice(0, limit).map((row) => (
            <tr key={`${kind}-${row.key}`} className="hover:bg-zinc-50/70">
              <td className="max-w-xl px-4 py-3 font-medium text-zinc-900"><span className="break-all">{row.key}</span></td>
              <td className="px-4 py-3 text-right font-semibold">{integer.format(row.clicks)}</td>
              <td className="px-4 py-3 text-right">{integer.format(row.impressions)}</td>
              <td className="px-4 py-3 text-right">{decimal.format(row.ctr)}%</td>
              <td className="px-4 py-3 text-right">{decimal.format(row.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendBars({ rows, metric, label }: { rows: Array<MetricRow & { date: string }>; metric: 'clicks' | 'impressions'; label: string }) {
  if (!rows.length) return <div className="grid h-44 place-items-center text-sm text-zinc-500">Sin serie temporal disponible.</div>;
  const max = Math.max(...rows.map((row) => row[metric]), 1);
  return (
    <div>
      <div className="flex h-44 items-end gap-1 rounded-xl bg-zinc-50 p-3" aria-label={label}>
        {rows.map((row) => {
          const height = Math.max(3, (row[metric] / max) * 100);
          return (
            <Tooltip key={`${metric}-${row.date}`} label={`${row.date}: ${integer.format(row[metric])}`}>
              <div className="flex h-full min-w-0 flex-1 items-end">
                <div className="w-full rounded-t bg-zinc-900/80 transition hover:bg-zinc-950" style={{ height: `${height}%` }} />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-zinc-400"><span>{rows[0]?.date}</span><span>{rows[rows.length - 1]?.date}</span></div>
    </div>
  );
}

function DeviceCards({ rows }: { rows: MetricRow[] }) {
  const labels: Record<string, string> = { MOBILE: 'Móvil', DESKTOP: 'Escritorio', TABLET: 'Tablet' };
  if (!rows.length) return <p className="text-sm text-zinc-500">Sin datos por dispositivo todavía.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><MonitorSmartphone className="h-4 w-4" />{labels[row.key] || row.key}</div>
          <div className="mt-3 text-2xl font-bold">{integer.format(row.clicks)} <span className="text-sm font-medium text-zinc-500">clics</span></div>
          <div className="mt-1 text-xs text-zinc-500">{integer.format(row.impressions)} impresiones · CTR {decimal.format(row.ctr)}%</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 p-5"><h2 className="text-lg font-bold text-zinc-950">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}</div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function SearchConsolePage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [appliedFrom, setAppliedFrom] = useState(initial.from);
  const [appliedTo, setAppliedTo] = useState(initial.to);
  const [data, setData] = useState<SearchConsolePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [querySearch, setQuerySearch] = useState('');

  const load = useCallback(async (rangeFrom: string, rangeTo: string) => {
    setLoading(true);
    const started = Date.now();
    try {
      const result = await api.get<SearchConsolePayload>(`/marketing/performance/search-console?from=${rangeFrom}&to=${rangeTo}`);
      setData(result);
      if (result.connection.status === 'error') {
        showToast({ message: result.connection.message || 'Search Console respondió con un error.', variant: 'error' });
      }
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar Search Console.', variant: 'error' });
    } finally {
      const remaining = Math.max(0, 650 - (Date.now() - started));
      if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(appliedFrom, appliedTo); }, [appliedFrom, appliedTo, load]);

  const summary = data?.summary;
  const previous = data?.previousSummary;
  const filteredQueries = useMemo(() => {
    const needle = querySearch.trim().toLocaleLowerCase('es');
    if (!needle) return data?.queries ?? [];
    return (data?.queries ?? []).filter((row) => row.key.toLocaleLowerCase('es').includes(needle));
  }, [data, querySearch]);

  const kpis: Kpi[] = summary ? [
    {
      label: 'Clics orgánicos', value: integer.format(summary.clicks), note: 'Visitas desde resultados de Google', help: HELP.clicks, icon: MousePointerClick,
      delta: previous ? percentChange(summary.clicks, previous.clicks) : null,
    },
    {
      label: 'Impresiones', value: integer.format(summary.impressions), note: 'Veces que M&M apareció en Google', help: HELP.impressions, icon: Eye,
      delta: previous ? percentChange(summary.impressions, previous.impressions) : null,
    },
    {
      label: 'CTR orgánico', value: `${decimal.format(summary.ctr)}%`, note: 'Clics / impresiones', help: HELP.ctr, icon: Percent,
      delta: previous ? percentChange(summary.ctr, previous.ctr) : null,
    },
    {
      label: 'Posición media', value: decimal.format(summary.position), note: 'Menor es mejor', help: HELP.position, icon: Gauge,
      delta: previous ? percentChange(summary.position, previous.position) : null, inverseDelta: true,
    },
  ] : [];

  const applyRange = () => {
    if (!from || !to || from > to) {
      showToast({ message: 'Seleccioná un rango de fechas válido.', variant: 'error' });
      return;
    }
    setAppliedFrom(from);
    setAppliedTo(to);
    if (from === appliedFrom && to === appliedTo) void load(from, to);
  };

  const statusText = data?.connection.status === 'connected' ? 'Conectado' : data?.connection.status === 'error' ? 'Con error' : 'Pendiente';
  const statusClass = data?.connection.status === 'connected' ? 'bg-emerald-100 text-emerald-800' : data?.connection.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';

  return (
    <section className="space-y-6">
      <PageHeader
        title="Google Search Console"
        description="SEO orgánico conectado a Performance 360: búsquedas, clics, impresiones, CTR, posiciones y oportunidades."
        action={<Button variant="secondary" onClick={() => void load(appliedFrom, appliedTo)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
      />
      <MarketingTabs />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <Button onClick={applyRange} disabled={loading}>Aplicar período</Button>
        <div className="ml-auto flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-2">
          <Activity className="h-4 w-4 text-zinc-500" />
          <div className="text-xs">
            <div className="flex items-center gap-2"><strong className="text-zinc-800">Search Console</strong><span className={`rounded-full px-2 py-0.5 font-semibold ${statusClass}`}>{statusText}</span></div>
            <div className="mt-0.5 text-zinc-500">{data?.connection.lastSyncAt ? `Última sincronización: ${new Date(data.connection.lastSyncAt).toLocaleString('es-AR')}` : data?.connection.message || 'Esperando primera sincronización'}</div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div><strong>Dato importante:</strong> Search Console no es tiempo real. Los últimos días pueden estar incompletos mientras Google termina de consolidarlos. <Tooltip label={HELP.delay}><button type="button" className="ml-1 underline decoration-dotted">¿Por qué?</button></Tooltip></div>
      </div>

      {summary ? (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-lg font-bold text-zinc-950">Visibilidad orgánica</h2><p className="text-sm text-zinc-500">Comparación automática contra el período inmediatamente anterior.</p></div>
              <div className="text-right text-xs text-zinc-500"><div className="font-semibold text-zinc-700">Propiedad</div><div>{data?.property || '—'}</div></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((item) => <KpiCard key={item.label} item={item} />)}</div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Clics orgánicos por día" subtitle="Tráfico que llegó desde resultados naturales de Google."><TrendBars rows={data?.daily ?? []} metric="clicks" label="Clics orgánicos diarios" /></Panel>
            <Panel title="Impresiones por día" subtitle="Evolución de la presencia de M&M en resultados de búsqueda."><TrendBars rows={data?.daily ?? []} metric="impressions" label="Impresiones orgánicas diarias" /></Panel>
          </section>

          <Panel title="Consultas de búsqueda" subtitle="Qué está escribiendo la gente en Google cuando encuentra M&M.">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-zinc-500"><Search className="h-4 w-4" />{integer.format(data?.queries.length ?? 0)} consultas medidas</div>
              <Input className="w-full sm:w-72" placeholder="Buscar consulta…" value={querySearch} onChange={(event) => setQuerySearch(event.target.value)} />
            </div>
            <MetricTable rows={filteredQueries} kind="query" limit={50} />
          </Panel>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel title="Oportunidades SEO" subtitle="Consultas con impresiones y posición media entre 4 y 15.">
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><Sparkles className="h-4 w-4" /><InfoLabel label="Cómo leer este bloque" help={HELP.opportunity} /></div>
              <MetricTable rows={data?.opportunities ?? []} kind="opportunity" limit={30} />
            </Panel>
            <Panel title="Dispositivos" subtitle="Dónde se producen las búsquedas orgánicas."><div className="mb-4 text-xs text-zinc-500"><InfoLabel label="Distribución por dispositivo" help={HELP.device} /></div><DeviceCards rows={data?.devices ?? []} /></Panel>
          </section>

          <Panel title="Páginas que reciben visibilidad" subtitle="URLs de M&M que Google está mostrando y enviando tráfico.">
            <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500"><FileText className="h-4 w-4" />{integer.format(data?.pages.length ?? 0)} páginas medidas</div>
            <MetricTable rows={data?.pages ?? []} kind="page" limit={50} />
          </Panel>

          <Panel title="Lectura ejecutiva" subtitle="Qué significa esta conexión dentro de Performance 360.">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 p-4"><TrendingUp className="h-5 w-5" /><h3 className="mt-3 font-semibold">Descubrimiento</h3><p className="mt-1 text-sm text-zinc-500">Ahora podemos medir qué búsquedas generan visibilidad y cuáles empiezan a ganar posiciones.</p></div>
              <div className="rounded-xl bg-zinc-50 p-4"><MousePointerClick className="h-5 w-5" /><h3 className="mt-3 font-semibold">Tráfico orgánico</h3><p className="mt-1 text-sm text-zinc-500">Clics e impresiones quedan separados de Meta Ads y del tráfico directo.</p></div>
              <div className="rounded-xl bg-zinc-50 p-4"><Sparkles className="h-5 w-5" /><h3 className="mt-3 font-semibold">Próxima capa</h3><p className="mt-1 text-sm text-zinc-500">Con GA4 podremos unir consulta orgánica → sesión → formulario → presupuesto → cierre.</p></div>
            </div>
          </Panel>
        </>
      ) : !loading ? (
        <div className={`rounded-2xl border p-6 ${data?.connection.status === 'error' ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'}`}>
          <h2 className="font-bold text-zinc-950">{data?.connection.status === 'error' ? 'No se pudo sincronizar Search Console' : 'Search Console todavía no tiene datos disponibles'}</h2>
          <p className="mt-2 text-sm text-zinc-600">{data?.connection.message || 'Revisá la configuración de la propiedad y volvé a actualizar en unos minutos.'}</p>
        </div>
      ) : null}

      {loading ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/20 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-zinc-950 text-white"><RefreshCw className="h-6 w-6 animate-spin" /></div>
            <div className="mt-5 text-base font-bold text-zinc-950">Cargando Search Console…</div>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Consultando búsquedas, clics, impresiones, posiciones, páginas y dispositivos.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
