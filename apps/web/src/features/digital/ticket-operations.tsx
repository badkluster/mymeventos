'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { ticketLabel } from './ticket-labels';
const money = (value = 0) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
type Order = { _id: string; publicId: string; buyer: { name: string; email: string; documentNumber?: string }; publicationId?: { title?: string }; lines: Array<{ name: string; quantity: number }>; totalAmount: number; status: string; paymentStatus: string };

export function TicketOrdersAdmin({ title = 'Ventas', description = 'Órdenes, pagos, compradores y entradas emitidas.' }: { title?: string; description?: string }) { const { showToast } = useToast(); const [orders, setOrders] = useState<Order[]>([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const load = async () => { try { const query = new URLSearchParams(); if (search) query.set('search', search); if (status) query.set('status', status); setOrders((await api.get<{ orders: Order[] }>(`/tickets/orders?${query}`)).orders); } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las órdenes.', variant: 'error' }); } }; useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [search, status]); return <section className="space-y-5"><PageHeader title={title} description={description} /><div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3"><label className="text-sm font-medium md:col-span-2">Buscar por código, comprador, DNI o email<div className="relative mt-1.5"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label><label className="text-sm font-medium">Estado<Select className="mt-1.5" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="payment_pending">Pendiente de pago</option><option value="paid">Pagada</option><option value="cancelled">Cancelada</option><option value="refunded">Reembolsada</option></Select></label></div><div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Publicación</th><th className="px-4 py-3">Comprador</th><th className="px-4 py-3">Entradas</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y">{orders.map((order) => <tr key={order._id}><td className="px-4 py-4 font-medium"><Link className="underline" href={`/admin/digital-tickets/orders/${order._id}`}>{order.publicId}</Link></td><td className="px-4 py-4">{order.publicationId?.title || '—'}</td><td className="px-4 py-4">{order.buyer.name}<small className="block text-zinc-500">{order.buyer.email}</small></td><td className="px-4 py-4">{order.lines.reduce((sum, line) => sum + line.quantity, 0)}</td><td className="px-4 py-4">{money(order.totalAmount)}</td><td className="px-4 py-4">{ticketLabel(order.paymentStatus)}</td><td className="px-4 py-4">{ticketLabel(order.status)}</td></tr>)}{!orders.length ? <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-500">No hay órdenes para estos filtros.</td></tr> : null}</tbody></table></div></section>; }

export function TicketBuyersAdmin() { const { showToast } = useToast(); const [buyers, setBuyers] = useState<Array<{ _id: string; name: string; email: string; documentNumber?: string; ordersCount: number; ticketsCount: number; totalSpent: number; lastPurchaseAt: string }>>([]); const [search, setSearch] = useState(''); useEffect(() => { const timer = window.setTimeout(() => { const query = search ? `?search=${encodeURIComponent(search)}` : ''; api.get<{ buyers: typeof buyers }>(`/tickets/buyers${query}`).then((result) => setBuyers(result.buyers)).catch((error) => showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar los compradores.', variant: 'error' })); }, 200); return () => window.clearTimeout(timer); }, [search]); return <section className="space-y-5"><PageHeader title="Compradores" description="Personas únicas que compraron entradas, agrupadas por email." /><div className="rounded-2xl border border-zinc-200 bg-white p-4"><label className="text-sm font-medium">Buscar por nombre, email o DNI<div className="relative mt-1.5"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label></div><div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Comprador</th><th className="px-4 py-3">DNI</th><th className="px-4 py-3">Compras</th><th className="px-4 py-3">Entradas</th><th className="px-4 py-3">Total abonado</th><th className="px-4 py-3">Última compra</th></tr></thead><tbody className="divide-y">{buyers.map((buyer) => <tr key={buyer._id}><td className="px-4 py-4 font-medium">{buyer.name}<small className="block font-normal text-zinc-500">{buyer.email}</small></td><td className="px-4 py-4">{buyer.documentNumber || '—'}</td><td className="px-4 py-4">{buyer.ordersCount}</td><td className="px-4 py-4">{buyer.ticketsCount}</td><td className="px-4 py-4">{money(buyer.totalSpent)}</td><td className="px-4 py-4">{new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(buyer.lastPurchaseAt))}</td></tr>)}{!buyers.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No hay compradores para mostrar.</td></tr> : null}</tbody></table></div></section>; }

export function TicketOrderDetail({ orderId }: { orderId: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<any>();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const load = () => api.get<any>(`/tickets/orders/${orderId}`).then(setData).catch((error) => showToast({ message: error.message, variant: 'error' }));
  useEffect(() => { void load(); }, [orderId]);
  if (!data) return <p className="p-6 text-sm text-zinc-500">Cargando orden…</p>;
  const { order, tickets, payment, refunds } = data;
  const toggleTicket = (ticketId: string) => setSelectedTicketIds((current) => {
    const next = new Set(current);
    if (next.has(ticketId)) next.delete(ticketId); else next.add(ticketId);
    return next;
  });
  const submitRefund = async (force = false) => {
    setSubmitting(true);
    try {
      await api.post(`/tickets/orders/${orderId}/refund`, {
        reason: reason || 'Solicitud administrativa',
        amount: amount ? Number(amount) : undefined,
        ticketIds: selectedTicketIds.size ? [...selectedTicketIds] : undefined,
        force: force || undefined,
      });
      showToast({ message: 'Reembolso procesado.', variant: 'success' });
      setAmount('');
      setSelectedTicketIds(new Set());
      void load();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'TICKET_ALREADY_CHECKED_IN') {
        if (window.confirm('Una o más entradas ya tuvieron ingreso registrado. ¿Confirmás devolverlas de todos modos?')) {
          await submitRefund(true);
          return;
        }
      } else {
        showToast({ message: error instanceof Error ? error.message : 'No se pudo procesar el reembolso.', variant: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };
  const refund = async () => {
    if (submitting) return;
    const label = amount ? money(Number(amount)) : money(order.totalAmount);
    if (!window.confirm(`¿Confirmás reembolsar ${label} de la orden ${order.publicId}? Esta acción no se puede deshacer.`)) return;
    await submitRefund(false);
  };
  return <section className="space-y-6"><PageHeader title={`Orden ${order.publicId}`} description={`${order.publicationId?.title ?? 'Publicación'} · ${ticketLabel(order.status)}`} action={<Button variant="secondary" onClick={() => router.back()}>Volver</Button>} /><div className="grid gap-4 lg:grid-cols-3"><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Comprador</h2><p className="mt-3">{order.buyer.name}</p><p className="text-sm text-zinc-600">{order.buyer.email}</p><p className="text-sm text-zinc-600">{order.buyer.documentNumber || 'DNI no informado'}</p></article><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Pago</h2><p className="mt-3 text-2xl font-semibold">{money(order.totalAmount)}</p><p className="text-sm text-zinc-600">{ticketLabel(payment?.provider)} · {ticketLabel(payment?.status ?? order.paymentStatus)}</p></article><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Devolución</h2><label className="mt-3 block text-sm">Motivo<Input className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="mt-3 block text-sm">Monto a devolver (vacío = total)<Input className="mt-1" type="number" min={0} max={order.totalAmount} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{selectedTicketIds.size ? <p className="mt-2 text-xs text-zinc-500">{selectedTicketIds.size} entrada(s) seleccionada(s) para devolución parcial.</p> : null}<Button className="mt-3" variant="danger" disabled={submitting || order.status !== 'paid'} onClick={() => void refund()}>{submitting ? 'Procesando…' : 'Reembolsar orden'}</Button></article></div><article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Entradas emitidas</h2><p className="mt-1 text-xs text-zinc-500">Marcá entradas puntuales para una devolución parcial.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tickets.map((ticket: any) => <label key={ticket._id} className="flex cursor-pointer items-start gap-2 rounded-xl bg-zinc-50 p-4"><input type="checkbox" className="mt-1" checked={selectedTicketIds.has(ticket._id)} onChange={() => toggleTicket(ticket._id)} /><span><b>{ticket.ticketTypeId?.name}</b><p className="text-sm">{ticket.attendeeName}</p><p className="text-xs text-zinc-500">{ticketLabel(ticket.status)}</p></span></label>)}</div></article>{refunds.length ? <article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Reembolsos</h2>{refunds.map((refund: any) => <p className="mt-2" key={refund._id}>{money(refund.amount)} · {ticketLabel(refund.status)}</p>)}</article> : null}</section>;
}
