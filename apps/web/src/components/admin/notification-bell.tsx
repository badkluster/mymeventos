'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BackofficeNotification, NotificationsResponse } from '@/features/notifications/types';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';

function formatNotificationDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
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

export function NotificationBell() {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<BackofficeNotification[]>([]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const recentNotifications = notifications.slice(0, 5);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<NotificationsResponse>('/notifications');
      setNotifications(result.notifications);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function markAsRead(notification: BackofficeNotification) {
    if (notification.readAt) return;
    await api.patch(`/notifications/${notification._id}/read`, {});
    setNotifications((current) => current.map((item) => (item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item)));
  }

  async function openNotification(notification: BackofficeNotification) {
    try {
      await markAsRead(notification);
      const destination = normalizeAdminUrl(notification.actionUrl);
      router.push(destination ?? '/admin/notifications');
      setOpen(false);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo abrir la notificación.', variant: 'error' });
    }
  }

  async function markAllAsRead() {
    try {
      await api.patch('/notifications/read-all', {});
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })));
      showToast({ message: 'Notificaciones marcadas como leídas.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron actualizar las notificaciones.', variant: 'error' });
    }
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} sin leer` : ''}`} className="relative rounded p-2 hover:bg-muted">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Notificaciones</p>
              <p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} sin leer` : 'Todo al día'}</p>
            </div>
            <button type="button" disabled={!unreadCount} onClick={() => void markAllAsRead()} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" />
              Leer todo
            </button>
          </header>

          <div className="max-h-[390px] overflow-y-auto py-1">
            {recentNotifications.map((notification) => {
              const destination = normalizeAdminUrl(notification.actionUrl);
              return (
                <DropdownMenu.Item key={notification._id} asChild>
                  <button type="button" onClick={() => void openNotification(notification)} className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted focus:bg-muted">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.readAt ? 'bg-muted-foreground/40' : 'bg-red-600'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 block text-sm font-semibold text-foreground">{notification.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                        {formatNotificationDate(notification.createdAt)}
                        {destination && <ExternalLink className="h-3 w-3" />}
                      </span>
                    </span>
                  </button>
                </DropdownMenu.Item>
              );
            })}
            {!recentNotifications.length && (
              <div className="grid place-items-center px-6 py-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">{loading ? 'Cargando notificaciones…' : 'Sin notificaciones'}</p>
              </div>
            )}
          </div>

          <footer className="border-t border-border bg-muted px-4 py-3">
            <DropdownMenu.Item asChild>
              <Link href="/admin/notifications" className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-foreground outline-none hover:bg-card focus:bg-card">
                Ver centro de notificaciones
              </Link>
            </DropdownMenu.Item>
          </footer>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
