'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarPlus, ChevronLeft, CreditCard, Download, Eye, FileText, Mail, MessageCircle, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, eventStaffStatusLabels, eventStatusLabels, paymentMethodLabels, paymentTypeLabels, quoteStatusLabels, staffSubroleLabels } from '@/lib/display-labels';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { cleanMenuSections, cleanStringList, MenuSectionsEditor, type MenuSectionValue } from '@/components/admin/structured-list-editors';
import { EventBasicsEditor, EventCommercialEditor, EventOperationsWorkspace, EventSuppliersEditor, EventTasksEditor, eventOperationalSummary, normalizeResourcePlan } from '@/features/events/event-operations';
import type { Contract, Event, EventExpense, EventExpenseSummary, EventSupplierAssignment, Payment, PaymentSummary, Quote } from '@/features/quotes/types';

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha definida';
const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Sin horario';
const eventTabs = ['resumen', 'ficha', 'cliente', 'comercial', 'menu', 'servicios', 'cronograma', 'proveedores', 'staff', 'tareas', 'contrato', 'pagos', 'actividad'];
const eventTabLabels: Record<string, string> = { resumen: 'Resumen', ficha: 'Ficha', cliente: 'Cliente', comercial: 'Comercial', menu: 'Menú', servicios: 'Servicios', cronograma: 'Cronograma', proveedores: 'Proveedores', staff: 'Staff', tareas: 'Tareas', contrato: 'Contrato', pagos: 'Pagos', actividad: 'Actividad' };

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; name?: string; quoteNumber?: string; firstName?: string; lastName?: string };
  return item.fullName || item.name || item.quoteNumber || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Sin datos';
}

