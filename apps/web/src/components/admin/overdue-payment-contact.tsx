'use client';

import { useState } from 'react';
import { LoaderCircle, Mail, MessageCircle } from 'lucide-react';
import { Permission } from '@mym/shared';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { useSession } from '@/components/session-provider';
import { TableActionButton } from '@/components/admin/table-action-button';
import { Button, Input, Modal, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

export type PaymentCollectionTarget =
  | { source: 'payment'; paymentId: string }
  | { source: 'installment'; eventId: string; installmentId: string };

type PaymentCollectionContact = {
  customer: { fullName: string; email?: string; phone?: string };
  obligation: { label: string; amount: number; dueDate: string; eventName?: string };
  email: { subject: string; message: string };
  whatsapp: { message: string };
};

type Installment = {
  id?: string;
  label?: string;
  amount?: number;
  paidAmount?: number;
  status?: string;
  dueDate?: string;
  paymentWindowEnd?: string;
};

type PaymentListItem = {
  _id: string;
  paymentNumber?: string;
  dueDate?: string;
  amount?: number;
  status?: string;
  source?: string;
  customerId?: string | { fullName?: string; firstName?: string; lastName?: string };
};

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'sin fecha';

function argentinaDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isOverduePaymentDate(value?: string): boolean {
  const dueDate = value?.slice(0, 10);
  return Boolean(dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < argentinaDateKey());
}

export function OverduePaymentContact({ target, iconOnly = false, label = 'Contactar al cliente' }: { target: PaymentCollectionTarget; iconOnly?: boolean; label?: string }) {
  const { user, loading: sessionLoading } = useSession();
  const { showToast } = useToast();
  const [contact, setContact] = useState<PaymentCollectionContact>();
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState<'email' | 'whatsapp' | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const canContact = userCanAccess(user, [Permission.PAYMENTS_CREATE]);

  const openPreview = async () => {
    setLoadingPreview(true);
    try {
      const response = await api.post<{ contact: PaymentCollectionContact }>('/payment-collections/preview', { target });
      setContact(response.contact);
      setEmailSubject(response.contact.email.subject);
      setEmailMessage(response.contact.email.message);
      setWhatsappMessage(response.contact.whatsapp.message);
      setOpen(true);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo preparar el contacto.', variant: 'error' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendEmail = async () => {
    setSending('email');
    try {
      await api.post('/payment-collections/send-email', { target, subject: emailSubject, message: emailMessage });
      showToast({ message: 'El recordatorio de pago se envió por email.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo enviar el email.', variant: 'error' });
    } finally {
      setSending(null);
    }
  };

  const openWhatsApp = async () => {
    const draftWindow = window.open('', '_blank');
    setSending('whatsapp');
    try {
      const response = await api.post<{ whatsappUrl: string }>('/payment-collections/open-whatsapp', { target, message: whatsappMessage });
      let opened = false;
      if (draftWindow) {
        draftWindow.opener = null;
        draftWindow.location.href = response.whatsappUrl;
        opened = true;
      } else {
        opened = Boolean(window.open(response.whatsappUrl, '_blank', 'noopener,noreferrer'));
      }
      showToast(opened
        ? { message: 'Se abrió un borrador de WhatsApp para que lo revises y envíes.', variant: 'success' }
        : { message: 'El navegador bloqueó la apertura de WhatsApp. Habilitá las ventanas emergentes e intentá nuevamente.', variant: 'error' });
    } catch (error) {
      draftWindow?.close();
      showToast({ message: error instanceof Error ? error.message : 'No se pudo abrir WhatsApp.', variant: 'error' });
    } finally {
      setSending(null);
    }
  };

  if (sessionLoading || !canContact) return null;

  return <>
    {iconOnly ? <TableActionButton icon={MessageCircle} label="Contactar por pago vencido" disabled={loadingPreview} onClick={() => void openPreview()} /> : <Button variant="secondary" disabled={loadingPreview} onClick={() => void openPreview()}>{loadingPreview ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}{loadingPreview ? 'Preparando...' : label}</Button>}
    <Modal open={open} title="Contactar por pago vencido" description="Revisá y editá el mensaje antes de enviarlo. El email se envía desde M&M Eventos; WhatsApp abre un borrador para que confirmes el envío." onClose={() => setOpen(false)}>
      {contact ? <div className="space-y-6 p-5 sm:p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">{contact.obligation.label}</p><p className="mt-1">Saldo: {money(contact.obligation.amount)} · vencido el {formatDate(contact.obligation.dueDate)}{contact.obligation.eventName ? ` · ${contact.obligation.eventName}` : ''}</p></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2"><p className="rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-500">Cliente: </span><span className="font-medium text-zinc-900">{contact.customer.fullName}</span></p><p className="rounded-xl bg-zinc-50 px-3 py-2"><span className="text-zinc-500">Email: </span><span className="font-medium text-zinc-900">{contact.customer.email || 'No registrado'}</span></p><p className="rounded-xl bg-zinc-50 px-3 py-2 sm:col-span-2"><span className="text-zinc-500">WhatsApp: </span><span className="font-medium text-zinc-900">{contact.customer.phone || 'No registrado'}</span></p></div>
        <section className="space-y-3 rounded-2xl border border-zinc-200 p-4"><div><h3 className="font-semibold text-zinc-950">Email</h3><p className="mt-1 text-sm text-zinc-500">Al confirmar, el email se envía inmediatamente y queda auditado.</p></div><label className="block text-sm font-medium text-zinc-700">Asunto<Input className="mt-1.5" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></label><label className="block text-sm font-medium text-zinc-700">Mensaje<Textarea className="mt-1.5" value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} /></label><div className="flex justify-end"><Button disabled={!contact.customer.email || !emailSubject.trim() || !emailMessage.trim() || sending !== null} onClick={() => void sendEmail()}>{sending === 'email' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}{sending === 'email' ? 'Enviando...' : 'Enviar email ahora'}</Button></div>{!contact.customer.email ? <p className="text-sm text-amber-700">El cliente no tiene un email registrado.</p> : null}</section>
        <section className="space-y-3 rounded-2xl border border-zinc-200 p-4"><div><h3 className="font-semibold text-zinc-950">WhatsApp</h3><p className="mt-1 text-sm text-zinc-500">Se abrirá el texto precompletado en WhatsApp. Revisalo allí antes de enviarlo.</p></div><label className="block text-sm font-medium text-zinc-700">Mensaje<Textarea className="mt-1.5" value={whatsappMessage} onChange={(event) => setWhatsappMessage(event.target.value)} /></label><div className="flex justify-end"><Button variant="secondary" disabled={!contact.customer.phone || !whatsappMessage.trim() || sending !== null} onClick={() => void openWhatsApp()}>{sending === 'whatsapp' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}{sending === 'whatsapp' ? 'Abriendo...' : 'Abrir borrador de WhatsApp'}</Button></div>{!contact.customer.phone ? <p className="text-sm text-amber-700">El cliente no tiene un número de WhatsApp registrado.</p> : null}</section>
      </div> : null}
    </Modal>
  </>;
}

export function OverdueInstallmentCollectionActions({ eventId, installments }: { eventId: string; installments: Installment[] }) {
  const overdue = installments.filter((installment) => {
    const dueDate = installment.paymentWindowEnd ?? installment.dueDate;
    const remaining = Math.max(0, Number(installment.amount ?? 0) - Number(installment.paidAmount ?? 0));
    return Boolean(installment.id) && !['paid', 'cancelled'].includes(installment.status ?? '') && remaining > 0 && isOverduePaymentDate(dueDate);
  });
  if (!overdue.length) return null;

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm"><div><h2 className="font-semibold text-amber-950">Cuotas vencidas: contacto rápido</h2><p className="mt-1 text-sm text-amber-800">Elegí una cuota para preparar un recordatorio cordial por email o WhatsApp.</p></div><div className="mt-4 space-y-3">{overdue.map((installment, index) => { const dueDate = installment.paymentWindowEnd ?? installment.dueDate; const remaining = Math.max(0, Number(installment.amount ?? 0) - Number(installment.paidAmount ?? 0)); return <div key={installment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"><div><p className="font-medium text-zinc-950">{installment.label || `Cuota ${index + 1}`}</p><p className="mt-1 text-sm text-zinc-600">Saldo {money(remaining)} · vencida el {formatDate(dueDate)}</p></div><OverduePaymentContact target={{ source: 'installment', eventId, installmentId: installment.id! }} label="Contactar" /></div>; })}</div></section>;
}

function customerName(value: PaymentListItem['customerId']): string {
  if (!value || typeof value === 'string') return 'Cliente sin datos';
  return value.fullName || [value.firstName, value.lastName].filter(Boolean).join(' ') || 'Cliente sin datos';
}

export function OverduePaymentCollectionActions({ payments }: { payments: PaymentListItem[] }) {
  const overdue = payments.filter((payment) => payment.source !== 'ticket_order' && payment.status === 'pending' && isOverduePaymentDate(payment.dueDate));
  if (!overdue.length) return null;

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm"><div><h2 className="font-semibold text-amber-950">Pagos vencidos: contacto rápido</h2><p className="mt-1 text-sm text-amber-800">Prepará un recordatorio profesional y cordial para el cliente por email o WhatsApp.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{overdue.map((payment) => <div key={payment._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"><div><p className="font-medium text-zinc-950">{payment.paymentNumber || 'Pago pendiente'} · {customerName(payment.customerId)}</p><p className="mt-1 text-sm text-zinc-600">{money(Number(payment.amount ?? 0))} · vencido el {formatDate(payment.dueDate)}</p></div><OverduePaymentContact target={{ source: 'payment', paymentId: payment._id }} label="Contactar" /></div>)}</div></section>;
}
