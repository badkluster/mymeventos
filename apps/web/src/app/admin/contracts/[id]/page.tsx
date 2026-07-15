'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronLeft, CreditCard, Download, Eye, Mail, MessageCircle, Plus, RefreshCw, RotateCcw, Save, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { contractAddendumStatusLabels, contractStatusLabels, displayLabel, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from '@/lib/display-labels';
import { Button, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import type { Contract, ContractAddendum, Payment, PaymentSummary } from '@/features/quotes/types';
        //

const money = (value?: unknown) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const formatDate = (value?: unknown) => typeof value === 'string' ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha';
const text = (value: unknown, fallback = 'No informado') => typeof value === 'string' && value.trim() ? value : fallback;
const statusTone: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-700', pending_approval: 'bg-amber-50 text-amber-800', approved: 'bg-emerald-50 text-emerald-700', requires_changes: 'bg-sky-50 text-sky-700', cancelled: 'bg-rose-50 text-rose-700', superseded: 'bg-zinc-100 text-zinc-500' };

function entityId(value: unknown) { return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? ''; }
const emptyAddendum = { title: '', description: '', itemName: '', itemType: 'extra_service', quantity: 1, unitPrice: 0, discountAmount: 0 };
const emptyPayment = { type: 'deposit', method: 'cash', status: 'paid', amount: 0, dueDate: '', reference: '', notes: '' };

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [contract, setContract] = useState<Contract>();
  const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams?.get('tab') || 'resumen');
  const [observations, setObservations] = useState('');
  const [clausesText, setClausesText] = useState('');
  const [newAddendum, setNewAddendum] = useState(emptyAddendum);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
  const [newPayment, setNewPayment] = useState(emptyPayment);

  const load = async (contractId: string) => {
    setLoading(true);
    try {
      const [contractResponse, addendumsResponse] = await Promise.all([
        api.get<{ contract: Contract }>(`/contracts/${contractId}`),
        api.get<{ items: ContractAddendum[] }>(`/contracts/${contractId}/addendums`)
      ]);
      const paymentsResponse = await api.get<{ items: Payment[]; summary: PaymentSummary }>(`/contracts/${contractId}/payments`);
      setContract(contractResponse.contract);
      setAddendums(addendumsResponse.items ?? []);
      setPayments(paymentsResponse.items ?? []);
      setPaymentSummary(paymentsResponse.summary ?? { paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
      setObservations(contractResponse.contract.observations ?? '');
      setClausesText((contractResponse.contract.legalTermsSnapshot?.clauses ?? []).map((clause) => `${clause.title ?? 'Cláusula'}\n${clause.text ?? ''}`).join('\n\n---\n\n'));
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el contrato.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  const save = async () => {
    if (!contract) return;
    setSaving(true);
    try {
      const clauses = clausesText.split(/\n---\n/).map((block, index) => { const [title, ...lines] = block.trim().split('\n'); return { key: `clause_${index + 1}`, title: title || `Cláusula ${index + 1}`, text: lines.join('\n').trim() }; }).filter((clause) => clause.title || clause.text);
      await api.patch(`/contracts/${contract._id}`, { observations, legalTermsSnapshot: { ...contract.legalTermsSnapshot, clauses } });
      await load(id);
      showToast({ message: 'Contrato actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el contrato.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const action = async (path: string, message: string) => {
    if (!contract) return;
    setSaving(true);
    try { await api.post(`/contracts/${contract._id}/${path}`, {}); await load(id); showToast({ message, variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el contrato.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const refreshSnapshots = async () => {
    if (!contract) return;
    setSaving(true);
    try { await api.post(`/contracts/${contract._id}/refresh-snapshots`, {}); await load(id); showToast({ message: 'Datos del cliente y evento actualizados en el contrato.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron actualizar los datos del contrato.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const generatePdf = async () => {
    if (!contract) return;
    setSaving(true);
    try { await api.post(`/contracts/${contract._id}/pdf`, {}); await load(id); showToast({ message: 'PDF del contrato generado correctamente.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo generar el PDF.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const addendumAction = async (addendum: ContractAddendum, path: string, message: string) => {
    setSaving(true);
    try { await api.post(`/contracts/${id}/addendums/${addendum._id}/${path}`, {}); await load(id); showToast({ message, variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar la adenda.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const createNewAddendum = async () => {
    if (!newAddendum.title.trim() || !newAddendum.itemName.trim()) return showToast({ message: 'La adenda necesita título e ítem.', variant: 'error' });
    setSaving(true);
    try {
      await api.post(`/contracts/${id}/addendums`, { title: newAddendum.title, description: newAddendum.description, discountAmount: newAddendum.discountAmount, items: [{ type: newAddendum.itemType, name: newAddendum.itemName, quantity: newAddendum.quantity, unitPrice: newAddendum.unitPrice }] });
      setNewAddendum(emptyAddendum);
      await load(id);
      showToast({ message: 'Adenda creada correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo crear la adenda.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const createNewPayment = async () => {
    if (!newPayment.amount || Number(newPayment.amount) <= 0) return showToast({ message: 'Indicá un importe válido.', variant: 'error' });
    setSaving(true);
    try {
      await api.post(`/contracts/${id}/payments`, { ...newPayment, amount: Number(newPayment.amount), dueDate: newPayment.dueDate || undefined });
      setNewPayment(emptyPayment);
      await load(id);
      showToast({ message: 'Pago registrado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo registrar el pago.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const paymentAction = async (payment: Payment, path: string, message: string) => {
    setSaving(true);
    try {
      await api.post(`/payments/${payment._id}/${path}`, path === 'mark-paid' ? { method: payment.method || 'other' } : {});
      await load(id);
      showToast({ message, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el pago.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !contract) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando contrato...</div>;
  const eventId = entityId(contract.eventId);
  const customerId = entityId(contract.customerId);
  const tabs = ['resumen', 'cliente', 'evento', 'servicios', 'menu', 'valores', 'adendas', 'condiciones', 'actividad'];

  return <section className="space-y-6 pb-8">
    <Link href="/admin/contracts" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Contratos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{contract.contractNumber}</h1><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[contract.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{displayLabel(contractStatusLabels, contract.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{text(contract.customerSnapshot?.fullName)} · {text(contract.eventSnapshot?.eventType, 'Evento')}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={saving || contract.status === 'approved' || contract.status === 'cancelled'} onClick={() => void refreshSnapshots()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar datos</Button><Button disabled={saving || contract.status === 'approved' || contract.status === 'cancelled'} onClick={() => void action('approve', 'Contrato aprobado y PDF generado.')}><CheckCircle2 className="mr-2 h-4 w-4" />Aprobar</Button>{contract.status === 'approved' && !contract.pdfSecureUrl && <Button variant="secondary" disabled={saving} onClick={() => void generatePdf()}>Generar PDF</Button>}{contract.pdfSecureUrl && <><a href={contract.pdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><Eye className="mr-2 h-4 w-4" />Previsualizar / imprimir</Button></a><a href={contract.pdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><Download className="mr-2 h-4 w-4" />Descargar</Button></a><a href={`https://wa.me/${String(contract.customerSnapshot?.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, te compartimos el contrato ${contract.contractNumber}: ${contract.pdfSecureUrl}`)}`} target="_blank" rel="noreferrer"><Button variant="secondary"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button></a><a href={`mailto:${String(contract.customerSnapshot?.email ?? '')}?subject=${encodeURIComponent(`Contrato ${contract.contractNumber} · M&M Eventos`)}&body=${encodeURIComponent(`Hola, te compartimos el contrato del evento. Podés verlo y descargarlo aquí: ${contract.pdfSecureUrl}`)}`}><Button variant="secondary"><Mail className="mr-2 h-4 w-4" />Email</Button></a></>}<Button variant="secondary" disabled={saving || contract.status === 'cancelled'} onClick={() => void action('request-changes', 'Contrato marcado con cambios requeridos.')}><AlertTriangle className="mr-2 h-4 w-4" />Requiere cambios</Button><Button variant="secondary" disabled={saving || contract.status === 'cancelled'} onClick={() => void action('cancel', 'Contrato cancelado.')}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button></div></div></header>
    <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">{eventId ? <Link className="font-medium text-zinc-950 underline" href={`/admin/events/${eventId}`}>Ver evento</Link> : null}{customerId ? <Link className="font-medium text-zinc-950 underline" href={`/admin/customers/${customerId}`}>Ver cliente</Link> : null}</div>
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200">{tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-3 py-2 text-sm font-medium capitalize ${activeTab === tab ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>{tab === 'menu' ? 'Menú' : tab}</button>)}</nav>
    {activeTab === 'adendas' && <Card title="Cómo cargar una adenda"><p className="text-sm leading-6 text-zinc-600">Una adenda registra un agregado o cambio comercial posterior al contrato: por ejemplo, una hora extra, una barra premium o decoración adicional. Al crearla queda pendiente; sólo impacta el total contractual cuando se aprueba.</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><Item label="Título" value="Nombre general: “Barra premium”" /><Item label="Ítem" value="Qué se agrega: “Gin tonic y aperitivos”" /><Item label="Tipo" value="Categoría del agregado" /><Item label="Cantidad" value="Unidades, horas o personas" /><Item label="Precio unitario" value="Valor de cada unidad" /></div><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><b>Ejemplo:</b> Título: “Hora extra”; Ítem: “Extensión de salón y DJ”; Tipo: Hora extra; Cantidad: 1; Precio unitario: $150.000. En descripción: “Extensión de 05:00 a 06:00, incluye salón, DJ y personal.”</div></Card>}
    {activeTab === 'resumen' && <div className="grid gap-5 lg:grid-cols-3"><Card title="Contrato"><Item label="Número" value={contract.contractNumber} /><Item label="Estado" value={displayLabel(contractStatusLabels, contract.status)} /><Item label="Aprobado" value={formatDate(contract.approvedAt)} /></Card><Card title="Cliente y evento"><Item label="Cliente" value={text(contract.customerSnapshot?.fullName)} /><Item label="Evento" value={text(contract.eventSnapshot?.eventName ?? contract.eventSnapshot?.eventType)} /><Item label="Fecha" value={formatDate(contract.eventSnapshot?.eventDate)} /></Card><article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Total contractual</p><p className="mt-3 text-3xl font-semibold">{money(contract.totalAmount)}</p><p className="mt-5 text-sm text-zinc-300">Saldo: {money(contract.balanceAmount)}</p></article></div>}
    {activeTab === 'cliente' && <Card title="Cliente"><Item label="Nombre" value={text(contract.customerSnapshot?.fullName)} /><Item label="Documento" value={text(contract.customerSnapshot?.documentNumber ?? contract.customerSnapshot?.dni)} /><Item label="Ocupación" value={text(contract.customerSnapshot?.occupation)} /><Item label="Teléfono" value={text(contract.customerSnapshot?.phone)} /><Item label="Email" value={text(contract.customerSnapshot?.email)} /><Item label="Domicilio" value={text(contract.customerSnapshot?.address)} /></Card>}
    {activeTab === 'evento' && <Card title="Evento"><Item label="Tipo" value={text(contract.eventSnapshot?.eventType)} /><Item label="Agasajado/a" value={text(contract.eventSnapshot?.honoreeName)} /><Item label="Fecha" value={formatDate(contract.eventSnapshot?.eventDate)} /><Item label="Horario" value={[contract.eventSnapshot?.startTime, contract.eventSnapshot?.endTime].filter(Boolean).join(' - ') || 'Sin horario'} /><Item label="Invitados" value={String(contract.eventSnapshot?.guestCount ?? 'Sin definir')} /><Item label="Restricciones alimentarias" value={`Vegetarianos: ${contract.eventSnapshot?.vegetarianCount ?? 0} · Veganos: ${contract.eventSnapshot?.veganCount ?? 0} · Celíacos: ${contract.eventSnapshot?.celiacCount ?? 0} · Sin lactosa: ${contract.eventSnapshot?.lactoseIntolerantCount ?? 0}`} /><Item label="Mantelería" value={text(contract.eventSnapshot?.tableLinenColor)} /><Item label="Salón" value={text(contract.eventSnapshot?.salonName)} /></Card>}
    {activeTab === 'servicios' && <Card title="Servicios incluidos">{contract.servicesSnapshot?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">{contract.servicesSnapshot.map((item) => <li key={item}>{item}</li>)}</ul> : <Empty text="No hay servicios cargados." />}</Card>}
    {activeTab === 'menu' && <Card title="Menú">{contract.menuSnapshot?.length ? contract.menuSnapshot.map((section, index) => <div key={`${section.title}-${index}`}><h3 className="font-medium text-zinc-800">{section.title || 'Menú'}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">{(section.items ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>) : <Empty text="No hay menú cargado." />}</Card>}
    {activeTab === 'valores' && <div className="grid gap-5 lg:grid-cols-3"><Card title="Base"><Item label="Base contrato" value={money(contract.baseAmount)} /><Item label="Descuentos" value={money(contract.discountsAmount)} /><Item label="Pagado" value={money(contract.paidAmount)} /></Card><Card title="Adendas"><Item label="Aprobadas" value={money(contract.approvedAddendumsAmount)} /><Item label="Pendientes informativas" value={money(contract.pendingAddendumsAmount)} /><Item label="No afectan saldo hasta aprobarse" value="Sí" /></Card><Card title="Total"><Item label="Total contractual" value={money(contract.totalAmount)} /><Item label="Saldo" value={money(contract.balanceAmount)} /></Card></div>}
    {activeTab === 'adendas' && <div className="space-y-5"><Card title="Nueva adenda"><div className="grid gap-3 lg:grid-cols-6"><Input placeholder="Título" value={newAddendum.title} onChange={(event) => setNewAddendum((current) => ({ ...current, title: event.target.value }))} /><Input placeholder="Ítem" value={newAddendum.itemName} onChange={(event) => setNewAddendum((current) => ({ ...current, itemName: event.target.value }))} /><Select value={newAddendum.itemType} onChange={(event) => setNewAddendum((current) => ({ ...current, itemType: event.target.value }))}><option value="extra_service">Servicio extra</option><option value="beverage">Bebidas</option><option value="decoration">Ambientación</option><option value="menu_upgrade">Menú adicional</option><option value="hour_extension">Hora extra</option><option value="other">Otro</option></Select><Input type="number" min={1} value={newAddendum.quantity} onChange={(event) => setNewAddendum((current) => ({ ...current, quantity: Number(event.target.value) }))} /><Input type="number" min={0} value={newAddendum.unitPrice} onChange={(event) => setNewAddendum((current) => ({ ...current, unitPrice: Number(event.target.value) }))} /><Button disabled={saving} onClick={() => void createNewAddendum()}><Plus className="mr-2 h-4 w-4" />Crear</Button></div><Textarea placeholder="Descripción" value={newAddendum.description} onChange={(event) => setNewAddendum((current) => ({ ...current, description: event.target.value }))} /></Card><Card title="Adendas">{addendums.length ? <div className="overflow-x-auto"><table className="min-w-[860px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Título</th><th>Estado</th><th>Total</th><th className="text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{addendums.map((addendum) => <tr key={addendum._id}><td className="py-3 font-medium">{addendum.addendumNumber}</td><td>{addendum.title}</td><td>{displayLabel(contractAddendumStatusLabels, addendum.status)}</td><td>{money(addendum.totalAmount)}</td><td><div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving || addendum.status === 'approved'} onClick={() => void addendumAction(addendum, 'approve', 'Adenda aprobada.')}>Aprobar</Button><Button variant="secondary" disabled={saving || addendum.status === 'approved'} onClick={() => void addendumAction(addendum, 'reject', 'Adenda rechazada.')}>Rechazar</Button><Button variant="secondary" disabled={saving || addendum.status === 'approved'} onClick={() => void addendumAction(addendum, 'cancel', 'Adenda cancelada.')}>Cancelar</Button></div></td></tr>)}</tbody></table></div> : <Empty text="No hay adendas asociadas." />}</Card></div>}
    {activeTab === 'condiciones' && <Card title="Cláusulas"><Textarea value={clausesText} onChange={(event) => setClausesText(event.target.value)} className="min-h-96 font-mono text-xs" /><p className="text-sm text-zinc-500">Separá cláusulas con una línea que contenga únicamente ---.</p><Button disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Guardar condiciones</Button></Card>}
    {activeTab === 'actividad' && <Card title="Actividad"><Textarea value={observations} onChange={(event) => setObservations(event.target.value)} className="min-h-32" /><Button disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Guardar observaciones</Button></Card>}
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-4">{children}</div></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
function Empty({ text: value }: { text: string }) { return <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">{value}</p>; }
