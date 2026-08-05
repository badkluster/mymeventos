'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileText, Printer, Search, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { contractStatusLabels, displayLabel } from '@/lib/display-labels';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import type { Contract, Event, PaginationMeta } from '@/features/quotes/types';
import { formatCivilDate } from '@/lib/dates';

type ListResponse = { items?: Contract[]; meta?: Partial<PaginationMeta> };

const money = (value?: unknown) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const formatDate = (value?: unknown) => formatCivilDate(value, 'Sin fecha', 'medium');
const statusTone: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-700', pending_approval: 'bg-amber-50 text-amber-800', approved: 'bg-emerald-50 text-emerald-700', requires_changes: 'bg-sky-50 text-sky-700', cancelled: 'bg-rose-50 text-rose-700', superseded: 'bg-zinc-100 text-zinc-500' };

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; name?: string; eventName?: string; eventType?: string };
  return item.fullName || item.name || item.eventName || item.eventType || 'Sin datos';
}
function normalize(response: ListResponse): { items: Contract[]; meta: PaginationMeta } {
  const items = response.items ?? [];
  const source = response.meta ?? {};
  const totalItems = source.totalItems ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

export default function ContractsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '', status: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      if (filters.status) query.set('status', filters.status);
      const response = normalize(await api.get<ListResponse>(`/contracts?${query.toString()}`));
      setItems(response.items);
      setMeta(response.meta);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar los contratos.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filters, showToast]);

  // La pantalla debe sincronizar datos con filtros y paginación.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes }));
  const action = async (contract: Contract, path: string, message: string) => {
    setSavingId(contract._id);
    try {
      await api.post(`/contracts/${contract._id}/${path}`, {});
      await load();
      showToast({ message, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el contrato.', variant: 'error' });
    } finally {
      setSavingId('');
    }
  };

  return <section className="space-y-6">
    <PageHeader title="Contratos" description="Contratos formales generados desde eventos base." />
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(2,auto)]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por número, cliente o evento..." /></div>
        <Select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilters({ page: 1, status: event.target.value })} className="h-11 min-w-44"><option value="">Todos los estados</option>{Object.entries(contractStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ page: 1, limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[1280px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Número', 'Cliente', 'Evento', 'Fecha', 'Salón', 'Base', 'Adendas aprobadas', 'Total', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((contract) => <tr key={contract._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-semibold text-zinc-900">{contract.contractNumber}</td><td className="px-5 py-4 text-zinc-700">{entityName(contract.customerId) || String(contract.customerSnapshot?.fullName ?? 'Sin datos')}</td><td className="px-5 py-4 text-zinc-700">{entityName(contract.eventId) || String(contract.eventSnapshot?.eventName ?? contract.eventSnapshot?.eventType ?? 'Evento')}</td><td className="px-5 py-4 text-zinc-700">{formatDate((contract.eventId as Event)?.eventDate ?? contract.eventSnapshot?.eventDate)}</td><td className="px-5 py-4 text-zinc-700">{entityName(contract.salonId) || String(contract.eventSnapshot?.salonName ?? 'Sin salón')}</td><td className="px-5 py-4 text-zinc-700">{money(contract.baseAmount)}</td><td className="px-5 py-4 text-zinc-700">{money(contract.approvedAddendumsAmount)}</td><td className="px-5 py-4 font-medium text-zinc-900">{money(contract.totalAmount ?? contract.commercialSnapshot?.totalAmount)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[contract.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(contractStatusLabels, contract.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/contracts/${contract._id}`}><TableActionButton icon={Eye} label="Ver contrato" /></Link><TableActionButton icon={CheckCircle2} label="Aprobar contrato" disabled={savingId === contract._id || contract.status === 'approved' || contract.status === 'cancelled'} onClick={() => void action(contract, 'approve', 'Contrato aprobado.')} /><TableActionButton icon={AlertTriangle} label="Requiere cambios" disabled={savingId === contract._id || contract.status === 'cancelled'} onClick={() => void action(contract, 'request-changes', 'Contrato marcado con cambios requeridos.')} /><TableActionButton icon={XCircle} label="Cancelar contrato" disabled={savingId === contract._id || contract.status === 'cancelled'} onClick={() => void action(contract, 'cancel', 'Contrato cancelado.')} /><Link href={`/admin/contracts/${contract._id}/print`}><TableActionButton icon={Printer} label="Imprimir contrato" /></Link></div></td></tr>)}</tbody></table></div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando contratos...</div>}
      {!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><FileText className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay contratos</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los contratos aparecerán al generarlos desde eventos listos.</p></div>}
    </div>
    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong></span><div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div></footer>
  </section>;
}
