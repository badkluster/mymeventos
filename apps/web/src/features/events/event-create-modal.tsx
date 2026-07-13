'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cleanMenuSections, cleanStringList, MenuSectionsEditor, StringListEditor, type MenuSectionValue } from '@/components/admin/structured-list-editors';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { createDefaultResourcePlan } from '@/features/events/event-operations';
import type { Customer, Event, EventResourcePlan, EventTimelineItem, Quote, Salon } from '@/features/quotes/types';

type CreateResponse = { event?: Event; contractCreated?: boolean; contractError?: string };
type Props = { open: boolean; salons: Salon[]; onClose: () => void; onCreated: (eventId: string, message?: string) => void; onError: (message: string) => void };

const emptyForm = {
  sourceMode: 'direct',
  customerMode: 'new',
  quoteId: '',
  customerId: '',
  salonId: '',
  eventName: '',
  eventType: '',
  eventDate: '',
  startTime: '',
  endTime: '',
  guestCount: '',
  honoreeName: '',
  vegetarianCount: '',
  veganCount: '',
  celiacCount: '',
  lactoseIntolerantCount: '',
  tableLinenColor: '',
  customerFullName: '',
  customerPhone: '',
  customerEmail: '',
  customerDocumentNumber: '',
  customerAddress: '',
  customerOccupation: '',
  packageName: '',
  pricingMode: 'fixed',
  pricePerPerson: '',
  fixedPrice: '',
  finalAmount: '',
  depositAmount: '',
  paymentTerms: '',
  notes: '',
  createContract: false
};

function numberOrUndefined(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return '';
  const item = value as { fullName?: string; name?: string; quoteNumber?: string };
  return item.fullName || item.name || item.quoteNumber || '';
}

function cleanTimeline(items?: EventTimelineItem[]): EventTimelineItem[] {
  return (items ?? []).filter((item) => item.title.trim() || item.notes?.trim()).map((item) => ({ ...item, title: item.title.trim(), status: item.status || 'pending' }));
}

function defaultPlan(): EventResourcePlan {
  return createDefaultResourcePlan();
}

