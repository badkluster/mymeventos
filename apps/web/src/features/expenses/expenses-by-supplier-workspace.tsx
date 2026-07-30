'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { ExpensesNav } from './expenses-nav';

type Row = {
  supplierId: string | null; supplierName: string; supplierBusinessName: string | null; supplierCategory: string | null;
  initialEstimatedAmount: number; finalAmount: number; additionalAmount: number; taxAmount: number; amount: number;
  deviation: number; paidAmount: number; pendingAmount: number; expenseCount: number;
};
type Summary = { initialEstimatedAmount: number; finalAmount: number; additionalAmount: number; taxAmount: number; amount: number; deviation: number; paidAmount: number; pendingAmount: number; expenseCount: number };
type Response = { items: Row[]; summary: Summary };
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
function initialPeriod() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value])); const last = new Date(Date.UTC(Number(p.year), Number(p.month), 0)).getUTCDate(); return { from: `${p.year}-${p.month}-01`, to: `${p.year}-${p.month}-${last}` }; }

export function ExpensesBySupplierWorkspace() {
  const { showToast } = useToast(); const initial = useMemo(() => initialPeriod(), []);
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to); const [result, setResult] = useState<Response | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setResult(await api.get<Response>(`/expenses/by-supplier?from=${from}&to=${to}`)); } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo calcular el gasto por proveedor.', variant: 'error' }); } finally { setLoading(false); } }, [from, to, showToast]);
  useEffect(() => { void load(); }, [load]);
  return <section className="space-y-5">
    <PageHeader title="Gastos por proveedor" description="Reemplaza el 'Control de Gastos I/II/III' y la 'Relación de Gastos' del Excel: inicial, final y adicional agrupados por proveedor, con el desvío final vs. inicial." action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>} />
    <ExpensesNav />
    <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><label className="text-xs font-medium">Desde<Input className="mt-1.5 w-44" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-medium">Hasta<Input className="mt-1.5 w-44" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    {result ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Estimado inicial</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.initialEstimatedAmount)}</p></article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Monto final</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.finalAmount)}</p></article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Adicional</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.additionalAmount)}</p></article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Total gastado</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.amount)}</p></article>
      <article className={`rounded-2xl border p-4 shadow-sm ${result.summary.deviation > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-xs text-zinc-600">Desvío final vs. inicial</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.deviation)}</p></article>
    </div> : null}
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">{result ? <div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Proveedor', 'Inicial', 'Final', 'Adicional', 'Impuestos', 'Total', 'Desvío', 'Pagado', 'Pendiente', 'Gastos'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{result.items.map((item) => <tr key={item.supplierId ?? 'none'} className={!item.supplierId ? 'bg-amber-50/35' : ''}>
      <td className="px-4 py-3"><span className="font-semibold">{item.supplierName}</span>{item.supplierBusinessName ? <span className="block text-xs text-zinc-500">{item.supplierBusinessName}</span> : null}</td>
      {[item.initialEstimatedAmount, item.finalAmount, item.additionalAmount, item.taxAmount, item.amount].map((value, index) => <td key={index} className="px-4 py-3 tabular-nums">{money.format(value)}</td>)}
      <td className={`px-4 py-3 tabular-nums ${item.deviation > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{money.format(item.deviation)}</td>
      <td className="px-4 py-3 tabular-nums">{money.format(item.paidAmount)}</td>
      <td className="px-4 py-3 tabular-nums">{money.format(item.pendingAmount)}</td>
      <td className="px-4 py-3">{item.expenseCount}</td>
    </tr>)}</tbody></table>{!result.items.length ? <div className="grid min-h-52 place-items-center text-sm text-zinc-500">No hay gastos en el período.</div> : null}</div> : <div className="p-8 text-sm text-zinc-500">Calculando gasto por proveedor…</div>}</article>
  </section>;
}
