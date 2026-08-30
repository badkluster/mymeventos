'use client';
/* eslint-disable react/no-unescaped-entities */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarPlus, ChevronLeft, CreditCard, Download, Eye, FileText, LockKeyhole, Mail, MessageCircle, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { Permission } from '@mym/shared';
import { api } from '@/lib/api';
import { activityTypeLabels, contractStatusLabels, displayLabel, eventStaffStatusLabels, eventStatusLabels, eventTypeLabels, paymentMethodLabels, paymentTypeLabels, quoteStatusLabels, staffSubroleLabels } from '@/lib/display-labels';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { cleanMenuSections, cleanStringList, MenuSectionsEditor, type MenuSectionValue } from '@/components/admin/structured-list-editors';
import { EventBasicsEditor, EventCommercialEditor, EventOperationsWorkspace, EventSuppliersEditor, EventTasksEditor, eventOperationalSummary, normalizeResourcePlan } from '@/features/events/event-operations';
import { EventInvitationPanel } from '@/features/events/event-invitation-panel';
import { EventPackageManager } from '@/features/events/event-package-manager';
import { RelatedContactModal, type RelatedContactTarget } from '@/features/events/related-contact-modal';
import { OverdueInstallmentCollectionActions } from '@/components/admin/overdue-payment-contact';
import { formatCivilDate } from '@/lib/dates';
import { useSession } from '@/components/session-provider';
import { userCanAccess } from '@/lib/admin-permissions';
import type { Contract, Event, EventExpense, EventExpenseSummary, EventSupplierAssignment, Payment, PaymentSummary, Quote } from '@/features/quotes/types';

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => formatCivilDate(value, 'Sin fecha definida');
const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Sin horario';
const eventTabs = ['resumen', 'ficha', 'cliente', 'comercial', 'menu', 'servicios', 'contrato', 'proveedores', 'staff', 'tareas', 'cronograma', 'invitacion', 'pagos', 'actividad'];
const eventTabLabels: Record<string, string> = { resumen: 'Resumen', ficha: 'Ficha', cliente: 'Cliente', comercial: 'Comercial', menu: 'Menú', servicios: 'Servicios', cronograma: 'Cronograma', proveedores: 'Proveedores', staff: 'Staff', tareas: 'Tareas', invitacion: 'Invitación digital', contrato: 'Contrato', pagos: 'Pagos', actividad: 'Actividad' };

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; name?: string; quoteNumber?: string; firstName?: string; lastName?: string };
  return item.fullName || item.name || item.quoteNumber || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Sin datos';
}