type StaffOption = { _id: string; fullName?: string; firstName?: string; lastName?: string; username?: string; staffProfile?: { staffSubroles?: string[] } };
type StaffAssignment = { _id: string; staffUserId?: string | StaffOption; salonId?: string | { _id: string; name?: string }; roleLabel?: string; staffSubrole?: string; shiftStart?: string; shiftEnd?: string; status: string; notes?: string };
const staffName = (value: unknown) => typeof value === 'string' ? value : ((value as StaffOption | undefined)?.fullName || [(value as StaffOption | undefined)?.firstName, (value as StaffOption | undefined)?.lastName].filter(Boolean).join(' ') || (value as StaffOption | undefined)?.username || 'Staff');
function entityId(value: unknown) {
  return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [event, setEvent] = useState<Event>();
  const [contract, setContract] = useState<Contract>();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<EventExpense[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<EventExpenseSummary>({ totalPaid: 0, totalCancelled: 0, activeExpenseCount: 0, cancelledExpenseCount: 0 });
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ staffUserId: '', staffSubrole: 'WAITER', roleLabel: '', shiftStart: '', shiftEnd: '', notes: '' });
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
  const [newPayment, setNewPayment] = useState({ amount: '', method: 'cash', type: 'installment', planInstallmentId: '', reference: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const notice = (message: string, variant: 'success' | 'error' = 'success') => showToast({ message, variant });

  const load = async (eventId: string) => {
    setLoading(true);
    try {
      const [response, paymentsResponse, expensesResponse, staffResponse, staffOptionsResponse] = await Promise.all([
        api.get<{ event: Event; contract?: Contract; contracts?: Contract[] }>(`/events/${eventId}`),
        api.get<{ items: Payment[]; summary: PaymentSummary }>(`/events/${eventId}/payments`),
        api.get<{ items: EventExpense[]; summary: EventExpenseSummary }>(`/events/${eventId}/expenses`),
        api.get<{ items: StaffAssignment[] }>(`/events/${eventId}/staff`),
        api.get<{ items: StaffOption[] }>('/users?active=true&limit=100')
      ]);
      setEvent(response.event);
      setContract(response.contract);
      setContracts(response.contracts ?? (response.contract ? [response.contract] : []));
      setPayments(paymentsResponse.items ?? []);
      setExpenses(expensesResponse.items ?? []);
      setExpenseSummary(expensesResponse.summary ?? { totalPaid: 0, totalCancelled: 0, activeExpenseCount: 0, cancelledExpenseCount: 0 });
      setStaffAssignments(staffResponse.items ?? []);
      setStaffOptions(staffOptionsResponse.items ?? []);
      setPaymentSummary(paymentsResponse.summary ?? { paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo cargar el evento.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  const updateStatus = async (status: string, reason?: string) => {
    if (!event) return;
    setSaving(true);
    try {
      await api.patch(`/events/${event._id}/status`, reason ? { status, reason } : { status });
      await load(id);
      notice('Evento actualizado correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo actualizar el evento.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const requestStatusChange = (status: string) => {
    if (['cancelled', 'lost'].includes(status)) { setPendingStatus(status); setStatusReason(''); return; }
    void updateStatus(status);
  };
  const confirmStatusChange = async () => {
    if (!pendingStatus || !statusReason.trim()) return notice('Indicá el motivo antes de continuar.', 'error');
    await updateStatus(pendingStatus, statusReason);
    setPendingStatus(null);
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
  const saveSuppliers = async (items: EventSupplierAssignment[]) => {
    if (!event) return;
    setSaving(true);
    try {
      await api.put(`/events/${event._id}/suppliers`, { items: items.map((item) => ({
        id: item.id,
        supplierId: item.supplierId,
        serviceType: item.serviceType,
        arrivalTime: item.arrivalTime,
        agreedAmount: item.agreedAmount,
        status: item.status,
        notes: item.notes,
      })) });
      await load(id);
      notice('Proveedores actualizados y gastos sincronizados correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudieron actualizar los proveedores del evento.', 'error');
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
  const assignStaff = async () => {
    if (!event) return;
    setSaving(true);
    try {
      await api.post(`/events/${event._id}/staff`, { ...staffForm, shiftStart: staffForm.shiftStart || undefined, shiftEnd: staffForm.shiftEnd || undefined, roleLabel: staffForm.roleLabel || undefined });
      setStaffModalOpen(false);
      setStaffForm({ staffUserId: '', staffSubrole: 'WAITER', roleLabel: '', shiftStart: '', shiftEnd: '', notes: '' });
      await load(id);
      notice('Staff asignado correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo asignar el staff.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const updateStaffAssignment = async (assignmentId: string, action: 'confirm' | 'cancel' | 'delete') => {
    if (!event) return;
    setSaving(true);
    try {
      if (action === 'delete') await api.delete(`/events/${event._id}/staff/${assignmentId}`);
      else await api.post(`/events/${event._id}/staff/${assignmentId}/${action}`, {});
      await load(id);
      notice('Asignación actualizada correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo actualizar la asignación.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const registerPayment = async () => {
    if (!event || !Number(newPayment.amount)) return;
    setSaving(true);
    try {
      await api.post(`/events/${event._id}/payments`, { ...newPayment, amount: Number(newPayment.amount), planInstallmentId: newPayment.planInstallmentId || undefined });
      setNewPayment({ amount: '', method: 'cash', type: 'installment', planInstallmentId: '', reference: '', notes: '' });
      await load(id);
      notice('Pago registrado y plan de cuotas actualizado.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo registrar el pago.', 'error');
    } finally { setSaving(false); }
  };
  const resendReceiptEmail = async (payment: Payment) => {
    if (!event) return;
    setSaving(true);
    try { const response = await api.post<{ emailSent: boolean }>(`/events/${event._id}/payments/${payment._id}/receipt-email`, {}); await load(id); notice(response.emailSent ? 'Comprobante enviado por email.' : 'Comprobante generado; configurá SMTP para enviarlo automáticamente.', response.emailSent ? 'success' : 'error'); }
    catch (error) { notice(error instanceof Error ? error.message : 'No se pudo enviar el comprobante.', 'error'); }
    finally { setSaving(false); }
  };

  if (loading || !event) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando evento...</div>;

  const quote = typeof event.sourceQuoteId === 'string' ? (typeof event.quoteId === 'string' ? undefined : event.quoteId as Quote | undefined) : event.sourceQuoteId as Quote | undefined;
  const lead = typeof event.sourceLeadId === 'string' ? undefined : event.sourceLeadId;
  const customerId = entityId(event.customerId);
  const commercial = event.commercialSnapshot ?? {};
  const eventCustomer = typeof event.customerId === 'string' ? undefined : event.customerId;
  const checklist: Record<string, boolean> = { ...(event.contractReadyChecklist ?? {}), document: Boolean(eventCustomer?.documentNumber), address: Boolean(eventCustomer?.address) };
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
  const menuSections = (event.menuSnapshot ?? []).map((section) => ({ title: section.title ?? 'Menú', items: section.items ?? [] }));
  const resourcePlan = normalizeResourcePlan(event.resourcePlanSnapshot);
  const operationalSummary = eventOperationalSummary(resourcePlan);
  const financialTotal = Number(event.finalAmount ?? event.estimatedAmount ?? commercial.totalAmount ?? contract?.totalAmount ?? 0);
  const financialPaid = Number(paymentSummary.paidAmount ?? 0);
  const financialBalance = Math.max(0, Number(contract?.balanceAmount ?? financialTotal - financialPaid));
  const saveResourcePlan = (plan: typeof resourcePlan) => void patchEvent({ resourcePlanSnapshot: plan });

  return <section className="space-y-6 pb-8">
    <Link href="/admin/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Eventos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{event.eventName || event.eventType || 'Evento'}</h1><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{displayLabel(eventStatusLabels, event.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{entityName(event.customerId)} · {entityName(event.salonId)}</p></div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">Estado<Select value={event.status} disabled={saving} onChange={(change) => requestStatusChange(change.target.value)} className="w-56 py-2">{Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      </div>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">{eventTabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>{eventTabLabels[tab]}</button>)}</div>
    {(activeTab === 'resumen' || activeTab === 'pagos') && <FinancialOverview total={financialTotal} paid={financialPaid} balance={financialBalance} />}
    {activeTab === 'resumen' && <SupplierExpenseOverview total={financialTotal} expenses={expenses} summary={expenseSummary} />}
    {activeTab === 'contrato' && contracts.length > 1 && <Card title="Historial de contratos"><p className="text-sm text-zinc-500">Las versiones se ordenan desde la más reciente. Los contratos aprobados anteriores se conservan para trazabilidad.</p><div className="mt-4 overflow-x-auto"><table className="min-w-[680px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Versión</th><th>Número</th><th>Estado</th><th>Creado</th><th className="text-right">Acción</th></tr></thead><tbody className="divide-y divide-zinc-100">{contracts.map((item, index) => <tr key={item._id}><td className="py-3">{item.versionNumber ?? contracts.length - index}</td><td className="font-medium">{item.contractNumber}{index === 0 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Actual</span>}</td><td>{displayLabel({ draft: 'Borrador', pending_approval: 'Pendiente', approved: 'Aprobado', requires_changes: 'Requiere cambios', cancelled: 'Cancelado', superseded: 'Reemplazado' }, item.status)}</td><td>{formatDate(item.createdAt)}</td><td className="text-right"><Link className="font-medium text-zinc-950 underline" href={`/admin/contracts/${item._id}`}>Ver contrato</Link></td></tr>)}</tbody></table></div></Card>}
    {activeTab === 'resumen' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-3"><Card title="Evento"><Item label="Tipo" value={event.eventType || 'Sin especificar'} /><Item label="Fecha" value={formatDate(event.eventDate)} /><Item label="Horario" value={[event.startTime, event.endTime].filter(Boolean).join(' - ') || 'Sin horario'} /><Item label="Personas" value={event.guestCount || 'Sin definir'} /><Item label="Salón" value={entityName(event.salonId)} /></Card><article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Importe estimado</p><p className="mt-3 text-3xl font-semibold">{money(event.finalAmount ?? event.estimatedAmount)}</p><p className="mt-5 text-sm text-zinc-300">Pendiente de contrato y plan de pagos.</p></article><Card title="Notas"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{event.notes || 'Sin notas.'}</p></Card></div><Card title="Pulso operativo"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Cronograma" value={`${operationalSummary.doneTimeline}/${operationalSummary.timelineCount}`} helper="momentos hechos" /><Metric label="Stock e insumos" value={operationalSummary.productCount + operationalSummary.inventoryCount} helper={operationalSummary.resourceIssues ? `${operationalSummary.resourceIssues} con alerta` : 'sin alertas'} /><Metric label="Proveedores" value={operationalSummary.supplierCount} helper="servicios externos" /><Metric label="Tareas" value={`${operationalSummary.doneTasks}/${operationalSummary.taskCount}`} helper={`${operationalSummary.alertCount} alertas`} /></div></Card></div>}
    {activeTab === 'ficha' && <EventBasicsEditor key={event.updatedAt} event={event} saving={saving} onSave={(payload) => void patchEvent(payload)} />}
    {activeTab === 'cliente' && <div className="grid gap-5 lg:grid-cols-2"><Card title="Cliente"><Item label="Nombre" value={entityName(event.customerId)} /><Item label="Lead origen" value={lead ? entityName(lead) : 'No informado'} /><div className="mt-4 flex flex-wrap gap-3">{customerId ? <Link href={`/admin/customers/${customerId}`} className="inline-flex text-sm font-medium text-zinc-950 underline">Ver cliente</Link> : null}{lead && typeof lead !== 'string' ? <Link href={`/admin/leads/${lead._id}`} className="inline-flex text-sm font-medium text-zinc-950 underline">Ver lead</Link> : null}</div></Card><Card title="Presupuestos relacionados"><Item label="Número" value={quote?.quoteNumber || 'No informado'} /><Item label="Estado" value={quote ? displayLabel(quoteStatusLabels, quote.status) : 'No informado'} /><Item label="Total" value={money(quote?.totalAmount ?? event.estimatedAmount)} />{quote?._id ? <Link href={`/admin/quotes/${quote._id}`} className="mt-4 inline-flex text-sm font-medium text-zinc-950 underline">Ver presupuesto</Link> : null}</Card></div>}
    {activeTab === 'comercial' && <EventCommercialEditor key={event.updatedAt} event={event} saving={saving} onSave={(payload) => void patchEvent(payload)} />}
    {activeTab === 'menu' && <EventMenuEditor key={event.updatedAt} initialValue={menuSections} saving={saving} onSave={(value) => patchEvent({ menuSnapshot: cleanMenuSections(value) })} />}
    {activeTab === 'servicios' && <EventServicesEditor key={event.updatedAt} initialValue={event.servicesSnapshot ?? []} saving={saving} onSave={(value) => patchEvent({ servicesSnapshot: cleanStringList(value) })} />}
    {activeTab === 'cronograma' && <EventOperationsWorkspace key={event.updatedAt} event={event} plan={resourcePlan} saving={saving} onSave={saveResourcePlan} onSyncSummary={(payload) => void patchEvent(payload)} onNotice={notice} />}
    {activeTab === 'proveedores' && <EventSuppliersEditor key={event.updatedAt} plan={resourcePlan} saving={saving} onSave={(items) => void saveSuppliers(items)} />}
    {activeTab === 'staff' && <Card title="Equipo del evento"><div className="flex justify-end"><Button disabled={saving} onClick={() => setStaffModalOpen(true)}><CalendarPlus className="mr-2 h-4 w-4" />Asignar integrante</Button></div>{staffAssignments.length ? <div className="overflow-x-auto"><table className="min-w-[840px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Persona</th><th>Rol</th><th>Turno</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{staffAssignments.map((assignment) => <tr key={assignment._id}><td className="py-3">{staffName(assignment.staffUserId)}</td><td>{assignment.roleLabel || displayLabel(staffSubroleLabels, assignment.staffSubrole ?? '')}</td><td>{[formatDateTime(assignment.shiftStart), assignment.shiftEnd ? formatDateTime(assignment.shiftEnd) : ''].filter(Boolean).join(' - ')}</td><td>{displayLabel(eventStaffStatusLabels, assignment.status)}</td><td><div className="flex justify-end gap-2"><Button variant="secondary" className="px-3 py-2" disabled={saving || assignment.status === 'confirmed'} onClick={() => void updateStaffAssignment(assignment._id, 'confirm')}>Confirmar</Button><Button variant="secondary" className="px-3 py-2" disabled={saving || assignment.status === 'cancelled'} onClick={() => void updateStaffAssignment(assignment._id, 'cancel')}>Cancelar</Button><Button variant="danger" className="px-3 py-2" disabled={saving} onClick={() => void updateStaffAssignment(assignment._id, 'delete')}><Trash2 className="h-4 w-4" /><span className="sr-only">Quitar</span></Button></div></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">No hay integrantes asignados a este evento.</p>}</Card>}
    {activeTab === 'tareas' && <EventTasksEditor key={event.updatedAt} plan={resourcePlan} saving={saving} onSave={saveResourcePlan} />}
    {activeTab === 'contrato' && <div className="space-y-5">{contract ? <Card title="Contrato generado"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-50 px-4 py-4"><div><p className="font-semibold text-emerald-950">{contract.contractNumber}</p><p className="mt-1 text-sm text-emerald-700">Estado: {contract.status} · Total contractual: {money(contract.totalAmount)}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/contracts/${contract._id}`}><Button><FileText className="mr-2 h-4 w-4" />Ver contrato</Button></Link><Link href={`/admin/contracts/${contract._id}?tab=adendas`}><Button variant="secondary">Ver adendas</Button></Link><Link href={`/admin/contracts/${contract._id}/print`}><Button variant="secondary"><Printer className="mr-2 h-4 w-4" />Imprimir</Button></Link></div></div></Card> : null}<Card title="Checklist para contrato"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries({ customerComplete: 'Cliente completo', document: 'DNI/documento', address: 'Domicilio', salonDefined: 'Salón definido', dateDefined: 'Fecha definida', timeDefined: 'Horario definido', guestCount: 'Cantidad de invitados', totalPrice: 'Precio total', deposit: 'Seña', paymentTerms: 'Condiciones de pago', menu: 'Menú', includedServices: 'Servicios incluidos' }).map(([key, label]) => <span key={key} className={`rounded-xl px-3 py-2 text-sm font-medium ${checklist[key] ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{label}: {checklist[key] ? 'OK' : 'Pendiente'}</span>)}</div>{contract ? <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">Este evento ya tiene contrato activo.</p> : canCreateContract ? <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-4"><p className="text-sm text-emerald-700">El evento tiene los datos mínimos para generar contrato.</p><Button disabled={saving} className="mt-4" onClick={() => void createContract()}><FileText className="mr-2 h-4 w-4" />{saving ? 'Creando contrato...' : 'Crear contrato'}</Button></div> : <div className="mt-5 rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-800"><p className="font-medium">Faltan datos para generar contrato:</p><ul className="mt-2 list-disc pl-5">{contractMissing.map((item) => <li key={item}>{item}</li>)}</ul></div>}</Card></div>}
    {activeTab === 'pagos' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-4"><Card title="Cobrado"><Item label="Impacta saldo" value={money(paymentSummary.paidAmount)} /></Card><Card title="Pendiente"><Item label="Programado" value={money(paymentSummary.pendingAmount)} /></Card><Card title="Vencido"><Item label="Importe vencido" value={money(paymentSummary.overdueAmount)} /></Card><Card title="Garantía"><Item label="Recibida" value={money(paymentSummary.securityDepositAmount)} /></Card></div><Card title="Registrar cobro"><p className="text-sm text-zinc-500">Podés cobrar una cuota pendiente, adelantar una futura o cargar un importe libre. Si excede la cuota elegida, el excedente descuenta la última cuota pendiente.</p><div className="mt-4 grid gap-3 lg:grid-cols-5"><Select value={newPayment.planInstallmentId} onChange={(change) => { const installment = event.paymentPlanSnapshot?.find((item) => item.id === change.target.value); setNewPayment((current) => ({ ...current, planInstallmentId: change.target.value, amount: installment ? String(Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0))) : current.amount })); }}><option value="">Importe libre / próxima cuota</option>{(event.paymentPlanSnapshot ?? []).filter((item) => item.status !== 'paid' && item.status !== 'cancelled').map((item, index) => <option key={item.id ?? index} value={item.id ?? ''}>{item.label || `Cuota ${index + 1}`} · pendiente {money(Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)))}</option>)}</Select><Input type="number" min={1} value={newPayment.amount} onChange={(change) => setNewPayment((current) => ({ ...current, amount: change.target.value }))} placeholder="Importe recibido" /><Select value={newPayment.method} onChange={(change) => setNewPayment((current) => ({ ...current, method: change.target.value }))}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input value={newPayment.reference} onChange={(change) => setNewPayment((current) => ({ ...current, reference: change.target.value }))} placeholder="Comprobante / referencia" /><Button disabled={saving || !newPayment.amount || !contract} onClick={() => void registerPayment()}><CreditCard className="mr-2 h-4 w-4" />Registrar pago</Button></div>{!contract && <p className="mt-3 text-sm text-amber-700">Para registrar un cobro primero generá el contrato desde este evento.</p>}<Textarea className="mt-3" value={newPayment.notes} onChange={(change) => setNewPayment((current) => ({ ...current, notes: change.target.value }))} placeholder="Notas opcionales" /></Card><Card title="Plan de cuotas">{event.paymentPlanSnapshot?.length ? <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Cuota</th><th>Ventana de pago</th><th>Programado</th><th>Cobrado</th><th>Estado</th></tr></thead><tbody className="divide-y divide-zinc-100">{event.paymentPlanSnapshot.map((item, index) => <tr key={item.id ?? index}><td className="py-3 font-medium">{item.label || `Cuota ${index + 1}`}</td><td>{formatDate(item.paymentWindowStart)} — {formatDate(item.paymentWindowEnd ?? item.dueDate)}</td><td>{money(item.amount)}</td><td>{money(item.paidAmount)}</td><td>{item.status === 'partial' ? 'Pago parcial' : item.status === 'paid' ? 'Cobrada' : 'Pendiente'}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">Todavía no hay cuotas programadas. Crealas desde Comercial.</p>}</Card><Card title="Historial de pagos">{payments.length ? <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Tipo</th><th>Medio</th><th>Importe</th><th>Fecha</th><th>Comprobante</th><th className="text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{payments.map((payment) => <tr key={payment._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/payments/${payment._id}`}>{payment.paymentNumber}</Link></td><td>{displayLabel(paymentTypeLabels, payment.type)}</td><td>{payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'No informado'}</td><td>{money(payment.amount)}</td><td>{formatDate(payment.paidAt ?? payment.dueDate)}</td><td>{payment.receiptPdfSecureUrl ? <a className="font-medium text-zinc-950 underline" href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer">PDF</a> : 'Generando...'}</td><td><div className="flex justify-end gap-1">{payment.receiptPdfSecureUrl && <><a href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><Eye className="h-4 w-4" /><span className="sr-only">Previsualizar</span></Button></a><a href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><Download className="h-4 w-4" /><span className="sr-only">Descargar</span></Button></a><a href={`https://wa.me/${String((typeof event.customerId === 'string' ? '' : event.customerId?.phone) ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Comprobante de pago ${payment.paymentNumber}: ${payment.receiptPdfSecureUrl}`)}`} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><MessageCircle className="h-4 w-4" /><span className="sr-only">WhatsApp</span></Button></a></>}<Button variant="secondary" className="px-2 py-2" disabled={saving} onClick={() => void resendReceiptEmail(payment)}><Mail className="h-4 w-4" /><span className="sr-only">Enviar por email</span></Button></div></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">No hay pagos registrados para este evento.</p>}</Card></div>}
    {activeTab === 'actividad' && <Card title="Actividad"><p className="text-sm text-zinc-500">Actividad específica de eventos pendiente de modelo dedicado. Los cambios importantes quedan auditados en el sistema.</p></Card>}
    <Modal open={Boolean(pendingStatus)} title={pendingStatus === 'lost' ? 'Marcar evento como perdido' : 'Cancelar evento'} description="Indicá el motivo antes de confirmar el cambio de estado." onClose={() => setPendingStatus(null)}>
      <div className="space-y-4 p-5 sm:p-8">
        <label className="block text-sm font-medium text-zinc-700">Motivo (obligatorio)
          <Textarea className="mt-2" value={statusReason} onChange={(change) => setStatusReason(change.target.value)} placeholder="Explicá por qué se cancela o se pierde el evento." />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => setPendingStatus(null)}>Volver</Button>
          <Button variant="danger" disabled={saving} onClick={() => void confirmStatusChange()}>Confirmar</Button>
        </div>
      </div>
    </Modal>
    <Modal open={staffModalOpen} title="Asignar integrante" description="La asignación queda vinculada a este evento y al salón del evento." onClose={() => setStaffModalOpen(false)}><div className="space-y-4 p-6"><Select value={staffForm.staffUserId} onChange={(event) => setStaffForm((current) => ({ ...current, staffUserId: event.target.value }))}><option value="">Seleccionar usuario</option>{staffOptions.map((staff) => <option key={staff._id} value={staff._id}>{staffName(staff)}</option>)}</Select><div className="grid gap-3 md:grid-cols-2"><Select value={staffForm.staffSubrole} onChange={(event) => setStaffForm((current) => ({ ...current, staffSubrole: event.target.value }))}>{Object.entries(staffSubroleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input placeholder="Rol específico opcional" value={staffForm.roleLabel} onChange={(event) => setStaffForm((current) => ({ ...current, roleLabel: event.target.value }))} /><Input type="datetime-local" value={staffForm.shiftStart} onChange={(event) => setStaffForm((current) => ({ ...current, shiftStart: event.target.value }))} /><Input type="datetime-local" value={staffForm.shiftEnd} onChange={(event) => setStaffForm((current) => ({ ...current, shiftEnd: event.target.value }))} /></div><Textarea placeholder="Notas" value={staffForm.notes} onChange={(event) => setStaffForm((current) => ({ ...current, notes: event.target.value }))} /><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={() => setStaffModalOpen(false)}>Cancelar</Button><Button disabled={saving || !staffForm.staffUserId} onClick={() => void assignStaff()}>Asignar</Button></div></div></Modal>
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-4">{children}</div></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) { return <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"><p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p><p className="mt-1 text-xs text-zinc-500">{helper}</p></div>; }
function FinancialOverview({ total, paid, balance }: { total: number; paid: number; balance: number }) { return <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Importe total</p><p className="mt-2 text-2xl font-semibold">{money(total)}</p></article><article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-sm font-medium text-emerald-800">Ya abonado</p><p className="mt-2 text-2xl font-semibold text-emerald-800">{money(paid)}</p></article><article className="rounded-2xl border border-amber-100 bg-amber-50 p-5"><p className="text-sm font-medium text-amber-800">Restante a pagar</p><p className="mt-2 text-2xl font-semibold text-amber-800">{money(balance)}</p></article></div>; }
function SupplierExpenseOverview({ total, expenses, summary }: { total: number; expenses: EventExpense[]; summary: EventExpenseSummary }) {
  const supplierName = (expense: EventExpense) => !expense.supplierId || typeof expense.supplierId === 'string' ? 'Proveedor' : expense.supplierId.name;
  return <Card title="Gastos de proveedores">
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Gastos confirmados" value={money(summary.totalPaid)} helper={`${summary.activeExpenseCount} pagos activos`} /><Metric label="Resultado estimado" value={money(total - summary.totalPaid)} helper="importe del evento menos gastos confirmados" /><Metric label="Gastos anulados" value={money(summary.totalCancelled)} helper={`${summary.cancelledExpenseCount} registros históricos`} /></div>
    {expenses.length ? <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Proveedor</th><th>Servicio</th><th>Estado</th><th className="text-right">Importe</th></tr></thead><tbody className="divide-y divide-zinc-100">{expenses.map((expense) => <tr key={expense._id} className={expense.status === 'cancelled' ? 'text-zinc-400' : ''}><td className="py-3 font-medium">{supplierName(expense)}</td><td>{expense.description}</td><td>{expense.status === 'paid' ? 'Pagado' : 'Anulado'}</td><td className="text-right">{money(expense.amount)}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">Todavía no hay gastos confirmados para este evento.</p>}
  </Card>;
}
function EventMenuEditor({ initialValue, saving, onSave }: { initialValue: MenuSectionValue[]; saving: boolean; onSave: (value: MenuSectionValue[]) => void }) { const [value, setValue] = useState(initialValue); return <Card title="Menú"><MenuSectionsEditor value={value} onChange={setValue} /><div className="flex justify-end"><Button disabled={saving} onClick={() => onSave(value)}>{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div><p className="text-sm text-zinc-500">Estos cambios modifican sólo la ficha del evento; no alteran el presupuesto ni la plantilla original.</p></Card>; }
function EventServicesEditor({ initialValue, saving, onSave }: { initialValue: string[]; saving: boolean; onSave: (value: string[]) => void }) {
  type Detail = { id: string; category: string; title: string; detail: string };
  const decode = (item: string, index: number): Detail => { const [heading, ...rest] = item.split(' — '); const [category, title] = heading.includes(': ') ? heading.split(': ', 2) : ['Servicio', heading]; return { id: `${index}-${heading}`, category, title, detail: rest.join(' — ') }; };
  const [items, setItems] = useState<Detail[]>(initialValue.map(decode));
  const update = (index: number, patch: Partial<Detail>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const save = () => onSave(items.filter((item) => item.title.trim()).map((item) => `${item.category || 'Servicio'}: ${item.title.trim()}${item.detail.trim() ? ` — ${item.detail.trim()}` : ''}`));
  return <Card title="Servicios incluidos y detalle operativo"><p className="text-sm text-zinc-500">Definí exactamente lo acordado con el cliente. Por ejemplo: bebidas servidas a mesa, bebidas de la barra, color de mantelería o condiciones de un servicio externo.</p><div className="space-y-3">{items.map((item, index) => <div key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><div className="grid gap-3 md:grid-cols-[180px_1fr_40px]"><Select value={item.category} onChange={(event) => update(index, { category: event.target.value })}><option>Bebidas a mesa</option><option>Barra</option><option>Mantelería</option><option>Catering</option><option>Ambientación</option><option>Servicio de salón</option><option>Servicio externo</option><option>Servicio</option></Select><Input value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Nombre del servicio" /><Button type="button" variant="secondary" className="px-3" disabled={saving} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /><span className="sr-only">Quitar servicio</span></Button></div><Textarea className="mt-3" value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Detalle acordado: marcas, variedades, cantidades, color, modalidad de servicio, restricciones o instrucciones para el día del evento." /></div>)}</div><div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, { id: `${Date.now()}-${current.length}`, category: 'Servicio', title: '', detail: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar servicio detallado</Button><Button disabled={saving} onClick={save}>{saving ? 'Guardando...' : 'Guardar servicios'}</Button></div><p className="text-sm text-zinc-500">Para bebidas que formen parte del menú, agregá también una sección “Bebidas y barra” desde la pestaña Menú; así se reflejará claramente en el contrato y en el operativo.</p></Card>;
}
