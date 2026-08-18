'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Eye, LockKeyhole, Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { eventStatusLabels } from '@/lib/display-labels';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { EventCreateModal } from '@/features/events/event-create-modal';
import { formatCivilDate } from '@/lib/dates';
import type { Event, PaginationMeta, Salon } from '@/features/quotes/types';

type ListResponse = { items?: Event[]; meta?: Partial<PaginationMeta> };

const formatDate = (value?: string) => formatCivilDate(value, 'Sin fecha', 'medium');
const statusTone: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-700', quoted: 'bg-amber-50 text-amber-800', reserved: 'bg-sky-50 text-sky-700', confirmed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-700', lost: 'bg-orange-50 text-orange-700' };

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; name?: string; quoteNumber?: string };
  return item.fullName || item.name || item.quoteNumber || 'Sin datos';
}

function entityId(value: unknown) {
  return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
}

function normalize(response: ListResponse): { items: Event[]; meta: PaginationMeta } {
  const items = response.items ?? [];
  const source = response.meta ?? {};
  const totalItems = source.totalItems ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

function rangeForMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { dateFrom: '', dateTo: '' };
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export default function EventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [items, setItems] = useState<Event[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '', status: '', salonId: '', month: '', dateFrom: '', dateTo: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  const setNotice = useCallback((message: string) => { if (message) showToast({ message, variant: 'error' }); }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      if (filters.status) query.set('status', filters.status);
      if (filters.salonId) query.set('salonId', filters.salonId);
      if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) query.set('dateTo', filters.dateTo);
      const [eventsResponse, salonsResponse] = await Promise.all([
        api.get<ListResponse>(`/events?${query.toString()}`),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons')
      ]);
      const events = normalize(eventsResponse);
      setItems(events.items);
      setMeta(events.meta);
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron cargar los eventos.');
    } finally {
      setLoading(false);
    }
  }, [filters, setNotice]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (searchParams?.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes }));
  const selectMonth = (month: string) => updateFilters({ page: 1, month, ...rangeForMonth(month) });
  const clearDateFilters = () => updateFilters({ page: 1, month: '', dateFrom: '', dateTo: '' });
  const hasDateFilters = Boolean(filters.month || filters.dateFrom || filters.dateTo);
  const handleCreated = async (eventId: string, message?: string) => {
    setCreateOpen(false);
    showToast({ message: message ?? 'Evento creado correctamente.', variant: 'success' });
    await load();
    router.push(`/admin/events/${eventId}`);
  };
  const handleCreateError = useCallback((message: string) => showToast({ message, variant: 'error' }), [showToast]);

  return <section className="space-y-6">
    <PageHeader title="Eventos" description="Eventos creados desde presupuestos aceptados, carga directa y futuras reservas." action={<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo evento</Button>} />
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,auto)]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por evento o notas..." /></div>
        <Select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilters({ page: 1, status: event.target.value })} className="h-11 min-w-44"><option value="">Todos los estados</option>{Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Filtrar por salón" value={filters.salonId} onChange={(event) => updateFilters({ page: 1, salonId: event.target.value })} className="h-11 min-w-40"><option value="">Todos los salones</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select>
        <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ page: 1, limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4">
        <div className="flex items-center gap-2 pb-2 text-sm font-medium text-zinc-700"><CalendarRange className="h-4 w-4 text-zinc-500" /><span>Fecha del evento</span></div>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600"><span>Mes</span><Input aria-label="Filtrar por mes" type="month" value={filters.month} onChange={(event) => selectMonth(event.target.value)} className="h-10 min-w-40" /></label>
        <span className="pb-2 text-xs text-zinc-400">o</span>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600"><span>Desde</span><Input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => updateFilters({ page: 1, month: '', dateFrom: event.target.value })} className="h-10 min-w-40" /></label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600"><span>Hasta</span><Input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => updateFilters({ page: 1, month: '', dateTo: event.target.value })} className="h-10 min-w-40" /></label>
        {hasDateFilters ? <Button type="button" variant="secondary" onClick={clearDateFilters} className="h-10 px-3"><X className="mr-1.5 h-4 w-4" />Limpiar fechas</Button> : null}
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[1080px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Evento / cliente', 'Fecha', 'Salón', 'Tipo de evento', 'Presupuesto origen', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((event) => { const quoteId = entityId(event.sourceQuoteId ?? event.quoteId); return <tr key={event._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4"><p className="font-medium text-zinc-900">{event.eventName || event.eventType || 'Evento sin nombre'}</p><p className="mt-1 text-xs text-zinc-500">{entityName(event.customerId)}</p></td><td className="px-5 py-4 text-zinc-700">{formatDate(event.eventDate)}</td><td className="px-5 py-4 text-zinc-700">{entityName(event.salonId)}</td><td className="px-5 py-4 text-zinc-700">{event.eventType || 'Sin tipo'}</td><td className="px-5 py-4 text-zinc-700">{quoteId ? <Link href={`/admin/quotes/${quoteId}`} className="font-medium text-zinc-950 underline">{entityName(event.sourceQuoteId ?? event.quoteId)}</Link> : 'No informado'}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone[event.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{eventStatusLabels[event.status] ?? event.status}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Link href={`/admin/events/${event._id}/closure`}><TableActionButton icon={LockKeyhole} label="Cierre integral" /></Link><Link href={`/admin/events/${event._id}`}><TableActionButton icon={Eye} label="Ver evento" /></Link></div></td></tr>; })}</tbody></table></div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando eventos...</div>}
      {!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><CalendarDays className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay eventos</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los presupuestos convertidos aparecerán en este listado.</p></div>}
    </div>
    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong></span><div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div></footer>
    {createOpen ? <EventCreateModal open={createOpen} salons={salons} onClose={() => setCreateOpen(false)} onCreated={(eventId, message) => void handleCreated(eventId, message)} onError={handleCreateError} /> : null}
  </section>;
}
