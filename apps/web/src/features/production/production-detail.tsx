'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, Check, CheckCheck, LockKeyhole, Pencil, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { formatCivilDate } from '@/lib/dates';
import { useToast } from '@/components/ui/toast-provider';

type Person = { _id?: string; fullName?: string; firstName?: string; lastName?: string };
type Item = {
  _id: string; productNameSnapshot: string; plannedQuantity: number; completedQuantity: number; unit: string; status: string;
  observations?: string; responsibleId?: Person; readyBy?: Person; checkedBy?: Person; readyAt?: string; checkedAt?: string;
};
type Section = { _id: string; type: string; name: string; items: Item[] };
type Plan = {
  _id: string; status: string; eventDate: string; notes?: string; version?: number; guestCounts: { total?: number };
  eventId?: { _id?: string; eventName?: string; eventType?: string; startTime?: string }; customerId?: { fullName?: string };
  salonId?: { name?: string }; contractId?: { contractNumber?: string; status?: string }; sections: Section[];
};
type Staff = { _id: string; fullName?: string; firstName?: string; lastName?: string };
type ItemForm = { item?: Item; sectionType: string; productName: string; plannedQuantity: string; completedQuantity: string; unit: string; responsibleId: string; observations: string };
type Freshness = { current: boolean; currentFingerprint?: string; nextFingerprint?: string };

