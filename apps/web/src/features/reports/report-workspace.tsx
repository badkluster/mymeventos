'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Download, LoaderCircle, Printer, RotateCcw, Save, Search, Share2 } from 'lucide-react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import {
  contractStatusLabels, displayLabel, eventStatusLabels, leadSourceLabels, leadStatusLabels,
  paymentMethodLabels, paymentStatusLabels, paymentTypeLabels, quoteStatusLabels,
} from '@/lib/display-labels';
import { useToast } from '@/components/ui/toast-provider';

// 'date' = instante real (createdAt, sentAt, approvedAt, paidAt) en hora de Argentina.
// 'civilDate' = fecha civil sin hora (eventDate, dueDate/paymentWindow*, gasto), en UTC — el
// backend ya la normalizó a medianoche UTC, y formatearla en un huso real la corre un día.
type Column = { key: string; label: string; format?: 'date' | 'civilDate' | 'currency' | 'number' | 'status'; linkKey?: string };
type SummaryItem = { id: string; label: string; value: number; format: 'number' | 'currency' | 'percentage'; partial?: boolean };
type ReportResponse = {
  columns: Column[];
  rows: Array<Record<string, unknown> & { id: string; href?: string }>;
  summary: SummaryItem[];
  breakdowns: Record<string, Array<{ _id: string; value: number }>>;
  meta: {
    report: { key: string; title: string; description: string };
    period: { from: string; to: string };
    filters: Record<string, string>;
    generatedAt: string;
    page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean;
  };
};
type Salon = { _id: string; name: string };
type Filters = { from: string; to: string; salonId: string; status: string; search: string; sortBy: string; sortOrder: 'asc' | 'desc'; page: number; limit: number };

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' });
const civilDate = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', dateStyle: 'short' });

function todayPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { from: `${values.year}-${values.month}-01`, to: `${values.year}-${values.month}-${values.day}` };
}

function initialFilters(): Filters {
  const period = todayPeriod();
  return { ...period, salonId: '', status: '', search: '', sortBy: '', sortOrder: 'desc', page: 1, limit: 25 };
}

const statusMaps: Record<string, Record<string, string>> = {
  leads: leadStatusLabels, quotes: quoteStatusLabels, events: eventStatusLabels, contracts: contractStatusLabels, payments: paymentStatusLabels,
};
const generalLabels: Record<string, string> = {
  ...leadStatusLabels, ...leadSourceLabels, ...quoteStatusLabels, ...eventStatusLabels, ...contractStatusLabels,
  ...paymentStatusLabels, ...paymentMethodLabels, ...paymentTypeLabels,
  not_generated: 'No generada', complete: 'Completa', pending: 'Pendiente', missing: 'Sin contrato',
  not_set: 'Sin informar', paid: 'Pagado', cancelled: 'Cancelado', OTHER: 'Otros',
};

function valueLabel(value: unknown, column: Column) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.format === 'date') {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '—' : date.format(parsed);
  }
  if (column.format === 'civilDate') {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '—' : civilDate.format(parsed);
  }
  if (column.format === 'currency') return money.format(Number(value));
  if (column.format === 'number') return number.format(Number(value));
  if (column.format === 'status') return displayLabel(generalLabels, String(value));
  return String(value);
}

function summaryLabel(item: SummaryItem) {
  if (item.format === 'currency') return money.format(item.value);
  if (item.format === 'percentage') return `${number.format(item.value)} %`;
  return number.format(item.value);
}

