'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, ChevronLeft, ChevronRight, Eye, LoaderCircle, Plus, Search } from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Input, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { ProductionNav } from './production-nav';

type Plan = {
  _id: string; status: string; eventDate: string; guestCounts: { total?: number };
  eventId?: { eventName?: string; eventType?: string; startTime?: string }; salonId?: { name?: string }; customerId?: { fullName?: string };
  itemSummary: { total: number; checked: number; blocked: number };
};
type Candidate = { _id: string; eventName?: string; eventType?: string; eventDate: string; salonId?: { name?: string }; customerId?: { fullName?: string } };
type ListResponse = { items: Plan[]; summary: Array<{ _id: string; value: number }>; meta: { page: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } };

const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En proceso', ready: 'Lista', checked: 'Chequeada', blocked: 'Bloqueada', cancelled: 'Cancelada', closed: 'Cerrada' };
const statusTone: Record<string, string> = { pending: 'bg-amber-50 text-amber-800', in_progress: 'bg-sky-50 text-sky-700', ready: 'bg-violet-50 text-violet-700', checked: 'bg-emerald-50 text-emerald-700', blocked: 'bg-red-50 text-red-700', closed: 'bg-zinc-900 text-white' };
const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium' });

function period() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const last = new Date(Date.UTC(Number(values.year), Number(values.month), 0)).getUTCDate();
  return { from: `${values.year}-${values.month}-01`, to: `${values.year}-${values.month}-${last}` };
}

export function ProductionList() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const { showToast } = useToast();
  const initial = useMemo(() => period(), []);
  const [filters, setFilters] = useState({ ...initial, search: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<ListResponse | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canGenerate = userCanAccess(user, [Permission.PRODUCTION_GENERATE]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to, page: String(filters.page), limit: '25' });
      if (filters.search) query.set('search', filters.search);
      if (filters.status) query.set('status', filters.status);
      setResult(await api.get<ListResponse>(`/production/plans?${query}`));
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar producción.', variant: 'error' });
    } finally { setLoading(false); }
  }, [filters, showToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (searchParams?.get('generate') === '1' && canGenerate) setGenerateOpen(true); }, [searchParams, canGenerate]);
  useEffect(() => {
    if (!generateOpen) return;
    void api.get<{ items: Candidate[] }>('/production/candidates').then((response) => setCandidates(response.items)).catch((cause) => showToast({ message: cause instanceof Error ? cause.message : 'No se pudieron cargar los eventos.', variant: 'error' }));
  }, [generateOpen, showToast]);

  const generate = async () => {
    if (!selectedEventId) return;
    setSaving(true);
    try {
      const response = await api.post<{ plan: { _id: string }; created: boolean }>('/production/plans/generate', { eventId: selectedEventId });
      setGenerateOpen(false); setSelectedEventId('');
      showToast({ message: response.created ? 'Producción generada correctamente.' : 'El evento ya tenía producción vigente.', variant: 'success' });
      await load();
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo generar la producción.', variant: 'error' });
    } finally { setSaving(false); }
  };
  const update = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  return <section className="space-y-5">
    <PageHeader title="Producción" description="Planes por evento con cantidades, responsables y estados auditables." action={canGenerate ? <Button onClick={() => setGenerateOpen(true)}><Plus className="mr-2 h-4 w-4" />Generar producción</Button> : undefined} />
    <ProductionNav />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[160px_160px_180px_minmax(220px,1fr)_auto]">
      <Input aria-label="Desde" type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
      <Input aria-label="Hasta" type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
      <Select value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') update({ search: search.trim() }); }} className="pl-9" placeholder="Evento o tipo…" /></span>
      <Button variant="secondary" onClick={() => update({ search: search.trim() })}>Buscar</Button>
    </div>
    {result ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(statusLabels).slice(0, 4).map(([key, label]) => <article key={key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{result.summary.find((item) => item._id === key)?.value ?? 0}</p></article>)}</div> : null}
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading && !result ? <div className="grid min-h-64 place-items-center text-sm text-zinc-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Cargando planes…</div> : null}
      {result ? <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Fecha', 'Evento / cliente', 'Salón', 'Invitados', 'Avance', 'Bloqueados', 'Estado', ''].map((label) => <th key={label} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{result.items.map((plan) => {
        const percentage = plan.itemSummary.total ? Math.round((plan.itemSummary.checked / plan.itemSummary.total) * 100) : 0;
        return <tr key={plan._id} className="hover:bg-zinc-50"><td className="px-5 py-4 font-medium">{date.format(new Date(plan.eventDate))}<span className="block text-xs font-normal text-zinc-400">{plan.eventId?.startTime || ''}</span></td><td className="px-5 py-4"><p className="font-semibold text-zinc-900">{plan.eventId?.eventName || plan.eventId?.eventType || 'Evento'}</p><p className="mt-0.5 text-xs text-zinc-500">{plan.customerId?.fullName || 'Sin cliente'}</p></td><td className="px-5 py-4">{plan.salonId?.name || 'Sin salón'}</td><td className="px-5 py-4 tabular-nums">{plan.guestCounts?.total ?? 0}</td><td className="px-5 py-4"><div className="flex min-w-36 items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage}%` }} /></div><span className="text-xs tabular-nums text-zinc-500">{plan.itemSummary.checked}/{plan.itemSummary.total}</span></div></td><td className="px-5 py-4">{plan.itemSummary.blocked || '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[plan.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{statusLabels[plan.status] ?? plan.status}</span></td><td className="px-5 py-4"><Link href={`/admin/production/${plan._id}`} className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"><Eye className="h-4 w-4" /></Link></td></tr>;
      })}</tbody></table>{!result.items.length ? <div className="grid min-h-52 place-items-center text-center"><div><ChefHat className="mx-auto h-8 w-8 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay planes para los filtros seleccionados.</p></div></div> : null}</div> : null}
      {result ? <footer className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-sm text-zinc-500"><span>{result.meta.totalItems} planes</span><div className="flex items-center gap-2"><Button variant="secondary" className="px-2.5" disabled={!result.meta.hasPreviousPage} onClick={() => update({ page: filters.page - 1 })}><ChevronLeft className="h-4 w-4" /></Button><span>Página {result.meta.page} de {result.meta.totalPages}</span><Button variant="secondary" className="px-2.5" disabled={!result.meta.hasNextPage} onClick={() => update({ page: filters.page + 1 })}><ChevronRight className="h-4 w-4" /></Button></div></footer> : null}
    </article>
    <Modal open={generateOpen} onClose={() => setGenerateOpen(false)} title="Generar producción" description="Seleccioná un evento próximo. La operación es idempotente: volver a ejecutarla no duplica productos.">
      <div className="space-y-4 p-6"><label className="block text-sm font-medium text-zinc-700">Evento<Select className="mt-1.5" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}><option value="">Seleccionar evento…</option>{candidates.map((item) => <option key={item._id} value={item._id}>{date.format(new Date(item.eventDate))} · {item.eventName || item.eventType || 'Evento'} · {item.salonId?.name || 'Sin salón'}</option>)}</Select></label>{!candidates.length ? <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">No hay eventos próximos sin producción.</p> : null}<footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setGenerateOpen(false)}>Cancelar</Button><Button disabled={!selectedEventId || saving} onClick={() => void generate()}>{saving ? 'Generando…' : 'Generar'}</Button></footer></div>
    </Modal>
  </section>;
}
