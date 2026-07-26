'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Printer, RefreshCw } from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { ProductionNav } from './production-nav';

type Row = {
  productId?: string; productName: string; unit: string; plannedQuantity: number; completedQuantity: number; eventCount: number;
  pendingItems: number; availableQuantity: number; missingQuantity: number; toBuyQuantity: number; toProduceQuantity: number;
};
type Response = { items: Row[]; totals: { products: number; plannedQuantity: number; missingQuantity: number } };
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

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
  const load = useCallback(async () => {
    setLoading(true);
    try { setResult(await api.get<Response>(`/production/consolidated?from=${from}&to=${to}`)); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo consolidar la producción.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [from, to, showToast]);
  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-5">
    <PageHeader title="Producción consolidada" description="Cantidades normalizadas de todos los eventos del período, comparadas con stock y avance real." action={<div className="print:hidden flex gap-2"><Button variant="secondary" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button></div>} />
    <ProductionNav />
    <div className="print:hidden flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><label className="text-xs font-medium text-zinc-600">Desde<Input className="mt-1.5 w-44" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-medium text-zinc-600">Hasta<Input className="mt-1.5 w-44" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div>
    {result ? <div className="grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Productos distintos</p><p className="mt-2 text-2xl font-semibold">{result.totals.products}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Cantidad planificada</p><p className="mt-2 text-2xl font-semibold">{number.format(result.totals.plannedQuantity)}</p></article><article className={`rounded-2xl border p-4 shadow-sm ${result.totals.missingQuantity ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-xs text-zinc-600">Faltante contra stock</p><p className="mt-2 text-2xl font-semibold">{number.format(result.totals.missingQuantity)}</p></article></div> : null}
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading && !result ? <div className="grid min-h-64 place-items-center text-sm text-zinc-500"><span><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Consolidando…</span></div> : null}
      {result ? <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Producto', 'Unidad', 'Eventos', 'Planificado', 'Completado', 'Disponible', 'Faltante', 'A comprar', 'A producir', 'Pendientes'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{result.items.map((item) => <tr key={`${item.productId || item.productName}-${item.unit}`} className={item.missingQuantity ? 'bg-amber-50/35' : ''}><td className="px-4 py-3 font-semibold text-zinc-900">{item.productName}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3 tabular-nums">{item.eventCount}</td><td className="px-4 py-3 tabular-nums">{number.format(item.plannedQuantity)}</td><td className="px-4 py-3 tabular-nums">{number.format(item.completedQuantity)}</td><td className="px-4 py-3 tabular-nums">{number.format(item.availableQuantity)}</td><td className="px-4 py-3 font-semibold tabular-nums">{item.missingQuantity ? <span className="inline-flex items-center gap-1 text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{number.format(item.missingQuantity)}</span> : '—'}</td><td className="px-4 py-3 tabular-nums">{number.format(item.toBuyQuantity)}</td><td className="px-4 py-3 tabular-nums">{number.format(item.toProduceQuantity)}</td><td className="px-4 py-3 tabular-nums">{item.pendingItems}</td></tr>)}</tbody></table>{!result.items.length ? <div className="grid min-h-52 place-items-center text-sm text-zinc-500">No hay ítems de producción en el período.</div> : null}</div> : null}
    </article>
  </section>;
}