export function ReportWorkspace({ reportKey }: { reportKey: string }) {
  const { showToast } = useToast();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [searchInput, setSearchInput] = useState('');
  const [salons, setSalons] = useState<Salon[]>([]);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = initialFilters();
    for (const key of Object.keys(next) as Array<keyof Filters>) {
      const value = params.get(key);
      if (!value) continue;
      if (key === 'page' || key === 'limit') (next[key] as number) = Number(value);
      else (next[key] as string) = value;
    }
    setFilters(next);
    setSearchInput(next.search);
  }, [reportKey]);

  useEffect(() => {
    void api.get<{ salons?: Salon[] } | Salon[]>('/salons?limit=100')
      .then((result) => setSalons(Array.isArray(result) ? result : result.salons ?? []))
      .catch(() => setSalons([]));
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== '' && value !== 0) params.set(key, String(value));
    return params;
  }, [filters]);
  const queryString = query.toString();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<ReportResponse>(`/reports/${reportKey}?${queryString}`);
      setReport(result);
      window.history.replaceState(null, '', `${window.location.pathname}?${queryString}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [reportKey, queryString]);
  useEffect(() => { void load(); }, [load]);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  const reset = () => { const next = initialFilters(); setFilters(next); setSearchInput(''); };
  const savedKey = `mym.report-view.${reportKey}`;
  const saveView = () => {
    localStorage.setItem(savedKey, JSON.stringify(filters));
    showToast({ message: 'Vista guardada en este dispositivo.', variant: 'success' });
  };
  const restoreView = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(savedKey) || '') as Filters;
      setFilters(saved); setSearchInput(saved.search || '');
      showToast({ message: 'Vista restaurada.', variant: 'success' });
    } catch {
      showToast({ message: 'No hay una vista guardada para este reporte.', variant: 'error' });
    }
  };
  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    showToast({ message: 'URL con filtros copiada.', variant: 'success' });
  };
  const download = async (format: 'csv' | 'excel') => {
    setExporting(format);
    try {
      const result = await api.download(`/reports/${reportKey}/export?${queryString}&format=${format}`);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'Archivo generado correctamente.', variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo exportar.', variant: 'error' });
    } finally {
      setExporting('');
    }
  };
  const statusOptions = statusMaps[reportKey] ?? {};

  return <section className="space-y-5">
    <div className="print:hidden"><Link href="/admin/reports" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver al centro de reportes</Link></div>
    <PageHeader title={report?.meta.report.title ?? 'Reporte'} description={report?.meta.report.description ?? 'Información consolidada con filtros del servidor.'} />

    <div className="print:hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_150px_190px_170px_minmax(220px,1fr)_auto]">
        <label className="text-xs font-medium text-zinc-600">Desde<Input type="date" value={filters.from} max={filters.to} onChange={(event) => update({ from: event.target.value })} className="mt-1.5" /></label>
        <label className="text-xs font-medium text-zinc-600">Hasta<Input type="date" value={filters.to} min={filters.from} onChange={(event) => update({ to: event.target.value })} className="mt-1.5" /></label>
        <label className="text-xs font-medium text-zinc-600">Salón<Select value={filters.salonId} onChange={(event) => update({ salonId: event.target.value })} className="mt-1.5"><option value="">Todo mi alcance</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></label>
        <label className="text-xs font-medium text-zinc-600">Estado<Select value={filters.status} onChange={(event) => update({ status: event.target.value })} className="mt-1.5"><option value="">Todos</option>{Object.entries(statusOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="text-xs font-medium text-zinc-600">Buscar<span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') update({ search: searchInput.trim() }); }} className="pl-9" placeholder="Nombre, número o referencia…" /></span></label>
        <Button className="self-end" onClick={() => update({ search: searchInput.trim() })}>Aplicar</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <Button variant="secondary" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Limpiar</Button>
        <Button variant="secondary" onClick={saveView}><Save className="mr-2 h-4 w-4" />Guardar vista</Button>
        <Button variant="secondary" onClick={restoreView}>Restaurar vista</Button>
        <Button variant="secondary" onClick={() => void share()}><Share2 className="mr-2 h-4 w-4" />Compartir URL</Button>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
        <span className="flex-1" />
        <Button variant="secondary" disabled={Boolean(exporting)} onClick={() => void download('csv')}><Download className="mr-2 h-4 w-4" />{exporting === 'csv' ? 'Generando…' : 'CSV'}</Button>
        <Button variant="secondary" disabled={Boolean(exporting)} onClick={() => void download('excel')}><Download className="mr-2 h-4 w-4" />{exporting === 'excel' ? 'Generando…' : 'Excel'}</Button>
      </div>
    </div>

    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
    {report ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {report.summary.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{summaryLabel(item)}</p>{item.partial ? <p className="mt-1 text-[11px] text-amber-700">Total parcial de la página visible</p> : null}</article>)}
    </div> : null}

    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading && !report ? <div className="grid min-h-72 place-items-center text-sm text-zinc-500"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando reporte…</span></div> : null}
      {report ? <div className="overflow-x-auto"><table className="w-full min-w-max text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{report.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"><button className="inline-flex items-center gap-1 hover:text-zinc-950" onClick={() => update({ sortBy: column.key, sortOrder: filters.sortBy === column.key && filters.sortOrder === 'asc' ? 'desc' : 'asc' })}>{column.label}{filters.sortBy === column.key ? filters.sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}</button></th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-100">{report.rows.map((row) => <tr key={row.id} className="hover:bg-zinc-50">{report.columns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 text-zinc-700 ${column.format === 'currency' || column.format === 'number' ? 'text-right tabular-nums' : ''}`}>{column.linkKey && row[column.linkKey] ? <Link href={String(row[column.linkKey])} className="font-semibold text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950">{valueLabel(row[column.key], column)}</Link> : valueLabel(row[column.key], column)}</td>)}</tr>)}</tbody></table>
        {!report.rows.length ? <div className="grid min-h-48 place-items-center text-sm text-zinc-500">No hay registros para los filtros seleccionados.</div> : null}</div> : null}
      {report ? <footer className="print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500"><span>Mostrando {report.rows.length} de {report.meta.totalItems} · Generado {date.format(new Date(report.meta.generatedAt))}</span><div className="flex items-center gap-2"><Select value={filters.limit} onChange={(event) => update({ limit: Number(event.target.value) })} className="w-28 py-2">{[25, 50, 100].map((value) => <option key={value} value={value}>{value} filas</option>)}</Select><Button variant="secondary" className="px-2.5" disabled={!report.meta.hasPreviousPage || loading} onClick={() => update({ page: filters.page - 1 })}><ChevronLeft className="h-4 w-4" /></Button><span>Página {report.meta.page} de {report.meta.totalPages}</span><Button variant="secondary" className="px-2.5" disabled={!report.meta.hasNextPage || loading} onClick={() => update({ page: filters.page + 1 })}><ChevronRight className="h-4 w-4" /></Button></div></footer> : null}
    </article>
  </section>;
}
