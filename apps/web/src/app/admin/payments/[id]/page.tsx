'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, RotateCcw, XCircle } from 'lucide-react';
import { Permission } from '@mym/shared';
import { api } from '@/lib/api';
import { displayLabel, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from '@/lib/display-labels';
import { Button, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { useSession } from '@/components/session-provider';
import { userCanAccess } from '@/lib/admin-permissions';
import { OverduePaymentContact, isOverduePaymentDate } from '@/components/admin/overdue-payment-contact';
import type { Payment } from '@/features/quotes/types';

type ConfirmAction = { path: 'cancel' | 'refund'; title: string; description: string };

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';
const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const entityName = (value: unknown) => {
  if (!value || typeof value === 'string') return 'Sin datos';
  const item = value as { fullName?: string; eventName?: string; eventType?: string; contractNumber?: string; quoteNumber?: string; name?: string };
  return item.fullName || item.eventName || item.eventType || item.contractNumber || item.quoteNumber || item.name || 'Sin datos';
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const { user } = useSession();
  const canOverride = userCanAccess(user, [Permission.PAYMENTS_APPROVE]);
  const [id, setId] = useState('');
  const [payment, setPayment] = useState<Payment>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [allowOverride, setAllowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const load = async (paymentId: string) => {
    setLoading(true);
    try {
      const response = await api.get<{ payment: Payment }>(`/payments/${paymentId}`);
      setPayment(response.payment);
      setMethod(response.payment.method ?? 'cash');
      setNotes(response.payment.notes ?? '');
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el pago.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  const action = async (path: string, message: string) => {
    setSaving(true);
    try {
      await api.post(`/payments/${id}/${path}`, path === 'mark-paid' ? { method, notes } : { notes });
      await load(id);
      showToast({ message, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el pago.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const openConfirm = (next: ConfirmAction) => {
    setConfirmAction(next);
    setConfirmReason('');
    setAllowOverride(false);
    setOverrideReason('');
  };
  const submitConfirm = async () => {
    if (!confirmAction) return;
    if (!confirmReason.trim()) {
      showToast({ message: 'Indicá el motivo antes de continuar.', variant: 'error' });
      return;
    }
    if (allowOverride && !overrideReason.trim()) {
      showToast({ message: 'Indicá el motivo de la autorización.', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { reason: confirmReason };
      if (confirmAction.path === 'refund' && allowOverride) {
        body.allowExcessRefund = true;
        body.overrideReason = overrideReason;
      }
      await api.post(`/payments/${id}/${confirmAction.path}`, body);
      await load(id);
      showToast({ message: confirmAction.path === 'cancel' ? 'Pago cancelado.' : 'Reembolso registrado.', variant: 'success' });
      setConfirmAction(null);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el pago.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.patch(`/payments/${id}`, { notes });
      await load(id);
      showToast({ message: 'Pago actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el pago.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !payment) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando pago...</div>;
  const contractId = entityId(payment.contractId);
  const eventId = entityId(payment.eventId);
  const customerId = entityId(payment.customerId);
  const isTicketOrder = payment.source === 'ticket_order';
  const ticketOrder = typeof payment.ticketOrderId === 'string' ? undefined : payment.ticketOrderId;

  return <section className="space-y-6 pb-8">
    <Link href="/admin/payments" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Ingresos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{payment.paymentNumber}</h1><p className="mt-2 text-sm text-zinc-500">{displayLabel(paymentTypeLabels, payment.type)} · {displayLabel(paymentStatusLabels, payment.status)}</p></div>{isTicketOrder ? null : <div className="flex flex-wrap gap-2"><Button disabled={saving || payment.status === 'paid'} onClick={() => void action('mark-paid', 'Pago marcado como cobrado.')}><CheckCircle2 className="mr-2 h-4 w-4" />Marcar cobrado</Button><Button variant="secondary" disabled={saving || payment.status !== 'paid' || payment.type === 'refund'} onClick={() => openConfirm({ path: 'refund', title: 'Reembolsar pago', description: 'El reembolso queda registrado como un movimiento propio, sin modificar el pago original.' })}><RotateCcw className="mr-2 h-4 w-4" />Reembolsar</Button><Button variant="secondary" disabled={saving || payment.status === 'cancelled'} onClick={() => openConfirm({ path: 'cancel', title: 'Cancelar pago', description: 'El pago cancelado deja de contarse en el saldo del contrato.' })}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button></div>}</div></header>
    {isTicketOrder ? <Card title="Compra de entrada digital"><Item label="Comprador" value={ticketOrder?.buyer?.name || 'Sin datos'} /><Item label="Email" value={ticketOrder?.buyer?.email || 'Sin datos'} />{ticketOrder ? <Link className="text-sm font-medium text-zinc-950 underline" href={`/admin/digital-tickets/orders/${ticketOrder._id}`}>Ver orden {ticketOrder.publicId}</Link> : null}<p className="text-xs text-zinc-500">Este pago se registró automáticamente al aprobarse la compra. Para reembolsarlo o modificarlo, hacelo desde la orden en Entradas digitales.</p></Card> : null}
    <div className="grid gap-5 lg:grid-cols-3"><Card title="Pago"><Item label="Importe" value={money(payment.amount)} /><Item label="Estado" value={displayLabel(paymentStatusLabels, payment.status)} /><Item label="Tipo" value={displayLabel(paymentTypeLabels, payment.type)} /><Item label="Medio" value={payment.method ? displayLabel(paymentMethodLabels, payment.method) : 'No informado'} /><Item label="Vencimiento" value={formatDate(payment.dueDate)} /><Item label="Cobrado" value={formatDate(payment.paidAt)} /></Card>{isTicketOrder ? null : <Card title="Asociaciones"><Item label="Cliente" value={entityName(payment.customerId)} />{customerId ? <Link className="text-sm font-medium text-zinc-950 underline" href={`/admin/customers/${customerId}`}>Ver cliente</Link> : null}<Item label="Evento" value={entityName(payment.eventId)} />{eventId ? <Link className="text-sm font-medium text-zinc-950 underline" href={`/admin/events/${eventId}`}>Ver evento</Link> : null}<Item label="Contrato" value={entityName(payment.contractId)} />{contractId ? <Link className="text-sm font-medium text-zinc-950 underline" href={`/admin/contracts/${contractId}?tab=pagos`}>Ver contrato</Link> : null}</Card>}{isTicketOrder ? null : <Card title="Cobro"><label className="block text-sm font-medium text-zinc-700">Medio<Select className="mt-2" value={method} onChange={(event) => setMethod(event.target.value)}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas internas" /><Button variant="secondary" disabled={saving} onClick={() => void saveNotes()}>Guardar notas</Button></Card>}</div>
    <Card title="Referencias"><Item label="Recibo" value={payment.receiptNumber || 'No informado'} /><Item label="Referencia" value={payment.reference || 'No informado'} /><Item label="Afecta saldo contractual" value={payment.affectsContractBalance ? 'Sí' : 'No'} /></Card>
    {!isTicketOrder && payment.status === 'pending' && isOverduePaymentDate(payment.dueDate) ? <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm"><h2 className="font-semibold text-amber-950">Pago vencido</h2><p className="mt-1 text-sm text-amber-800">Prepará un recordatorio profesional y cordial para solicitar el pago.</p><div className="mt-4"><OverduePaymentContact target={{ source: 'payment', paymentId: id }} /></div></div> : null}
    <Modal open={Boolean(confirmAction)} title={confirmAction?.title ?? ''} description={confirmAction?.description} onClose={() => setConfirmAction(null)}>
      <div className="space-y-4 p-5 sm:p-8">
        <label className="block text-sm font-medium text-zinc-700">Motivo (obligatorio)
          <Textarea className="mt-2" value={confirmReason} onChange={(event) => setConfirmReason(event.target.value)} placeholder="Explicá por qué se realiza esta acción." />
        </label>
        {confirmAction?.path === 'refund' && canOverride ? <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={allowOverride} onChange={(event) => setAllowOverride(event.target.checked)} />
            Autorizar reembolso por encima de lo disponible
          </label>
          {allowOverride ? <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Motivo de la autorización excepcional." /> : null}
        </div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => setConfirmAction(null)}>Volver</Button>
          <Button variant="danger" disabled={saving} onClick={() => void submitConfirm()}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-4">{children}</div></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
