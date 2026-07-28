'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { Bell, Check, CheckCheck, ExternalLink, Inbox, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableActionButton } from '@/components/admin/table-action-button';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import type { BackofficeNotification, NotificationsResponse } from '@/features/notifications/types';
import { api } from '@/lib/api';

type StatusFilter = 'all' | 'unread' | 'read';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function normalizeAdminUrl(actionUrl?: string): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('/admin')) return actionUrl;
  try {
    const url = new URL(actionUrl);
    return url.pathname.startsWith('/admin') ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function notificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    quote_request_created: 'Nueva solicitud',
    quote_request_updated: 'Solicitud actualizada',
    quote_created: 'Presupuesto creado',
    quote_sent: 'Presupuesto enviado',
    quote_updated: 'Presupuesto actualizado',
    quote_approved: 'Presupuesto aprobado',
    contract_created: 'Contrato creado',
    contract_approved: 'Contrato aprobado',
    payment_created: 'Pago registrado',
    payment_received: 'Pago recibido',
    financial_reminder: 'Recordatorio financiero',
    event_created: 'Evento creado',
    event_reminder: 'Recordatorio de evento',
    lead_created: 'Nuevo contacto',
    lead_assigned: 'Contacto asignado',
    task_assigned: 'Tarea asignada',
    system: 'Sistema',
    quote_request: 'Solicitud de presupuesto',
    quote: 'Presupuesto',
    lead: 'Contacto',
    event: 'Evento',
    contract: 'Contrato',
    payment: 'Pago',
  };
  return labels[type] ?? 'Aviso del sistema';
}

function TypeBadge({ type }: { type: string }) {
  return <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-500/15">{notificationTypeLabel(type)}</span>;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<BackofficeNotification[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<NotificationsResponse>('/notifications');
      setItems(result.notifications);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const unread = items.filter((notification) => !notification.readAt).length;
    return { total: items.length, unread, read: items.length - unread };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');
    return items.filter((notification) => {
      const matchesStatus = status === 'all' || (status === 'unread' ? !notification.readAt : Boolean(notification.readAt));
      const matchesQuery = !normalizedQuery || [notification.title, notification.message, notificationTypeLabel(notification.type)].some((value) => value.toLocaleLowerCase('es-AR').includes(normalizedQuery));
      return matchesStatus && matchesQuery;
    });
  }, [items, query, status]);

  async function markAsRead(notification: BackofficeNotification) {
    if (notification.readAt) return;
    setUpdatingId(notification._id);
    try {
      await api.patch(`/notifications/${notification._id}/read`, {});
      setItems((current) => current.map((item) => (item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item)));
      showToast({ message: 'Notificación marcada como leída.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar la notificación.', variant: 'error' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAllAsRead() {
    setUpdatingId('all');
    try {
      await api.patch('/notifications/read-all', {});
      const readAt = new Date().toISOString();
      setItems((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })));
      showToast({ message: 'Todas las notificaciones fueron marcadas como leídas.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron actualizar las notificaciones.', variant: 'error' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteNotification(notification: BackofficeNotification) {
    setUpdatingId(notification._id);
    try {
      await api.delete(`/notifications/${notification._id}`);
      setItems((current) => current.filter((item) => item._id !== notification._id));
      showToast({ message: 'Notificación eliminada.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar la notificación.', variant: 'error' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function goToAction(notification: BackofficeNotification) {
    const destination = normalizeAdminUrl(notification.actionUrl);
    if (!destination) {
      showToast({ message: 'Esta notificación no tiene un destino del backoffice.', variant: 'info' });
      return;
    }
    if (!notification.readAt) {
      await markAsRead(notification);
    }
    router.push(destination);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Notificaciones"
        description="Avisos operativos del backoffice y accesos rápidos al área correspondiente."
        action={
          <Button variant="secondary" disabled={!metrics.unread || updatingId === 'all'} onClick={() => void markAllAsRead()}>
            <CheckCheck className="mr-2 h-4 w-4" />
            {updatingId === 'all' ? 'Actualizando…' : 'Marcar todo como leído'}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Total</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950">{metrics.total}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Sin leer</p>
          <p className="mt-2 text-3xl font-semibold text-red-600">{metrics.unread}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Leídas</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950">{metrics.read}</p>
        </article>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-10" placeholder="Buscar por título, mensaje o tipo…" />
          </div>
          <Select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-11">
            <option value="all">Todas</option>
            <option value="unread">Sin leer</option>
            <option value="read">Leídas</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Notificación</th>
                <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Tipo</th>
                <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
                <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredItems.map((notification) => {
                const destination = normalizeAdminUrl(notification.actionUrl);
                const busy = updatingId === notification._id;
                return (
                  <tr key={notification._id} className={`transition-colors hover:bg-amber-50/35 ${notification.readAt ? '' : 'bg-red-50/25'}`}>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${notification.readAt ? 'bg-zinc-100 text-zinc-600' : 'bg-red-100 text-red-700'}`}>
                        {notification.readAt ? 'Leída' : 'Sin leer'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="max-w-xl">
                        <p className="font-semibold text-zinc-950">{notification.title}</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">{notification.message}</p>
                        {destination && <p className="mt-1 text-xs font-medium text-zinc-400">Tiene acceso directo al detalle</p>}
                      </div>
                    </td>
                    <td className="px-5 py-4"><TypeBadge type={notification.type} /></td>
                    <td className="whitespace-nowrap px-5 py-4 text-zinc-600">{formatDate(notification.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-0.5">
                        <TableActionButton icon={ExternalLink} label="Ir al área relacionada" disabled={!destination || busy} onClick={() => void goToAction(notification)} />
                        <TableActionButton icon={Check} label="Marcar como leída" disabled={Boolean(notification.readAt) || busy} onClick={() => void markAsRead(notification)} />
                        <TableActionButton icon={Trash2} label="Eliminar notificación" disabled={busy} onClick={() => void deleteNotification(notification)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && (
          <div className="grid place-items-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
              {loading ? <Bell className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
            </span>
            <h2 className="mt-4 font-semibold text-zinc-900">{loading ? 'Cargando notificaciones' : 'No hay notificaciones para mostrar'}</h2>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">Probá cambiar los filtros o esperar nuevos avisos del sistema.</p>
          </div>
        )}
      </div>
    </section>
  );
}
