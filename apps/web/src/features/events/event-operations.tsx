'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, ClipboardCheck, PackageCheck, Plus, Save, Trash2, Truck } from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui/primitives';
import type { Event, EventAlertItem, EventInventoryItem, EventProductItem, EventResourcePlan, EventSupplierAssignment, EventTaskItem, EventTimelineItem } from '@/features/quotes/types';

type SaveEvent = (payload: Record<string, unknown>) => void;
type SavePlan = (plan: EventResourcePlan) => void;

const timelineStatusLabels: Record<string, string> = { pending: 'Pendiente', ready: 'Preparado', done: 'Hecho', cancelled: 'Cancelado' };
const resourceStatusLabels: Record<string, string> = { planned: 'Planificado', reserved: 'Reservado', purchased: 'Comprado', used: 'Usado', delivered: 'Entregado', returned: 'Devuelto', missing: 'Faltante', damaged: 'Roto' };
const supplierStatusLabels: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', paid: 'Pagado', cancelled: 'Cancelado' };
const taskStatusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', blocked: 'Bloqueada' };
const priorityLabels: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica' };
const alertStatusLabels: Record<string, string> = { pending: 'Pendiente', scheduled: 'Programada', sent: 'Enviada', done: 'Hecha' };

const emptyLogistics = { eventSetupNotes: '', kitchenNotes: '', barNotes: '', decorationNotes: '', accessNotes: '', riskNotes: '' };
const defaultTimelineItems: EventTimelineItem[] = [
  { id: 'setup', time: '', title: 'Armado del salón', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'supplier-arrival', time: '', title: 'Recepción de proveedores', area: 'Logística', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'guest-reception', time: '', title: 'Recepción de invitados', area: 'Recepción', owner: 'Staff', status: 'pending', notes: '' },
  { id: 'honoree-entry', time: '', title: 'Ingreso principal / homenajeado', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'reception-service', time: '', title: 'Servicio de recepción', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'main-menu', time: '', title: 'Servicio de menú principal', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'toast-cake', time: '', title: 'Brindis, torta o momento especial', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'sweet-table', time: '', title: 'Mesa dulce / postre', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'party', time: '', title: 'Baile, DJ y animación', area: 'Pista', owner: 'DJ', status: 'pending', notes: '' },
  { id: 'closing', time: '', title: 'Cierre, desmontaje y devolución', area: 'Logística', owner: 'Coordinación', status: 'pending', notes: '' }
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numeric(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inputDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function inputDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function normalizeResourcePlan(plan?: EventResourcePlan): EventResourcePlan {
  return {
    timelineItems: Array.isArray(plan?.timelineItems) ? plan.timelineItems : [],
    productItems: Array.isArray(plan?.productItems) ? plan.productItems : [],
    inventoryItems: Array.isArray(plan?.inventoryItems) ? plan.inventoryItems : [],
    supplierAssignments: Array.isArray(plan?.supplierAssignments) ? plan.supplierAssignments : [],
    tasks: Array.isArray(plan?.tasks) ? plan.tasks : [],
    alerts: Array.isArray(plan?.alerts) ? plan.alerts : [],
    logistics: { ...emptyLogistics, ...(plan?.logistics ?? {}) },
    source: plan?.source,
    sourceQuoteId: plan?.sourceQuoteId
  };
}

export function createDefaultResourcePlan(): EventResourcePlan {
  return {
    timelineItems: defaultTimelineItems.map((item) => ({ ...item })),
    productItems: [],
    inventoryItems: [],
    supplierAssignments: [],
    tasks: [],
    alerts: [],
    logistics: { ...emptyLogistics },
    source: 'manual_event'
  };
}

export function eventOperationalSummary(plan?: EventResourcePlan) {
  const value = normalizeResourcePlan(plan);
  const doneTasks = (value.tasks ?? []).filter((item) => item.status === 'done').length;
  const doneTimeline = (value.timelineItems ?? []).filter((item) => item.status === 'done').length;
  const resourceIssues = (value.inventoryItems ?? []).filter((item) => ['missing', 'damaged'].includes(String(item.status))).length;
  return {
    timelineCount: value.timelineItems?.length ?? 0,
    productCount: value.productItems?.length ?? 0,
    inventoryCount: value.inventoryItems?.length ?? 0,
    supplierCount: value.supplierAssignments?.length ?? 0,
    taskCount: value.tasks?.length ?? 0,
    alertCount: value.alerts?.length ?? 0,
    doneTasks,
    doneTimeline,
    resourceIssues
  };
}

function SectionCard({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-950">{icon}{title}</h2>
      {action}
    </div>
    <div className="mt-5 space-y-4">{children}</div>
  </article>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block space-y-1.5 ${className}`}>
    <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
    {children}
  </label>;
}

function EmptyRows({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">{text}</div>;
}

function IconButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50">
    <Trash2 className="h-4 w-4" />
  </button>;
}

function SaveBar({ saving, onSave, text = 'Guardar plan operativo' }: { saving: boolean; onSave: () => void; text?: string }) {
  return <div className="flex justify-end border-t border-zinc-100 pt-4">
    <Button disabled={saving} onClick={onSave}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : text}</Button>
  </div>;
}

export function EventBasicsEditor({ event, saving, onSave }: { event: Event; saving: boolean; onSave: SaveEvent }) {
  const [form, setForm] = useState({
    eventName: event.eventName ?? '',
    eventType: event.eventType ?? '',
    eventDate: inputDate(event.eventDate),
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    guestCount: event.guestCount?.toString() ?? '',
    honoreeName: event.honoreeName ?? '',
    vegetarianCount: event.vegetarianCount?.toString() ?? '',
    veganCount: event.veganCount?.toString() ?? '',
    celiacCount: event.celiacCount?.toString() ?? '',
    lactoseIntolerantCount: event.lactoseIntolerantCount?.toString() ?? '',
    tableLinenColor: event.tableLinenColor ?? '',
    notes: event.notes ?? ''
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => onSave({
    eventName: form.eventName,
    eventType: form.eventType,
    eventDate: form.eventDate || undefined,
    startTime: form.startTime,
    endTime: form.endTime,
    guestCount: numeric(form.guestCount),
    honoreeName: form.honoreeName,
    vegetarianCount: numeric(form.vegetarianCount),
    veganCount: numeric(form.veganCount),
    celiacCount: numeric(form.celiacCount),
    lactoseIntolerantCount: numeric(form.lactoseIntolerantCount),
    tableLinenColor: form.tableLinenColor,
    notes: form.notes
  });
  return <SectionCard title="Ficha del evento">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Nombre del evento" className="md:col-span-2"><Input value={form.eventName} onChange={(event) => set('eventName', event.target.value)} /></Field>
      <Field label="Tipo"><Input value={form.eventType} onChange={(event) => set('eventType', event.target.value)} placeholder="15 años, casamiento, infantil..." /></Field>
      <Field label="Homenajeado"><Input value={form.honoreeName} onChange={(event) => set('honoreeName', event.target.value)} /></Field>
      <Field label="Fecha"><Input type="date" value={form.eventDate} onChange={(event) => set('eventDate', event.target.value)} /></Field>
      <Field label="Inicio"><Input value={form.startTime} onChange={(event) => set('startTime', event.target.value)} placeholder="21:00" /></Field>
      <Field label="Fin"><Input value={form.endTime} onChange={(event) => set('endTime', event.target.value)} placeholder="05:00" /></Field>
      <Field label="Invitados"><Input type="number" min={1} value={form.guestCount} onChange={(event) => set('guestCount', event.target.value)} /></Field>
      <Field label="Vegetarianos"><Input type="number" min={0} value={form.vegetarianCount} onChange={(event) => set('vegetarianCount', event.target.value)} /></Field>
      <Field label="Veganos"><Input type="number" min={0} value={form.veganCount} onChange={(event) => set('veganCount', event.target.value)} /></Field>
      <Field label="Celíacos"><Input type="number" min={0} value={form.celiacCount} onChange={(event) => set('celiacCount', event.target.value)} /></Field>
      <Field label="Sin lactosa"><Input type="number" min={0} value={form.lactoseIntolerantCount} onChange={(event) => set('lactoseIntolerantCount', event.target.value)} /></Field>
      <Field label="Mantelería" className="md:col-span-2"><Input value={form.tableLinenColor} onChange={(event) => set('tableLinenColor', event.target.value)} placeholder="Color, textura, servilletas..." /></Field>
      <Field label="Notas internas" className="md:col-span-2 xl:col-span-4"><Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
    </div>
    <SaveBar saving={saving} onSave={save} text="Guardar ficha" />
  </SectionCard>;
}

export function EventTimelineEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [items, setItems] = useState<EventTimelineItem[]>(basePlan.timelineItems ?? []);
  const update = (index: number, changes: Partial<EventTimelineItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const add = () => setItems((current) => [...current, { id: makeId(), time: '', title: '', area: '', owner: '', status: 'pending', notes: '' }]);
  const clean = items.filter((item) => item.title.trim() || item.notes?.trim()).map((item) => ({ ...item, title: item.title.trim(), status: item.status || 'pending' }));
  return <SectionCard title="Cronograma operativo" icon={<CalendarClock className="h-4 w-4" />} action={<Button variant="secondary" onClick={add}><Plus className="mr-2 h-4 w-4" />Agregar momento</Button>}>
    {items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[110px_minmax(180px,1fr)_150px_150px_150px_44px]">
      <Input aria-label="Horario" placeholder="21:00" value={item.time ?? ''} onChange={(event) => update(index, { time: event.target.value })} />
      <Input aria-label="Actividad" placeholder="Ingreso, recepción, cena, vals..." value={item.title} onChange={(event) => update(index, { title: event.target.value })} />
      <Input aria-label="Área" placeholder="Área" value={item.area ?? ''} onChange={(event) => update(index, { area: event.target.value })} />
      <Input aria-label="Responsable" placeholder="Responsable" value={item.owner ?? ''} onChange={(event) => update(index, { owner: event.target.value })} />
      <Select aria-label="Estado" value={item.status ?? 'pending'} onChange={(event) => update(index, { status: event.target.value })}>{Object.entries(timelineStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <IconButton label="Quitar momento" disabled={saving} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
      <Textarea aria-label="Notas" className="lg:col-span-6" placeholder="Notas operativas, señales, música, observaciones..." value={item.notes ?? ''} onChange={(event) => update(index, { notes: event.target.value })} />
    </div>)}</div> : <EmptyRows text="Todavía no hay cronograma cargado para este evento." />}
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, timelineItems: clean })} />
  </SectionCard>;
}

export function EventResourcesEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [products, setProducts] = useState<EventProductItem[]>(basePlan.productItems ?? []);
  const [inventory, setInventory] = useState<EventInventoryItem[]>(basePlan.inventoryItems ?? []);
  const updateProduct = (index: number, changes: Partial<EventProductItem>) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const updateInventory = (index: number, changes: Partial<EventInventoryItem>) => setInventory((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const cleanProducts = products.filter((item) => item.name.trim()).map((item) => ({ ...item, totalCost: Number(item.totalCost ?? Number(item.quantity ?? 0) * Number(item.unitCost ?? 0)) || undefined }));
  const cleanInventory = inventory.filter((item) => item.name.trim());
  return <div className="space-y-5">
    <SectionCard title="Productos e insumos usados" icon={<PackageCheck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setProducts((current) => [...current, { id: makeId(), name: '', category: '', quantity: undefined, unit: 'unidad', status: 'planned', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar insumo</Button>}>
      {products.length ? <div className="space-y-3">{products.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(180px,1fr)_120px_90px_90px_120px_110px_110px_120px_44px]">
        <Input aria-label="Producto" placeholder="Gaseosa, hielo, descartables..." value={item.name} onChange={(event) => updateProduct(index, { name: event.target.value })} />
        <Input aria-label="Categoría" placeholder="Categoría" value={item.category ?? ''} onChange={(event) => updateProduct(index, { category: event.target.value })} />
        <Input aria-label="Cantidad" type="number" min={0} value={item.quantity ?? ''} onChange={(event) => updateProduct(index, { quantity: numeric(event.target.value) })} />
        <Input aria-label="Unidad" placeholder="Unidad" value={item.unit ?? ''} onChange={(event) => updateProduct(index, { unit: event.target.value })} />
        <Input aria-label="Proveedor" placeholder="Proveedor" value={item.supplierName ?? ''} onChange={(event) => updateProduct(index, { supplierName: event.target.value })} />
        <Input aria-label="Costo unitario" type="number" min={0} value={item.unitCost ?? ''} onChange={(event) => updateProduct(index, { unitCost: numeric(event.target.value) })} />
        <Input aria-label="Costo total" type="number" min={0} value={item.totalCost ?? ''} onChange={(event) => updateProduct(index, { totalCost: numeric(event.target.value) })} />
        <Select aria-label="Estado" value={item.status ?? 'planned'} onChange={(event) => updateProduct(index, { status: event.target.value })}>{Object.entries(resourceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar insumo" disabled={saving} onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-9" placeholder="Marca, compra pendiente, reposición..." value={item.notes ?? ''} onChange={(event) => updateProduct(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text="No hay productos o insumos cargados." />}
    </SectionCard>
    <SectionCard title="Vajilla, mantelería, mobiliario y equipos" icon={<PackageCheck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setInventory((current) => [...current, { id: makeId(), name: '', category: 'Vajilla', quantityRequired: undefined, quantityReserved: undefined, quantityReturned: undefined, unit: 'unidad', status: 'planned', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar recurso</Button>}>
      {inventory.length ? <div className="space-y-3">{inventory.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(180px,1fr)_130px_100px_100px_100px_100px_130px_44px]">
        <Input aria-label="Recurso" placeholder="Copas, manteles, mesas..." value={item.name} onChange={(event) => updateInventory(index, { name: event.target.value })} />
        <Input aria-label="Categoría" placeholder="Vajilla" value={item.category ?? ''} onChange={(event) => updateInventory(index, { category: event.target.value })} />
        <Input aria-label="Necesario" type="number" min={0} value={item.quantityRequired ?? ''} onChange={(event) => updateInventory(index, { quantityRequired: numeric(event.target.value) })} />
        <Input aria-label="Reservado" type="number" min={0} value={item.quantityReserved ?? ''} onChange={(event) => updateInventory(index, { quantityReserved: numeric(event.target.value) })} />
        <Input aria-label="Devuelto" type="number" min={0} value={item.quantityReturned ?? ''} onChange={(event) => updateInventory(index, { quantityReturned: numeric(event.target.value) })} />
        <Input aria-label="Unidad" placeholder="Unidad" value={item.unit ?? ''} onChange={(event) => updateInventory(index, { unit: event.target.value })} />
        <Select aria-label="Estado" value={item.status ?? 'planned'} onChange={(event) => updateInventory(index, { status: event.target.value })}>{Object.entries(resourceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar recurso" disabled={saving} onClick={() => setInventory((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-8" placeholder="Color, estado, faltantes, roturas..." value={item.notes ?? ''} onChange={(event) => updateInventory(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text="No hay recursos operativos cargados." />}
      <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, productItems: cleanProducts, inventoryItems: cleanInventory })} />
    </SectionCard>
  </div>;
}

export function EventSuppliersEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [items, setItems] = useState<EventSupplierAssignment[]>(basePlan.supplierAssignments ?? []);
  const update = (index: number, changes: Partial<EventSupplierAssignment>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const clean = items.filter((item) => item.supplierName.trim() || item.serviceType?.trim());
  return <SectionCard title="Servicios externos y proveedores" icon={<Truck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setItems((current) => [...current, { id: makeId(), supplierName: '', serviceType: '', status: 'pending', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar proveedor</Button>}>
    {items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(160px,1fr)_140px_130px_120px_100px_120px_120px_44px]">
      <Input aria-label="Proveedor" placeholder="Proveedor" value={item.supplierName} onChange={(event) => update(index, { supplierName: event.target.value })} />
      <Input aria-label="Servicio" placeholder="Foto, DJ, decoración..." value={item.serviceType ?? ''} onChange={(event) => update(index, { serviceType: event.target.value })} />
      <Input aria-label="Contacto" placeholder="Contacto" value={item.contactName ?? ''} onChange={(event) => update(index, { contactName: event.target.value })} />
      <Input aria-label="Teléfono" placeholder="Teléfono" value={item.phone ?? ''} onChange={(event) => update(index, { phone: event.target.value })} />
      <Input aria-label="Llegada" placeholder="Llegada" value={item.arrivalTime ?? ''} onChange={(event) => update(index, { arrivalTime: event.target.value })} />
      <Input aria-label="Monto acordado" type="number" min={0} value={item.agreedAmount ?? ''} onChange={(event) => update(index, { agreedAmount: numeric(event.target.value) })} />
      <Select aria-label="Estado" value={item.status ?? 'pending'} onChange={(event) => update(index, { status: event.target.value })}>{Object.entries(supplierStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <IconButton label="Quitar proveedor" disabled={saving} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
      <Textarea aria-label="Notas" className="lg:col-span-8" placeholder="Horarios, condiciones, pago..." value={item.notes ?? ''} onChange={(event) => update(index, { notes: event.target.value })} />
    </div>)}</div> : <EmptyRows text="No hay proveedores externos cargados para este evento." />}
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, supplierAssignments: clean })} />
  </SectionCard>;
}

export function EventTasksEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [tasks, setTasks] = useState<EventTaskItem[]>(basePlan.tasks ?? []);
  const [alerts, setAlerts] = useState<EventAlertItem[]>(basePlan.alerts ?? []);
  const updateTask = (index: number, changes: Partial<EventTaskItem>) => setTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const updateAlert = (index: number, changes: Partial<EventAlertItem>) => setAlerts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const cleanTasks = tasks.filter((item) => item.title.trim());
  const cleanAlerts = alerts.filter((item) => item.title.trim());
  return <div className="space-y-5">
    <SectionCard title="Tareas del evento" icon={<ClipboardCheck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setTasks((current) => [...current, { id: makeId(), title: '', owner: '', dueDate: '', priority: 'normal', status: 'pending', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar tarea</Button>}>
      {tasks.length ? <div className="space-y-3">{tasks.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(180px,1fr)_140px_170px_120px_130px_44px]">
        <Input aria-label="Tarea" placeholder="Confirmar menú, croquis, saldo..." value={item.title} onChange={(event) => updateTask(index, { title: event.target.value })} />
        <Input aria-label="Responsable" placeholder="Responsable" value={item.owner ?? ''} onChange={(event) => updateTask(index, { owner: event.target.value })} />
        <Input aria-label="Vencimiento" type="date" value={item.dueDate ? inputDate(item.dueDate) : ''} onChange={(event) => updateTask(index, { dueDate: event.target.value })} />
        <Select aria-label="Prioridad" value={item.priority ?? 'normal'} onChange={(event) => updateTask(index, { priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Estado" value={item.status ?? 'pending'} onChange={(event) => updateTask(index, { status: event.target.value })}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar tarea" disabled={saving} onClick={() => setTasks((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-6" placeholder="Detalle, acuerdos, seguimiento..." value={item.notes ?? ''} onChange={(event) => updateTask(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text="No hay tareas operativas cargadas." />}
    </SectionCard>
    <SectionCard title="Alertas y recordatorios" icon={<CalendarClock className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setAlerts((current) => [...current, { id: makeId(), title: '', remindAt: '', channel: 'system', status: 'pending', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar alerta</Button>}>
      {alerts.length ? <div className="space-y-3">{alerts.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(180px,1fr)_170px_130px_130px_44px]">
        <Input aria-label="Alerta" placeholder="Pedir saldo, confirmar staff..." value={item.title} onChange={(event) => updateAlert(index, { title: event.target.value })} />
        <Input aria-label="Fecha de alerta" type="datetime-local" value={inputDateTime(item.remindAt)} onChange={(event) => updateAlert(index, { remindAt: event.target.value })} />
        <Select aria-label="Canal" value={item.channel ?? 'system'} onChange={(event) => updateAlert(index, { channel: event.target.value })}><option value="system">Sistema</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Select>
        <Select aria-label="Estado" value={item.status ?? 'pending'} onChange={(event) => updateAlert(index, { status: event.target.value })}>{Object.entries(alertStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar alerta" disabled={saving} onClick={() => setAlerts((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-5" placeholder="Mensaje o condición para disparar la alerta..." value={item.notes ?? ''} onChange={(event) => updateAlert(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text="No hay alertas cargadas." />}
      <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, tasks: cleanTasks, alerts: cleanAlerts })} />
    </SectionCard>
  </div>;
}

export function EventLogisticsEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [logistics, setLogistics] = useState(basePlan.logistics ?? emptyLogistics);
  const set = (key: keyof typeof emptyLogistics, value: string) => setLogistics((current) => ({ ...current, [key]: value }));
  return <SectionCard title="Logística y coordinación interna" icon={<ClipboardCheck className="h-4 w-4" />}>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Armado del salón"><Textarea value={logistics.eventSetupNotes ?? ''} onChange={(event) => set('eventSetupNotes', event.target.value)} placeholder="Layout, mesas, pista, ceremonia, sectores..." /></Field>
      <Field label="Cocina"><Textarea value={logistics.kitchenNotes ?? ''} onChange={(event) => set('kitchenNotes', event.target.value)} placeholder="Producción, tiempos, restricciones, emplatado..." /></Field>
      <Field label="Barra y bebidas"><Textarea value={logistics.barNotes ?? ''} onChange={(event) => set('barNotes', event.target.value)} placeholder="Bebidas, hielo, barra, alcohol, horarios..." /></Field>
      <Field label="Ambientación"><Textarea value={logistics.decorationNotes ?? ''} onChange={(event) => set('decorationNotes', event.target.value)} placeholder="Decoración, mantelería, centros, colores..." /></Field>
      <Field label="Ingreso y accesos"><Textarea value={logistics.accessNotes ?? ''} onChange={(event) => set('accessNotes', event.target.value)} placeholder="Acceso proveedores, invitados, estacionamiento..." /></Field>
      <Field label="Riesgos / puntos críticos"><Textarea value={logistics.riskNotes ?? ''} onChange={(event) => set('riskNotes', event.target.value)} placeholder="Alertas internas, dependencias, temas sensibles..." /></Field>
    </div>
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, logistics })} />
  </SectionCard>;
}