type Activity = { _id: string; type: string; title: string; description?: string; createdAt: string };
type StaffOption = { _id: string; fullName?: string; firstName?: string; lastName?: string; username?: string; staffProfile?: { staffSubroles?: string[] } };
type StaffAssignment = { _id: string; staffUserId?: string | StaffOption; salonId?: string | { _id: string; name?: string }; roleLabel?: string; staffSubrole?: string; shiftStart?: string; shiftEnd?: string; status: string; notes?: string };
type StaffLifecycleAction = 'assign' | 'confirm' | 'complete' | 'no-show' | 'cancel';
type LifecyclePreview = { canProceed: boolean; blockers: { code: string; label: string; count: number }[]; impacts: Record<string, number> };
const staffName = (value: unknown) => typeof value === 'string' ? value : ((value as StaffOption | undefined)?.fullName || [(value as StaffOption | undefined)?.firstName, (value as StaffOption | undefined)?.lastName].filter(Boolean).join(' ') || (value as StaffOption | undefined)?.username || 'Staff');
const staffLifecycleActions: Record<string, { action: StaffLifecycleAction; label: string }[]> = {
  proposed: [{ action: 'assign', label: 'Asignar' }, { action: 'cancel', label: 'Cancelar' }],
  assigned: [{ action: 'confirm', label: 'Confirmar' }, { action: 'cancel', label: 'Cancelar' }],
  confirmed: [{ action: 'complete', label: 'Marcar completado' }, { action: 'no-show', label: 'Marcar ausente' }, { action: 'cancel', label: 'Cancelar' }],
  checked_in: [{ action: 'complete', label: 'Marcar completado' }],
};
const staffActionStatuses: Record<StaffLifecycleAction, string> = { assign: 'assigned', confirm: 'confirmed', complete: 'completed', 'no-show': 'no_show', cancel: 'cancelled' };
const lifecycleImpactLabels: Record<string, string> = {
  staffCancelled: 'Asignaciones de staff a cancelar', calendarItemsCancelled: 'Tareas y recordatorios a cancelar', tablewareReleased: 'Reservas de vajilla a liberar', productionPlansCancelled: 'Planes de producción a cancelar', invitationsCancelled: 'Invitaciones a despublicar', pendingExpensesCancelled: 'Gastos pendientes a anular', paidExpensesPreserved: 'Gastos pagados que se conservan', contractsPreserved: 'Contratos que se conservan', paymentsPreserved: 'Pagos que se conservan', automaticCalendarItemsRemoved: 'Alertas automáticas a retirar',
};
function entityId(value: unknown) {
  return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user } = useSession();
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [event, setEvent] = useState<Event>();
  const [contract, setContract] = useState<Contract>();
  const [proposedContract, setProposedContract] = useState<Contract>();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<EventExpense[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<EventExpenseSummary>({ totalPaid: 0, totalCancelled: 0, activeExpenseCount: 0, cancelledExpenseCount: 0 });
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [pendingStaffAction, setPendingStaffAction] = useState<{ assignment: StaffAssignment; action: Extract<StaffLifecycleAction, 'cancel' | 'no-show'> }>();
  const [relatedContactTarget, setRelatedContactTarget] = useState<RelatedContactTarget>();
  const [staffForm, setStaffForm] = useState({ staffUserId: '', staffSubrole: 'WAITER', roleLabel: '', shiftStart: '', shiftEnd: '', notes: '' });
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
  const [newPayment, setNewPayment] = useState({ amount: '', method: 'cash', type: 'installment', planInstallmentId: '', paidAt: '', reference: '', notes: '' });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [supplementaryLoadError, setSupplementaryLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [lifecyclePreview, setLifecyclePreview] = useState<LifecyclePreview>();
  const [lifecyclePreviewLoading, setLifecyclePreviewLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [reactivation, setReactivation] = useState({ status: 'draft', reason: '' });
  const notice = (message: string, variant: 'success' | 'error' | 'info' = 'success') => showToast({ message, variant });

  const load = async (eventId: string) => {
    setLoading(true);
    setLoadError('');
    setSupplementaryLoadError('');
    try {
      // La ficha principal tiene que poder abrirse aunque falle algún panel secundario
      // (por ejemplo, pagos, proveedores o el directorio de staff). Antes un único 403
      // dejaba `event` vacío y el usuario quedaba atrapado en "Cargando evento...".
      const response = await api.get<{ event: Event; contract?: Contract; proposedContract?: Contract; contracts?: Contract[] }>(`/events/${eventId}`);
      setEvent(response.event);
      setContract(response.contract);
      setProposedContract(response.proposedContract);
      setContracts(response.contracts ?? (response.contract ? [response.contract] : []));
      setLoading(false);

      const [paymentsResult, expensesResult, staffResult, staffOptionsResult, activityResult] = await Promise.allSettled([
        api.get<{ items: Payment[]; summary: PaymentSummary }>(`/events/${eventId}/payments`),
        api.get<{ items: EventExpense[]; summary: EventExpenseSummary }>(`/events/${eventId}/expenses`),
        api.get<{ items: StaffAssignment[] }>(`/events/${eventId}/staff`),
        api.get<{ items: StaffOption[] }>('/users?active=true&limit=100'),
        api.get<{ activities: Activity[] }>(`/events/${eventId}/activity`)
      ]);

      if (paymentsResult.status === 'fulfilled') {
        setPayments(paymentsResult.value.items ?? []);
        setPaymentSummary(paymentsResult.value.summary ?? { paidAmount: 0, refundedAmount: 0, pendingAmount: 0, securityDepositAmount: 0, overdueAmount: 0 });
      }
      if (expensesResult.status === 'fulfilled') {
        setExpenses(expensesResult.value.items ?? []);
        setExpenseSummary(expensesResult.value.summary ?? { totalPaid: 0, totalCancelled: 0, activeExpenseCount: 0, cancelledExpenseCount: 0 });
      }
      if (staffResult.status === 'fulfilled') setStaffAssignments(staffResult.value.items ?? []);
      if (staffOptionsResult.status === 'fulfilled') setStaffOptions(staffOptionsResult.value.items ?? []);
      if (activityResult.status === 'fulfilled') setActivities(activityResult.value.activities ?? []);

      if ([paymentsResult, expensesResult, staffResult, staffOptionsResult, activityResult].some((result) => result.status === 'rejected')) {
        setSupplementaryLoadError('La ficha se cargó, pero algunos datos complementarios no están disponibles todavía. Podés reintentar sin perder los cambios realizados.');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el evento.');
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
  const requestStatusChange = async (status: string) => {
    if (['cancelled', 'lost'].includes(status)) {
      setPendingStatus(status);
      setStatusReason('');
      setLifecyclePreview(undefined);
      setLifecyclePreviewLoading(true);
      try {
        const response = await api.get<{ preview: LifecyclePreview }>(`/events/${event?._id}/cancellation-preview`);
        setLifecyclePreview(response.preview);
      } catch (error) {
        notice(error instanceof Error ? error.message : 'No se pudo analizar la cancelación.', 'error');
        setPendingStatus(null);
      } finally {
        setLifecyclePreviewLoading(false);
      }
      return;
    }
    void updateStatus(status);
  };
  const confirmStatusChange = async () => {
    if (!pendingStatus || !statusReason.trim()) return notice('Indicá el motivo antes de continuar.', 'error');
    if (!lifecyclePreview?.canProceed) return notice('Resolvé los bloqueos antes de cancelar el evento.', 'error');
    await updateStatus(pendingStatus, statusReason);
    setPendingStatus(null);
  };
  const openDeleteModal = async () => {
    if (!event) return;
    setDeleteModalOpen(true);
    setLifecyclePreview(undefined);
    setLifecyclePreviewLoading(true);
    try {
      const response = await api.get<{ preview: LifecyclePreview }>(`/events/${event._id}/deletion-preview`);
      setLifecyclePreview(response.preview);
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo analizar el borrador.', 'error');
      setDeleteModalOpen(false);
    } finally {
      setLifecyclePreviewLoading(false);
    }
  };
  const deleteDraft = async () => {
    if (!event || !lifecyclePreview?.canProceed) return;
    setSaving(true);
    try {
      await api.delete(`/events/${event._id}`);
      notice('Borrador eliminado correctamente.');
      router.replace('/admin/events');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo eliminar el borrador.', 'error');
      setDeleteModalOpen(false);
    } finally {
      setSaving(false);
    }
  };
  const reactivate = async () => {
    if (!event || !reactivation.reason.trim()) return notice('Indicá el motivo de la reactivación.', 'error');
    setSaving(true);
    try {
      const response = await api.post<{ warnings?: string[] }>(`/events/${event._id}/reactivate`, reactivation);
      setReactivateModalOpen(false);
      await load(id);
      notice('Evento reactivado correctamente.');
      response.warnings?.forEach((warning) => notice(warning, 'info'));
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo reactivar el evento.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const patchEvent = async (payload: Record<string, unknown>) => {
    if (!event) return;
    setSaving(true);
    try {
      const result = await api.patch<{ event: Event; warnings?: string[] }>(`/events/${event._id}`, payload);
      await load(id);
      notice('Evento actualizado correctamente.');
      result.warnings?.forEach((warning) => notice(warning, 'info'));
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
  const updateStaffAssignment = async (assignmentId: string, action: StaffLifecycleAction | 'delete') => {
    if (!event) return;
    setSaving(true);
    try {
      if (action === 'delete') await api.delete(`/events/${event._id}/staff/${assignmentId}`);
      else await api.patch(`/events/${event._id}/staff/${assignmentId}`, { status: staffActionStatuses[action] });
      await load(id);
      notice('Asignación actualizada correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo actualizar la asignación.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const requestStaffAction = (assignment: StaffAssignment, action: StaffLifecycleAction) => {
    if (action === 'cancel' || action === 'no-show') {
      setPendingStaffAction({ assignment, action });
      return;
    }
    void updateStaffAssignment(assignment._id, action);
  };
  const registerPayment = async () => {
    if (!event || !Number(newPayment.amount)) return;
    setSaving(true);
    try {
      const response = await api.post<{ items: Payment[]; summary: PaymentSummary; contract?: Contract; paymentPlanSnapshot?: Event['paymentPlanSnapshot']; planOverpaymentAmount?: number }>(`/events/${event._id}/payments`, { ...newPayment, amount: Number(newPayment.amount), paidAt: newPayment.paidAt || undefined, planInstallmentId: newPayment.planInstallmentId || undefined });
      setPayments(response.items ?? []);
      setPaymentSummary(response.summary);
      if (response.contract) setContract(response.contract);
      if (response.paymentPlanSnapshot) setEvent((current) => current ? { ...current, paymentPlanSnapshot: response.paymentPlanSnapshot } : current);
      setNewPayment({ amount: '', method: 'cash', type: 'installment', planInstallmentId: '', paidAt: '', reference: '', notes: '' });
      notice(response.planOverpaymentAmount ? `Pago registrado. El plan de cuotas quedó saldado; el excedente de ${money(response.planOverpaymentAmount)} quedó acreditado al saldo del contrato.` : 'Pago registrado y plan de cuotas actualizado.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo registrar el pago.', 'error');
    } finally { setSaving(false); }
  };
  const addActivity = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const description = note.trim();
    if (!description || !event) return;
    setSaving(true);
    try {
      await api.post(`/events/${event._id}/activities`, { description });
      setNote('');
      await load(id);
      notice('Nota agregada correctamente.');
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo agregar la nota.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const resendReceiptEmail = async (payment: Payment) => {
    if (!event) return;
    setSaving(true);
    try { const response = await api.post<{ emailSent: boolean }>(`/events/${event._id}/payments/${payment._id}/receipt-email`, {}); await load(id); notice(response.emailSent ? 'Comprobante enviado por email.' : 'Comprobante generado; configurá SMTP para enviarlo automáticamente.', response.emailSent ? 'success' : 'error'); }
    catch (error) { notice(error instanceof Error ? error.message : 'No se pudo enviar el comprobante.', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando evento...</div>;
  if (loadError || !event) return <section className="space-y-4"><Link href="/admin/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Eventos</Link><div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm"><h1 className="text-lg font-semibold text-red-950">No se pudo abrir el evento</h1><p className="mt-2 text-sm text-red-800">{loadError || 'El evento no está disponible en este momento.'}</p><Button className="mt-4" variant="secondary" disabled={!id} onClick={() => void load(id)}>Reintentar</Button></div></section>;

  const quote = typeof event.sourceQuoteId === 'string' ? (typeof event.quoteId === 'string' ? undefined : event.quoteId as Quote | undefined) : event.sourceQuoteId as Quote | undefined;
  const lead = typeof event.sourceLeadId === 'string' ? undefined : event.sourceLeadId;
  const customerId = entityId(event.customerId);
  const leadId = entityId(event.sourceLeadId ?? event.leadId);
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
  const toggleTaskStatus = (index: number) => {
    const tasks = (resourcePlan.tasks ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, status: item.status === 'done' ? 'pending' : 'done' } : item);
    saveResourcePlan({ ...resourcePlan, tasks });
  };
  const paymentPlanReady = Boolean(event.paymentPlanSnapshot?.length);
  const isTerminal = ['cancelled', 'lost'].includes(event.status);
  const canCancel = userCanAccess(user, [Permission.EVENTS_CANCEL]);
  const canDeleteDraft = event.status === 'draft' && userCanAccess(user, [Permission.EVENTS_DELETE]);
  const editingDisabled = saving || isTerminal;
  const commercialStatusText = contract
    ? (paymentPlanReady ? 'Contrato y plan de pagos generados.' : 'Contrato generado. Plan de pagos pendiente (cargalo desde Comercial).')
    : (paymentPlanReady ? 'Plan de pagos generado. Pendiente de contrato.' : 'Pendiente de contrato y plan de pagos.');

  return <section className="space-y-6 pb-8">
    <Link href="/admin/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Eventos</Link>
    {supplementaryLoadError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>{supplementaryLoadError}</span><Button variant="secondary" className="shrink-0" disabled={!id} onClick={() => void load(id)}>Reintentar carga</Button></div> : null}
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{event.eventName || displayLabel(eventTypeLabels, event.eventType || '')}</h1><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{displayLabel(eventStatusLabels, event.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{entityName(event.customerId)} · {entityName(event.salonId)}</p></div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canDeleteDraft ? <Button variant="danger" disabled={saving} onClick={() => void openDeleteModal()}><Trash2 className="mr-2 h-4 w-4" />Eliminar borrador</Button> : null}
          {isTerminal && canCancel ? <Button variant="secondary" disabled={saving} onClick={() => { setReactivation({ status: 'draft', reason: '' }); setReactivateModalOpen(true); }}><RotateCcw className="mr-2 h-4 w-4" />Reactivar</Button> : null}
          {!isTerminal ? <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">Estado<Select value={event.status} disabled={saving} onChange={(change) => void requestStatusChange(change.target.value)} className="w-56 py-2">{Object.entries(eventStatusLabels).filter(([value]) => canCancel || !['cancelled', 'lost'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label> : null}
        </div>
      </div>
    </header>
    {isTerminal ? <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-950"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Evento en estado terminal: sólo lectura</p><p className="mt-1 text-sm leading-6 text-rose-800">Se preservan contratos, pagos, gastos e historial. Reactivalo para editarlo; las reservas operativas liberadas deberán revisarse antes de volver a confirmarlo.</p></div></div> : null}
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">{eventTabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>{eventTabLabels[tab]}</button>)}</div>
    <fieldset disabled={isTerminal} className="contents">
    {(activeTab === 'resumen' || activeTab === 'pagos') && <FinancialOverview total={financialTotal} paid={financialPaid} balance={financialBalance} />}
    {activeTab === 'pagos' && !isTerminal && <OverdueInstallmentCollectionActions eventId={event._id} installments={event.paymentPlanSnapshot?.length ? event.paymentPlanSnapshot : contract?.paymentPlanSnapshot ?? []} />}
    {activeTab === 'resumen' && <SupplierExpenseOverview total={financialTotal} expenses={expenses} summary={expenseSummary} />}
    {activeTab === 'contrato' && contracts.length > 1 && <Card title="Historial de contratos"><p className="text-sm text-zinc-500">Las versiones se ordenan desde la más reciente. El contrato aprobado continúa vigente mientras una revisión esté en borrador.</p><div className="mt-4 overflow-x-auto"><table className="min-w-[680px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Versión</th><th>Número</th><th>Estado</th><th>Creado</th><th className="text-right">Acción</th></tr></thead><tbody className="divide-y divide-zinc-100">{contracts.map((item, index) => <tr key={item._id}><td className="py-3">{item.versionNumber ?? contracts.length - index}</td><td className="font-medium">{item.contractNumber}{item._id === contract?._id && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Vigente</span>}{item._id === proposedContract?._id && <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">Propuesto</span>}</td><td>{displayLabel({ draft: 'Borrador', pending_approval: 'Pendiente', approved: 'Aprobado', requires_changes: 'Requiere cambios', cancelled: 'Cancelado', superseded: 'Reemplazado' }, item.status)}</td><td>{formatDate(item.createdAt)}</td><td className="text-right"><Link className="font-medium text-zinc-950 underline" href={`/admin/contracts/${item._id}`}>Ver contrato</Link></td></tr>)}</tbody></table></div></Card>}
    {activeTab === 'resumen' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-3"><Card title="Evento"><Item label="Tipo" value={event.eventType || 'Sin especificar'} /><Item label="Fecha" value={formatDate(event.eventDate)} /><Item label="Horario" value={[event.startTime, event.endTime].filter(Boolean).join(' - ') || 'Sin horario'} /><Item label="Personas" value={event.guestCount || 'Sin definir'} /><Item label="Salón" value={entityName(event.salonId)} /></Card><article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm"><p className="text-sm font-medium text-zinc-300">Importe estimado</p><p className="mt-3 text-3xl font-semibold">{money(event.finalAmount ?? event.estimatedAmount)}</p><p className="mt-5 text-sm text-zinc-300">{commercialStatusText}</p></article><Card title="Notas"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{event.notes || 'Sin notas.'}</p></Card></div><Card title="Pulso operativo"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Cronograma" value={`${operationalSummary.doneTimeline}/${operationalSummary.timelineCount}`} helper="momentos hechos" /><Metric label="Stock e insumos" value={operationalSummary.productCount + operationalSummary.inventoryCount} helper={operationalSummary.resourceIssues ? `${operationalSummary.resourceIssues} con alerta` : 'sin alertas'} /><Metric label="Proveedores" value={operationalSummary.supplierCount} helper="servicios externos" /><Metric label="Tareas" value={`${operationalSummary.doneTasks}/${operationalSummary.taskCount}`} helper={`${operationalSummary.alertCount} alertas`} /></div></Card><Card title="Progreso de tareas">{(resourcePlan.tasks ?? []).filter((item) => item.title?.trim()).length ? <div className="space-y-2">{(resourcePlan.tasks ?? []).filter((item) => item.title?.trim()).map((item) => { const index = (resourcePlan.tasks ?? []).indexOf(item); return <label key={item.id ?? index} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${item.status === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}><input type="checkbox" className="h-4 w-4 rounded border-zinc-300" checked={item.status === 'done'} disabled={saving} onChange={() => toggleTaskStatus(index)} /><span className={`flex-1 ${item.status === 'done' ? 'line-through opacity-70' : ''}`}>{item.title}{item.owner ? <span className="ml-2 text-xs font-normal text-zinc-400">· {item.owner}</span> : null}</span>{item.dueDate ? <span className="shrink-0 text-xs text-zinc-400">{formatDate(item.dueDate)}</span> : null}</label>; })}</div> : <p className="text-sm text-zinc-500">No hay tareas cargadas para este evento. Agregalas desde la pestaña Tareas.</p>}</Card><Card title="Cierre integral"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-2xl text-sm leading-6 text-zinc-600">Revisá los pendientes operativos, financieros y administrativos antes de cerrar el evento.</p><Link href={`/admin/events/${event._id}/closure`}><Button><LockKeyhole className="mr-2 h-4 w-4" />Ir al cierre integral</Button></Link></div></Card></div>}
    {activeTab === 'ficha' && <EventBasicsEditor key={event.updatedAt} event={event} saving={editingDisabled} onSave={(payload) => void patchEvent(payload)} />}
    {activeTab === 'invitacion' && (isTerminal ? <Card title="Invitación digital"><p className="text-sm text-zinc-600">La invitación vinculada se despublicó al cancelar el evento. Reactivá el evento y revisala antes de volver a publicarla.</p></Card> : <EventInvitationPanel event={event} />)}
    {activeTab === 'cliente' && <div className="grid gap-5 lg:grid-cols-2"><Card title="Cliente"><Item label="Nombre" value={entityName(event.customerId)} /><Item label="Lead origen" value={lead ? entityName(lead) : leadId ? 'Lead asociado' : 'No informado'} /><div className="mt-4 flex flex-wrap gap-3">{customerId ? <Button variant="secondary" onClick={() => setRelatedContactTarget({ kind: 'customer', id: customerId })}>Ver cliente</Button> : null}{leadId ? <Button variant="secondary" onClick={() => setRelatedContactTarget({ kind: 'lead', id: leadId })}>Ver lead</Button> : null}</div></Card><Card title="Presupuestos relacionados"><Item label="Número" value={quote?.quoteNumber || 'No informado'} /><Item label="Estado" value={quote ? displayLabel(quoteStatusLabels, quote.status) : 'No informado'} /><Item label="Total" value={money(quote?.totalAmount ?? event.estimatedAmount)} />{quote?._id ? <Link href={`/admin/quotes/${quote._id}`} className="mt-4 inline-flex text-sm font-medium text-zinc-950 underline">Ver presupuesto</Link> : null}</Card></div>}
    {activeTab === 'comercial' && <div className="space-y-5">{!isTerminal ? <EventPackageManager event={event} onApplied={() => load(id)} /> : null}<EventCommercialEditor key={event.updatedAt} event={event} saving={editingDisabled} onSave={(payload) => void patchEvent(payload)} /></div>}
    {activeTab === 'menu' && <EventMenuEditor key={event.updatedAt} initialValue={menuSections} saving={editingDisabled} onSave={(value) => patchEvent({ menuSnapshot: cleanMenuSections(value) })} />}
    {activeTab === 'servicios' && <EventServicesEditor key={event.updatedAt} initialValue={event.servicesSnapshot ?? []} saving={editingDisabled} onSave={(value) => patchEvent({ servicesSnapshot: cleanStringList(value) })} />}
    {activeTab === 'cronograma' && <EventOperationsWorkspace key={event.updatedAt} event={event} plan={resourcePlan} saving={editingDisabled} onSave={saveResourcePlan} onSyncSummary={(payload) => void patchEvent(payload)} onNotice={notice} />}
    {activeTab === 'proveedores' && <EventSuppliersEditor key={event.updatedAt} plan={resourcePlan} saving={editingDisabled} onSave={(items) => void saveSuppliers(items)} />}
    {activeTab === 'staff' && <Card title="Equipo del evento"><div className="flex justify-end"><Button disabled={saving} onClick={() => setStaffModalOpen(true)}><CalendarPlus className="mr-2 h-4 w-4" />Asignar integrante</Button></div>{staffAssignments.length ? <div className="overflow-x-auto"><table className="min-w-[840px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Persona</th><th>Rol</th><th>Turno</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{staffAssignments.map((assignment) => { const actions = staffLifecycleActions[assignment.status] ?? []; const canDelete = ['proposed', 'assigned'].includes(assignment.status); return <tr key={assignment._id}><td className="py-3">{staffName(assignment.staffUserId)}</td><td>{assignment.roleLabel || displayLabel(staffSubroleLabels, assignment.staffSubrole ?? '')}</td><td>{[formatDateTime(assignment.shiftStart), assignment.shiftEnd ? formatDateTime(assignment.shiftEnd) : ''].filter(Boolean).join(' - ')}</td><td>{displayLabel(eventStaffStatusLabels, assignment.status)}</td><td><div className="flex justify-end gap-2">{actions.map(({ action, label }) => <Button key={action} variant="secondary" className="px-3 py-2" disabled={saving} onClick={() => requestStaffAction(assignment, action)}>{label}</Button>)}{canDelete ? <Button variant="danger" className="px-3 py-2" disabled={saving} onClick={() => void updateStaffAssignment(assignment._id, 'delete')}><Trash2 className="h-4 w-4" /><span className="sr-only">Quitar</span></Button> : null}{!actions.length && !canDelete ? <span className="py-2 text-xs text-zinc-500">Sin acciones pendientes</span> : null}</div></td></tr>; })}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">No hay integrantes asignados a este evento.</p>}</Card>}
    {activeTab === 'tareas' && <EventTasksEditor key={event.updatedAt} plan={resourcePlan} saving={editingDisabled} onSave={saveResourcePlan} />}
    {activeTab === 'contrato' && proposedContract && <Card title="Cambio contractual propuesto"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-amber-50 px-4 py-4"><div><p className="font-semibold text-amber-950">{proposedContract.contractNumber}</p><p className="mt-1 text-sm text-amber-800">Versión todavía no vigente · Total propuesto: {money(proposedContract.totalAmount)}</p></div><Link href={`/admin/contracts/${proposedContract._id}`}><Button variant="secondary">Revisar borrador</Button></Link></div></Card>}
    {activeTab === 'contrato' && <div className="space-y-5">{contract ? <Card title="Contrato generado"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-50 px-4 py-4"><div><p className="font-semibold text-emerald-950">{contract.contractNumber}</p><p className="mt-1 text-sm text-emerald-700">Estado: {displayLabel(contractStatusLabels, contract.status)} · Total contractual: {money(contract.totalAmount)}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/contracts/${contract._id}`}><Button><FileText className="mr-2 h-4 w-4" />Ver contrato</Button></Link><Link href={`/admin/contracts/${contract._id}?tab=adendas`}><Button variant="secondary">Ver adendas</Button></Link><Link href={`/admin/contracts/${contract._id}/print`}><Button variant="secondary"><Printer className="mr-2 h-4 w-4" />Imprimir</Button></Link></div></div></Card> : null}<Card title="Checklist para contrato"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries({ customerComplete: 'Cliente completo', document: 'DNI/documento', address: 'Domicilio', salonDefined: 'Salón definido', dateDefined: 'Fecha definida', timeDefined: 'Horario definido', guestCount: 'Cantidad de invitados', totalPrice: 'Precio total', deposit: 'Seña', paymentTerms: 'Condiciones de pago', menu: 'Menú', includedServices: 'Servicios incluidos' }).map(([key, label]) => <span key={key} className={`rounded-xl px-3 py-2 text-sm font-medium ${checklist[key] ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{label}: {checklist[key] ? 'OK' : 'Pendiente'}</span>)}</div>{contract ? <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-700">Este evento ya tiene contrato activo.</p> : canCreateContract ? <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-4"><p className="text-sm text-emerald-700">El evento tiene los datos mínimos para generar contrato.</p><Button disabled={saving} className="mt-4" onClick={() => void createContract()}><FileText className="mr-2 h-4 w-4" />{saving ? 'Creando contrato...' : 'Crear contrato'}</Button></div> : <div className="mt-5 rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-800"><p className="font-medium">Faltan datos para generar contrato:</p><ul className="mt-2 list-disc pl-5">{contractMissing.map((item) => <li key={item}>{item}</li>)}</ul></div>}</Card></div>}
    {activeTab === 'pagos' && <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-4"><Card title="Cobrado"><Item label="Impacta saldo" value={money(paymentSummary.paidAmount)} /></Card><Card title="Pendiente"><Item label="Programado" value={money(paymentSummary.pendingAmount)} /></Card><Card title="Vencido"><Item label="Importe vencido" value={money(paymentSummary.overdueAmount)} /></Card><Card title="Garantía"><Item label="Recibida" value={money(paymentSummary.securityDepositAmount)} /></Card></div><Card title="Registrar cobro"><p className="text-sm text-zinc-500">La seña, un saldo global, un extra o un ajuste se cobran aparte y no afectan el plan de cuotas. Elegí "Cuota" para cobrar una cuota pendiente, adelantar una futura o cargar un importe libre (se aplica desde la próxima cuota sin cobrar); si el importe supera la cuota elegida, el excedente se aplica en cascada a las cuotas siguientes en orden hasta agotarse.</p><div className="mt-4 grid gap-3 lg:grid-cols-6"><Select value={newPayment.type} onChange={(change) => { const type = change.target.value; const depositAmount = Number(commercial.depositAmount || 0); setNewPayment((current) => ({ ...current, type, planInstallmentId: type === 'installment' ? current.planInstallmentId : '', amount: type === 'deposit' && !current.amount && depositAmount ? String(depositAmount) : current.amount })); }}>{Object.entries(paymentTypeLabels).filter(([value]) => ['deposit', 'installment', 'balance', 'extra', 'adjustment', 'other'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={newPayment.planInstallmentId} disabled={newPayment.type !== 'installment'} onChange={(change) => { const installment = event.paymentPlanSnapshot?.find((item) => item.id === change.target.value); setNewPayment((current) => ({ ...current, planInstallmentId: change.target.value, amount: installment ? String(Math.max(0, Number(installment.amount || 0) - Number(installment.paidAmount || 0))) : current.amount })); }}><option value="">Importe libre / próxima cuota</option>{(event.paymentPlanSnapshot ?? []).filter((item) => item.status !== 'paid' && item.status !== 'cancelled').map((item, index) => <option key={item.id ?? index} value={item.id ?? ''}>{item.label || `Cuota ${index + 1}`} · pendiente {money(Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)))}</option>)}</Select><Input type="number" min={1} value={newPayment.amount} onChange={(change) => setNewPayment((current) => ({ ...current, amount: change.target.value }))} placeholder="Importe recibido" /><Select value={newPayment.method} onChange={(change) => setNewPayment((current) => ({ ...current, method: change.target.value }))}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input value={newPayment.reference} onChange={(change) => setNewPayment((current) => ({ ...current, reference: change.target.value }))} placeholder="Comprobante / referencia" /><Button disabled={saving || !newPayment.amount || !contract} onClick={() => void registerPayment()}><CreditCard className="mr-2 h-4 w-4" />Registrar pago</Button></div><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><label className="block space-y-1.5"><span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Fecha de cobro</span><Input type="date" value={newPayment.paidAt} onChange={(change) => setNewPayment((current) => ({ ...current, paidAt: change.target.value }))} /></label><p className="max-w-xl text-xs leading-5 text-zinc-500">Para registrar un pago histórico, indicá la fecha en que se realizó. Si la dejás vacía, se usará la fecha actual.</p></div>{!contract && <p className="mt-3 text-sm text-amber-700">Para registrar un cobro primero generá el contrato desde este evento.</p>}<Textarea className="mt-3" value={newPayment.notes} onChange={(change) => setNewPayment((current) => ({ ...current, notes: change.target.value }))} placeholder="Notas opcionales" /></Card><Card title="Plan de cuotas">{event.paymentPlanSnapshot?.length ? <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Cuota</th><th>Ventana de pago</th><th>Programado</th><th>Cobrado</th><th>Estado</th></tr></thead><tbody className="divide-y divide-zinc-100">{event.paymentPlanSnapshot.map((item, index) => <tr key={item.id ?? index}><td className="py-3 font-medium">{item.label || `Cuota ${index + 1}`}</td><td>{formatDate(item.paymentWindowStart)} — {formatDate(item.paymentWindowEnd ?? item.dueDate)}</td><td>{money(item.amount)}</td><td>{money(item.paidAmount)}</td><td>{item.status === 'partial' ? 'Pago parcial' : item.status === 'paid' ? 'Cobrada' : 'Pendiente'}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">Todavía no hay cuotas programadas. Crealas desde Comercial.</p>}</Card><Card title="Historial de pagos">{payments.length ? <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Número</th><th>Tipo</th><th>Medio</th><th>Importe</th><th>Fecha</th><th>Comprobante</th><th className="text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{payments.map((payment) => <tr key={payment._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/payments/${payment._id}`}>{payment.paymentNumber}</Link></td><td>{displayLabel(paymentTypeLabels, payment.type)}</td><td>{payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'No informado'}</td><td>{money(payment.amount)}</td><td>{formatDate(payment.paidAt ?? payment.dueDate)}</td><td>{payment.receiptPdfSecureUrl ? <a className="font-medium text-zinc-950 underline" href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer">PDF</a> : 'Generando...'}</td><td><div className="flex justify-end gap-1">{payment.receiptPdfSecureUrl && <><a href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><Eye className="h-4 w-4" /><span className="sr-only">Previsualizar</span></Button></a><a href={payment.receiptPdfSecureUrl} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><Download className="h-4 w-4" /><span className="sr-only">Descargar</span></Button></a><a href={`https://wa.me/${String((typeof event.customerId === 'string' ? '' : event.customerId?.phone) ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Comprobante de pago ${payment.paymentNumber}: ${payment.receiptPdfSecureUrl}`)}`} target="_blank" rel="noreferrer"><Button variant="secondary" className="px-2 py-2"><MessageCircle className="h-4 w-4" /><span className="sr-only">WhatsApp</span></Button></a></>}<Button variant="secondary" className="px-2 py-2" disabled={saving} onClick={() => void resendReceiptEmail(payment)}><Mail className="h-4 w-4" /><span className="sr-only">Enviar por email</span></Button></div></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">No hay pagos registrados para este evento.</p>}</Card></div>}
    {activeTab === 'actividad' && <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <Card title="Agregar nota">
        <form onSubmit={addActivity} className="space-y-3">
          <Textarea value={note} onChange={(change) => setNote(change.target.value)} required placeholder="Escribí una nota interna sobre este evento…" />
          <div className="flex justify-end"><Button disabled={saving || !note.trim()}>{saving ? 'Guardando...' : 'Agregar nota'}</Button></div>
        </form>
      </Card>
      <Card title="Actividad">
        {activities.length ? <div className="space-y-4">{activities.map((item) => <div key={item._id} className="relative border-l-2 border-zinc-200 pl-5 pb-1 before:absolute before:-left-[5px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-zinc-950"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-zinc-900">{displayLabel(activityTypeLabels, item.type)}</p><time className="text-xs text-zinc-400">{formatDateTime(item.createdAt)}</time></div><p className="mt-1 text-sm leading-6 text-zinc-600">{item.description || item.title}</p></div>)}</div> : <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">Todavía no hay actividad registrada para este evento.</p>}
      </Card>
    </div>}
    </fieldset>
    <Modal open={Boolean(pendingStatus)} title={pendingStatus === 'lost' ? 'Marcar evento como perdido' : 'Cancelar evento'} description="Revisá el impacto y dejá asentado el motivo antes de confirmar." onClose={() => setPendingStatus(null)}>
      <div className="space-y-5 p-5 sm:p-8">
        {lifecyclePreviewLoading ? <p className="rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">Analizando contratos, cobros y recursos operativos…</p> : null}
        {lifecyclePreview?.blockers.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="flex items-center gap-2 font-semibold text-red-950"><AlertTriangle className="h-4 w-4" />No se puede continuar</p><ul className="mt-2 space-y-1 text-sm text-red-800">{lifecyclePreview.blockers.map((blocker) => <li key={blocker.code}>• {blocker.label}{blocker.count > 1 ? ` (${blocker.count})` : ''}</li>)}</ul></div> : null}
        {lifecyclePreview?.canProceed ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold text-amber-950">Cambios que se aplicarán juntos</p><ul className="mt-2 space-y-1 text-sm text-amber-800">{Object.entries(lifecyclePreview.impacts).filter(([, count]) => count > 0).map(([key, count]) => <li key={key}>• {lifecycleImpactLabels[key] ?? key}: {count}</li>)}</ul><p className="mt-3 text-sm text-amber-900">Los contratos, pagos y gastos ya pagados se conservan como historial. No se enviarán nuevos recordatorios de cobro.</p></div> : null}
        <label className="block text-sm font-medium text-zinc-700">Motivo (obligatorio)
          <Textarea className="mt-2" value={statusReason} onChange={(change) => setStatusReason(change.target.value)} placeholder="Explicá por qué se cancela o se pierde el evento." />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => setPendingStatus(null)}>Volver</Button>
          <Button variant="danger" disabled={saving || lifecyclePreviewLoading || !lifecyclePreview?.canProceed || !statusReason.trim()} onClick={() => void confirmStatusChange()}>Confirmar</Button>
        </div>
      </div>
    </Modal>
    <Modal open={deleteModalOpen} title="Eliminar borrador" description="La eliminación es lógica y sólo se permite si el borrador no tiene trazabilidad ni operaciones asociadas." onClose={() => setDeleteModalOpen(false)}>
      <div className="space-y-5 p-5 sm:p-8">
        {lifecyclePreviewLoading ? <p className="rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">Comprobando dependencias del borrador…</p> : null}
        {lifecyclePreview?.blockers.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" />Este borrador debe conservarse</p><ul className="mt-2 space-y-1 text-sm text-amber-800">{lifecyclePreview.blockers.map((blocker) => <li key={blocker.code}>• {blocker.label}{blocker.count > 1 ? ` (${blocker.count})` : ''}</li>)}</ul><p className="mt-3 text-sm text-amber-900">Si ya no seguirá adelante, usá Cancelar o Marcar como perdido para mantener el historial.</p></div> : null}
        {lifecyclePreview?.canProceed ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Se ocultará el borrador y se retirarán sus alertas automáticas.</p><p className="mt-2">Esta acción no borra clientes ni información de otros módulos.</p></div> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setDeleteModalOpen(false)}>Volver</Button><Button variant="danger" disabled={saving || lifecyclePreviewLoading || !lifecyclePreview?.canProceed} onClick={() => void deleteDraft()}><Trash2 className="mr-2 h-4 w-4" />Eliminar borrador</Button></div>
      </div>
    </Modal>
    <Modal open={reactivateModalOpen} title="Reactivar evento" description="La reactivación recupera la ficha, pero no vuelve a reservar recursos liberados automáticamente." onClose={() => setReactivateModalOpen(false)}>
      <div className="space-y-4 p-5 sm:p-8">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">Después de reactivar revisá staff, vajilla, calendario, proveedores y producción. Si había una invitación publicada, quedará despublicada hasta una revisión manual.</div>
        <label className="block text-sm font-medium text-zinc-700">Estado de reapertura<Select className="mt-2" value={reactivation.status} onChange={(change) => setReactivation((current) => ({ ...current, status: change.target.value }))}>{Object.entries(eventStatusLabels).filter(([value]) => !['cancelled', 'lost'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="block text-sm font-medium text-zinc-700">Motivo (obligatorio)<Textarea className="mt-2" value={reactivation.reason} onChange={(change) => setReactivation((current) => ({ ...current, reason: change.target.value }))} placeholder="Explicá por qué se reabre el evento." /></label>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={saving} onClick={() => setReactivateModalOpen(false)}>Volver</Button><Button disabled={saving || !reactivation.reason.trim()} onClick={() => void reactivate()}><RotateCcw className="mr-2 h-4 w-4" />Reactivar evento</Button></div>
      </div>
    </Modal>
    <Modal open={staffModalOpen} title="Asignar integrante" description="La asignación queda vinculada a este evento y al salón del evento." onClose={() => setStaffModalOpen(false)}><div className="space-y-4 p-6"><Select value={staffForm.staffUserId} onChange={(event) => setStaffForm((current) => ({ ...current, staffUserId: event.target.value }))}><option value="">Seleccionar usuario</option>{staffOptions.map((staff) => <option key={staff._id} value={staff._id}>{staffName(staff)}</option>)}</Select><div className="grid gap-3 md:grid-cols-2"><Select value={staffForm.staffSubrole} onChange={(event) => setStaffForm((current) => ({ ...current, staffSubrole: event.target.value }))}>{Object.entries(staffSubroleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input placeholder="Rol específico opcional" value={staffForm.roleLabel} onChange={(event) => setStaffForm((current) => ({ ...current, roleLabel: event.target.value }))} /><label className="block text-sm font-medium text-zinc-700">Inicio del turno<Input type="datetime-local" className="mt-1.5" value={staffForm.shiftStart} onChange={(event) => setStaffForm((current) => ({ ...current, shiftStart: event.target.value }))} /></label><label className="block text-sm font-medium text-zinc-700">Fin del turno<Input type="datetime-local" className="mt-1.5" value={staffForm.shiftEnd} onChange={(event) => setStaffForm((current) => ({ ...current, shiftEnd: event.target.value }))} /></label></div><Textarea placeholder="Notas" value={staffForm.notes} onChange={(event) => setStaffForm((current) => ({ ...current, notes: event.target.value }))} /><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={() => setStaffModalOpen(false)}>Cancelar</Button><Button disabled={saving || !staffForm.staffUserId} onClick={() => void assignStaff()}>Asignar</Button></div></div></Modal>
    <Modal open={Boolean(pendingStaffAction)} title={pendingStaffAction?.action === 'no-show' ? 'Marcar integrante como ausente' : 'Cancelar asignación'} description={pendingStaffAction?.action === 'no-show' ? 'Confirmá que la persona no se presentó al evento.' : 'Confirmá la cancelación de esta asignación.'} onClose={() => setPendingStaffAction(undefined)}><div className="p-6"><p className="text-sm text-zinc-600">{pendingStaffAction ? staffName(pendingStaffAction.assignment.staffUserId) : ''}</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPendingStaffAction(undefined)}>Volver</Button><Button variant="danger" disabled={saving || !pendingStaffAction} onClick={() => { if (!pendingStaffAction) return; const { assignment, action } = pendingStaffAction; setPendingStaffAction(undefined); void updateStaffAssignment(assignment._id, action); }}>{pendingStaffAction?.action === 'no-show' ? 'Marcar ausente' : 'Cancelar asignación'}</Button></div></div></Modal>
    <RelatedContactModal target={relatedContactTarget} onClose={() => setRelatedContactTarget(undefined)} onSaved={() => load(id)} onNotice={notice} />
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
