'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, LoaderCircle, Printer, RefreshCw } from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { ProductionNav } from './production-nav';

type EventQty = { planId: string; eventId?: string; eventName?: string; eventType?: string; customerName?: string; eventDate: string; plannedQuantity: number; completedQuantity: number };
type Row = {
  productId?: string; productName: string; unit: string; plannedQuantity: number; completedQuantity: number; eventCount: number;
  pendingItems: number; availableQuantity: number; missingQuantity: number; toBuyQuantity: number; toProduceQuantity: number;
  byEvent: EventQty[];
};
type Section = { type: string; name: string; events: EventQty[]; items: Row[] };
type Response = { sections: Section[]; totals: { products: number; plannedQuantity: number; missingQuantity: number } };
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
// `eventDate` es una fecha civil normalizada a medianoche UTC — se formatea en UTC para no
// correrla un día para atrás.
const shortDate = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
function eventLabel(event: EventQty) {
  const name = event.customerName || event.eventName || event.eventType || 'Evento';
  return `${name} ${shortDate.format(new Date(event.eventDate))}`;
}

function initialPeriod() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const last = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
  return { from: `${parts.year}-${parts.month}-01`, to: `${parts.year}-${parts.month}-${last}` };
}

export function ProductionConsolidated() {
  const { showToast } = useToast();
  const initial = useMemo(() => initialPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [result, setResult] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setResult(await api.get<Response>(`/production/consolidated?from=${from}&to=${to}`)); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo consolidar la producción.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [from, to, showToast]);
  useEffect(() => { void load(); }, [load]);
  const download = async (format: 'excel' | 'pdf', type?: string) => {
    setExporting(true);
    try {
      const query = new URLSearchParams({ from, to, format });
      if (type) query.set('type', type);
      const asset = await api.download(`/production/consolidated/export?${query.toString()}`);
      const url = URL.createObjectURL(asset.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = asset.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo exportar la producción.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return <section className="space-y-5">
    <PageHeader title="Producción consolidada" description="Cantidades normalizadas de todos los eventos del período, comparadas con stock y avance real." action={<div className="print:hidden flex flex-wrap gap-2"><Button variant="secondary" disabled={exporting} onClick={() => void download('excel')}><Download className="mr-2 h-4 w-4" />Excel total</Button><Button variant="secondary" disabled={exporting} onClick={() => void download('pdf')}><Download className="mr-2 h-4 w-4" />PDF total</Button><Button variant="secondary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button></div>} />
    <ProductionNav />
    <div className="print:hidden flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><label className="text-xs font-medium text-zinc-600">Desde<Input className="mt-1.5 w-44" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-medium text-zinc-600">Hasta<Input className="mt-1.5 w-44" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div>
    {result ? <div className="grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Productos distintos</p><p className="mt-2 text-2xl font-semibold">{result.totals.products}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Cantidad planificada</p><p className="mt-2 text-2xl font-semibold">{number.format(result.totals.plannedQuantity)}</p></article><article className={`rounded-2xl border p-4 shadow-sm ${result.totals.missingQuantity ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-xs text-zinc-600">Faltante contra stock</p><p className="mt-2 text-2xl font-semibold">{number.format(result.totals.missingQuantity)}</p></article></div> : null}
    {loading && !result ? <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="grid min-h-64 place-items-center text-sm text-zinc-500"><span><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Consolidando…</span></div></article> : null}
    {result && !result.sections.length ? <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="grid min-h-52 place-items-center text-sm text-zinc-500">No hay ítems de producción en el período.</div></article> : null}
    {result?.sections.map((section) => <article key={section.type} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3"><h2 className="text-sm font-semibold text-zinc-900">{section.name}</h2><Button variant="secondary" className="print:hidden px-3 py-2" disabled={exporting} onClick={() => void download('excel', section.type)}><Download className="mr-2 h-4 w-4" />Excel de {section.name}</Button></header>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-zinc-200"><tr>
        <th className="sticky left-0 z-10 min-w-[220px] bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Producto</th>
        {section.events.map((event) => <th key={event.planId} className="min-w-[92px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{eventLabel(event)}</th>)}
        {['Total', 'Completado', 'Disponible', 'Faltante', 'A comprar', 'A producir', 'Pendientes'].map((label) => <th key={label} className="min-w-[92px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}
      </tr></thead><tbody className="divide-y divide-zinc-100">{section.items.map((item) => {
        const byPlanId = new Map(item.byEvent.map((entry) => [entry.planId, entry]));
        return <tr key={`${item.productId || item.productName}-${item.unit}`} className={item.missingQuantity ? 'bg-amber-50/35' : ''}>
          <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-zinc-900">{item.productName} <span className="font-normal text-zinc-400">({item.unit})</span></td>
          {section.events.map((event) => <td key={event.planId} className="px-3 py-3 tabular-nums text-zinc-700">{byPlanId.has(event.planId) ? number.format(byPlanId.get(event.planId)!.plannedQuantity) : '—'}</td>)}
          <td className="px-3 py-3 font-semibold tabular-nums">{number.format(item.plannedQuantity)}</td>
          <td className="px-3 py-3 tabular-nums">{number.format(item.completedQuantity)}</td>
          <td className="px-3 py-3 tabular-nums">{number.format(item.availableQuantity)}</td>
          <td className="px-3 py-3 font-semibold tabular-nums">{item.missingQuantity ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{number.format(item.missingQuantity)}</span> : '—'}</td>
          <td className="px-3 py-3 tabular-nums">{number.format(item.toBuyQuantity)}</td>
          <td className="px-3 py-3 tabular-nums">{number.format(item.toProduceQuantity)}</td>
          <td className="px-3 py-3 tabular-nums">{item.pendingItems}</td>
        </tr>;
      })}</tbody></table></div>
    </article>)}
  </section>;
}
