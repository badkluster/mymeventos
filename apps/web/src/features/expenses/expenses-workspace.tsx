'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';
import { ExpensesNav } from './expenses-nav';

type Named = { _id: string; name?: string; businessName?: string; eventName?: string; eventType?: string };
type Category = { _id: string; name: string; code: string; type: string; isActive: boolean };
type Expense = {
  _id: string; date?: string; createdAt?: string; description: string; salonId?: Named; eventId?: Named; supplierId?: Named; categoryId?: Category;
  initialEstimatedAmount: number; finalAmount: number; additionalAmount: number; taxAmount: number; amount: number; status: string;
  paymentMethod?: string; receiptUrl?: string; notes?: string;
};
type ListResponse = { items: Expense[]; summary: { total: number; initial: number; final: number; additional: number; tax: number; paid: number; pending: number }; meta: { page: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } };

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
// `Expense.date` es una fecha civil normalizada a medianoche UTC — se formatea en UTC para no
// correrla un día para atrás.
const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', dateStyle: 'short' });
const paymentLabels: Record<string, string> = { cash: 'Efectivo', bank_transfer: 'Transferencia', mercado_pago: 'Mercado Pago', card: 'Tarjeta', other: 'Otro' };
const statusLabels: Record<string, string> = { pending: 'Pendiente', paid: 'Pagado', cancelled: 'Cancelado' };
const entity = (value?: Named) => value?.name || value?.businessName || value?.eventName || value?.eventType || '—';
function currentPeriod() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const last = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
  return { from: `${parts.year}-${parts.month}-01`, to: `${parts.year}-${parts.month}-${last}` };
}
function id(value?: Named | Category) { return value?._id || ''; }