const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En proceso', ready: 'Lista', checked: 'Chequeada', blocked: 'Bloqueada', cancelled: 'Cancelada', closed: 'Cerrada' };
const statusTone: Record<string, string> = { pending: 'bg-amber-50 text-amber-800', in_progress: 'bg-sky-50 text-sky-700', ready: 'bg-violet-50 text-violet-700', checked: 'bg-emerald-50 text-emerald-700', blocked: 'bg-red-50 text-red-700', cancelled: 'bg-zinc-100 text-zinc-500', closed: 'bg-zinc-900 text-white' };
const sections: Record<string, string> = { savory: 'Producción salada', sweet: 'Producción dulce', beverages: 'Bebidas', cake: 'Tortas', bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros' };
const dateTime = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
const blankForm: ItemForm = { sectionType: 'miscellaneous', productName: '', plannedQuantity: '', completedQuantity: '', unit: 'unidad', responsibleId: '', observations: '' };
const personName = (person?: Person) => person?.fullName || [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Sin asignar';

export function ProductionDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const { user } = useSession();
  const { showToast } = useToast();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [savingId, setSavingId] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [reason, setReason] = useState('');
  const canCreate = userCanAccess(user, [Permission.PRODUCTION_CREATE]);
  const canUpdate = userCanAccess(user, [Permission.PRODUCTION_UPDATE]);
  const canComplete = userCanAccess(user, [Permission.PRODUCTION_COMPLETE]);
  const canReopen = userCanAccess(user, [Permission.PRODUCTION_REOPEN]);
  const canRegenerate = userCanAccess(user, [Permission.PRODUCTION_GENERATE]);

  const load = useCallback(async () => {
    try {
      const [detail, currentFreshness] = await Promise.all([
        api.get<{ plan: Plan }>(`/production/plans/${planId}`),
        api.get<Freshness>(`/production/plans/${planId}/freshness`).catch(() => null),
      ]);
      setPlan(detail.plan); setFreshness(currentFreshness);
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el plan.', variant: 'error' }); }
  }, [planId, showToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void api.get<{ items?: Staff[] }>('/users?active=true&limit=100').then((result) => setStaff(result.items ?? [])).catch(() => setStaff([]));
  }, []);

  const setStatus = async (item: Item, status: string) => {
    setSavingId(item._id);
    try {
      await api.post(`/production/items/${item._id}/status`, { status, completedQuantity: ['ready', 'checked'].includes(status) ? item.plannedQuantity : item.completedQuantity });
      showToast({ message: `Ítem marcado como ${statusLabels[status].toLowerCase()}.`, variant: 'success' }); await load();
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.', variant: 'error' }); }
    finally { setSavingId(''); }
  };
  const openEdit = (item: Item, sectionType: string) => setForm({ item, sectionType, productName: item.productNameSnapshot, plannedQuantity: String(item.plannedQuantity), completedQuantity: String(item.completedQuantity), unit: item.unit, responsibleId: item.responsibleId?._id || '', observations: item.observations || '' });
  const save = async () => {
    if (!form || !plan) return;
    setSavingId(form.item?._id || 'new');
    try {
      if (form.item) await api.patch(`/production/items/${form.item._id}`, { plannedQuantity: Number(form.plannedQuantity), completedQuantity: Number(form.completedQuantity), responsibleId: form.responsibleId, observations: form.observations });
      else await api.post(`/production/plans/${plan._id}/items`, { sectionType: form.sectionType, productName: form.productName, plannedQuantity: Number(form.plannedQuantity), unit: form.unit, responsibleId: form.responsibleId, observations: form.observations });
      setForm(null); showToast({ message: form.item ? 'Ítem actualizado.' : 'Ítem agregado.', variant: 'success' }); await load();
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar el ítem.', variant: 'error' }); }
    finally { setSavingId(''); }
  };
  const close = async () => {
    if (!plan) return; setSavingId('close');
    try { await api.post(`/production/plans/${plan._id}/close`, {}); showToast({ message: 'Producción cerrada.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cerrar.', variant: 'error' }); }
    finally { setSavingId(''); }
  };
  const reopen = async () => {
    if (!plan || !reason.trim()) return; setSavingId('reopen');
    try { await api.post(`/production/plans/${plan._id}/reopen`, { reason }); setReopenOpen(false); setReason(''); showToast({ message: 'Producción reabierta con auditoría.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo reabrir.', variant: 'error' }); }
    finally { setSavingId(''); }
  };
  const regenerate = async () => {
    if (!plan?.eventId?._id || reason.trim().length < 3) return; setSavingId('regenerate');
    try {
      const response = await api.post<{ plan: { _id: string }; regenerated: boolean }>('/production/plans/generate', { eventId: plan.eventId._id, regenerate: true, reason: reason.trim() });
      setRegenerateOpen(false); setReason(''); showToast({ message: 'Se creó una nueva versión de producción.', variant: 'success' });
      router.replace(`/admin/production/${response.plan._id}`);
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo regenerar.', variant: 'error' }); }
    finally { setSavingId(''); }
  };

  if (!plan) return <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500">Cargando producción…</div>;
  const allItems = plan.sections.flatMap((section) => section.items);
  const locked = ['closed', 'cancelled'].includes(plan.status);
  const regenerationAllowed = canRegenerate && (!locked || canReopen);
  return <section className="space-y-5">
    <Link href="/admin/production" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver a producción</Link>
    <PageHeader title={plan.eventId?.eventName || plan.eventId?.eventType || 'Producción del evento'} description={`${formatCivilDate(plan.eventDate)}${plan.eventId?.startTime ? ` · ${plan.eventId.startTime}` : ''} · ${plan.salonId?.name || 'Sin salón'} · Versión ${plan.version || 1}`} action={<div className="flex flex-wrap gap-2">{plan.status === 'closed' && canReopen ? <Button variant="secondary" onClick={() => { setReason(''); setReopenOpen(true); }}><RotateCcw className="mr-2 h-4 w-4" />Reabrir</Button> : null}{!locked && canComplete ? <Button variant="secondary" disabled={savingId === 'close'} onClick={() => void close()}><LockKeyhole className="mr-2 h-4 w-4" />Cerrar producción</Button> : null}{!locked && canCreate ? <Button onClick={() => setForm({ ...blankForm })}><Plus className="mr-2 h-4 w-4" />Agregar ítem</Button> : null}</div>} />
    {freshness && !freshness.current ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="inline-flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>La producción quedó desactualizada.</strong><span className="block mt-1 text-amber-800">Cambió el evento, contrato, paquete, servicios o alguna regla desde que se generó esta versión.</span></span></span>{regenerationAllowed ? <Button onClick={() => { setReason(''); setRegenerateOpen(true); }}><RefreshCw className="mr-2 h-4 w-4" />Regenerar versión</Button> : null}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Cliente</p><p className="mt-1 font-semibold">{plan.customerId?.fullName || 'Sin cliente'}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Invitados</p><p className="mt-1 font-semibold">{plan.guestCounts?.total ?? 0}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Contrato</p><p className="mt-1 font-semibold">{plan.contractId?.contractNumber || 'Sin contrato'}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Avance</p><p className="mt-1 font-semibold">{allItems.filter((item) => item.status === 'checked').length} de {allItems.filter((item) => item.status !== 'cancelled').length} chequeados</p></article></div>
    {!allItems.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">La producción se generó sin ítems porque el evento no tenía productos explícitos y todavía no hay reglas aplicables. Agregá ítems manuales o configurá reglas.</div> : null}
    {plan.sections.map((section) => <article key={section._id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><h2 className="font-semibold">{section.name}</h2><p className="mt-0.5 text-xs text-zinc-500">{section.items.length} ítems</p></div>{!locked && canCreate ? <Button variant="secondary" className="py-2" onClick={() => setForm({ ...blankForm, sectionType: section.type })}><Plus className="mr-2 h-4 w-4" />Agregar</Button> : null}</header>
      <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="border-b border-zinc-100 bg-zinc-50/70"><tr>{['Producto', 'Planificado', 'Completado', 'Responsable', 'Observación', 'Estado', 'Trazabilidad', 'Acciones'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{section.items.map((item) => <tr key={item._id}><td className="px-4 py-3 font-semibold text-zinc-900">{item.productNameSnapshot}</td><td className="px-4 py-3 tabular-nums">{item.plannedQuantity} {item.unit}</td><td className="px-4 py-3 tabular-nums">{item.completedQuantity} {item.unit}</td><td className="px-4 py-3">{personName(item.responsibleId)}</td><td className="max-w-60 truncate px-4 py-3 text-zinc-500">{item.observations || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[item.status] ?? 'bg-zinc-100'}`}>{statusLabels[item.status] ?? item.status}</span></td><td className="px-4 py-3 text-xs text-zinc-500">{item.checkedAt ? `Chequeó ${personName(item.checkedBy)} · ${dateTime.format(new Date(item.checkedAt))}` : item.readyAt ? `Listo por ${personName(item.readyBy)} · ${dateTime.format(new Date(item.readyAt))}` : 'Sin cambios'}</td><td className="px-4 py-3"><div className="flex gap-1">{!locked && canUpdate ? <button title="Editar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => openEdit(item, section.type)}><Pencil className="h-4 w-4" /></button> : null}{!locked && canComplete && item.status !== 'ready' && item.status !== 'checked' ? <button title="Marcar listo" disabled={savingId === item._id} className="grid h-8 w-8 place-items-center rounded-lg text-violet-700 hover:bg-violet-50" onClick={() => void setStatus(item, 'ready')}><Check className="h-4 w-4" /></button> : null}{!locked && canComplete && item.status !== 'checked' ? <button title="Marcar chequeado" disabled={savingId === item._id} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50" onClick={() => void setStatus(item, 'checked')}><CheckCheck className="h-4 w-4" /></button> : null}{!locked && canUpdate && !['blocked', 'checked'].includes(item.status) ? <button title="Bloquear" disabled={savingId === item._id} className="grid h-8 w-8 place-items-center rounded-lg text-red-700 hover:bg-red-50" onClick={() => void setStatus(item, 'blocked')}><Ban className="h-4 w-4" /></button> : null}{!locked && canReopen && ['ready', 'checked', 'blocked'].includes(item.status) ? <button title="Volver a proceso" disabled={savingId === item._id} className="grid h-8 w-8 place-items-center rounded-lg text-sky-700 hover:bg-sky-50" onClick={() => void setStatus(item, 'in_progress')}><RotateCcw className="h-4 w-4" /></button> : null}</div></td></tr>)}</tbody></table></div>
    </article>)}
    <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.item ? 'Editar ítem' : 'Agregar ítem'} description="Los ajustes quedan registrados en auditoría. Un producto y unidad no se pueden duplicar dentro del plan.">
      {form ? <div className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">Sección<Select disabled={Boolean(form.item)} value={form.sectionType} onChange={(event) => setForm({ ...form, sectionType: event.target.value })} className="mt-1.5">{Object.entries(sections).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="text-sm font-medium">Producto<Input disabled={Boolean(form.item)} value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium">Cantidad planificada<Input type="number" min="0" step="0.01" value={form.plannedQuantity} onChange={(event) => setForm({ ...form, plannedQuantity: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium">Unidad<Input disabled={Boolean(form.item)} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className="mt-1.5" /></label>{form.item ? <label className="text-sm font-medium">Cantidad completada<Input type="number" min="0" step="0.01" value={form.completedQuantity} onChange={(event) => setForm({ ...form, completedQuantity: event.target.value })} className="mt-1.5" /></label> : null}<label className="text-sm font-medium">Responsable<Select value={form.responsibleId} onChange={(event) => setForm({ ...form, responsibleId: event.target.value })} className="mt-1.5"><option value="">Sin asignar</option>{staff.map((person) => <option key={person._id} value={person._id}>{personName(person)}</option>)}</Select></label><label className="sm:col-span-2 text-sm font-medium">Observaciones<Textarea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} className="mt-1.5" /></label><footer className="sm:col-span-2 flex justify-end gap-3"><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={savingId === (form.item?._id || 'new') || !form.productName || !form.plannedQuantity || !form.unit} onClick={() => void save()}>Guardar</Button></footer></div> : null}
    </Modal>
    <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Reabrir producción" description="La reapertura queda registrada con usuario, fecha y motivo."><div className="p-6"><label className="text-sm font-medium">Motivo<Textarea className="mt-1.5" value={reason} onChange={(event) => setReason(event.target.value)} /></label><footer className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setReopenOpen(false)}>Cancelar</Button><Button disabled={reason.trim().length < 3 || savingId === 'reopen'} onClick={() => void reopen()}>Reabrir</Button></footer></div></Modal>
    <Modal open={regenerateOpen} onClose={() => setRegenerateOpen(false)} title="Regenerar producción" description="Se crea una nueva versión y se conserva la anterior para auditoría. Los ítems manuales se trasladan a la nueva versión."><div className="p-6"><label className="text-sm font-medium">Motivo del cambio<Textarea className="mt-1.5" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. Cambió la cantidad de invitados y se agregó servicio de barra." /></label><footer className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRegenerateOpen(false)}>Cancelar</Button><Button disabled={reason.trim().length < 3 || savingId === 'regenerate'} onClick={() => void regenerate()}>{savingId === 'regenerate' ? 'Regenerando…' : 'Crear nueva versión'}</Button></footer></div></Modal>
  </section>;
}
