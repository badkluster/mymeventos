'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, RotateCcw, Search, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from '@/lib/display-labels';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { TableActionButton } from '@/components/admin/table-action-button';
import type { PaginationMeta, Payment } from '@/features/quotes/types';

type ListResponse = { items: Payment[]; meta: PaginationMeta };

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
const entityName = (value: unknown) => {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; eventName?: string; eventType?: string; contractNumber?: string; name?: string };
  return item.fullName || item.eventName || item.eventType || item.contractNumber || item.name || 'Sin datos';
};
const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const statusTone: Record<string, string> = { pending: 'bg-amber-50 text-amber-800', paid: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-700', refunded: 'bg-sky-50 text-sky-700' };

export default function PaymentsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ page: 1, status: '', type: '', method: '', search: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
    for (const [key, value] of Object.entries(filters)) if (value && key !== 'page') params.set(key, String(value));
    return params;
  }, [filters]);
  const queryString = query.toString();

  const load = useCallback(async () => {
    try {
      const response = await api.get<ListResponse>(`/payments?${queryString}`);
      setItems(response.items);
      setMeta(response.meta);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar los pagos.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [queryString, showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const updateFilters = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));
  const applySearch = () => updateFilters({ page: 1, search: searchInput.trim() });
  const action = async (payment: Payment, path: string, message: string) => {
    setSavingId(payment._id);
    try {
      await api.post(`/payments/${payment._id}/${path}`, path === 'mark-paid' ? { method: payment.method || 'other' } : {});
      await load();
      showToast({ message, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el pago.', variant: 'error' });
    } finally {
      setSavingId('');
    }
  };

  return <section className="space-y-6">
    <PageHeader title="Pagos" description="Señas, cuotas, saldos, reembolsos y depósitos asociados a contratos." />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_180px_180px_180px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applySearch(); }} className="h-11 pl-10" placeholder="Buscar número, recibo o referencia..." /></div>
      <Select value={filters.status} onChange={(event) => updateFilters({ page: 1, status: event.target.value })}><option value="">Todos los estados</option>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select value={filters.type} onChange={(event) => updateFilters({ page: 1, type: event.target.value })}><option value="">Todos los tipos</option>{Object.entries(paymentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select value={filters.method} onChange={(event) => updateFilters({ page: 1, method: event.target.value })}><option value="">Todos los medios</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Button variant="secondary" onClick={applySearch}>Filtrar</Button>
    </div>

    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading ? <p className="p-8 text-sm text-zinc-500">Cargando pagos...</p> : <div className="overflow-x-auto"><table className="min-w-[1320px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Número', 'Fecha', 'Vencimiento', 'Cliente', 'Evento', 'Contrato', 'Salón', 'Tipo', 'Medio', 'Importe', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((payment) => <tr key={payment._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-semibold text-zinc-900">{payment.paymentNumber}</td><td className="px-5 py-4 text-zinc-700">{formatDate(payment.paidAt ?? payment.createdAt)}</td><td className="px-5 py-4 text-zinc-700">{formatDate(payment.dueDate)}</td><td className="px-5 py-4 text-zinc-700">{entityName(payment.customerId)}</td><td className="px-5 py-4 text-zinc-700">{entityName(payment.eventId)}</td><td className="px-5 py-4">{entityId(payment.contractId) ? <Link className="font-medium text-zinc-950 underline" href={`/admin/contracts/${entityId(payment.contractId)}?tab=pagos`}>{entityName(payment.contractId)}</Link> : entityName(payment.contractId)}</td><td className="px-5 py-4 text-zinc-700">{entityName(payment.salonId)}</td><td className="px-5 py-4 text-zinc-700">{displayLabel(paymentTypeLabels, payment.type)}</td><td className="px-5 py-4 text-zinc-700">{payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'Pendiente'}</td><td className="px-5 py-4 font-medium text-zinc-900">{money(payment.amount)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[payment.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(paymentStatusLabels, payment.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/payments/${payment._id}`}><TableActionButton icon={Eye} label="Ver pago" /></Link><TableActionButton icon={CheckCircle2} label="Marcar cobrado" disabled={savingId === payment._id || payment.status === 'paid'} onClick={() => void action(payment, 'mark-paid', 'Pago marcado como cobrado.')} /><TableActionButton icon={RotateCcw} label="Reembolsar" disabled={savingId === payment._id || payment.status !== 'paid' || payment.type === 'refund'} onClick={() => void action(payment, 'refund', 'Reembolso registrado.')} /><TableActionButton icon={XCircle} label="Cancelar" disabled={savingId === payment._id || payment.status === 'cancelled'} onClick={() => void action(payment, 'cancel', 'Pago cancelado.')} /></div></td></tr>)}</tbody></table>{items.length === 0 ? <p className="p-8 text-sm text-zinc-500">No hay pagos para los filtros seleccionados.</p> : null}</div>}
    </article>
    {meta ? <div className="flex items-center justify-between text-sm text-zinc-500"><span>Página {meta.page} de {meta.totalPages}</span><div className="flex gap-2"><Button variant="secondary" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}>Anterior</Button><Button variant="secondary" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: filters.page + 1 })}>Siguiente</Button></div></div> : null}
  </section>;
}