export function ExpensesWorkspace() {
  const { user } = useSession();
  const { showToast } = useToast();
  const initial = useMemo(() => currentPeriod(), []);
  const [filters, setFilters] = useState({ ...initial, status: '', categoryId: '', assigned: '', page: 1 });
  const [result, setResult] = useState<ListResponse | null>(null);
  const [salons, setSalons] = useState<Named[]>([]);
  const [events, setEvents] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<Expense | null | undefined>();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canCreate = userCanAccess(user, [Permission.EXPENSES_CREATE]);
  const canUpdate = userCanAccess(user, [Permission.EXPENSES_UPDATE]);
  const canDelete = userCanAccess(user, [Permission.EXPENSES_DELETE]);
  const canCategories = userCanAccess(user, [Permission.EXPENSE_CATEGORIES_MANAGE]);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ from: filters.from, to: filters.to, page: String(filters.page), limit: '25' });
    if (filters.status) query.set('status', filters.status); if (filters.categoryId) query.set('categoryId', filters.categoryId); if (filters.assigned) query.set('assigned', filters.assigned);
    try { setResult(await api.get<ListResponse>(`/expenses?${query}`)); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudieron cargar los gastos.', variant: 'error' }); }
  }, [filters, showToast]);
  const loadOptions = useCallback(async () => {
    try {
      const [salonResponse, eventResponse, supplierResponse, categoryResponse] = await Promise.all([
        api.get<{ salons?: Named[] } | Named[]>('/salons?limit=100'), api.get<{ items?: Named[] }>('/events?limit=100'),
        api.get<{ items?: Named[]; suppliers?: Named[] }>('/suppliers'), api.get<{ items: Category[] }>('/expenses/categories'),
      ]);
      setSalons(Array.isArray(salonResponse) ? salonResponse : salonResponse.salons ?? []); setEvents(eventResponse.items ?? []);
      setSuppliers(supplierResponse.items ?? supplierResponse.suppliers ?? []); setCategories(categoryResponse.items);
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudieron cargar las opciones.', variant: 'error' }); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]); useEffect(() => { void loadOptions(); }, [loadOptions]);
  const update = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); const data = new FormData(event.currentTarget);
    const payload = { date: String(data.get('date')), description: String(data.get('description')), salonId: String(data.get('salonId')), eventId: String(data.get('eventId')), supplierId: String(data.get('supplierId')), categoryId: String(data.get('categoryId')), initialEstimatedAmount: Number(data.get('initialEstimatedAmount') || 0), finalAmount: Number(data.get('finalAmount') || 0), additionalAmount: Number(data.get('additionalAmount') || 0), taxAmount: Number(data.get('taxAmount') || 0), status: String(data.get('status')), paymentMethod: String(data.get('paymentMethod')), receiptUrl: String(data.get('receiptUrl')), notes: String(data.get('notes')) };
    try {
      if (form) await api.patch(`/expenses/${form._id}`, payload); else await api.post('/expenses', payload);
      setForm(undefined); showToast({ message: form ? 'Gasto actualizado.' : 'Gasto registrado.', variant: 'success' }); await load();
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar el gasto.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true);
    try { await api.post('/expenses/categories', { name: String(data.get('name')), code: String(data.get('code')), type: String(data.get('type')), isActive: true }); setCategoryOpen(false); showToast({ message: 'Categoría creada.', variant: 'success' }); await loadOptions(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo crear la categoría.', variant: 'error' }); } finally { setSaving(false); }
  };
  const remove = async (expense: Expense) => {
    if (!confirm(`¿Eliminar el gasto “${expense.description}”? El registro quedará en auditoría.`)) return;
    try { await api.delete(`/expenses/${expense._id}`); showToast({ message: 'Gasto eliminado.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo eliminar.', variant: 'error' }); }
  };
  const defaultDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

  return <section className="space-y-5">
    <PageHeader title="Gastos y costos" description="Registro estructurado de costos estimados, finales, adicionales e impuestos." action={<div className="flex gap-2">{canCategories ? <Button variant="secondary" onClick={() => setCategoryOpen(true)}>Nueva categoría</Button> : null}{canCreate ? <Button onClick={() => setForm(null)}><Plus className="mr-2 h-4 w-4" />Registrar gasto</Button> : null}</div>} />
    <ExpensesNav />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"><Input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} /><Input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} /><Select value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={filters.categoryId} onChange={(event) => update({ categoryId: event.target.value })}><option value="">Todas las categorías</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select><Select value={filters.assigned} onChange={(event) => update({ assigned: event.target.value })}><option value="">Asignados y generales</option><option value="true">Asignados a evento</option><option value="false">Sin evento</option></Select></div>
    {result ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Total registrado</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.total)}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Pagado</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{money.format(result.summary.paid)}</p></article><article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="text-xs text-zinc-600">Pendiente</p><p className="mt-2 text-2xl font-semibold text-amber-800">{money.format(result.summary.pending)}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">Desvío final vs. inicial</p><p className="mt-2 text-2xl font-semibold">{money.format(result.summary.final + result.summary.additional + result.summary.tax - result.summary.initial)}</p></article></div> : null}
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">{result ? <div className="overflow-x-auto"><table className="min-w-[1200px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Fecha', 'Concepto', 'Categoría', 'Salón / evento', 'Proveedor', 'Inicial', 'Final', 'Adicional', 'Impuestos', 'Total', 'Estado', 'Comprobante', ''].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{result.items.map((item) => <tr key={item._id}><td className="px-4 py-3">{date.format(new Date(item.date || item._id))}</td><td className="px-4 py-3 font-semibold">{item.description}</td><td className="px-4 py-3">{item.categoryId?.name || 'Sin categoría'}</td><td className="px-4 py-3">{entity(item.salonId)}<span className="block text-xs text-zinc-500">{entity(item.eventId)}</span></td><td className="px-4 py-3">{entity(item.supplierId)}</td><td className="px-4 py-3 tabular-nums">{money.format(item.initialEstimatedAmount)}</td><td className="px-4 py-3 tabular-nums">{money.format(item.finalAmount)}</td><td className="px-4 py-3 tabular-nums">{money.format(item.additionalAmount)}</td><td className="px-4 py-3 tabular-nums">{money.format(item.taxAmount)}</td><td className="px-4 py-3 font-semibold tabular-nums">{money.format(item.amount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : item.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-zinc-100 text-zinc-500'}`}>{statusLabels[item.status]}</span></td><td className="px-4 py-3">{item.receiptUrl ? <a href={item.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">Ver <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-amber-700">Faltante</span>}</td><td className="px-4 py-3"><div className="flex">{canUpdate ? <button title="Editar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => setForm(item)}><Pencil className="h-4 w-4" /></button> : null}{canDelete ? <button title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /></button> : null}</div></td></tr>)}</tbody></table>{!result.items.length ? <div className="grid min-h-52 place-items-center text-sm text-zinc-500">No hay gastos para los filtros seleccionados.</div> : null}</div> : <div className="p-8 text-sm text-zinc-500">Cargando gastos…</div>}</article>
    {result ? <footer className="flex items-center justify-between text-sm text-zinc-500"><span>{result.meta.totalItems} registros</span><div className="flex items-center gap-2"><Button variant="secondary" disabled={!result.meta.hasPreviousPage} onClick={() => update({ page: filters.page - 1 })}>Anterior</Button><span>Página {result.meta.page} de {result.meta.totalPages}</span><Button variant="secondary" disabled={!result.meta.hasNextPage} onClick={() => update({ page: filters.page + 1 })}>Siguiente</Button></div></footer> : null}
    <Modal open={form !== undefined} onClose={() => setForm(undefined)} title={form ? 'Editar gasto' : 'Registrar gasto'} description="El total se calcula como final + adicional + impuestos. El estimado se conserva para medir desvíos.">
      <form onSubmit={save} className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Fecha<Input name="date" type="date" required defaultValue={form?.date ? String(form.date).slice(0, 10) : defaultDate} className="mt-1.5" /></label><label className="sm:col-span-2 text-sm font-medium">Concepto<Input name="description" required defaultValue={form?.description} className="mt-1.5" /></label><label className="text-sm font-medium">Salón<Select name="salonId" required defaultValue={id(form?.salonId)} className="mt-1.5"><option value="">Seleccionar…</option>{salons.map((item) => <option key={item._id} value={item._id}>{entity(item)}</option>)}</Select></label><label className="text-sm font-medium">Evento<Select name="eventId" defaultValue={id(form?.eventId)} className="mt-1.5"><option value="">Gasto general</option>{events.map((item) => <option key={item._id} value={item._id}>{entity(item)}</option>)}</Select></label><label className="text-sm font-medium">Proveedor<Select name="supplierId" defaultValue={id(form?.supplierId)} className="mt-1.5"><option value="">Sin proveedor</option>{suppliers.map((item) => <option key={item._id} value={item._id}>{entity(item)}</option>)}</Select></label><label className="text-sm font-medium">Categoría<Select name="categoryId" defaultValue={id(form?.categoryId)} className="mt-1.5"><option value="">Sin categoría</option>{categories.filter((item) => item.isActive).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></label><label className="text-sm font-medium">Estimado inicial<Input name="initialEstimatedAmount" type="number" min="0" step="0.01" defaultValue={form?.initialEstimatedAmount ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Importe final<Input name="finalAmount" type="number" min="0" step="0.01" defaultValue={form?.finalAmount ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Adicional<Input name="additionalAmount" type="number" min="0" step="0.01" defaultValue={form?.additionalAmount ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Impuestos<Input name="taxAmount" type="number" min="0" step="0.01" defaultValue={form?.taxAmount ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Estado<Select name="status" defaultValue={form?.status ?? 'pending'} className="mt-1.5">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="text-sm font-medium">Medio de pago<Select name="paymentMethod" defaultValue={form?.paymentMethod ?? ''} className="mt-1.5"><option value="">Sin informar</option>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="sm:col-span-2 lg:col-span-3 text-sm font-medium">URL del comprobante<Input name="receiptUrl" type="url" defaultValue={form?.receiptUrl} className="mt-1.5" placeholder="https://…" /></label><label className="sm:col-span-2 lg:col-span-3 text-sm font-medium">Notas<Textarea name="notes" defaultValue={form?.notes} className="mt-1.5" /></label><footer className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setForm(undefined)}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar gasto'}</Button></footer></form>
    </Modal>
    <Modal open={categoryOpen} onClose={() => setCategoryOpen(false)} title="Nueva categoría" description="Las categorías son configurables y se usan en reportes y rentabilidad."><form onSubmit={createCategory} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<Input required name="name" className="mt-1.5" /></label><label className="text-sm font-medium">Código<Input required name="code" pattern="[A-Za-z0-9_-]+" className="mt-1.5" /></label><label className="sm:col-span-2 text-sm font-medium">Tipo<Select name="type" className="mt-1.5"><option value="DIRECT">Costo directo</option><option value="INDIRECT">Costo indirecto</option><option value="STAFF">Staff</option><option value="SERVICE">Servicio</option><option value="OTHER">Otro</option></Select></label><footer className="sm:col-span-2 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setCategoryOpen(false)}>Cancelar</Button><Button disabled={saving}>Crear categoría</Button></footer></form></Modal>
  </section>;
}
