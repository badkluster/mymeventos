'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, Mail, MessageCircle, Pencil, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { activityTypeLabels, displayLabel, eventStatusLabels, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels, quoteRequestStatusLabels, quoteStatusLabels } from '@/lib/display-labels';
import { Button, Input, Modal, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { contractStatusLabels } from '@/lib/display-labels';
import type { Contract, Customer, Event, Payment, PaymentSummary, Quote, QuoteRequest } from '@/features/quotes/types';

type Activity = { _id: string; type: string; title: string; description?: string; createdAt: string };
type DetailResponse = { customer: Customer; quotes: Quote[]; events: Event[]; quoteRequests: QuoteRequest[]; contracts?: Contract[]; payments?: Payment[]; paymentSummary?: PaymentSummary; activities: Activity[] };

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: unknown) => typeof value === 'string' ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
const customerName = (customer?: Customer) => customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Cliente sin nombre';
const salonName = (value: unknown) => !value || typeof value === 'string' ? 'Sin salón' : (value as { name?: string }).name ?? 'Sin salón';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [data, setData] = useState<DetailResponse>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', email: '', documentNumber: '', address: '', occupation: '', birthDate: '', notes: '' });
  const notice = (message: string) => message && showToast({ message, variant: 'error' });

  const load = async (customerId: string) => {
    setLoading(true);
    try {
      setData(await api.get<DetailResponse>(`/customers/${customerId}`));
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo cargar el cliente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  if (loading || !data) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando cliente...</div>;
  const { customer, quotes, events, quoteRequests, activities } = data;
  const contracts = data.contracts ?? [];
  const payments = data.payments ?? [];
  const summary = data.paymentSummary ?? { paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 };
  const totalContracted = contracts.reduce((sum, contract) => sum + Number(contract.totalAmount ?? 0), 0);
  const totalBalance = contracts.reduce((sum, contract) => sum + Number(contract.balanceAmount ?? 0), 0);

  const openWhatsApp = () => {
    if (!customer.phone) return notice('El cliente no tiene teléfono.');
    window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  };
  const openEdit = () => { setEditForm({ fullName: customerName(customer), phone: customer.phone ?? '', email: customer.email ?? '', documentNumber: customer.documentNumber ?? '', address: customer.address ?? '', occupation: customer.occupation ?? '', birthDate: customer.birthDate ? customer.birthDate.slice(0, 10) : '', notes: customer.notes ?? '' }); setEditOpen(true); };
  const saveCustomer = async () => { setSaving(true); try { await api.patch(`/customers/${id}`, editForm); setEditOpen(false); await load(id); showToast({ message: 'Datos contractuales del cliente actualizados.', variant: 'success' }); } catch (error) { notice(error instanceof Error ? error.message : 'No se pudo actualizar el cliente.'); } finally { setSaving(false); } };

  return <section className="space-y-6 pb-8">
    <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Clientes</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{customerName(customer)}</h1><p className="mt-2 text-sm text-zinc-500">{customer.phone || 'Sin teléfono'} · {customer.email || 'Sin email'}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Editar datos</Button><Button variant="secondary" onClick={openWhatsApp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>{customer.email ? <a href={`mailto:${customer.email}`}><Button variant="secondary"><Mail className="mr-2 h-4 w-4" />Email</Button></a> : null}<Link href={`/admin/quotes?customerId=${id}`}><Button><ReceiptText className="mr-2 h-4 w-4" />Crear presupuesto</Button></Link></div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Datos principales"><Item label="Nombre" value={customerName(customer)} /><Item label="Documento" value={customer.documentNumber || 'Pendiente para contrato'} /><Item label="Domicilio" value={customer.address || 'Pendiente para contrato'} /><Item label="Ocupación" value={customer.occupation || 'No informada'} /><Item label="Teléfono" value={customer.phone || 'No informado'} /><Item label="Email" value={customer.email || 'No informado'} /><Item label="Fecha de alta" value={formatDate(customer.createdAt)} /></Card>
      <Card title="Origen"><Item label="Lead de origen" value={typeof customer.sourceLeadId === 'string' ? customer.sourceLeadId : customer.sourceLeadId?.fullName || 'No informado'} />{customer.sourceLeadId && typeof customer.sourceLeadId !== 'string' ? <Link href={`/admin/leads/${customer.sourceLeadId._id}`} className="mt-4 inline-flex text-sm font-medium text-zinc-950 underline">Ver lead de origen</Link> : null}</Card>
      <article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Historial comercial</p><p className="mt-4 text-3xl font-semibold">{quotes.length} presupuestos</p><p className="mt-2 text-sm text-zinc-300">{events.length} eventos asociados</p></article>
    </div>
    <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Datos del cliente" description="Estos datos se copiarán al contrato cuando se genere desde el evento."><div className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Nombre completo<Input value={editForm.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Documento / DNI<Input value={editForm.documentNumber} onChange={(event) => setEditForm((current) => ({ ...current, documentNumber: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Ocupación<Input value={editForm.occupation} onChange={(event) => setEditForm((current) => ({ ...current, occupation: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Fecha de nacimiento<Input type="date" value={editForm.birthDate} onChange={(event) => setEditForm((current) => ({ ...current, birthDate: event.target.value }))} className="mt-1.5" /><span className="mt-1 block text-xs font-normal text-zinc-400">Opcional — habilita el saludo automático de cumpleaños.</span></label><label className="text-sm font-medium text-zinc-700">Teléfono<Input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Email<Input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Domicilio<Input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Notas<Textarea value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1.5" /></label><footer className="flex justify-end gap-2 sm:col-span-2"><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void saveCustomer()}>{saving ? 'Guardando…' : 'Guardar datos'}</Button></footer></div></Modal>

    <div className="grid gap-5 lg:grid-cols-4">
      <Card title="Contratado"><Item label="Total contratado" value={money(totalContracted)} /><Item label="Saldo pendiente" value={money(totalBalance)} /></Card>
      <Card title="Cobrado"><Item label="Impacta saldo" value={money(summary.paidAmount)} /></Card>
      <Card title="Pendiente"><Item label="Programado" value={money(summary.pendingAmount)} /></Card>
      <Card title="Garantía"><Item label="Depósito recibido" value={money(summary.securityDepositAmount)} /></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Presupuestos del cliente">{quotes.length === 0 ? <Empty text="No hay presupuestos asociados." /> : <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Fecha</th><th>Salón</th><th>Paquete</th><th>Total</th><th>Estado</th></tr></thead><tbody className="divide-y divide-zinc-100">{quotes.map((quote) => <tr key={quote._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/quotes/${quote._id}`}>{quote.quoteNumber}</Link></td><td>{formatDate(quote.createdAt)}</td><td>{salonName(quote.salonId)}</td><td>{quote.packageName || 'Personalizado'}</td><td>{money(quote.totalAmount)}</td><td>{displayLabel(quoteStatusLabels, quote.status)}</td></tr>)}</tbody></table></div>}</Card>
      <Card title="Eventos del cliente">{events.length === 0 ? <Empty text="No hay eventos asociados." /> : <div className="space-y-3">{events.map((event) => <Link key={event._id} href={`/admin/events/${event._id}`} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 transition hover:bg-zinc-100"><span><b className="text-zinc-900">{event.eventName || event.eventType || 'Evento'}</b><span className="mt-1 block text-sm text-zinc-500">{formatDate(event.eventDate)} · {salonName(event.salonId)}</span></span><span className="text-sm text-zinc-600">{displayLabel(eventStatusLabels, event.status)}</span></Link>)}</div>}</Card>
    </div>

    <Card title="Contratos del cliente">{contracts.length === 0 ? <Empty text="No hay contratos asociados." /> : <div className="space-y-3">{contracts.map((contract) => <Link key={contract._id} href={`/admin/contracts/${contract._id}`} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 transition hover:bg-zinc-100"><span><b className="text-zinc-900">{contract.contractNumber}</b><span className="mt-1 block text-sm text-zinc-500">{formatDate(contract.eventSnapshot?.eventDate)} · {salonName(contract.salonId)}</span></span><span className="text-sm text-zinc-600">{displayLabel(contractStatusLabels, contract.status)}</span></Link>)}</div>}</Card>

    <Card title="Historial financiero">{payments.length === 0 ? <Empty text="No hay pagos registrados para este cliente." /> : <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Evento</th><th>Contrato</th><th>Tipo</th><th>Estado</th><th>Medio</th><th>Importe</th><th>Fecha</th></tr></thead><tbody className="divide-y divide-zinc-100">{payments.map((payment) => <tr key={payment._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/payments/${payment._id}`}>{payment.paymentNumber}</Link></td><td>{typeof payment.eventId === 'string' ? payment.eventId : payment.eventId?.eventName || payment.eventId?.eventType || 'Evento'}</td><td>{!payment.contractId ? 'Sin contrato' : typeof payment.contractId === 'string' ? payment.contractId : <Link className="font-medium text-zinc-950 underline" href={`/admin/contracts/${payment.contractId._id}?tab=pagos`}>{payment.contractId.contractNumber}</Link>}</td><td>{displayLabel(paymentTypeLabels, payment.type)}</td><td>{displayLabel(paymentStatusLabels, payment.status)}</td><td>{payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'No informado'}</td><td>{money(payment.amount)}</td><td>{formatDate(payment.paidAt ?? payment.dueDate)}</td></tr>)}</tbody></table></div>}</Card>

    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Solicitudes asociadas">{quoteRequests.length === 0 ? <Empty text="No hay solicitudes asociadas." /> : <div className="space-y-3">{quoteRequests.map((item) => <Link key={item._id} href={`/admin/quotes/requests/${item._id}`} className="block rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 transition hover:bg-zinc-100"><p className="font-medium text-zinc-900">{formatDate(item.createdAt)} · {displayLabel(quoteRequestStatusLabels, item.status)}</p><p className="mt-1 text-sm text-zinc-500">{item.eventType || 'Sin tipo de evento'}</p></Link>)}</div>}</Card>
      <Card title="Actividad">{activities.length === 0 ? <Empty text="Todavía no hay actividad registrada." /> : <div className="space-y-4">{activities.map((activity) => <div key={activity._id} className="relative border-l-2 border-zinc-200 pl-5 pb-1 before:absolute before:-left-[5px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-zinc-950"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-zinc-900">{displayLabel(activityTypeLabels, activity.type)}</p><time className="text-xs text-zinc-400">{formatDate(activity.createdAt)}</time></div><p className="mt-1 text-sm leading-6 text-zinc-600">{activity.description || activity.title}</p></div>)}</div>}</Card>
    </div>
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-4">{children}</div></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">{text}</p>; }
