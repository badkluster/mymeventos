'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, Clock3, Copy, Mail, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, quoteStatusLabels } from '@/lib/display-labels';
import { Button, Modal, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { QuoteFormModal } from '@/features/quotes/quote-form-modal';
import { getEntityId, getSalonName, type Event, type LeadOption, type PackageTemplate, type Quote, type Salon } from '@/features/quotes/types';

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const date = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha definida';

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [quote, setQuote] = useState<Quote>();
  const [id, setId] = useState('');
  const [salons, setSalons] = useState<Salon[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [packages, setPackages] = useState<PackageTemplate[]>([]);
  const [notice, setNoticeState] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setNotice = (value: string) => {
    setNoticeState(value);
    if (!value) return;
    const isSuccess = /correctamente|duplicado|duplicada|actualizado|actualizada|eliminado|eliminada/i.test(value);
    showToast({ message: value, variant: isSuccess ? 'success' : 'error' });
  };

  const load = async (quoteId: string) => {
    setLoading(true);
    try {
      const [quoteResponse, salonsResponse, leadsResponse, packagesResponse] = await Promise.all([
        api.get<{ quote?: Quote } | Quote>(`/quotes/${quoteId}`),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons'),
        api.get<{ items?: LeadOption[]; leads?: LeadOption[] } | LeadOption[]>('/leads?limit=100'),
        api.get<{ packages?: PackageTemplate[]; items?: PackageTemplate[] } | PackageTemplate[]>('/quotes/packages')
      ]);
      setQuote((quoteResponse as { quote?: Quote }).quote ?? (quoteResponse as Quote));
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
      setLeads(Array.isArray(leadsResponse) ? leadsResponse : leadsResponse.items ?? leadsResponse.leads ?? []);
      setPackages(Array.isArray(packagesResponse) ? packagesResponse : packagesResponse.items ?? packagesResponse.packages ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar el presupuesto.');
    } finally {
      setLoading(false);
    }
  };

  // La ruta dinámica debe recuperar el presupuesto al cargarse.
  useEffect(() => { void params.then(({ id: quoteId }) => { setId(quoteId); return load(quoteId); }); }, [params]);

  const updateStatus = async (status: string) => {
    if (!quote) return;
    setSaving(true);
    try {
      await api.patch(`/quotes/${quote._id}/status`, { status });
      await load(id);
      setNotice('Estado actualizado correctamente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el estado.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (payload: Record<string, unknown>) => {
    if (!quote) return;
    setSaving(true);
    try {
      await api.patch(`/quotes/${quote._id}`, payload);
      setEditOpen(false);
      await load(id);
      setNotice('Presupuesto actualizado correctamente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el presupuesto.');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!quote) return;
    try {
      const response = await api.post<{ quote?: Quote }>(`/quotes/${quote._id}/duplicate`);
      setNotice('Presupuesto duplicado correctamente.');
      if (response.quote?._id) router.push(`/admin/quotes/${response.quote._id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo duplicar el presupuesto.');
    }
  };

  const remove = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      await api.delete(`/quotes/${quote._id}`);
      router.push('/admin/quotes');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el presupuesto.');
      setDeleteOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const whatsapp = () => {
    if (!quote) return;
    const salon = getSalonName(quote.salonId, salons);
    const extras = [quote.promotionText && `Promo: ${quote.promotionText}`, quote.giftText && `Regalo: ${quote.giftText}`, quote.paymentTerms && `Condiciones: ${quote.paymentTerms}`].filter(Boolean).join('\n');
    const message = `Hola ${quote.contactName}, te compartimos el presupuesto ${quote.quoteNumber}.\n\nPaquete: ${quote.packageName || 'Personalizado'}\nSalón: ${salon}\nPersonas: ${quote.guestCount}\nValor final por persona: ${money(quote.finalPricePerPerson)}\nTotal: ${money(quote.totalAmount)}\nSeña: ${money(quote.depositAmount)}${extras ? `\n${extras}` : ''}`;
    window.open(`https://wa.me/${quote.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const convertToEvent = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      const response = await api.post<{ event: Event }>(`/quotes/${quote._id}/convert-to-event`, {});
      setNotice('Evento creado correctamente desde el presupuesto.');
      router.push(`/admin/events/${response.event._id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo convertir el presupuesto en evento.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !quote) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">{notice || 'Cargando presupuesto...'}</div>;

  const relatedCustomerId = getEntityId(quote.convertedCustomerId ?? quote.customerId);
  const relatedEventId = getEntityId(quote.convertedEventId);

  return <section className="space-y-6 pb-8">
    <Link href="/admin/quotes" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Presupuestos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{quote.quoteNumber}</h1><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{displayLabel(quoteStatusLabels, quote.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{quote.contactName} · {quote.eventType}</p><label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-700">Estado<Select value={quote.status} disabled={saving} onChange={(event) => void updateStatus(event.target.value)} className="w-48 py-2">{Object.entries(quoteStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={whatsapp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>{quote.email && <Button variant="secondary" onClick={() => { window.location.href = `mailto:${quote.email}?subject=${encodeURIComponent(`Presupuesto ${quote.quoteNumber} · M&M Eventos`)}`; }}><Mail className="mr-2 h-4 w-4" />Email</Button>}<Button variant="secondary" onClick={() => void duplicate()}><Copy className="mr-2 h-4 w-4" />Duplicar</Button><Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Contacto"><Item label="Nombre" value={quote.contactName} /><Item label="Teléfono" value={quote.phone} /><Item label="Email" value={quote.email || 'No informado'} /></Card>
      <Card title="Datos del evento"><Item label="Tipo de evento" value={quote.eventType} /><Item label="Fecha tentativa" value={date(quote.estimatedEventDate)} /><Item label="Salón" value={getSalonName(quote.salonId, salons)} /><Item label="Horario" value={quote.startTime && quote.endTime ? `${quote.startTime} a ${quote.endTime}` : 'Sin horario definido'} /></Card>
      <article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Total del presupuesto</p><p className="mt-3 text-3xl font-semibold">{money(quote.totalAmount)}</p><div className="mt-6 flex items-center gap-2 text-sm text-zinc-300"><Clock3 className="h-4 w-4" />{quote.guestCount} personas · {quote.durationHours || '-'} horas</div></article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2"><h2 className="text-base font-semibold text-zinc-950">Resumen económico</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"><Item label="Paquete" value={quote.packageName || 'Personalizado'} /><Item label="Valor por persona" value={money(quote.pricePerPerson)} /><Item label="Descuento" value={`${quote.discountPercentage ?? 0}%`} /><Item label="Valor final por persona" value={money(quote.finalPricePerPerson)} /><Item label="Seña" value={money(quote.depositAmount)} /><Item label="Saldo" value={money(quote.balanceAmount)} /></dl></article>
      <Card title="Promociones y regalos"><Item label="Promoción" value={quote.promotionText || 'Sin promoción'} /><Item label="Regalo" value={quote.giftText || 'Sin regalo'} /><Item label="Condiciones de pago" value={quote.paymentTerms || 'Sin condiciones informadas'} /></Card>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">Menú</h2>{quote.menuSections?.length ? <div className="mt-4 space-y-4">{quote.menuSections.map((section, index) => <div key={`${section.title ?? section.name}-${index}`}><h3 className="font-medium text-zinc-800">{section.title ?? section.name ?? 'Sección'}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-600">{section.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div> : <p className="mt-4 text-sm text-zinc-500">No hay menú cargado.</p>}</article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">Servicios incluidos</h2>{quote.includedServices?.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">{quote.includedServices.map((item) => <li key={item} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul> : <p className="mt-4 text-sm text-zinc-500">No hay servicios cargados.</p>}<div className="mt-6 border-t border-zinc-100 pt-5"><h2 className="text-base font-semibold text-zinc-950">Observaciones</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{quote.notes || 'Sin observaciones.'}</p></div></article>
    </div>

    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Relaciones comerciales</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Cliente</p>{relatedCustomerId ? <Link href={`/admin/customers/${relatedCustomerId}`} className="mt-2 inline-flex text-sm font-semibold text-zinc-950 underline">Ver cliente relacionado</Link> : <p className="mt-2 text-sm text-zinc-500">Aún no hay cliente convertido.</p>}</div>
        <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Evento</p>{relatedEventId ? <Link href={`/admin/events/${relatedEventId}`} className="mt-2 inline-flex text-sm font-semibold text-zinc-950 underline">Ver evento relacionado</Link> : <p className="mt-2 text-sm text-zinc-500">Aún no hay evento convertido.</p>}</div>
      </div>
    </div>

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="font-medium text-emerald-950">Presupuesto aceptado</p>
      <p className="mt-1 text-sm text-emerald-800">Crea o reutiliza el cliente, genera el evento base y deja el lead convertido. El contrato y pagos quedan para la siguiente fase.</p>
      {relatedEventId ? <Link href={`/admin/events/${relatedEventId}`}><Button className="mt-4"><CalendarCheck className="mr-2 h-4 w-4" />Ver evento</Button></Link> : <Button disabled={saving} className="mt-4" onClick={() => void convertToEvent()}><CalendarCheck className="mr-2 h-4 w-4" />{saving ? 'Creando evento...' : 'Crear evento'}</Button>}
    </div>

    <QuoteFormModal open={editOpen} quote={quote} salons={salons} leads={leads} packages={packages} saving={saving} onClose={() => setEditOpen(false)} onSubmit={save} />
    <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar presupuesto" description="Esta acción eliminará el presupuesto del listado, pero conservará el registro internamente."><div className="p-6"><footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void remove()}>{saving ? 'Eliminando...' : 'Eliminar'}</Button></footer></div></Modal>
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><dl className="mt-5 space-y-4">{children}</dl></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
