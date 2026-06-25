'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Eye, Mail, MessageCircle, Pencil, Plus, ReceiptText, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, quoteStatusLabels } from '@/lib/display-labels';
import { Button, Input, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { QuoteFormModal } from '@/features/quotes/quote-form-modal';
import { getLeadName, getSalonName, type LeadOption, type PackageTemplate, type PaginationMeta, type Quote, type Salon } from '@/features/quotes/types';

type ListResponse = { items?: Quote[]; quotes?: Quote[]; meta?: Partial<PaginationMeta>; pagination?: Partial<PaginationMeta> };

const currency = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
const statusTone: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-700', sent: 'bg-blue-50 text-blue-700', follow_up: 'bg-amber-50 text-amber-800', accepted: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', expired: 'bg-orange-50 text-orange-700', converted: 'bg-violet-50 text-violet-700' };

function normalizeList(response: ListResponse): { items: Quote[]; meta: PaginationMeta } {
  const items = response.items ?? response.quotes ?? [];
  const source = response.meta ?? response.pagination ?? {};
  const totalItems = source.totalItems ?? (source as { total?: number }).total ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

export default function QuotesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Quote[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [packages, setPackages] = useState<PackageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const setNotice = (message: string) => {
    if (!message) return;
    const isSuccess = /correctamente|creado|creada|actualizado|actualizada|duplicado|duplicada|eliminado|eliminada/i.test(message);
    showToast({ message, variant: isSuccess ? 'success' : 'error' });
  };
  const [formQuote, setFormQuote] = useState<Quote | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [remove, setRemove] = useState<Quote | undefined>();
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '', status: '', salonId: '', packageTemplateId: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      if (filters.status) query.set('status', filters.status);
      if (filters.salonId) query.set('salonId', filters.salonId);
      if (filters.packageTemplateId) query.set('packageTemplateId', filters.packageTemplateId);
      const [quotesResponse, salonsResponse, leadsResponse, packagesResponse] = await Promise.all([
        api.get<ListResponse>(`/quotes?${query.toString()}`),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons'),
        api.get<{ items?: LeadOption[]; leads?: LeadOption[] } | LeadOption[]>('/leads?limit=100'),
        api.get<{ packages?: PackageTemplate[]; items?: PackageTemplate[] } | PackageTemplate[]>('/quotes/packages'),
      ]);
      const quotes = normalizeList(quotesResponse);
      setItems(quotes.items);
      setMeta(quotes.meta);
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
      setLeads(Array.isArray(leadsResponse) ? leadsResponse : leadsResponse.items ?? leadsResponse.leads ?? []);
      setPackages(Array.isArray(packagesResponse) ? packagesResponse : packagesResponse.items ?? packagesResponse.packages ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron cargar los presupuestos.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // La pantalla necesita cargar datos y recargarlos al cambiar filtros.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const handleDetailAction = (event: MouseEvent) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button[aria-label="Ver detalle"]');
      if (!action) return;
      const quoteNumber = action.closest('tr')?.querySelector('td')?.textContent;
      const quote = items.find((item) => item.quoteNumber === quoteNumber);
      if (quote) router.push(`/admin/quotes/${quote._id}`);
    };
    document.addEventListener('click', handleDetailAction);
    return () => document.removeEventListener('click', handleDetailAction);
  }, [items, router]);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes }));
  const openCreate = () => { setNotice(''); setFormQuote(undefined); setIsFormOpen(true); };
  const openEdit = (quote: Quote) => { setNotice(''); setFormQuote(quote); setIsFormOpen(true); };

  const save = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = formQuote ? await api.patch<{ quote?: Quote }>(`/quotes/${formQuote._id}`, payload) : await api.post<{ quotes?: Quote[]; quote?: Quote }>('/quotes', payload);
      const createdQuotes = (response as { quotes?: Quote[] }).quotes ?? [];
      const totalCreated = !formQuote && createdQuotes.length > 1 ? ` Se crearon ${createdQuotes.length} presupuestos.` : '';
      setNotice(`${formQuote ? 'Presupuesto actualizado correctamente.' : 'Presupuesto creado correctamente.'}${totalCreated}`);
      setIsFormOpen(false);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el presupuesto.');
      throw error;
    } finally { setSaving(false); }
  };

  const duplicate = async (quote: Quote) => {
    try { await api.post(`/quotes/${quote._id}/duplicate`); setNotice('Presupuesto duplicado correctamente.'); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo duplicar el presupuesto.'); }
  };
  const changeStatus = async (quote: Quote, status: 'accepted' | 'rejected' | 'sent') => {
    try { await api.patch(`/quotes/${quote._id}/status`, { status }); setNotice('Estado actualizado correctamente.'); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el estado.'); }
  };
  const removeQuote = async () => {
    if (!remove) return;
    setSaving(true);
    try { await api.delete(`/quotes/${remove._id}`); setRemove(undefined); setNotice('Presupuesto eliminado correctamente.'); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el presupuesto.'); }
    finally { setSaving(false); }
  };
  const sendWhatsApp = (quote: Quote) => {
    const salon = getSalonName(quote.salonId, salons);
    const extras = [quote.promotionText && `Promo: ${quote.promotionText}`, quote.giftText && `Regalo: ${quote.giftText}`, quote.paymentTerms && `Condiciones: ${quote.paymentTerms}`].filter(Boolean).join('\n');
    const message = `Hola ${quote.contactName}, te compartimos el presupuesto ${quote.quoteNumber}.\n\nPaquete: ${quote.packageName || 'Personalizado'}\nSalón: ${salon}\nEvento: ${quote.eventType}\nPersonas: ${quote.guestCount}\nValor final por persona: ${currency(quote.finalPricePerPerson)}\nTotal: ${currency(quote.totalAmount)}\nSeña: ${currency(quote.depositAmount)}${extras ? `\n${extras}` : ''}`;
    window.open(`https://wa.me/${quote.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const sendEmail = (quote: Quote) => {
    setNotice(quote.email ? 'Envío por email pendiente de configuración.' : 'Este presupuesto no tiene un email asociado.');
  };

  return <section className="space-y-6">
    <PageHeader title="Presupuestos" description="Cotizaciones comerciales por salón, paquete y contacto." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo presupuesto</Button>} />
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(4,auto)]"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por número, contacto o teléfono…" /></div><Select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilters({ page: 1, status: event.target.value })} className="h-11 min-w-40"><option value="">Todos los estados</option>{Object.entries(quoteStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select aria-label="Filtrar por salón" value={filters.salonId} onChange={(event) => updateFilters({ page: 1, salonId: event.target.value })} className="h-11 min-w-40"><option value="">Todos los salones</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select><Select aria-label="Filtrar por paquete" value={filters.packageTemplateId} onChange={(event) => updateFilters({ page: 1, packageTemplateId: event.target.value })} className="h-11 min-w-40"><option value="">Todos los paquetes</option>{packages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select><Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ page: 1, limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select></div></div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Número', 'Lead / cliente', 'Teléfono', 'Fecha tentativa', 'Personas', 'Salón', 'Paquete', 'Total', 'Estado'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((quote) => <tr key={quote._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-semibold text-zinc-900">{quote.quoteNumber}</td><td className="px-5 py-4"><p className="font-medium text-zinc-900">{quote.contactName || getLeadName(quote.leadId) || 'Sin contacto'}</p><p className="mt-0.5 text-xs text-zinc-500">{getLeadName(quote.leadId) ? 'Lead asociado' : 'Contacto directo'}</p></td><td className="px-5 py-4 text-zinc-700">{quote.phone}</td><td className="px-5 py-4 whitespace-nowrap text-zinc-700">{formatDate(quote.estimatedEventDate)}</td><td className="px-5 py-4 text-zinc-700">{quote.guestCount || '—'}</td><td className="px-5 py-4 text-zinc-700">{getSalonName(quote.salonId, salons)}</td><td className="px-5 py-4 text-zinc-700">{quote.packageName || 'Personalizado'}</td><td className="px-5 py-4 whitespace-nowrap font-medium text-zinc-900">{currency(quote.totalAmount)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[quote.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(quoteStatusLabels, quote.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><TableActionButton icon={Eye} label="Ver detalle" onClick={() => undefined} /><Link className="sr-only" href={`/admin/quotes/${quote._id}`}>Ver detalle de presupuesto</Link><TableActionButton icon={Pencil} label="Editar presupuesto" onClick={() => openEdit(quote)} /><TableActionButton icon={Copy} label="Duplicar presupuesto" onClick={() => void duplicate(quote)} /><TableActionButton icon={MessageCircle} label="Enviar por WhatsApp" onClick={() => sendWhatsApp(quote)} />{quote.email && <TableActionButton icon={Mail} label="Enviar por email" onClick={() => sendEmail(quote)} />}<TableActionButton icon={Check} label="Marcar como aceptado" onClick={() => void changeStatus(quote, 'accepted')} /><TableActionButton icon={X} label="Marcar como rechazado" onClick={() => void changeStatus(quote, 'rejected')} /><TableActionButton icon={Trash2} label="Eliminar presupuesto" onClick={() => setRemove(quote)} /></div></td></tr>)}</tbody></table></div>{loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando presupuestos…</div>}{!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><ReceiptText className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No encontramos presupuestos</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Creá un presupuesto o ajustá los filtros para ver otros resultados.</p></div>}</div>
    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong> presupuestos</span><div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div></footer>
    <QuoteFormModal open={isFormOpen} quote={formQuote} salons={salons} leads={leads} packages={packages} saving={saving} onClose={() => setIsFormOpen(false)} onSubmit={save} />
    <Modal open={Boolean(remove)} onClose={() => setRemove(undefined)} title="Eliminar presupuesto" description="Esta acción eliminará el presupuesto del listado, pero conservará el registro internamente."><div className="p-6"><footer className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={() => setRemove(undefined)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void removeQuote()}>{saving ? 'Eliminando…' : 'Eliminar'}</Button></footer></div></Modal>
  </section>;
}
