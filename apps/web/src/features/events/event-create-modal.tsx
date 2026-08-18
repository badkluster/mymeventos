'use client';

import { useEffect, useMemo, useState } from 'react';
import { PackageCheck, PencilLine } from 'lucide-react';
import { cleanMenuSections, cleanStringList, MenuSectionsEditor, StringListEditor, type MenuSectionValue } from '@/components/admin/structured-list-editors';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { createDefaultResourcePlan } from '@/features/events/event-operations';
import type { Customer, Event, PackageTemplate, Quote, Salon } from '@/features/quotes/types';

type CreateResponse = { event?: Event; contractCreated?: boolean; contractError?: string };
export type EventCreateDefaults = { salonId?: string; eventDate?: string; startTime?: string; endTime?: string };
type Props = { open: boolean; salons: Salon[]; initialValues?: EventCreateDefaults; onClose: () => void; onCreated: (eventId: string, message?: string) => void; onError: (message: string) => void };

const emptyForm = {
  sourceMode: 'direct',
  customerMode: 'new',
  quoteId: '',
  customerId: '',
  salonId: '',
  packageTemplateId: '',
  eventName: '',
  eventType: '',
  eventDate: '',
  startTime: '',
  endTime: '',
  guestCount: '',
  honoreeName: '',
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

type ApplicablePackage = PackageTemplate & { packageTemplateId?: string; packageName?: string; active?: boolean; notes?: string };
type TimeErrors = { startTime?: string; endTime?: string };

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validateTimes(startTime: string, endTime: string): TimeErrors {
  const errors: TimeErrors = {};
  if (!startTime) errors.startTime = 'Ingresá el horario de inicio.';
  else if (!timePattern.test(startTime)) errors.startTime = 'Usá un horario válido en formato HH:mm.';
  if (!endTime) errors.endTime = 'Ingresá el horario de fin.';
  else if (!timePattern.test(endTime)) errors.endTime = 'Usá un horario válido en formato HH:mm.';
  if (!errors.startTime && !errors.endTime && startTime === endTime) errors.endTime = 'El horario de fin debe ser distinto del inicio.';
  return errors;
}

function crossesMidnight(startTime: string, endTime: string) {
  return timePattern.test(startTime) && timePattern.test(endTime) && endTime < startTime;
}

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

export function EventCreateModal({ open, salons, initialValues, onClose, onCreated, onError }: Props) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initialValues }));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [packages, setPackages] = useState<ApplicablePackage[]>([]);
  const [packagesSalonId, setPackagesSalonId] = useState('');
  const [packageMode, setPackageMode] = useState<'manual' | 'package'>('manual');
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState('');
  const [menuSections, setMenuSections] = useState<MenuSectionValue[]>([{ title: 'Menú', items: [] }]);
  const [services, setServices] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touchedTimes, setTouchedTimes] = useState({ startTime: false, endTime: false });
  const selectedQuote = useMemo(() => quotes.find((quote) => quote._id === form.quoteId), [form.quoteId, quotes]);
  const availablePackages = useMemo(() => packagesSalonId === form.salonId ? packages : [], [form.salonId, packages, packagesSalonId]);
  const selectedPackage = useMemo(() => availablePackages.find((item) => item._id === form.packageTemplateId), [availablePackages, form.packageTemplateId]);
  const timeErrors = useMemo(() => validateTimes(form.startTime, form.endTime), [form.endTime, form.startTime]);
  const validTimes = !timeErrors.startTime && !timeErrors.endTime;

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

  useEffect(() => {
    if (!open || !form.salonId || form.sourceMode !== 'direct') {
      return;
    }
    let cancelled = false;
    const salonId = form.salonId;
    void Promise.resolve().then(async () => {
      setLoadingPackages(true);
      setPackagesError('');
      try {
        const response = await api.get<{ packageRules?: ApplicablePackage[] }>(`/salons/${salonId}/package-rules`);
        if (cancelled) return;
        setPackages((response.packageRules ?? []).filter((item) => item.active !== false).map((item) => ({ ...item, _id: item.packageTemplateId || item._id, name: item.packageName || item.name })));
        setPackagesSalonId(salonId);
      } catch (error) {
        if (!cancelled) setPackagesError(error instanceof Error ? error.message : 'No se pudieron cargar los paquetes del salón.');
      } finally {
        if (!cancelled) setLoadingPackages(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, form.salonId, form.sourceMode]);

  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const selectSalon = (salonId: string) => {
    setForm((current) => ({ ...current, salonId, packageTemplateId: '', packageName: '' }));
    setPackageMode('manual');
  };
  const chooseManualLoad = () => {
    setPackageMode('manual');
    setForm((current) => ({ ...current, packageTemplateId: '', packageName: '' }));
  };
  const applyPackage = (packageId: string) => {
    const selected = availablePackages.find((item) => item._id === packageId);
    if (!selected) return;
    const pricingMode = selected.pricingMode ?? 'fixed';
    const pricePerPerson = selected.finalPricePerPerson ?? selected.pricePerPerson;
    const fixedPrice = selected.finalFixedPrice ?? selected.fixedPrice;
    setForm((current) => ({
      ...current,
      packageTemplateId: selected._id,
      packageName: selected.name,
      pricingMode,
      startTime: initialValues?.startTime ?? selected.startTime ?? current.startTime,
      endTime: initialValues?.endTime ?? selected.endTime ?? current.endTime,
      pricePerPerson: pricePerPerson === undefined ? '' : String(pricePerPerson),
      finalAmount: fixedPrice === undefined ? '' : String(fixedPrice),
      depositAmount: selected.depositAmount === undefined ? '' : String(selected.depositAmount),
      paymentTerms: selected.paymentTerms ?? current.paymentTerms
    }));
    setMenuSections((selected.menuSections ?? []).map((section) => ({ title: section.title ?? section.name ?? 'Menú', items: section.items ?? [] })));
    setServices(selected.includedServices ?? []);
  };
  const submit = async () => {
    setTouchedTimes({ startTime: true, endTime: true });
    if (form.sourceMode === 'direct' && !validTimes) return;
    setSaving(true);
    try {
      const plan = createDefaultResourcePlan();
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
        packageTemplateId: form.packageTemplateId || undefined,
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

  const directPrice = form.pricingMode === 'per_person' ? numberOrUndefined(form.pricePerPerson) : numberOrUndefined(form.finalAmount || form.fixedPrice);
  const quoteMissing = selectedQuote ? [
    !selectedQuote.eventType && 'tipo de evento',
    !selectedQuote.eventDate && 'fecha',
    !selectedQuote.startTime && 'horario de inicio',
    !selectedQuote.endTime && 'horario de fin',
    !selectedQuote.guestCount && 'cantidad de invitados'
  ].filter(Boolean) as string[] : [];
  const canSubmit = form.sourceMode === 'quote'
    ? Boolean(form.quoteId && selectedQuote && !quoteMissing.length)
    : Boolean(
      form.salonId
      && (form.customerMode === 'existing' ? form.customerId : form.customerFullName.trim())
      && form.eventType.trim()
      && form.eventDate
      && form.startTime
      && form.endTime
      && numberOrUndefined(form.guestCount)
      && (form.packageTemplateId || form.packageName.trim())
      && directPrice
      && validTimes
    );

  return <Modal open={open} title="Nuevo evento" description="Creá un evento directo o desde un presupuesto existente." onClose={onClose}>
    <div className="space-y-6 p-6">
      <p className="text-sm text-zinc-600">Los campos marcados con <span className="font-semibold text-red-600" aria-hidden="true">*</span> son necesarios para generar el contrato.</p>
      <div className="grid gap-2 rounded-xl bg-zinc-100 p-1 sm:grid-cols-2">
        <button type="button" onClick={() => set('sourceMode', 'direct')} className={`rounded-lg px-4 py-2 text-sm font-medium ${form.sourceMode === 'direct' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Evento directo</button>
        <button type="button" onClick={() => set('sourceMode', 'quote')} className={`rounded-lg px-4 py-2 text-sm font-medium ${form.sourceMode === 'quote' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>Desde presupuesto</button>
      </div>

      {form.sourceMode === 'quote' ? <section className="space-y-4">
        <Field label="Presupuesto existente" required><Select value={form.quoteId} disabled={loadingOptions} onChange={(event) => set('quoteId', event.target.value)}><option value="">Seleccionar presupuesto</option>{quotes.map((quote) => <option key={quote._id} value={quote._id}>{quote.quoteNumber} · {quote.contactName || entityName(quote.customerId) || 'Sin cliente'} · {entityName(quote.salonId)}</option>)}</Select></Field>
        {selectedQuote ? <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-3"><Info label="Cliente" value={selectedQuote.contactName || entityName(selectedQuote.customerId) || 'Sin cliente'} /><Info label="Evento" value={selectedQuote.eventType || 'Sin tipo'} /><Info label="Total" value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(selectedQuote.totalAmount ?? 0)} />{quoteMissing.length ? <p className="text-red-700 sm:col-span-3" role="alert">Completá {quoteMissing.join(', ')} en el presupuesto antes de crear el evento.</p> : null}</div> : null}
        <Field label="Nombre de evento opcional"><Input value={form.eventName} onChange={(event) => set('eventName', event.target.value)} placeholder="Si querés sobrescribir el nombre generado" /></Field>
      </section> : <section className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Salón" required><Select value={form.salonId} onChange={(event) => selectSalon(event.target.value)}><option value="">Seleccionar salón</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></Field>
          <Field label="Cliente" required><Select value={form.customerMode} onChange={(event) => set('customerMode', event.target.value)}><option value="new">Crear cliente nuevo</option><option value="existing">Usar cliente existente</option></Select></Field>
        </div>
        {form.salonId ? <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div><h3 className="text-sm font-semibold text-zinc-950">¿Cómo querés iniciar la carga?</h3><p className="mt-1 text-sm text-foreground/75">Elegí un paquete disponible para este salón y revisá sus datos, o completá el evento de forma manual.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setPackageMode('package')} className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-900/20 ${packageMode === 'package' ? 'border-zinc-950 bg-white shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}><span className="flex items-center gap-2 font-medium text-zinc-950"><PackageCheck className="h-4 w-4" />Usar un paquete</span><span className="mt-1 block text-sm text-foreground/75">Precarga valores, menú, servicios y condiciones.</span></button>
            <button type="button" onClick={chooseManualLoad} className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-900/20 ${packageMode === 'manual' ? 'border-zinc-950 bg-white shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}><span className="flex items-center gap-2 font-medium text-zinc-950"><PencilLine className="h-4 w-4" />Carga manual</span><span className="mt-1 block text-sm text-foreground/75">Cargá cada dato a medida, como hasta ahora.</span></button>
          </div>
          {packageMode === 'package' ? <div className="space-y-2"><Field label="Paquete disponible"><Select value={form.packageTemplateId} disabled={loadingPackages || !availablePackages.length} onChange={(event) => applyPackage(event.target.value)}><option value="">{loadingPackages ? 'Cargando paquetes...' : availablePackages.length ? 'Seleccionar paquete' : 'No hay paquetes disponibles'}</option>{availablePackages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>{packagesError ? <p className="text-sm text-red-700">No se pudieron cargar los paquetes: {packagesError}. Podés continuar con la carga manual.</p> : null}{!loadingPackages && !packagesError && !availablePackages.length ? <p className="text-sm text-foreground/75">Este salón no tiene paquetes activos. Podés continuar con la carga manual.</p> : null}{selectedPackage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><span className="font-medium">{selectedPackage.name}</span> aplicado. Podés ajustar los campos antes de crear el evento.</p> : null}</div> : null}
        </section> : null}
        {form.customerMode === 'existing' ? <Field label="Cliente existente" required><Select value={form.customerId} disabled={loadingOptions} onChange={(event) => set('customerId', event.target.value)}><option value="">Seleccionar cliente</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.fullName || customer.phone || customer.email}</option>)}</Select></Field> : <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo" required><Input value={form.customerFullName} onChange={(event) => set('customerFullName', event.target.value)} /></Field>
          <Field label="Teléfono"><Input value={form.customerPhone} onChange={(event) => set('customerPhone', event.target.value)} /></Field>
          <Field label="Email"><Input value={form.customerEmail} onChange={(event) => set('customerEmail', event.target.value)} /></Field>
          <Field label="DNI / documento"><Input value={form.customerDocumentNumber} onChange={(event) => set('customerDocumentNumber', event.target.value)} /></Field>
          <Field label="Domicilio"><Input value={form.customerAddress} onChange={(event) => set('customerAddress', event.target.value)} /></Field>
          <Field label="Ocupación"><Input value={form.customerOccupation} onChange={(event) => set('customerOccupation', event.target.value)} /></Field>
        </div>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre del evento" className="md:col-span-2"><Input value={form.eventName} onChange={(event) => set('eventName', event.target.value)} /></Field>
          <Field label="Tipo de evento" required><Input value={form.eventType} onChange={(event) => set('eventType', event.target.value)} placeholder="Ej.: Casamiento, cumpleaños de 15" /></Field>
          <Field label="Homenajeado"><Input value={form.honoreeName} onChange={(event) => set('honoreeName', event.target.value)} /></Field>
          <Field label="Fecha" required><Input type="date" value={form.eventDate} onChange={(event) => set('eventDate', event.target.value)} /></Field>
          <Field label="Inicio" required error={touchedTimes.startTime ? timeErrors.startTime : undefined}><Input id="event-start-time" type="time" step={60} required value={form.startTime} onBlur={() => setTouchedTimes((current) => ({ ...current, startTime: true }))} onChange={(event) => set('startTime', event.target.value)} aria-invalid={Boolean(touchedTimes.startTime && timeErrors.startTime)} aria-describedby={touchedTimes.startTime && timeErrors.startTime ? 'event-start-time-error' : undefined} className={touchedTimes.startTime && timeErrors.startTime ? 'border-red-500 focus:border-red-600 focus:ring-red-600/10' : ''} /></Field>
          <Field label="Fin" required error={touchedTimes.endTime ? timeErrors.endTime : undefined} hint={!timeErrors.endTime && crossesMidnight(form.startTime, form.endTime) ? 'Finaliza al día siguiente.' : undefined}><Input id="event-end-time" type="time" step={60} required value={form.endTime} onBlur={() => setTouchedTimes((current) => ({ ...current, endTime: true }))} onChange={(event) => set('endTime', event.target.value)} aria-invalid={Boolean(touchedTimes.endTime && timeErrors.endTime)} aria-describedby={touchedTimes.endTime && timeErrors.endTime ? 'event-end-time-error' : crossesMidnight(form.startTime, form.endTime) ? 'event-end-time-hint' : undefined} className={touchedTimes.endTime && timeErrors.endTime ? 'border-red-500 focus:border-red-600 focus:ring-red-600/10' : ''} /></Field>
          <Field label="Invitados" required><Input type="number" min={1} value={form.guestCount} onChange={(event) => set('guestCount', event.target.value)} /></Field>
          <Field label="Mantelería" className="md:col-span-2"><Input value={form.tableLinenColor} onChange={(event) => set('tableLinenColor', event.target.value)} /></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paquete / propuesta" required><Input value={form.packageName} onChange={(event) => set('packageName', event.target.value)} placeholder="Ej: Personalizado infantil" /></Field>
          <Field label="Modalidad"><Select value={form.pricingMode} onChange={(event) => set('pricingMode', event.target.value)}><option value="fixed">Precio total</option><option value="per_person">Precio por persona</option></Select></Field>
          <Field label={form.pricingMode === 'fixed' ? 'Precio total' : 'Precio por persona'} required><Input type="number" min={0} value={form.pricingMode === 'fixed' ? form.finalAmount : form.pricePerPerson} onChange={(event) => form.pricingMode === 'fixed' ? set('finalAmount', event.target.value) : set('pricePerPerson', event.target.value)} /></Field>
          <Field label="Seña"><Input type="number" min={0} value={form.depositAmount} onChange={(event) => set('depositAmount', event.target.value)} /></Field>
          <Field label="Condiciones de pago" className="md:col-span-2"><Textarea value={form.paymentTerms} onChange={(event) => set('paymentTerms', event.target.value)} /></Field>
        </div>
        <MenuSectionsEditor value={menuSections} onChange={setMenuSections} />
        <StringListEditor label="Servicios incluidos" values={services} onChange={setServices} />
      </section>}

      <Field label="Notas internas"><Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
      <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><input type="checkbox" className="mt-1" checked={form.createContract} onChange={(event) => set('createContract', event.target.checked)} /><span>Crear contrato al guardar si el evento tiene los datos mínimos. Si falta información, el evento se guarda y el contrato queda pendiente.</span></label>
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !canSubmit} onClick={() => void submit()}>{saving ? 'Creando...' : 'Crear evento'}</Button></div>
    </div>
  </Modal>;
}

function Field({ label, children, className = '', required = false, error, hint }: { label: string; children: React.ReactNode; className?: string; required?: boolean; error?: string; hint?: string }) {
  const fieldId = label === 'Inicio' ? 'event-start-time' : label === 'Fin' ? 'event-end-time' : undefined;
  return <label htmlFor={fieldId} className={`block space-y-1.5 ${className}`}><span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}{required ? <span className="ml-1 text-red-600" aria-label="obligatorio">*</span> : null}</span>{children}{error ? <span id={`${fieldId}-error`} className="block text-xs font-medium text-red-700" role="alert">{error}</span> : hint ? <span id={`${fieldId}-hint`} className="block text-xs text-zinc-500">{hint}</span> : null}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-1 font-medium text-zinc-800">{value}</p></div>;
}
