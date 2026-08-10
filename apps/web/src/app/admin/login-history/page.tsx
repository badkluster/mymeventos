'use client';

import { History, RefreshCw, Search, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { Role } from '@mym/shared';
import { useCallback, useEffect, useState } from 'react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { useSession } from '@/components/session-provider';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type LoginItem = {
  _id: string;
  userId: string;
  username: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  channel: 'web' | 'mobile';
  platform: 'web' | 'ios' | 'android';
  ipAddress?: string;
  userAgent?: string;
  installationId?: string;
  deviceModel?: string;
  deviceName?: string;
  manufacturer?: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  appBuildVersion?: string;
  applicationId?: string;
  createdAt: string;
};

type LoginHistoryResponse = {
  items: LoginItem[];
  summary: { total: number; today: number; uniqueUsers: number };
  pagination: { page: number; limit: number; totalItems: number; totalPages: number };
};

type Filters = {
  q: string;
  channel: '' | 'web' | 'mobile';
  platform: '' | 'web' | 'ios' | 'android';
  from: string;
  to: string;
};

const emptyFilters: Filters = { q: '', channel: '', platform: '', from: '', to: '' };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function channelLabel(value: LoginItem['channel']): string {
  return value === 'mobile' ? 'App móvil' : 'Backoffice';
}

function platformLabel(value: LoginItem['platform']): string {
  if (value === 'android') return 'Android';
  if (value === 'ios') return 'iOS';
  return 'Web';
}

function deviceLabel(item: LoginItem): string {
  if (item.channel === 'web') return 'Navegador web';
  return [item.manufacturer, item.deviceModel || item.deviceName].filter(Boolean).join(' · ') || 'Dispositivo móvil';
}

function deviceSecondary(item: LoginItem): string {
  const os = [item.osName, item.osVersion].filter(Boolean).join(' ');
  const app = item.appVersion ? `App ${item.appVersion}${item.appBuildVersion ? ` (${item.appBuildVersion})` : ''}` : '';
  return [os, app].filter(Boolean).join(' · ') || (item.channel === 'web' ? 'Acceso desde navegador' : 'Sin datos adicionales del dispositivo');
}

function toStartIso(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00-03:00`).toISOString() : undefined;
}

function toEndIso(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999-03:00`).toISOString() : undefined;
}

export default function LoginHistoryPage() {
  const { user } = useSession();
  const { showToast } = useToast();
  const isAdmin = Boolean(user?.roles?.includes(Role.ADMIN));
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<LoginItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, today: 0, uniqueUsers: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.channel) params.set('channel', filters.channel);
      if (filters.platform) params.set('platform', filters.platform);
      const from = toStartIso(filters.from);
      const to = toEndIso(filters.to);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const result = await api.get<LoginHistoryResponse>(`/login-history?${params.toString()}`);
      setItems(result.items);
      setSummary(result.summary);
      setTotalPages(result.pagination.totalPages);
      setTotalItems(result.pagination.totalItems);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el historial de accesos.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin, page, showToast]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters() {
    setPage(1);
    setFilters(draftFilters);
  }

  function clearFilters() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  }

  if (!isAdmin) {
    return <section className="space-y-6">
      <PageHeader title="Historial de accesos" description="Registro de inicios de sesión de la plataforma y las apps." />
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <div className="flex items-center gap-3 font-semibold"><ShieldCheck className="h-5 w-5" />Acceso exclusivo para administradores</div>
        <p className="mt-2 text-sm text-red-800">Tu usuario no tiene permiso para consultar información de accesos.</p>
      </div>
    </section>;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Historial de accesos"
        description="Registro de inicios de sesión exitosos en el backoffice y la app móvil. No incluye renovaciones automáticas de sesión."
        action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        El registro comienza a partir de la activación de esta función; los accesos anteriores no se reconstruyen retroactivamente. Las direcciones IP y los datos de dispositivo se muestran únicamente con fines de seguridad y auditoría.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">Accesos encontrados</p><History className="h-5 w-5 text-zinc-400" /></div>
          <p className="mt-2 text-3xl font-semibold text-zinc-950">{summary.total}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">Ingresos hoy</p><Smartphone className="h-5 w-5 text-zinc-400" /></div>
          <p className="mt-2 text-3xl font-semibold text-zinc-950">{summary.today}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">Usuarios distintos</p><Users className="h-5 w-5 text-zinc-400" /></div>
          <p className="mt-2 text-3xl font-semibold text-zinc-950">{summary.uniqueUsers}</p>
        </article>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_160px_170px_170px_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input value={draftFilters.q} onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))} className="h-11 pl-10" placeholder="Usuario, email, IP o dispositivo…" onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }} />
          </div>
          <Select aria-label="Origen" value={draftFilters.channel} onChange={(event) => setDraftFilters((current) => ({ ...current, channel: event.target.value as Filters['channel'] }))} className="h-11">
            <option value="">Todos los orígenes</option>
            <option value="web">Backoffice</option>
            <option value="mobile">App móvil</option>
          </Select>
          <Select aria-label="Plataforma" value={draftFilters.platform} onChange={(event) => setDraftFilters((current) => ({ ...current, platform: event.target.value as Filters['platform'] }))} className="h-11">
            <option value="">Todas</option>
            <option value="web">Web</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </Select>
          <Input aria-label="Desde" type="date" value={draftFilters.from} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} className="h-11" />
          <Input aria-label="Hasta" type="date" value={draftFilters.to} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} className="h-11" />
          <div className="flex gap-2">
            <Button onClick={applyFilters}>Aplicar</Button>
            <Button variant="secondary" onClick={clearFilters}>Limpiar</Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Fecha y hora</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Usuario</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Origen</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Dispositivo</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">IP</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">Agente / instalación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((item) => (
                <tr key={item._id} className="align-top transition-colors hover:bg-amber-50/30">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-zinc-800">{formatDate(item.createdAt)}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-zinc-950">{item.fullName || item.username}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">@{item.username}{item.email ? ` · ${item.email}` : ''}</p>
                    {item.roles?.length ? <p className="mt-1 text-xs text-zinc-400">{item.roles.join(', ')}</p> : null}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.channel === 'mobile' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/15' : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-500/15'}`}>{channelLabel(item.channel)}</span>
                    <p className="mt-2 text-xs text-zinc-500">{platformLabel(item.platform)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-zinc-900">{deviceLabel(item)}</p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">{deviceSecondary(item)}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-zinc-700">{item.ipAddress || 'No disponible'}</td>
                  <td className="px-5 py-4">
                    {item.installationId ? <p className="max-w-xs truncate font-mono text-xs text-zinc-600" title={item.installationId}>Instalación: {item.installationId}</p> : null}
                    {item.userAgent ? <p className="mt-1 max-w-sm truncate text-xs text-zinc-500" title={item.userAgent}>{item.userAgent}</p> : <p className="text-xs text-zinc-400">Sin información adicional</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!items.length ? <div className="grid place-items-center px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><History className="h-6 w-6" /></span>
          <h2 className="mt-4 font-semibold text-zinc-900">{loading ? 'Cargando accesos…' : 'Todavía no hay accesos para mostrar'}</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-500">Cuando un usuario inicie sesión correctamente en el backoffice o en la app móvil, aparecerá en esta tabla.</p>
        </div> : null}

        {items.length ? <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">Página {page} de {totalPages} · {totalItems} registro{totalItems === 1 ? '' : 's'}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
            <Button variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</Button>
          </div>
        </div> : null}
      </div>
    </section>
  );
}
