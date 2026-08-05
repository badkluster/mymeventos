'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Mail, MessageCircle, ReceiptText, Search, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { formatCivilDate } from '@/lib/dates';
import type { Customer, PaginationMeta } from '@/features/quotes/types';

type ListResponse = { items?: Customer[]; meta?: Partial<PaginationMeta> };

// `formatCivilDate` distingue fecha civil (eventDate) de instante real (createdAt) mirando la
// forma del valor — esta columna mezcla ambas según si el cliente tiene un próximo evento.
const formatDate = (value?: string) => value ? formatCivilDate(value, 'Sin fecha', 'medium') : 'Sin fecha';
const customerName = (customer: Customer) => customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Cliente sin nombre';

function normalize(response: ListResponse): { items: Customer[]; meta: PaginationMeta } {
  const items = response.items ?? [];
  const source = response.meta ?? {};
  const totalItems = source.totalItems ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

export default function CustomersPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  const notice = (message: string) => message && showToast({ message, variant: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      const response = normalize(await api.get<ListResponse>(`/customers?${query.toString()}`));
      setItems(response.items);
      setMeta(response.meta);
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // La pantalla debe sincronizar datos con filtros y paginación.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes }));
  const openWhatsApp = (customer: Customer) => {
    if (!customer.phone) return notice('El cliente no tiene teléfono.');
    window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  };

  return <section className="space-y-6">
    <PageHeader title="Clientes" description="Clientes consolidados con historial comercial, presupuestos y eventos." />
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por nombre, teléfono o email..." /></div>
        <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ page: 1, limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Cliente', 'Teléfono', 'Email', 'Eventos', 'Presupuestos', 'Última actividad', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((customer) => <tr key={customer._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-medium text-zinc-900">{customerName(customer)}</td><td className="px-5 py-4 text-zinc-700">{customer.phone || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{customer.email || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{customer.eventCount ?? 0}</td><td className="px-5 py-4 text-zinc-700">{customer.quoteCount ?? 0}</td><td className="px-5 py-4 text-zinc-700">{formatDate(customer.lastEvent?.eventDate ?? customer.createdAt)}</td><td className="px-5 py-4"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Activo</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/customers/${customer._id}`}><TableActionButton icon={Eye} label="Ver cliente" /></Link><TableActionButton icon={MessageCircle} label="WhatsApp" onClick={() => openWhatsApp(customer)} />{customer.email ? <a href={`mailto:${customer.email}`}><TableActionButton icon={Mail} label="Email" /></a> : null}<Link href={`/admin/quotes?customerId=${customer._id}`}><TableActionButton icon={ReceiptText} label="Crear presupuesto" /></Link></div></td></tr>)}</tbody></table></div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando clientes...</div>}
      {!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><UserRound className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay clientes</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los clientes aparecerán al convertir presupuestos o crearlos manualmente.</p></div>}
    </div>
    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong></span><div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div></footer>
  </section>;
}
