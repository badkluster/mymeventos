'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Eye, MessageCircle, Pencil, Plus, ReceiptText, Search, Trash2, UserCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, quoteRequestSourceLabels, quoteRequestStatusLabels, quoteStatusLabels } from '@/lib/display-labels';
import { Button, Input, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { QuoteFormModal } from '@/features/quotes/quote-form-modal';
import { getLeadName, getSalonName, type Customer, type LeadOption, type PackageTemplate, type PaginationMeta, type Quote, type QuoteRequest, type Salon } from '@/features/quotes/types';

type ListResponse<T> = { items?: T[]; meta?: Partial<PaginationMeta> };

const currency = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
const statusTone: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-700', sent: 'bg-blue-50 text-blue-700', follow_up: 'bg-amber-50 text-amber-800', accepted: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', expired: 'bg-orange-50 text-orange-700', converted: 'bg-violet-50 text-violet-700', new: 'bg-sky-50 text-sky-700', in_review: 'bg-amber-50 text-amber-800', discarded: 'bg-rose-50 text-rose-700', duplicated: 'bg-zinc-100 text-zinc-700' };

function normalizeList<T>(response: ListResponse<T>): { items: T[]; meta: PaginationMeta } {
  const items = response.items ?? [];
  const source = response.meta ?? {};
  const totalItems = source.totalItems ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

function requestSalonNames(request: QuoteRequest, salons: Salon[]) {
  const ids = request.interestedSalonIds ?? [];
  const names = ids.map((salon) => typeof salon === 'string' ? salons.find((item) => item._id === salon)?.name : salon.name).filter(Boolean);
  return names.length ? names.join(' · ') : 'Sin salón';
}

function assigneeName(value: QuoteRequest['assignedToUserId']) {
  if (!value || typeof value === 'string') return 'Sin asignar';
  return [value.firstName, value.lastName].filter(Boolean).join(' ') || value.email || 'Sin asignar';
}

function customerName(value: Quote['customerId']) {
  if (!value || typeof value === 'string') return '';
  return value.fullName || [value.firstName, value.lastName].filter(Boolean).join(' ');
}

export default function QuotesPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'requests' | 'quotes'>('requests');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<PackageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formQuote, setFormQuote] = useState<Quote | undefined>();
  const [formRequest, setFormRequest] = useState<QuoteRequest | undefined>();
  const [initialCustomerId, setInitialCustomerId] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [remove, setRemove] = useState<Quote | undefined>();
  const [discard, setDiscard] = useState<QuoteRequest | undefined>();
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '', status: '', salonId: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });

  const setNotice = useCallback((message: string) => {
    if (!message) return;
    const isSuccess = /correctamente|creado|creada|actualizado|actualizada|duplicado|duplicada|eliminado|eliminada|tomada|descartada/i.test(message);
    showToast({ message, variant: isSuccess ? 'success' : 'error' });
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      if (filters.status) query.set('status', filters.status);
      if (filters.salonId) query.set('salonId', filters.salonId);
      const [listResponse, salonsResponse, leadsResponse, customersResponse, packagesResponse] = await Promise.all([
        activeTab === 'requests' ? api.get<ListResponse<QuoteRequest>>(`/quote-requests?${query.toString()}`) : api.get<ListResponse<Quote>>(`/quotes?${query.toString()}`),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons'),
        api.get<{ items?: LeadOption[]; leads?: LeadOption[] } | LeadOption[]>('/leads?limit=100'),
        api.get<{ items?: Customer[] } | Customer[]>('/customers?limit=100'),
        api.get<{ packages?: PackageTemplate[]; items?: PackageTemplate[] } | PackageTemplate[]>('/quotes/packages'),
      ]);
      const list = normalizeList(listResponse as ListResponse<QuoteRequest | Quote>);
      if (activeTab === 'requests') setRequests(list.items as QuoteRequest[]);
      else setQuotes(list.items as Quote[]);
      setMeta(list.meta);
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
      setLeads(Array.isArray(leadsResponse) ? leadsResponse : leadsResponse.items ?? leadsResponse.leads ?? []);
      setCustomers(Array.isArray(customersResponse) ? customersResponse : customersResponse.items ?? []);
      setPackages(Array.isArray(packagesResponse) ? packagesResponse : packagesResponse.items ?? packagesResponse.packages ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar el módulo de presupuestos.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, setNotice]);

  // La pantalla necesita sincronizar el listado con filtros, pestaña y paginación.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    const customerId = searchParams?.get('customerId');
    if (!customerId || !customers.some((customer) => customer._id === customerId)) return;
    const timer = window.setTimeout(() => {
      setInitialCustomerId(customerId);
      setFormQuote(undefined);
      setFormRequest(undefined);
      setIsFormOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, customers]);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes }));
  const openCreate = () => { setInitialCustomerId(''); setFormQuote(undefined); setFormRequest(undefined); setIsFormOpen(true); };
  const openEdit = (quote: Quote) => { setInitialCustomerId(''); setFormQuote(quote); setFormRequest(undefined); setIsFormOpen(true); };
  const openConvert = (request: QuoteRequest) => { setInitialCustomerId(''); setFormQuote(undefined); setFormRequest(request); setIsFormOpen(true); };

  const save = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (formRequest) await api.post(`/quote-requests/${formRequest._id}/convert-to-quotes`, payload);
      else if (formQuote) await api.patch(`/quotes/${formQuote._id}`, payload);
      else await api.post('/quotes', payload);
      setNotice(formRequest ? 'Solicitud presupuestada correctamente.' : formQuote ? 'Presupuesto actualizado correctamente.' : 'Presupuesto creado correctamente.');
      setIsFormOpen(false);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el presupuesto.');
      throw error;
    } finally { setSaving(false); }
  };

  const duplicate = async (quote: Quote) => { try { await api.post(`/quotes/${quote._id}/duplicate`); setNotice('Presupuesto duplicado correctamente.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo duplicar el presupuesto.'); } };
  const changeQuoteStatus = async (quote: Quote, status: 'accepted' | 'rejected' | 'sent') => { try { await api.patch(`/quotes/${quote._id}/status`, { status }); setNotice('Estado actualizado correctamente.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el estado.'); } };
  const takeRequest = async (request: QuoteRequest) => { try { await api.patch(`/quote-requests/${request._id}/take`); setNotice('Solicitud tomada correctamente.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo tomar la solicitud.'); } };
  const markDuplicated = async (request: QuoteRequest) => { try { await api.patch(`/quote-requests/${request._id}/mark-duplicated`, {}); setNotice('Solicitud marcada como duplicada.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo marcar como duplicada.'); } };
  const discardRequest = async () => { if (!discard) return; setSaving(true); try { await api.patch(`/quote-requests/${discard._id}/discard`); setDiscard(undefined); setNotice('Solicitud descartada correctamente.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo descartar la solicitud.'); } finally { setSaving(false); } };
  const removeQuote = async () => { if (!remove) return; setSaving(true); try { await api.delete(`/quotes/${remove._id}`); setRemove(undefined); setNotice('Presupuesto eliminado correctamente.'); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el presupuesto.'); } finally { setSaving(false); } };
  const sendWhatsAppForRequest = (request: QuoteRequest) => {
    const phone = request.phone?.replace(/\D/g, '');
    if (!phone) return setNotice('La solicitud no tiene teléfono.');
    const message = `Hola ${request.contactName}, somos M&M Eventos. Recibimos tu solicitud para ${request.eventType || 'tu evento'} para aproximadamente ${request.guestCount || 'varias'} personas. Te vamos a preparar una propuesta con las opciones disponibles. ¿Podemos avanzar con algunos datos más?`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return <section className="space-y-6">
    <PageHeader title="Presupuestos" description="Solicitudes comerciales y presupuestos emitidos por salón." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo presupuesto</Button>} />
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">
      <button type="button" onClick={() => { setActiveTab('requests'); updateFilters({ page: 1, status: '' }); }} className={`px-4 py-3 text-sm font-medium ${activeTab === 'requests' ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>Solicitudes</button>
      <button type="button" onClick={() => { setActiveTab('quotes'); updateFilters({ page: 1, status: '' }); }} className={`px-4 py-3 text-sm font-medium ${activeTab === 'quotes' ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>Presupuestos</button>
    </div>
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,auto)]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por contacto, teléfono o evento..." /></div>
        <Select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilters({ page: 1, status: event.target.value })} className="h-11 min-w-44"><option value="">Todos los estados</option>{Object.entries(activeTab === 'requests' ? quoteRequestStatusLabels : quoteStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Filtrar por salón" value={filters.salonId} onChange={(event) => updateFilters({ page: 1, salonId: event.target.value })} className="h-11 min-w-40"><option value="">Todos los salones</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select>
        <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ page: 1, limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select>
      </div>
    </div>

    {activeTab === 'requests' ? <RequestsTable requests={requests} salons={salons} loading={loading} onTake={takeRequest} onConvert={openConvert} onWhatsApp={sendWhatsAppForRequest} onDuplicate={markDuplicated} onDiscard={setDiscard} /> : <QuotesTable quotes={quotes} salons={salons} loading={loading} onEdit={openEdit} onDuplicate={duplicate} onStatus={changeQuoteStatus} onRemove={setRemove} />}

    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{activeTab === 'requests' ? requests.length : quotes.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong></span>
      <div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div>
    </footer>
    <QuoteFormModal open={isFormOpen} quote={formQuote} quoteRequest={formRequest} initialCustomerId={initialCustomerId} salons={salons} leads={leads} customers={customers} packages={packages} saving={saving} onClose={() => setIsFormOpen(false)} onSubmit={save} />
    <Modal open={Boolean(remove)} onClose={() => setRemove(undefined)} title="Eliminar presupuesto" description="Esta acción eliminará el presupuesto del listado, pero conservará el registro internamente."><div className="p-6"><footer className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setRemove(undefined)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void removeQuote()}>{saving ? 'Eliminando...' : 'Eliminar'}</Button></footer></div></Modal>
    <Modal open={Boolean(discard)} onClose={() => setDiscard(undefined)} title="Descartar solicitud" description="La solicitud quedará archivada como descartada."><div className="p-6"><footer className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setDiscard(undefined)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void discardRequest()}>{saving ? 'Descartando...' : 'Descartar'}</Button></footer></div></Modal>
  </section>;
}

function RequestsTable({ requests, salons, loading, onTake, onConvert, onWhatsApp, onDuplicate, onDiscard }: { requests: QuoteRequest[]; salons: Salon[]; loading: boolean; onTake: (request: QuoteRequest) => void; onConvert: (request: QuoteRequest) => void; onWhatsApp: (request: QuoteRequest) => void; onDuplicate: (request: QuoteRequest) => void; onDiscard: (request: QuoteRequest) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Fecha', 'Nombre', 'Teléfono', 'Email', 'Tipo evento', 'Fecha tentativa', 'Personas', 'Salón/es', 'Origen', 'Estado', 'Asignado a'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{requests.map((request) => <tr key={request._id} className="transition-colors hover:bg-amber-50/35"><td className="whitespace-nowrap px-5 py-4 text-zinc-700">{formatDate(request.createdAt)}</td><td className="px-5 py-4 font-medium text-zinc-900">{request.contactName}</td><td className="px-5 py-4 text-zinc-700">{request.phone || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{request.email || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{request.eventType || 'Sin especificar'}</td><td className="px-5 py-4 text-zinc-700">{formatDate(request.estimatedEventDate)}</td><td className="px-5 py-4 text-zinc-700">{request.guestCount || '-'}</td><td className="px-5 py-4 text-zinc-700">{requestSalonNames(request, salons)}</td><td className="px-5 py-4 text-zinc-700">{displayLabel(quoteRequestSourceLabels, request.source)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[request.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(quoteRequestStatusLabels, request.status)}</span></td><td className="px-5 py-4 text-zinc-700">{assigneeName(request.assignedToUserId)}</td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/quotes/requests/${request._id}`}><TableActionButton icon={Eye} label="Ver solicitud" /></Link><TableActionButton icon={UserCheck} label="Tomar solicitud" onClick={() => onTake(request)} /><TableActionButton icon={ReceiptText} label="Generar presupuesto" onClick={() => onConvert(request)} /><TableActionButton icon={MessageCircle} label="WhatsApp" onClick={() => onWhatsApp(request)} /><TableActionButton icon={Copy} label="Marcar duplicada" onClick={() => onDuplicate(request)} /><TableActionButton icon={Trash2} label="Descartar solicitud" onClick={() => onDiscard(request)} /></div></td></tr>)}</tbody></table></div>{loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando solicitudes...</div>}{!loading && requests.length === 0 && <EmptyState title="No hay solicitudes" description="Las consultas web, WhatsApp, oficina o carga manual aparecerán en este listado." />}</div>;
}

function QuotesTable({ quotes, salons, loading, onEdit, onDuplicate, onStatus, onRemove }: { quotes: Quote[]; salons: Salon[]; loading: boolean; onEdit: (quote: Quote) => void; onDuplicate: (quote: Quote) => void; onStatus: (quote: Quote, status: 'accepted' | 'rejected' | 'sent') => void; onRemove: (quote: Quote) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Número', 'Lead / cliente', 'Teléfono', 'Fecha tentativa', 'Personas', 'Salón', 'Paquete', 'Total', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{quotes.map((quote) => { const linkedCustomerName = customerName(quote.customerId); const linkedLeadName = getLeadName(quote.leadId); return <tr key={quote._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-semibold text-zinc-900">{quote.quoteNumber}</td><td className="px-5 py-4"><p className="font-medium text-zinc-900">{quote.contactName || linkedCustomerName || linkedLeadName || 'Sin contacto'}</p><p className="mt-0.5 text-xs text-zinc-500">{linkedCustomerName ? 'Cliente asociado' : linkedLeadName ? 'Lead asociado' : 'Contacto directo'}</p></td><td className="px-5 py-4 text-zinc-700">{quote.phone}</td><td className="whitespace-nowrap px-5 py-4 text-zinc-700">{formatDate(quote.estimatedEventDate)}</td><td className="px-5 py-4 text-zinc-700">{quote.guestCount || '-'}</td><td className="px-5 py-4 text-zinc-700">{getSalonName(quote.salonId, salons)}</td><td className="px-5 py-4 text-zinc-700">{quote.packageName || 'Personalizado'}</td><td className="whitespace-nowrap px-5 py-4 font-medium text-zinc-900">{currency(quote.totalAmount)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[quote.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(quoteStatusLabels, quote.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/quotes/${quote._id}`}><TableActionButton icon={Eye} label="Ver detalle" /></Link><TableActionButton icon={Pencil} label="Editar presupuesto" onClick={() => onEdit(quote)} /><TableActionButton icon={Copy} label="Duplicar presupuesto" onClick={() => onDuplicate(quote)} /><TableActionButton icon={Check} label="Marcar como aceptado" onClick={() => onStatus(quote, 'accepted')} /><TableActionButton icon={X} label="Marcar como rechazado" onClick={() => onStatus(quote, 'rejected')} /><TableActionButton icon={Trash2} label="Eliminar presupuesto" onClick={() => onRemove(quote)} /></div></td></tr>; })}</tbody></table></div>{loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando presupuestos...</div>}{!loading && quotes.length === 0 && <EmptyState title="No hay presupuestos" description="Creá un presupuesto o ajustá los filtros para ver otros resultados." />}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><ReceiptText className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">{title}</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p></div>;
}
