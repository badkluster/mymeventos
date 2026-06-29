'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, eventStatusLabels, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels, quoteStatusLabels } from '@/lib/display-labels';
import { Button, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import type { Contract, Event, Payment, PaymentSummary, Quote } from '@/features/quotes/types';

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha definida';

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; name?: string; quoteNumber?: string; firstName?: string; lastName?: string };
  return item.fullName || item.name || item.quoteNumber || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Sin datos';
}
function entityId(value: unknown) {
  return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [event, setEvent] = useState<Event>();
  const [contract, setContract] = useState<Contract>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const notice = (message: string, variant: 'success' | 'error' = 'success') => showToast({ message, variant });

  const load = async (eventId: string) => {
    setLoading(true);
    try {
      const [response, paymentsResponse] = await Promise.all([
        api.get<{ event: Event; contract?: Contract }>(`/events/${eventId}`),
        api.get<{ items: Payment[]; summary: PaymentSummary }>(`/events/${eventId}/payments`)
      ]);
      setEvent(response.event);
      setContract(response.contract);
      setPayments(paymentsResponse.items ?? []);
      setPaymentSummary(paymentsResponse.summary ?? { paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo cargar el evento.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  const updateStatus = async (status: string) => {
    if (!event) return;
    setSaving(true);
    try {
      await api.patch(`/events/${event._id}/status`, { status });
      await load(id);
      notice('Evento actualizado correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo actualizar el evento.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const patchEvent = async (payload: Record<string, unknown>) => {
    if (!event) return;
    setSaving(true);
    try {
      await api.patch(`/events/${event._id}`, payload);
      await load(id);
      notice('Evento actualizado correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo actualizar el evento.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const createContract = async () => {
    if (!event) return;
    setSaving(true);
    try {
      const response = await api.post<{ contract: Contract; created: boolean }>(`/events/${event._id}/create-contract`, {});
      await load(id);
      notice(response.created ? 'Contrato creado correctamente.' : 'El evento ya tenía un contrato activo.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo crear el contrato.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !event) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando evento...</div>;

  const quote = typeof event.sourceQuoteId === 'string' ? (typeof event.quoteId === 'string' ? undefined : event.quoteId as Quote | undefined) : event.sourceQuoteId as Quote | undefined;
  const lead = typeof event.sourceLeadId === 'string' ? undefined : event.sourceLeadId;
  const customerId = entityId(event.customerId);
  const commercial = event.commercialSnapshot ?? {};
  const checklist = event.contractReadyChecklist ?? {};
  const contractMissing = [
    !event.customerId && 'Cliente',
    !event.salonId && 'Salón',
    !event.eventDate && 'Fecha del evento',
    !(event.startTime && event.endTime) && !commercial.durationHours && 'Horario o duración',
    !event.guestCount && 'Cantidad de invitados',
    !(event.finalAmount ?? event.estimatedAmount ?? commercial.totalAmount) && 'Valor total',
    !(commercial.packageName || event.eventType || (event.servicesSnapshot ?? []).length) && 'Paquete, servicios o descripción comercial'
  ].filter(Boolean) as string[];
  const canCreateContract = contractMissing.length === 0;
  const menuText = (event.menuSnapshot ?? []).map((section) => `${section.title ?? 'Menú'}: ${(section.items ?? []).join(' | ')}`).join('\n');
  const servicesText = (event.servicesSnapshot ?? []).join('\n');

  return <section className="space-y-6 pb-8">
    <Link href="/admin/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Eventos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{event.eventName || event.eventType || 'Evento'}</h1><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{displayLabel(eventStatusLabels, event.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{entityName(event.customerId)} · {entityName(event.salonId)}</p></div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">Estado<Select value={event.status} disabled={saving} onChange={(change) => void updateStatus(change.target.value)} className="w-56 py-2">{Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      </div>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">{['resumen', 'cliente', 'comercial', 'menu', 'servicios', 'contrato', 'pagos', 'actividad'].map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium capitalize ${activeTab === tab ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>{tab === 'menu' ? 'Menú' : tab === 'contrato' ? 'Contrato pendiente' : tab}</button>)}</div>
    {activeTab === 'resumen' && <div className="grid gap-5 lg:grid-cols-3"><Card title="Evento"><Item label="Tipo" value={event.eventType || 'Sin especificar'} /><Item label="Fecha" value={formatDate(event.eventDate)} /><Item label="Horario" value={[event.startTime, event.endTime].filter(Boolean).join(' - ') || 'Sin horario'} /><Item label="Personas" value={event.guestCount || 'Sin definir'} /><Item label="Salón" value={entityName(event.salonId)} /></Card><article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Importe estimado</p><p className="mt-3 text-3xl font-semibold">{money(event.finalAmount ?? event.estimatedAmount)}</p><p className="mt-5 text-sm text-zinc-300">Pendiente de contrato y plan de pagos.</p></article><Card title="Notas"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{event.notes || 'Sin notas.'}</p></Card></div>}
    {activeTab === 'cliente' && <div className="grid gap-5 lg:grid-cols-2"><Card title="Cliente"><Item label="Nombre" value={entityName(event.customerId)} /><Item label="Lead origen" value={lead ? entityName(lead) : 'No informado'} /><div className="mt-4 flex flex-wrap gap-3">{customerId ? <Link href={`/admin/customers/${customerId}`} className="inline-flex text-sm font-medium text-zinc-950 underline">Ver cliente</Link> : null}{lead && typeof lead !== 'string' ? <Link href={`/admin/leads/${lead._id}`} className="inline-flex text-sm font-medium text-zinc-950 underline">Ver lead</Link> : null}</div></Card><Card title="Presupuestos relacionados"><Item label="Número" value={quote?.quoteNumber || 'No informado'} /><Item label="Estado" value={quote ? displayLabel(quoteStatusLabels, quote.status) : 'No informado'} /><Item label="Total" value={money(quote?.totalAmount ?? event.estimatedAmount)} />{quote?._id ? <Link href={`/admin/quotes/${quote._id}`} className="mt-4 inline-flex text-sm font-medium text-zinc-950 underline">Ver presupuesto</Link> : null}</Card></div>}
    {activeTab === 'comercial' && <Card title="Comercial"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Item label="Paquete" value={String(commercial.packageName ?? quote?.packageName ?? 'Personalizado')} /><Item label="Precio por persona" value={money(Number(commercial.pricePerPerson ?? quote?.pricePerPerson))} /><Item label="Descuento" value={`${commercial.discountPercentage ?? quote?.discountPercentage ?? 0}%`} /><Item label="Total" value={money(Number(commercial.totalAmount ?? event.finalAmount ?? event.estimatedAmount))} /><Item label="Seña sugerida" value={money(Number(commercial.depositAmount ?? quote?.depositAmount))} /><Item label="Saldo estimado" value={money(Number(commercial.balanceAmount ?? quote?.balanceAmount))} /><Item label="Condiciones de pago" value={String(commercial.paymentTerms ?? quote?.paymentTerms ?? 'No informadas')} /><Item label="Promoción/regalo" value={[commercial.promotionText, commercial.giftText].filter(Boolean).join(' · ') || 'No informado'} /></div></Card>}
    {activeTab === 'menu' && <SnapshotEditor key={menuText} title="Menú" initialValue={menuText} saving={saving} onSave={(value) => patchEvent({ menuSnapshot: value.split('\n').map((line) => { const [title, ...items] = line.split(':'); return { title: title.trim() || 'Menú', items: items.join(':').split('|').map((item) => item.trim()).filter(Boolean) }; }).filter((section) => section.items.length) })} />}
    {activeTab === 'servicios' && <SnapshotEditor key={servicesText} title="Servicios incluidos" initialValue={servicesText} saving={saving} onSave={(value) => patchEvent({ servicesSnapshot: value.split('\n').map((item) => item.trim()).filter(Boolean) })} />}
    {activeTab === 'contrato' && <div className="space-y-5">{contract ? <Card title="Contrato generado"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-50 px-4 py-4"><div><p className="font-semibold text-emerald-950">{contract.contractNumber}</p><p className="mt-1 text-sm text-emerald-700">Estado: {contract.status} · Total contractual: {money(contract.totalAmount)}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/contracts/${contract._id}`}><Button><FileText className="mr-2 h-4 w-4" />Ver contrato</Button></Link><Link href={`/admin/contracts/${contract._id}?tab=adendas`}><Button variant="secondary">Ver adendas</Button></Link><Link href={`/admin/contracts/${contract._id}/print`}><Button variant="secondary"><Printer className="mr-2 h-4 w-4" />Imprimir</Button></Link></div></div></Card> : null}<Card title="Checklist para contrato"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries({ customerComplete: 'Cliente completo', document: 'DNI/documento', address: 'Domicilio', salonDefined: 'Salón definido', dateDefined: 'Fecha definida', timeDefined: 'Horario definido', guestCount: 'Cantidad de invitados', totalPrice: 'Precio total', deposit: 'Seña', paymentTerms: 'Condiciones de pago', menu: 'Menú', includedServices: 'Servicios incluidos' }).map(([key, label]) => <span key={key} className={`rounded-xl px-3 py-2 text-sm font-medium ${checklist[key] ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{label}: {checklist[key] ? 'OK' : 'Pendiente'}</span>)}</div>{contract ? <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">Este evento ya tiene contrato activo.</p> : canCreateContract ? <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-4"><p className="text-sm text-emerald-700">El evento tiene los datos mínimos para generar contrato.</p><Button disabled={saving} className="mt-4" onClick={() => void createContract()}><FileText className="mr-2 h-4 w-4" />{saving ? 'Creando contrato...' : 'Crear contrato'}</Button></div> : <div className="mt-5 rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-800"><p className="font-medium">Faltan datos para generar contrato:</p><ul className="mt-2 list-disc pl-5">{contractMissing.map((item) => <li key={item}>{item}</li>)}</ul></div>}</Card></div>}
    {activeTab === 'pagos' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-4"><Card title="Cobrado"><Item label="Impacta saldo" value={money(paymentSummary.paidAmount)} /></Card><Card title="Pendiente"><Item label="Programado" value={money(paymentSummary.pendingAmount)} /></Card><Card title="Vencido"><Item label="Importe vencido" value={money(paymentSummary.overdueAmount)} /></Card><Card title="Garantía"><Item label="Recibida" value={money(paymentSummary.securityDepositAmount)} /></Card></div><Card title="Pagos del evento">{payments.length ? <div className="overflow-x-auto"><table className="min-w-[840px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Tipo</th><th>Estado</th><th>Medio</th><th>Importe</th><th>Fecha</th><th>Contrato</th></tr></thead><tbody className="divide-y divide-zinc-100">{payments.map((payment) => <tr key={payment._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/payments/${payment._id}`}>{payment.paymentNumber}</Link></td><td>{displayLabel(paymentTypeLabels, payment.type)}</td><td>{displayLabel(paymentStatusLabels, payment.status)}</td><td>{payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'No informado'}</td><td>{money(payment.amount)}</td><td>{formatDate(payment.paidAt ?? payment.dueDate)}</td><td>{contract?._id ? <Link className="font-medium text-zinc-950 underline" href={`/admin/contracts/${contract._id}?tab=pagos`}>{contract.contractNumber}</Link> : 'Sin contrato'}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">No hay pagos registrados para este evento.</p>}</Card></div>}
    {activeTab === 'actividad' && <Card title="Actividad"><p className="text-sm text-zinc-500">Actividad específica de eventos pendiente de modelo dedicado. Los cambios importantes quedan auditados en el sistema.</p></Card>}
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-4">{children}</div></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
function SnapshotEditor({ title, initialValue, saving, onSave }: { title: string; initialValue: string; saving: boolean; onSave: (value: string) => void }) { const [value, setValue] = useState(initialValue); return <Card title={title}><Textarea value={value} onChange={(event) => setValue(event.target.value)} className="min-h-64" /><div className="flex justify-end"><Button disabled={saving} onClick={() => onSave(value)}>{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div><p className="text-sm text-zinc-500">Estos cambios modifican sólo la ficha del evento; no alteran el presupuesto ni la plantilla original.</p></Card>; }