export function EventCreateModal({ open, salons, onClose, onCreated, onError }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [menuSections, setMenuSections] = useState<MenuSectionValue[]>([{ title: 'Menú', items: [] }]);
  const [services, setServices] = useState<string[]>([]);
  const [resourcePlan, setResourcePlan] = useState<EventResourcePlan>(() => defaultPlan());
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedQuote = useMemo(() => quotes.find((quote) => quote._id === form.quoteId), [form.quoteId, quotes]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get<{ items?: Customer[] }>('/customers?limit=100'),
      api.get<{ items?: Quote[] }>('/quotes?limit=100&sortBy=createdAt')
    ]).then(([customersResponse, quotesResponse]) => {
      setCustomers(customersResponse.items ?? []);
      setQuotes(quotesResponse.items ?? []);
    }).catch((error) => {
      onError(error instanceof Error ? error.message : 'No se pudieron cargar clientes y presupuestos.');
    }).finally(() => setLoadingOptions(false));
  }, [open, onError]);

  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const updateTimeline = (index: number, changes: Partial<EventTimelineItem>) => setResourcePlan((current) => {
    const items = current.timelineItems ?? [];
    return { ...current, timelineItems: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) };
  });
  const addTimelineItem = () => setResourcePlan((current) => ({ ...current, timelineItems: [...(current.timelineItems ?? []), { id: `${Date.now()}`, time: '', title: '', area: '', owner: '', status: 'pending', notes: '' }] }));
  const removeTimelineItem = (index: number) => setResourcePlan((current) => ({ ...current, timelineItems: (current.timelineItems ?? []).filter((_, itemIndex) => itemIndex !== index) }));

  const submit = async () => {
    setSaving(true);
    try {
      const plan = { ...resourcePlan, timelineItems: cleanTimeline(resourcePlan.timelineItems) };
      const guestCount = numberOrUndefined(form.guestCount);
      const pricePerPerson = numberOrUndefined(form.pricePerPerson);
      const fixedAmount = numberOrUndefined(form.finalAmount || form.fixedPrice);
      const directTotalAmount = form.pricingMode === 'per_person' && guestCount && pricePerPerson ? guestCount * pricePerPerson : fixedAmount;
      const payload = form.sourceMode === 'quote' ? {
        quoteId: form.quoteId,
        eventName: form.eventName || undefined,
        notes: form.notes || undefined,
        createContract: form.createContract,
        resourcePlanSnapshot: plan
      } : {
        salonId: form.salonId,
        customerId: form.customerMode === 'existing' ? form.customerId : undefined,
        customer: form.customerMode === 'new' ? {
          fullName: form.customerFullName,
          phone: form.customerPhone,
          email: form.customerEmail || undefined,
          documentNumber: form.customerDocumentNumber || undefined,
          address: form.customerAddress || undefined,
          occupation: form.customerOccupation || undefined
        } : undefined,
        eventName: form.eventName || undefined,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate || undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        guestCount,
        honoreeName: form.honoreeName || undefined,
        vegetarianCount: numberOrUndefined(form.vegetarianCount),
        veganCount: numberOrUndefined(form.veganCount),
        celiacCount: numberOrUndefined(form.celiacCount),
        lactoseIntolerantCount: numberOrUndefined(form.lactoseIntolerantCount),
        tableLinenColor: form.tableLinenColor || undefined,
        packageName: form.packageName || undefined,
        pricingMode: form.pricingMode,
        pricePerPerson,
        finalPricePerPerson: pricePerPerson,
        fixedPrice: form.pricingMode === 'fixed' ? directTotalAmount : undefined,
        finalFixedPrice: form.pricingMode === 'fixed' ? directTotalAmount : undefined,
        estimatedAmount: directTotalAmount,
        finalAmount: directTotalAmount,
        depositAmount: numberOrUndefined(form.depositAmount),
        paymentTerms: form.paymentTerms || undefined,
        menuSnapshot: cleanMenuSections(menuSections),
        servicesSnapshot: cleanStringList(services),
        resourcePlanSnapshot: plan,
        notes: form.notes || undefined,
        createContract: form.createContract
      };
      const response = await api.post<CreateResponse>('/events', payload);
      const eventId = response.event?._id;
      if (!eventId) throw new Error('El evento fue creado pero no se recibió el identificador.');
      const message = response.contractError ? `Evento creado. Contrato pendiente: ${response.contractError}` : response.contractCreated ? 'Evento y contrato creados correctamente.' : 'Evento creado correctamente.';
      onCreated(eventId, message);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo crear el evento.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = form.sourceMode === 'quote' ? Boolean(form.quoteId) : Boolean(form.salonId && (form.customerMode === 'existing' ? form.customerId : form.customerFullName) && (form.eventName || form.eventType));

  return <Modal open={open} title="Nuevo evento" description="Creá un evento directo o desde un presupuesto existente." onClose={onClose}>
    <div className="space-y-6 p-6">
      <div className="grid gap-2 rounded-xl bg-zinc-100 p-1 sm:grid-cols-2">
        <button type="button" onClick={() => set('sourceMode', 'direct')} className={`rounded-lg px-4 py-2 text-sm font-medium ${form.sourceMode === 'direct' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Evento directo</button>
        <button type="button" onClick={() => set('sourceMode', 'quote')} className={`rounded-lg px-4 py-2 text-sm font-medium ${form.sourceMode === 'quote' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Desde presupuesto</button>
      </div>

      {form.sourceMode === 'quote' ? <section className="space-y-4">
        <Field label="Presupuesto existente"><Select value={form.quoteId} disabled={loadingOptions} onChange={(event) => set('quoteId', event.target.value)}><option value="">Seleccionar presupuesto</option>{quotes.map((quote) => <option key={quote._id} value={quote._id}>{quote.quoteNumber} · {quote.contactName || entityName(quote.customerId) || 'Sin cliente'} · {entityName(quote.salonId)}</option>)}</Select></Field>
        {selectedQuote ? <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-3"><Info label="Cliente" value={selectedQuote.contactName || entityName(selectedQuote.customerId) || 'Sin cliente'} /><Info label="Evento" value={selectedQuote.eventType || 'Sin tipo'} /><Info label="Total" value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(selectedQuote.totalAmount ?? 0)} /></div> : null}
        <Field label="Nombre de evento opcional"><Input value={form.eventName} onChange={(event) => set('eventName', event.target.value)} placeholder="Si querés sobrescribir el nombre generado" /></Field>
      </section> : <section className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Salón"><Select value={form.salonId} onChange={(event) => set('salonId', event.target.value)}><option value="">Seleccionar salón</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></Field>
          <Field label="Cliente"><Select value={form.customerMode} onChange={(event) => set('customerMode', event.target.value)}><option value="new">Crear cliente nuevo</option><option value="existing">Usar cliente existente</option></Select></Field>
        </div>
        {form.customerMode === 'existing' ? <Field label="Cliente existente"><Select value={form.customerId} disabled={loadingOptions} onChange={(event) => set('customerId', event.target.value)}><option value="">Seleccionar cliente</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.fullName || customer.phone || customer.email}</option>)}</Select></Field> : <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo"><Input value={form.customerFullName} onChange={(event) => set('customerFullName', event.target.value)} /></Field>
          <Field label="Teléfono"><Input value={form.customerPhone} onChange={(event) => set('customerPhone', event.target.value)} /></Field>
          <Field label="Email"><Input value={form.customerEmail} onChange={(event) => set('customerEmail', event.target.value)} /></Field>
          <Field label="DNI / documento"><Input value={form.customerDocumentNumber} onChange={(event) => set('customerDocumentNumber', event.target.value)} /></Field>
          <Field label="Domicilio"><Input value={form.customerAddress} onChange={(event) => set('customerAddress', event.target.value)} /></Field>
          <Field label="Ocupación"><Input value={form.customerOccupation} onChange={(event) => set('customerOccupation', event.target.value)} /></Field>
        </div>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre del evento" className="md:col-span-2"><Input value={form.eventName} onChange={(event) => set('eventName', event.target.value)} /></Field>
          <Field label="Tipo"><Input value={form.eventType} onChange={(event) => set('eventType', event.target.value)} /></Field>
          <Field label="Homenajeado"><Input value={form.honoreeName} onChange={(event) => set('honoreeName', event.target.value)} /></Field>
          <Field label="Fecha"><Input type="date" value={form.eventDate} onChange={(event) => set('eventDate', event.target.value)} /></Field>
          <Field label="Inicio"><Input value={form.startTime} onChange={(event) => set('startTime', event.target.value)} placeholder="21:00" /></Field>
          <Field label="Fin"><Input value={form.endTime} onChange={(event) => set('endTime', event.target.value)} placeholder="05:00" /></Field>
          <Field label="Invitados"><Input type="number" min={1} value={form.guestCount} onChange={(event) => set('guestCount', event.target.value)} /></Field>
          <Field label="Vegetarianos"><Input type="number" min={0} value={form.vegetarianCount} onChange={(event) => set('vegetarianCount', event.target.value)} /></Field>
          <Field label="Veganos"><Input type="number" min={0} value={form.veganCount} onChange={(event) => set('veganCount', event.target.value)} /></Field>
          <Field label="Celíacos"><Input type="number" min={0} value={form.celiacCount} onChange={(event) => set('celiacCount', event.target.value)} /></Field>
          <Field label="Sin lactosa"><Input type="number" min={0} value={form.lactoseIntolerantCount} onChange={(event) => set('lactoseIntolerantCount', event.target.value)} /></Field>
          <Field label="Mantelería" className="md:col-span-2"><Input value={form.tableLinenColor} onChange={(event) => set('tableLinenColor', event.target.value)} /></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paquete / propuesta"><Input value={form.packageName} onChange={(event) => set('packageName', event.target.value)} placeholder="Ej: Personalizado infantil" /></Field>
          <Field label="Modalidad"><Select value={form.pricingMode} onChange={(event) => set('pricingMode', event.target.value)}><option value="fixed">Precio total</option><option value="per_person">Precio por persona</option></Select></Field>
          <Field label={form.pricingMode === 'fixed' ? 'Precio total' : 'Precio por persona'}><Input type="number" min={0} value={form.pricingMode === 'fixed' ? form.finalAmount : form.pricePerPerson} onChange={(event) => form.pricingMode === 'fixed' ? set('finalAmount', event.target.value) : set('pricePerPerson', event.target.value)} /></Field>
          <Field label="Seña"><Input type="number" min={0} value={form.depositAmount} onChange={(event) => set('depositAmount', event.target.value)} /></Field>
          <Field label="Condiciones de pago" className="md:col-span-2"><Textarea value={form.paymentTerms} onChange={(event) => set('paymentTerms', event.target.value)} /></Field>
        </div>
        <MenuSectionsEditor value={menuSections} onChange={setMenuSections} />
        <StringListEditor label="Servicios incluidos" values={services} onChange={setServices} />
      </section>}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-zinc-950">Cronograma inicial</h3><Button type="button" variant="secondary" onClick={addTimelineItem}><Plus className="mr-2 h-4 w-4" />Agregar ítem</Button></div>
        <div className="space-y-3">{(resourcePlan.timelineItems ?? []).map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[90px_minmax(0,1fr)_120px_120px_40px]">
          <Input aria-label="Horario" placeholder="21:00" value={item.time ?? ''} onChange={(event) => updateTimeline(index, { time: event.target.value })} />
          <Input aria-label="Actividad" value={item.title} onChange={(event) => updateTimeline(index, { title: event.target.value })} />
          <Input aria-label="Área" placeholder="Área" value={item.area ?? ''} onChange={(event) => updateTimeline(index, { area: event.target.value })} />
          <Input aria-label="Responsable" placeholder="Responsable" value={item.owner ?? ''} onChange={(event) => updateTimeline(index, { owner: event.target.value })} />
          <button type="button" aria-label="Quitar ítem" onClick={() => removeTimelineItem(index)} className="grid h-10 w-10 place-items-center rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          <Textarea aria-label="Notas" className="md:col-span-5" placeholder="Notas del cronograma" value={item.notes ?? ''} onChange={(event) => updateTimeline(index, { notes: event.target.value })} />
        </div>)}</div>
      </section>

      <Field label="Notas internas"><Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
      <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><input type="checkbox" className="mt-1" checked={form.createContract} onChange={(event) => set('createContract', event.target.checked)} /><span>Crear contrato al guardar si el evento tiene los datos mínimos. Si falta información, el evento se guarda y el contrato queda pendiente.</span></label>
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !canSubmit} onClick={() => void submit()}>{saving ? 'Creando...' : 'Crear evento'}</Button></div>
    </div>
  </Modal>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block space-y-1.5 ${className}`}><span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-1 font-medium text-zinc-800">{value}</p></div>;
}
