'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, ClipboardCheck, Download, FileText, Mail, MessageCircle, PackageCheck, Plus, Save, Trash2, Truck } from 'lucide-react';
import { Button, Input, Modal, NumberField, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import type { Event, EventAlertItem, EventGuestList, EventInventoryItem, EventProductItem, EventResourcePlan, EventStaffNote, EventSupplierAssignment, EventTaskItem, EventTimelineItem } from '@/features/quotes/types';
import { GuestListWorkspace } from '@/features/events/guest-list-workspace';

type SaveEvent = (payload: Record<string, unknown>) => void;
type SavePlan = (plan: EventResourcePlan) => void;

const timelineStatusLabels: Record<string, string> = { pending: 'Pendiente', ready: 'Preparado', done: 'Hecho', cancelled: 'Cancelado' };
const resourceStatusLabels: Record<string, string> = { planned: 'Planificado', reserved: 'Reservado', purchased: 'Comprado', used: 'Usado', delivered: 'Entregado', returned: 'Devuelto', missing: 'Faltante', damaged: 'Roto' };
const productionCategoryLabels: Record<string, string> = { savory: 'Salados', sweet: 'Dulces', beverages: 'Bebidas', other: 'Otros' };
const supplierStatusLabels: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', paid: 'Pagado', cancelled: 'Cancelado' };
const taskStatusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', blocked: 'Bloqueada' };
const priorityLabels: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica' };
const alertStatusLabels: Record<string, string> = { pending: 'Pendiente', scheduled: 'Programada', sent: 'Enviada', done: 'Hecha' };

const emptyLogistics = { eventSetupNotes: '', kitchenNotes: '', barNotes: '', decorationNotes: '', accessNotes: '', riskNotes: '' };
const logisticsTemplates: Record<keyof typeof emptyLogistics, string> = {
  eventSetupNotes: `Hora de llegada y responsable de apertura: [completar]

Montaje del salón
• Confirmar el layout, cantidad y ubicación de mesas según el plano.
• Preparar mesa principal, sectores de fotos, pista y mesa dulce si aplica.
• Verificar sillas, cartelería, iluminación, sonido y circulación de invitados.
• Hacer una recorrida final con coordinación antes de habilitar el ingreso.`,
  kitchenNotes: `Antes del servicio
• Confirmar cantidades finales, menús infantiles y restricciones alimentarias.
• Coordinar con maître el orden y horario de salida de cada servicio.

Durante el evento
• Preparar recepción, menú principal, postre y mesa dulce según los momentos acordados.
• Identificar las mesas o invitados con menú especial antes de bandejear.
• Avisar a coordinación ante demoras, faltantes o cambios de último momento.`,
  barNotes: `Preparación de barra
• Confirmar bebidas, hielo, cristalería, vasos y horario de apertura.
• Definir responsable de reposición y retiro de vajilla.

Servicio responsable
• Respetar la indicación del evento para menores: no servir alcohol cuando corresponda.
• Preparar alternativas sin alcohol, agua y gaseosas para mesas de chicos.`,
  decorationNotes: `Mantelería y vajilla
• Definir color y combinación de manteles, caminos, servilletas y mesa principal.
• Confirmar cantidad de manteles por mesa, mesa dulce, fotos y sectores especiales.
• Revisar platos, cubiertos, copas y vasos; para niños usar vasos plásticos si corresponde.

Disposición de cubiertos
• Cuchillo a la derecha, con filo hacia adentro.
• Tenedor a la izquierda.
• Cuchara orientada hacia el tenedor.
• Realizar control final de limpieza, manchas y faltantes.`,
  accessNotes: `Recepción e ingreso
• Definir quién recibe a invitados, proveedores y familia principal.
• Tener disponible el control de mesas y la lista de invitados.
• Informar estacionamiento, accesos, baños y sectores reservados.
• Coordinar con maître y staff el momento de habilitar el ingreso.`,
  riskNotes: `Puntos críticos
• Confirmar contactos de salón, coordinación, cocina, DJ, fotografía y proveedores.
• Revisar alergias, restricciones, menores y momentos especiales antes del ingreso.
• Registrar cambios de último momento y comunicar al responsable de cada área.

Cierre
• Hacer conteo de vajilla, mantelería, stock y elementos prestados.
• Registrar faltantes, roturas, sobrantes y pendientes de devolución.`
};
const emptyGuestList: EventGuestList = { tables: [], guests: [], notes: '' };
const defaultTimelineItems: EventTimelineItem[] = [
  { id: 'setup', time: '', title: 'Armado del salón', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'supplier-arrival', time: '', title: 'Recepción de proveedores', area: 'Logística', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'guest-reception', time: '', title: 'Recepción de invitados', area: 'Recepción', owner: 'Staff', status: 'pending', notes: '' },
  { id: 'reception-service', time: '', title: 'Servicio de recepción', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'honoree-entry', time: '', title: 'Ingreso principal / homenajeado', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'main-menu', time: '', title: 'Servicio de menú principal', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'toast-cake', time: '', title: 'Brindis, torta o momento especial', area: 'Salón', owner: 'Coordinación', status: 'pending', notes: '' },
  { id: 'sweet-table', time: '', title: 'Mesa dulce / postre', area: 'Catering', owner: 'Cocina', status: 'pending', notes: '' },
  { id: 'party', time: '', title: 'Baile, DJ y animación', area: 'Pista', owner: 'DJ', status: 'pending', notes: '' },
  { id: 'closing', time: '', title: 'Cierre, desmontaje y devolución', area: 'Logística', owner: 'Coordinación', status: 'pending', notes: '' }
];
const defaultStaffNotes: EventStaffNote[] = [
  { id: 'protocol', title: 'Protocolo y momentos especiales', notes: 'El/la maître confirma cada momento con el cliente, DJ, foto y coordinación antes de avanzar.' },
  { id: 'minors', title: 'Menores y bebidas', notes: 'Identificar a los menores y respetar las indicaciones de bebidas y menú definidas para el evento.' },
  { id: 'closing', title: 'Cierre operativo', notes: 'Al finalizar, realizar conteo de vajilla y mantelería, ordenar cocina y entregar o resguardar los sobrantes según lo acordado.' }
];
const defaultTasks: EventTaskItem[] = [
  { id: 'client-briefing', title: 'Confirmar protocolo y responsables con el cliente', owner: 'Coordinación', priority: 'high', status: 'pending', notes: 'Validar ingresos, música, momentos especiales y contactos de referencia.' },
  { id: 'guest-list', title: 'Cerrar lista de invitados, mesas, menú y restricciones', owner: 'Coordinación', priority: 'high', status: 'pending', notes: 'Compartir formulario con el cliente y revisar el resumen con cocina.' },
  { id: 'setup-check', title: 'Verificar montaje, mantelería, vajilla y equipamiento', owner: 'Logística', priority: 'high', status: 'pending', notes: 'Controlar cantidades, estado y distribución antes del ingreso de invitados.' },
  { id: 'kitchen-briefing', title: 'Coordinar tiempos de servicio con cocina', owner: 'Cocina', priority: 'high', status: 'pending', notes: 'Revisar menú por cantidad y platos con restricción alimentaria.' },
  { id: 'closing-check', title: 'Realizar conteo y devolución al cierre', owner: 'Coordinación', priority: 'normal', status: 'pending', notes: 'Registrar faltantes, roturas, sobrantes y limpieza de sectores.' }
];
const defaultInventoryItems: EventInventoryItem[] = [
  { id: 'dinner-plate', name: 'Plato playo', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'dessert-plate', name: 'Plato de postre', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'water-glass', name: 'Copa de agua', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'champagne-glass', name: 'Copa de champagne', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'plastic-glass', name: 'Vaso plástico', category: 'Vajilla', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'cutlery', name: 'Cubiertos de mesa', category: 'Vajilla', unit: 'juego', status: 'planned', notes: '' },
  { id: 'round-linen', name: 'Mantel redondo', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'box-linen', name: 'Mantel cajón / mesa principal', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'table-runner', name: 'Camino de mesa', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' },
  { id: 'napkin', name: 'Servilleta', category: 'Mantelería', unit: 'unidad', status: 'planned', notes: '' }
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

type Installment = {
  id?: string;
  label?: string;
  amount?: number;
  dueDate?: string;
  paymentWindowStart?: string;
  paymentWindowEnd?: string;
  status?: string;
  notes?: string;
};

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthDay(date: Date, day: number) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth(), Math.min(Math.max(1, day), lastDay), 12);
}

export function normalizeResourcePlan(plan?: EventResourcePlan): EventResourcePlan {
  return {
    timelineItems: Array.isArray(plan?.timelineItems) ? plan.timelineItems : [],
    staffNotes: Array.isArray(plan?.staffNotes) ? plan.staffNotes : [],
    guestList: { ...emptyGuestList, ...(plan?.guestList ?? {}), tables: Array.isArray(plan?.guestList?.tables) ? plan.guestList.tables : [], guests: Array.isArray(plan?.guestList?.guests) ? plan.guestList.guests : [] },
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
    staffNotes: defaultStaffNotes.map((item) => ({ ...item })),
    guestList: { ...emptyGuestList },
    productItems: [],
    inventoryItems: defaultInventoryItems.map((item) => ({ ...item })),
    supplierAssignments: [],
    tasks: defaultTasks.map((item) => ({ ...item })),
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

function Field({ label, children, className = '', action }: { label: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <div className={`block space-y-1.5 ${className}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>{action}</div>
    {children}
  </div>;
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

type OperationalDocumentType = 'timeline' | 'logistics' | 'guest_list';
type OperationalDocument = { fileName: string; format: 'pdf' | 'word'; url: string; secureUrl: string };

function EventOperationalDocumentActions({ event, type, disabled, onNotice }: { event: Event; type: OperationalDocumentType; disabled?: boolean; onNotice?: (message: string, variant?: 'success' | 'error') => void }) {
  const [working, setWorking] = useState<'pdf' | 'word' | 'email' | 'whatsapp' | null>(null);
  const title = type === 'timeline' ? 'cronograma' : type === 'guest_list' ? 'control de invitados por mesa' : 'logística y coordinación interna';
  const customer = typeof event.customerId === 'string' ? undefined : event.customerId;
  const customerName = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
  const [emailOpen, setEmailOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(customer?.email ?? '');
  const [phoneRecipient, setPhoneRecipient] = useState(customer?.phone ?? '');
  const [emailFormat, setEmailFormat] = useState<'pdf' | 'word'>('pdf');
  const requestDocument = async (format: 'pdf' | 'word') => api.post<{ document: OperationalDocument }>(`/events/${event._id}/operational-documents/${type}/export`, { format });
  const openDocument = (asset: OperationalDocument) => {
    const link = globalThis.document.createElement('a');
    link.href = asset.secureUrl || asset.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = asset.fileName;
    link.click();
  };
  const exportDocument = async (format: 'pdf' | 'word') => {
    setWorking(format);
    try {
      const response = await requestDocument(format);
      openDocument(response.document);
      onNotice?.(`${format === 'pdf' ? 'PDF' : 'Word'} del ${title} generado correctamente.`);
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : `No se pudo generar el ${title}.`, 'error');
    } finally { setWorking(null); }
  };
  const email = async () => {
    if (!emailRecipient.trim()) { onNotice?.('Indicá el email destinatario.', 'error'); return; }
    setWorking('email');
    try {
      const response = await api.post<{ emailSent: boolean; email: string }>(`/events/${event._id}/operational-documents/${type}/email`, { format: emailFormat, email: emailRecipient.trim() });
      if (response.emailSent) setEmailOpen(false);
      onNotice?.(response.emailSent ? `${emailFormat === 'pdf' ? 'PDF' : 'Word'} del ${title} enviado a ${response.email}.` : 'El documento fue generado, pero el envío requiere configurar SMTP.', response.emailSent ? 'success' : 'error');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : `No se pudo enviar el ${title}.`, 'error');
    } finally { setWorking(null); }
  };
  const whatsapp = async () => {
    const phone = phoneRecipient.replace(/\D/g, '');
    if (!phone) { onNotice?.('Indicá el número de WhatsApp destinatario.', 'error'); return; }
    setWorking('whatsapp');
    try {
      const response = await requestDocument('pdf');
      const greeting = customerName ? `Hola ${customerName},` : 'Hola,';
      const message = `${greeting}\n\nTe compartimos el ${title} del evento ${event.eventName || event.eventType || ''}.\n\nPodés verlo o descargarlo acá:\n${response.document.secureUrl || response.document.url}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      setWhatsappOpen(false);
      onNotice?.('Documento listo para compartir por WhatsApp.');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : `No se pudo preparar el ${title}.`, 'error');
    } finally { setWorking(null); }
  };
  const busy = Boolean(working) || disabled;
  return <><div className="flex flex-wrap gap-2">
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void exportDocument('pdf')}><Download className="mr-2 h-4 w-4" />{working === 'pdf' ? 'Generando...' : 'PDF'}</Button>
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void exportDocument('word')}><FileText className="mr-2 h-4 w-4" />{working === 'word' ? 'Generando...' : 'Word'}</Button>
    <Button type="button" variant="secondary" disabled={busy} onClick={() => setEmailOpen(true)}><Mail className="mr-2 h-4 w-4" />Email</Button>
    <Button type="button" variant="secondary" disabled={busy} onClick={() => setWhatsappOpen(true)}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
  </div>
  <Modal open={emailOpen} title={`Enviar ${title} por email`} description="Elegí el formato e indicá el destinatario antes de enviar." onClose={() => !working && setEmailOpen(false)}><form className="space-y-4 p-6" onSubmit={(event) => { event.preventDefault(); void email(); }}><Field label="Email destinatario"><Input required type="email" value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} placeholder="equipo@ejemplo.com" /></Field><Field label="Formato adjunto"><Select value={emailFormat} onChange={(event) => setEmailFormat(event.target.value as 'pdf' | 'word')}><option value="pdf">PDF</option><option value="word">Word</option></Select></Field><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" disabled={Boolean(working)} onClick={() => setEmailOpen(false)}>Cancelar</Button><Button disabled={Boolean(working)}>{working === 'email' ? 'Enviando...' : 'Enviar documento'}</Button></div></form></Modal>
  <Modal open={whatsappOpen} title={`Compartir ${title} por WhatsApp`} description="Indicá el número al que querés preparar el mensaje con el enlace al PDF." onClose={() => !working && setWhatsappOpen(false)}><form className="space-y-4 p-6" onSubmit={(event) => { event.preventDefault(); void whatsapp(); }}><Field label="Número de WhatsApp"><Input required inputMode="tel" value={phoneRecipient} onChange={(event) => setPhoneRecipient(event.target.value)} placeholder="54911..." /></Field><p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">Se abrirá WhatsApp con el mensaje y el enlace seguro al PDF, listo para revisar y enviar.</p><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" disabled={Boolean(working)} onClick={() => setWhatsappOpen(false)}>Cancelar</Button><Button disabled={Boolean(working)}>{working === 'whatsapp' ? 'Preparando...' : 'Abrir WhatsApp'}</Button></div></form></Modal>
  </>;
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

export function EventCommercialEditor({ event, saving, onSave }: { event: Event; saving: boolean; onSave: SaveEvent }) {
  const initial = event.commercialSnapshot ?? {};
  const [form, setForm] = useState({ total: String(event.finalAmount ?? event.estimatedAmount ?? initial.totalAmount ?? ''), deposit: String(initial.depositAmount ?? ''), paymentTerms: String(initial.paymentTerms ?? ''), installments: event.paymentPlanSnapshot ?? [] as Installment[] });
  const [generator, setGenerator] = useState({ count: '1', firstDueDate: '', frequency: 'monthly', windowStartDay: '1', windowEndDay: '10' });
  const updateInstallment = (index: number, changes: Record<string, unknown>) => setForm((current) => ({ ...current, installments: current.installments.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  const total = numeric(form.total) ?? 0;
  const deposit = numeric(form.deposit) ?? 0;
  const generateInstallments = () => {
    const count = Math.max(1, Math.floor(Number(generator.count) || 1));
    const balance = Math.max(0, total - deposit);
    const base = Math.floor(balance / count);
    // La fecha elegida representa el cierre del primer período: 10/08 con ventana 1-10 genera 1/08 a 10/08.
    const start = generator.firstDueDate ? new Date(`${generator.firstDueDate}T12:00:00`) : new Date();
    const startDay = Math.min(31, Math.max(1, Math.floor(Number(generator.windowStartDay) || 1)));
    const endDay = Math.min(31, Math.max(startDay, Math.floor(Number(generator.windowEndDay) || startDay)));
    const months = generator.frequency === 'monthly' ? 1 : generator.frequency === 'bimonthly' ? 2 : 3;
    setForm((current) => ({ ...current, installments: Array.from({ length: count }, (_, index) => {
      const period = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
      if (generator.frequency === 'biweekly') period.setDate(start.getDate() + index * 15);
      else period.setMonth(start.getMonth() + index * months);
      const windowStart = generator.frequency === 'biweekly' ? new Date(period) : monthDay(period, startDay);
      const windowEnd = generator.frequency === 'biweekly' ? new Date(period.getFullYear(), period.getMonth(), period.getDate() + 14, 12) : monthDay(period, endDay);
      return {
        id: makeId(),
        label: `Cuota ${index + 1} de ${count}`,
        amount: index === count - 1 ? balance - base * (count - 1) : base,
        dueDate: dateOnly(windowEnd),
        paymentWindowStart: dateOnly(windowStart),
        paymentWindowEnd: dateOnly(windowEnd),
        status: 'scheduled',
        notes: ''
      };
    }) }));
  };
  return <SectionCard title="Valores y plan de pagos" icon={<ClipboardCheck className="h-4 w-4" />}>
    <div className="grid gap-4 md:grid-cols-3"><Field label="Total acordado"><Input type="number" min={0} value={form.total} onChange={(event) => setForm((current) => ({ ...current, total: event.target.value }))} /></Field><Field label="Seña"><Input type="number" min={0} value={form.deposit} onChange={(event) => setForm((current) => ({ ...current, deposit: event.target.value }))} /></Field><Field label="Saldo estimado"><div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-semibold">{Math.max(0, total - deposit).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}</div></Field><Field label="Condiciones de pago" className="md:col-span-3"><Textarea value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="Ej.: seña al reservar y saldo en cuotas mensuales." /></Field></div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><p className="font-medium text-amber-950">Generar cuotas automáticamente</p><p className="mt-1 text-sm text-amber-800">Cada cuota queda programada con su período de pago para usar en alertas y recordatorios.</p><div className="mt-3 grid gap-3 md:grid-cols-6"><Field label="Cantidad de cuotas"><Input type="number" min={1} max={60} value={generator.count} onChange={(event) => setGenerator((current) => ({ ...current, count: event.target.value }))} /></Field><Field label="Primer período"><Input type="date" value={generator.firstDueDate} onChange={(event) => setGenerator((current) => ({ ...current, firstDueDate: event.target.value }))} /></Field><Field label="Frecuencia"><Select value={generator.frequency} onChange={(event) => setGenerator((current) => ({ ...current, frequency: event.target.value }))}><option value="biweekly">Quincenal</option><option value="monthly">Mensual</option><option value="bimonthly">Bimestral</option><option value="quarterly">Trimestral</option></Select></Field>{generator.frequency !== 'biweekly' && <><Field label="Paga desde el día"><Input type="number" min={1} max={31} value={generator.windowStartDay} onChange={(event) => setGenerator((current) => ({ ...current, windowStartDay: event.target.value }))} /></Field><Field label="Hasta el día"><Input type="number" min={1} max={31} value={generator.windowEndDay} onChange={(event) => setGenerator((current) => ({ ...current, windowEndDay: event.target.value }))} /></Field></>}<div className="flex items-end"><Button type="button" variant="secondary" onClick={generateInstallments}>Generar plan</Button></div></div><p className="mt-3 text-xs text-amber-800">{generator.frequency === 'biweekly' ? 'Las cuotas quincenales se generan cada 15 días y cada ventana abarca los 15 días del período.' : 'Ejemplo: del día 1 al 10 de cada período. El vencimiento será el último día de esa ventana.'}</p></div>
    <div className="space-y-3">{form.installments.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[minmax(150px,1fr)_140px_155px_155px_130px_44px]"><Input value={item.label ?? ''} onChange={(event) => updateInstallment(index, { label: event.target.value })} placeholder="Seña / Cuota" /><NumberField label="Importe de la cuota" min={0} value={item.amount ?? 0} onChange={(event) => updateInstallment(index, { amount: Number(event.target.value) })} /><Field label="Paga desde"><Input type="date" value={item.paymentWindowStart?.slice(0, 10) ?? ''} onChange={(event) => updateInstallment(index, { paymentWindowStart: event.target.value || undefined })} /></Field><Field label="Hasta"><Input type="date" value={item.paymentWindowEnd?.slice(0, 10) ?? item.dueDate?.slice(0, 10) ?? ''} onChange={(event) => updateInstallment(index, { paymentWindowEnd: event.target.value || undefined, dueDate: event.target.value || undefined })} /></Field><Select value={item.status ?? 'pending'} onChange={(event) => updateInstallment(index, { status: event.target.value })}><option value="pending">Pendiente</option><option value="scheduled">Programada</option><option value="paid">Cobrada</option></Select><IconButton label="Quitar cuota" disabled={saving} onClick={() => setForm((current) => ({ ...current, installments: current.installments.filter((_, itemIndex) => itemIndex !== index) }))} /></div>)}</div>
    <SaveBar saving={saving} text="Guardar valores y plan de pagos" onSave={() => onSave({ finalAmount: total, estimatedAmount: total, commercialSnapshot: { ...initial, totalAmount: total, depositAmount: deposit, balanceAmount: Math.max(0, total - deposit), paymentTerms: form.paymentTerms }, paymentPlanSnapshot: form.installments })} />
  </SectionCard>;
}

export function EventTimelineEditor({ plan, saving, onSave }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [items, setItems] = useState<EventTimelineItem[]>(basePlan.timelineItems ?? []);
  const [staffNotes, setStaffNotes] = useState<EventStaffNote[]>(basePlan.staffNotes ?? []);
  const update = (index: number, changes: Partial<EventTimelineItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const updateStaffNote = (index: number, changes: Partial<EventStaffNote>) => setStaffNotes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const add = () => setItems((current) => [...current, { id: makeId(), time: '', title: '', area: '', owner: '', status: 'pending', notes: '' }]);
  const addStaffNote = () => setStaffNotes((current) => [...current, { id: makeId(), title: '', notes: '' }]);
  const clean = items.filter((item) => item.title.trim() || item.notes?.trim()).map((item) => ({ ...item, title: item.title.trim(), status: item.status || 'pending' }));
  const cleanStaffNotes = staffNotes.filter((item) => item.notes.trim()).map((item) => ({ ...item, title: item.title?.trim() }));
  const timelineNotes = items.filter((item) => item.notes?.trim());
  return <SectionCard title="Momentos del cronograma" icon={<CalendarClock className="h-4 w-4" />} action={<Button variant="secondary" onClick={add}><Plus className="mr-2 h-4 w-4" />Agregar momento</Button>}>
    {items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[110px_minmax(180px,1fr)_150px_150px_150px_44px]">
      <Input aria-label="Horario" placeholder="21:00" value={item.time ?? ''} onChange={(event) => update(index, { time: event.target.value })} />
      <Input aria-label="Actividad" placeholder="Ingreso, recepción, cena, vals..." value={item.title} onChange={(event) => update(index, { title: event.target.value })} />
      <Input aria-label="Área" placeholder="Área" value={item.area ?? ''} onChange={(event) => update(index, { area: event.target.value })} />
      <Input aria-label="Responsable" placeholder="Responsable" value={item.owner ?? ''} onChange={(event) => update(index, { owner: event.target.value })} />
      <Select aria-label="Estado" value={item.status ?? 'pending'} onChange={(event) => update(index, { status: event.target.value })}>{Object.entries(timelineStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <IconButton label="Quitar momento" disabled={saving} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
      <Textarea aria-label="Notas" className="lg:col-span-6" placeholder="Notas operativas, señales, música, observaciones..." value={item.notes ?? ''} onChange={(event) => update(index, { notes: event.target.value })} />
    </div>)}</div> : <EmptyRows text="Todavía no hay cronograma cargado para este evento." />}
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-amber-950">Notas para el staff</h3><p className="mt-1 text-sm text-amber-800">Indicaciones generales para el equipo. También se incluyen en el PDF y Word.</p></div><Button type="button" variant="secondary" onClick={addStaffNote}><Plus className="mr-2 h-4 w-4" />Agregar nota</Button></div>
      {staffNotes.length ? <div className="mt-4 space-y-3">{staffNotes.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-amber-100 bg-white/80 p-3 md:grid-cols-[minmax(180px,1fr)_44px]"><div className="space-y-3"><Input aria-label="Título de nota para staff" value={item.title ?? ''} onChange={(event) => updateStaffNote(index, { title: event.target.value })} placeholder="Título o referencia (opcional)" /><Textarea aria-label="Nota para staff" value={item.notes} onChange={(event) => updateStaffNote(index, { notes: event.target.value })} placeholder="Ej.: Antes del vals, coordinación avisa a DJ y foto; despejar la pista." /></div><IconButton label="Quitar nota para staff" disabled={saving} onClick={() => setStaffNotes((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-amber-200 bg-white/60 px-3 py-3 text-sm text-amber-800">Usá “Agregar nota” para cargar indicaciones generales que deba conocer todo el staff.</p>}
      {timelineNotes.length ? <div className="mt-4 border-t border-amber-200 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Notas vinculadas a momentos</p><ol className="mt-2 space-y-2">{timelineNotes.map((item, index) => <li key={item.id ?? index} className="rounded-lg border border-amber-100 bg-white/60 px-3 py-2.5 text-sm text-zinc-700"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold text-zinc-950">{item.time || 'Sin horario'} · {item.title || 'Momento sin título'}</span>{item.area ? <span className="text-xs text-zinc-500">{item.area}</span> : null}{item.owner ? <span className="text-xs text-zinc-500">· {item.owner}</span> : null}</div><p className="mt-1 whitespace-pre-wrap leading-5">{item.notes}</p></li>)}</ol></div> : null}
    </div>
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, timelineItems: clean, staffNotes: cleanStaffNotes })} />
  </SectionCard>;
}

const operationalViews = [
  ['moments', 'Momentos'],
  ['guests', 'Lista invitados y mesas'],
  ['logistics', 'Logística'],
  ['linen', 'Mantelería y vajilla'],
  ['products', 'Stock de productos']
] as const;

export function EventOperationsWorkspace({ event, plan, saving, onSave, onSyncSummary, onNotice }: { event: Event; plan?: EventResourcePlan; saving: boolean; onSave: SavePlan; onSyncSummary: (payload: Record<string, unknown>) => void; onNotice?: (message: string, variant?: 'success' | 'error') => void }) {
  const [view, setView] = useState<(typeof operationalViews)[number][0]>('moments');
  return <div className="space-y-5"><div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"><div className="flex gap-2 overflow-x-auto"><div className="flex min-w-max gap-2">{operationalViews.map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${view === value ? 'bg-zinc-950 text-white shadow-sm' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}>{label}</button>)}</div></div></div>
    <SectionCard title="Documentos operativos" icon={<FileText className="h-4 w-4" />}><p className="text-sm text-zinc-500">El cronograma reúne todas las vistas del evento. Desde aquí podés generar cada planilla por separado, sin depender de la pestaña que estés consultando.</p><div className="grid gap-3 xl:grid-cols-3"><div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"><h3 className="font-semibold text-zinc-950">Cronograma integral</h3><p className="mt-1 min-h-10 text-sm text-zinc-500">Momentos, responsables, notas de staff y resumen de invitados.</p><div className="mt-4"><EventOperationalDocumentActions event={event} type="timeline" disabled={saving} onNotice={onNotice} /></div></div><div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"><h3 className="font-semibold text-zinc-950">Control de ingreso por mesa</h3><p className="mt-1 min-h-10 text-sm text-zinc-500">Lista para recepción con casillas de ingreso, menú y observaciones.</p><div className="mt-4"><EventOperationalDocumentActions event={event} type="guest_list" disabled={saving} onNotice={onNotice} /></div></div><div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"><h3 className="font-semibold text-zinc-950">Logística y coordinación</h3><p className="mt-1 min-h-10 text-sm text-zinc-500">Armado, cocina, barra, ambientación, accesos y riesgos.</p><div className="mt-4"><EventOperationalDocumentActions event={event} type="logistics" disabled={saving} onNotice={onNotice} /></div></div></div></SectionCard>
    {view === 'moments' && <EventTimelineEditor plan={plan} saving={saving} onSave={onSave} />}
    {view === 'guests' && <EventGuestListEditor event={event} plan={plan} saving={saving} onSave={onSave} onSyncSummary={onSyncSummary} onNotice={onNotice} />}
    {view === 'logistics' && <EventLogisticsEditor plan={plan} saving={saving} onSave={onSave} />}
    {view === 'linen' && <EventTablewareEditor event={event} saving={saving} onNotice={onNotice} />}
    {view === 'products' && <EventResourcesEditor plan={plan} saving={saving} onSave={onSave} section="products" />}
  </div>;
}

export function EventGuestListEditor({ event, plan, saving, onSave, onSyncSummary, onNotice }: { event: Event; plan?: EventResourcePlan; saving: boolean; onSave: SavePlan; onSyncSummary: (payload: Record<string, unknown>) => void; onNotice?: (message: string, variant?: 'success' | 'error') => void }) {
  return <GuestListWorkspace event={event} plan={plan} saving={saving} onSave={onSave} onSyncSummary={onSyncSummary} onNotice={onNotice} />;
}

type SalonTablewareItem = { _id: string; name: string; category: string; currentQuantity: number; unitOfMeasure: string; reservedQuantity: number; availableQuantity: number; maxAssignableQuantity: number };
type TablewareAllocation = { _id?: string; salonStockItemId?: string; source: 'salon_stock' | 'external'; itemName: string; category?: string; unit?: string; quantity: number; notes?: string };
type ExternalTablewareItem = { id: string; name: string; category: string; unit: string; quantity?: number; notes?: string };

export function EventTablewareEditor({ event, saving, onNotice }: { event: Event; saving: boolean; onNotice?: (message: string, variant?: 'success' | 'error') => void }) {
  const [items, setItems] = useState<SalonTablewareItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | undefined>>({});
  const [external, setExternal] = useState<ExternalTablewareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const guestCount = Number(event.guestCount ?? 0);

  const load = async () => {
    setLoading(true); setMessage(undefined);
    try {
      const result = await api.get<{ items: SalonTablewareItem[]; allocations: TablewareAllocation[] }>(`/events/${event._id}/tableware`);
      setItems(result.items ?? []);
      const internal: Record<string, number> = {};
      const externalItems: ExternalTablewareItem[] = [];
      for (const allocation of result.allocations ?? []) {
        if (allocation.source === 'salon_stock' && allocation.salonStockItemId) internal[allocation.salonStockItemId] = allocation.quantity;
        if (allocation.source === 'external') externalItems.push({ id: allocation._id ?? makeId(), name: allocation.itemName, category: allocation.category || 'Vajilla adicional', unit: allocation.unit || 'unidad', quantity: allocation.quantity, notes: allocation.notes });
      }
      setQuantities(internal); setExternal(externalItems);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar la vajilla del salón.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }); return () => window.clearTimeout(timer); }, [event._id]);

  const assignSuggested = () => {
    if (!guestCount) { setMessage('Indicá la cantidad de invitados en el evento para armar la sugerencia.'); return; }
    const suggested: Record<string, number> = {};
    for (const item of items) {
      if (['PLATES', 'GLASSWARE', 'DRINKWARE', 'CUTLERY'].includes(item.category)) suggested[item._id] = Math.min(guestCount, item.maxAssignableQuantity);
    }
    setQuantities(suggested);
    setMessage(`Se prearmó una unidad por invitado para platos, copas, vasos y cubiertos. Revisá y ajustá antes de guardar.`);
  };
  const addExternalShortages = () => {
    if (!guestCount) { setMessage('Indicá la cantidad de invitados antes de calcular faltantes.'); return; }
    const shortages = items.filter((item) => ['PLATES', 'GLASSWARE', 'DRINKWARE', 'CUTLERY'].includes(item.category)).map((item) => ({ item, missing: Math.max(0, guestCount - Math.min(guestCount, item.maxAssignableQuantity)) })).filter(({ missing }) => missing > 0);
    if (!shortages.length) { setMessage('El stock propio alcanza para la sugerencia actual.'); return; }
    setExternal((current) => [...current, ...shortages.map(({ item, missing }) => ({ id: makeId(), name: `${item.name} adicional`, category: 'Vajilla adicional', unit: item.unitOfMeasure || 'unidad', quantity: missing, notes: 'Refuerzo por faltante de stock del salón.' }))]);
  };
  const save = async () => {
    setSubmitting(true); setMessage(undefined);
    try {
      const salonItems = Object.entries(quantities).filter(([, quantity]) => Number(quantity) > 0).map(([stockItemId, quantity]) => ({ stockItemId, quantity: Number(quantity) }));
      const externalItems = external.filter((item) => item.name.trim() && Number(item.quantity) > 0).map((item) => ({ id: item.id, name: item.name.trim(), category: item.category.trim() || 'Vajilla adicional', unit: item.unit.trim() || 'unidad', quantity: Number(item.quantity), notes: item.notes?.trim() || undefined }));
      const result = await api.put<{ items: SalonTablewareItem[]; allocations: TablewareAllocation[] }>(`/events/${event._id}/tableware`, { salonItems, externalItems });
      setItems(result.items ?? items);
      setMessage('Vajilla asignada. El disponible para la fecha ya fue actualizado.');
      onNotice?.('Vajilla asignada y reservada para la fecha del evento.', 'success');
    } catch (error) { const text = error instanceof Error ? error.message : 'No se pudo guardar la asignación de vajilla.'; setMessage(text); onNotice?.(text, 'error'); }
    finally { setSubmitting(false); }
  };
  const updateExternal = (id: string, patch: Partial<ExternalTablewareItem>) => setExternal((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  return <SectionCard title="Vajilla del salón" icon={<PackageCheck className="h-4 w-4" />} action={<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={assignSuggested} disabled={loading || submitting || saving}>Prearmar por invitados</Button><Button type="button" variant="secondary" onClick={addExternalShortages} disabled={loading || submitting || saving}>Completar faltantes</Button></div>}>
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">La vajilla propia se reserva sólo para la fecha de este evento. La sugerencia usa {guestCount ? `${guestCount} invitados` : 'la cantidad de invitados del evento'}; podés corregir cada cantidad antes de guardar.</p>
    {message ? <p className="mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">{message}</p> : null}
    {loading ? <p className="mt-5 text-sm text-zinc-500">Cargando disponibilidad del salón…</p> : <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Artículo</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Reservado fecha</th><th className="px-4 py-3">Disponible</th><th className="px-4 py-3">Asignar al evento</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((item) => <tr key={item._id}><td className="px-4 py-3"><p className="font-medium text-zinc-900">{item.name}</p><p className="text-xs text-zinc-500">{item.category} · {item.unitOfMeasure}</p></td><td className="px-4 py-3">{item.currentQuantity}</td><td className="px-4 py-3">{item.reservedQuantity}</td><td className={`px-4 py-3 font-semibold ${item.availableQuantity ? 'text-emerald-700' : 'text-rose-700'}`}>{item.availableQuantity}</td><td className="px-4 py-3"><Input aria-label={`Asignar ${item.name}`} className="w-32" type="number" min={0} value={quantities[item._id] ?? ''} onChange={(input) => setQuantities((current) => ({ ...current, [item._id]: numeric(input.target.value) }))} /></td></tr>)}</tbody></table></div>{!items.length ? <p className="px-4 py-8 text-sm text-zinc-500">Este salón no tiene artículos de vajilla activos.</p> : null}</div>}
    <div className="mt-5 rounded-xl border border-zinc-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-zinc-950">Vajilla adicional</h3><p className="mt-1 text-sm text-zinc-500">Usala para préstamo, alquiler o compra externa; no descuenta el stock del salón.</p></div><Button type="button" variant="secondary" onClick={() => setExternal((current) => [...current, { id: makeId(), name: '', category: 'Vajilla adicional', unit: 'unidad', quantity: undefined, notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar adicional</Button></div>
      {external.length ? <div className="mt-4 space-y-3">{external.map((item) => <div key={item.id} className="grid gap-3 rounded-xl bg-zinc-50 p-3 md:grid-cols-[minmax(180px,1fr)_150px_100px_100px_44px]"><Input aria-label="Vajilla adicional" placeholder="Ej.: Copas alquiladas" value={item.name} onChange={(input) => updateExternal(item.id, { name: input.target.value })} /><Input aria-label="Categoría adicional" value={item.category} onChange={(input) => updateExternal(item.id, { category: input.target.value })} /><NumberField label="Cantidad adicional" min={1} value={item.quantity ?? ''} onChange={(input) => updateExternal(item.id, { quantity: numeric(input.target.value) })} /><Input aria-label="Unidad adicional" value={item.unit} onChange={(input) => updateExternal(item.id, { unit: input.target.value })} /><IconButton label="Quitar vajilla adicional" onClick={() => setExternal((current) => current.filter((other) => other.id !== item.id))} /></div>)}</div> : null}
    </div>
    <SaveBar saving={saving || submitting} onSave={() => void save()} />
  </SectionCard>;
}

/*
function LegacyEventGuestListEditor({ event, plan, saving, onSave, onSyncSummary, onNotice }: { event: Event; plan?: EventResourcePlan; saving: boolean; onSave: SavePlan; onSyncSummary: (payload: Record<string, unknown>) => void; onNotice?: (message: string, variant?: 'success' | 'error') => void }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [guestList, setGuestList] = useState<EventGuestList>(() => guestListWithIds(basePlan.guestList));
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [quickGuests, setQuickGuests] = useState('');
  const tables = guestList.tables ?? [];
  const guests = guestList.guests ?? [];
  const updateList = (changes: Partial<EventGuestList>) => setGuestList((current) => ({ ...current, ...changes }));
  const updateTable = (index: number, changes: Partial<EventGuestTable>) => updateList({ tables: tables.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  const updateGuest = (index: number, changes: Partial<EventGuest>) => updateList({ guests: guests.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  const addTable = () => updateList({ tables: [...tables, { id: makeId(), name: `Mesa ${tables.length + 1}`, capacity: undefined, notes: '' }] });
  const addGuest = () => updateList({ guests: [...guests, { id: makeId(), fullName: '', tableId: '', meal: '', guestType: 'adult', dietaryPreference: 'none', notes: '', confirmed: true }] });
  const addQuickGuests = () => {
    const newGuests = quickGuests.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [fullName, meal] = line.split('|', 2).map((part) => part.trim());
      return { id: makeId(), fullName, tableId: '', meal: meal ?? '', guestType: 'adult', dietaryPreference: 'none', notes: '', confirmed: true } satisfies EventGuest;
    });
    if (!newGuests.length) return;
    updateList({ guests: [...guests, ...newGuests] });
    setQuickGuests('');
  };
  const cleanTables = tables.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim(), notes: item.notes?.trim() }));
  const cleanGuests = guests.filter((item) => item.fullName.trim()).map((item) => ({ ...item, fullName: item.fullName.trim(), meal: item.meal?.trim(), notes: item.notes?.trim() }));
  const adultGuests = cleanGuests.filter((item) => item.guestType !== 'child').length;
  const childGuests = cleanGuests.filter((item) => item.guestType === 'child').length;
  const dietary = (value: string) => cleanGuests.filter((item) => item.dietaryPreference === value).length;
  const mealSummary = cleanGuests.reduce<Record<string, number>>((summary, item) => { const key = item.meal?.trim() || 'Sin menú definido'; summary[key] = (summary[key] ?? 0) + 1; return summary; }, {});
  const resourceSuggestions = [
    ['Platos playos', adultGuests], ['Platos de postre', cleanGuests.length], ['Cubiertos de mesa', adultGuests], ['Copas de agua', adultGuests], ['Vasos plásticos', childGuests], ['Servilletas', cleanGuests.length], ['Manteles para mesas', cleanTables.length]
  ].filter(([, quantity]) => Number(quantity) > 0);
  const save = () => onSave({ ...basePlan, guestList: { tables: cleanTables, guests: cleanGuests, notes: guestList.notes?.trim(), submittedAt: guestList.submittedAt } });
  const syncSummary = () => onSyncSummary({ guestCount: cleanGuests.length || undefined, vegetarianCount: dietary('vegetarian'), veganCount: dietary('vegan'), celiacCount: dietary('celiac'), lactoseIntolerantCount: dietary('lactose_free') });
  const createShareLink = async () => {
    setSharing(true);
    try {
      const response = await api.post<{ token: string }>(`/events/${event._id}/guest-list-link`, {});
      const url = `${globalThis.location.origin}/invitados/${response.token}`;
      setShareUrl(url);
      try { await globalThis.navigator.clipboard.writeText(url); onNotice?.('Enlace para el cliente creado y copiado.'); }
      catch { onNotice?.('Enlace para el cliente creado. Copialo desde el campo mostrado.'); }
    } catch (error) { onNotice?.(error instanceof Error ? error.message : 'No se pudo crear el enlace para el cliente.', 'error'); }
    finally { setSharing(false); }
  };
  return <div className="space-y-5">
    <SectionCard title="Lista de invitados y mesas" icon={<CalendarClock className="h-4 w-4" />} action={<Button type="button" variant="secondary" disabled={sharing || saving} onClick={() => void createShareLink()}>{sharing ? 'Creando enlace...' : event.guestListAccessToken ? 'Renovar enlace cliente' : 'Compartir con cliente'}</Button>}>
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"><p className="font-medium text-sky-950">Formulario simple para el cliente</p><p className="mt-1 text-sm text-sky-800">El cliente podrá cargar invitados, mesa, menú y restricciones. Sus datos quedan listos para el cronograma y la operación.</p>{shareUrl ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input readOnly value={shareUrl} aria-label="Enlace de lista de invitados" /><a className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-sky-900 shadow-sm ring-1 ring-sky-200" href={shareUrl} target="_blank" rel="noreferrer">Abrir formulario</a></div> : null}</div>
      <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">El PDF y Word se generan con la última versión guardada de la lista. Después de reorganizar mesas o invitados, elegí <strong>Guardar lista de invitados</strong>.</p>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-zinc-950">Mesas</h3><p className="mt-1 text-sm text-zinc-500">Definí la distribución antes de asignar invitados.</p></div><Button type="button" variant="secondary" onClick={addTable}><Plus className="mr-2 h-4 w-4" />Agregar mesa</Button></div>
      {tables.length ? <div className="space-y-3">{tables.map((table, index) => <div key={table.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 md:grid-cols-[minmax(180px,1fr)_130px_minmax(180px,1fr)_44px]"><Input aria-label="Nombre de mesa" value={table.name} onChange={(event) => updateTable(index, { name: event.target.value })} placeholder="Mesa principal" /><Input aria-label="Capacidad" type="number" min={1} value={table.capacity ?? ''} onChange={(event) => updateTable(index, { capacity: numeric(event.target.value) })} placeholder="Capacidad" /><Input aria-label="Notas de mesa" value={table.notes ?? ''} onChange={(event) => updateTable(index, { notes: event.target.value })} placeholder="Familia, niños, menú especial..." /><IconButton label="Quitar mesa" disabled={saving} onClick={() => updateList({ tables: tables.filter((_, itemIndex) => itemIndex !== index), guests: guests.map((guest) => guest.tableId === table.id ? { ...guest, tableId: '' } : guest) })} /></div>)}</div> : <EmptyRows text="Todavía no hay mesas cargadas." />}
      <GuestSeatingBoard tables={tables} guests={guests} onAssign={(guestId, tableId) => updateList({ guests: guests.map((guest) => guest.id === guestId ? { ...guest, tableId } : guest) })} />
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-emerald-950">Carga rápida de invitados</h3><p className="mt-1 text-sm text-emerald-800">Pegá un invitado por línea. Si querés, agregá el menú separado por <strong>|</strong>.</p></div><Button type="button" variant="secondary" disabled={!quickGuests.trim()} onClick={addQuickGuests}><Plus className="mr-2 h-4 w-4" />Agregar {quickGuests.split(/\r?\n/).filter((line) => line.trim()).length || ''} invitado{quickGuests.split(/\r?\n/).filter((line) => line.trim()).length === 1 ? '' : 's'}</Button></div><Textarea className="mt-3" aria-label="Carga rápida de invitados" value={quickGuests} onChange={(event) => setQuickGuests(event.target.value)} placeholder={'Camila Pérez | Menú pollo\nJuan García | Vegetariano\nSofía López'} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4"><div><h3 className="font-semibold text-zinc-950">Detalle de invitados</h3><p className="mt-1 text-sm text-zinc-500">Registrá ubicación, menú y restricciones para que cocina y salón trabajen con la misma información.</p></div><Button type="button" variant="secondary" onClick={addGuest}><Plus className="mr-2 h-4 w-4" />Agregar invitado</Button></div>
      {guests.length ? <div className="space-y-3">{guests.map((guest, index) => <div key={guest.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(175px,1fr)_150px_140px_130px_145px_44px]"><Input aria-label="Nombre del invitado" value={guest.fullName} onChange={(event) => updateGuest(index, { fullName: event.target.value })} placeholder="Nombre y apellido" /><Select aria-label="Mesa" value={guest.tableId ?? ''} onChange={(event) => updateGuest(index, { tableId: event.target.value })}><option value="">Sin mesa</option>{tables.map((table, tableIndex) => <option key={table.id ?? tableIndex} value={table.id ?? ''}>{table.name}</option>)}</Select><Input aria-label="Menú" value={guest.meal ?? ''} onChange={(event) => updateGuest(index, { meal: event.target.value })} placeholder="Pollo, hamburguesa..." /><Select aria-label="Tipo de invitado" value={guest.guestType ?? 'adult'} onChange={(event) => updateGuest(index, { guestType: event.target.value })}><option value="adult">Adulto</option><option value="child">Niño/a</option><option value="vendor">Proveedor</option></Select><Select aria-label="Restricción alimentaria" value={guest.dietaryPreference ?? 'none'} onChange={(event) => updateGuest(index, { dietaryPreference: event.target.value })}><option value="none">Sin restricción</option><option value="vegetarian">Vegetariano/a</option><option value="vegan">Vegano/a</option><option value="celiac">Celíaco/a</option><option value="lactose_free">Sin lactosa</option></Select><IconButton label="Quitar invitado" disabled={saving} onClick={() => updateList({ guests: guests.filter((_, itemIndex) => itemIndex !== index) })} /><Textarea aria-label="Notas del invitado" className="lg:col-span-6" value={guest.notes ?? ''} onChange={(event) => updateGuest(index, { notes: event.target.value })} placeholder="Alergias, silla para niño, observaciones de ubicación..." /></div>)}</div> : <EmptyRows text="Todavía no hay invitados cargados." />}
      <Field label="Notas generales de la lista"><Textarea value={guestList.notes ?? ''} onChange={(event) => updateList({ notes: event.target.value })} placeholder="Confirmaciones pendientes, cambios de última hora, contactos..." /></Field>
      <SaveBar saving={saving} onSave={save} text="Guardar lista de invitados" />
    </SectionCard>
    <div className="grid gap-5 lg:grid-cols-3"><SectionCard title="Resumen operativo"><div className="grid grid-cols-2 gap-3"><SummaryMetric label="Invitados" value={cleanGuests.length} helper={`${adultGuests} adultos · ${childGuests} niños`} /><SummaryMetric label="Mesas" value={cleanTables.length} helper="distribución cargada" /><SummaryMetric label="Restricciones" value={dietary('vegetarian') + dietary('vegan') + dietary('celiac') + dietary('lactose_free')} helper="para cocina" /><SummaryMetric label="Menús" value={Object.keys(mealSummary).length} helper="opciones detectadas" /></div><Button type="button" className="mt-4 w-full" disabled={saving || !cleanGuests.length} onClick={syncSummary}>Sincronizar cantidades con el evento</Button></SectionCard><SectionCard title="Menú por cantidad"><div className="space-y-2">{Object.entries(mealSummary).length ? Object.entries(mealSummary).map(([meal, quantity]) => <div key={meal} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"><span>{meal}</span><strong>{quantity}</strong></div>) : <p className="text-sm text-zinc-500">Se completa al definir el menú de cada invitado.</p>}</div></SectionCard><SectionCard title="Sugerencias de salón y vajilla"><p className="text-sm text-zinc-500">Tomá estos valores como base y ajustalos en Stock y vajilla según el servicio contratado.</p><div className="mt-3 space-y-2">{resourceSuggestions.length ? resourceSuggestions.map(([name, quantity]) => <div key={String(name)} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span>{name}</span><strong>{quantity}</strong></div>) : <p className="text-sm text-zinc-500">Las sugerencias se calculan cuando hay invitados y mesas.</p>}</div></SectionCard></div>
  </div>;
}
*/

export function EventResourcesEditor({ plan, saving, onSave, section = 'all' }: { plan?: EventResourcePlan; saving: boolean; onSave: SavePlan; section?: 'products' | 'inventory' | 'all' }) {
  const basePlan = useMemo(() => normalizeResourcePlan(plan), [plan]);
  const [products, setProducts] = useState<EventProductItem[]>(basePlan.productItems ?? []);
  const [inventory, setInventory] = useState<EventInventoryItem[]>(basePlan.inventoryItems ?? []);
  const [productCategory, setProductCategory] = useState<'all' | 'savory' | 'sweet' | 'beverages' | 'other'>('all');
  const updateProduct = (index: number, changes: Partial<EventProductItem>) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const updateInventory = (index: number, changes: Partial<EventInventoryItem>) => setInventory((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const cleanProducts = products.filter((item) => item.name.trim()).map((item) => ({ ...item, totalCost: Number(item.totalCost ?? Number(item.quantity ?? 0) * Number(item.unitCost ?? 0)) || undefined }));
  const cleanInventory = inventory.filter((item) => item.name.trim());
  const visibleProducts = products.map((item, index) => ({ item, index })).filter(({ item }) => productCategory === 'all' || (item.productionCategory ?? 'other') === productCategory);
  return <div className="space-y-5">
    {section !== 'inventory' && <SectionCard title="Stock de productos" icon={<PackageCheck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setProducts((current) => [...current, { id: makeId(), name: '', category: '', productionCategory: productCategory === 'all' ? 'savory' : productCategory, quantity: undefined, unit: 'unidad', status: 'planned', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar insumo</Button>}>
      <div className="flex flex-wrap gap-2">{([['all', 'Todos'], ['savory', 'Salados'], ['sweet', 'Dulces'], ['beverages', 'Bebidas'], ['other', 'Otros']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setProductCategory(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${productCategory === value ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{label} ({value === 'all' ? products.length : products.filter((item) => (item.productionCategory ?? 'other') === value).length})</button>)}</div>
      {visibleProducts.length ? <div className="mt-4 space-y-3">{visibleProducts.map(({ item, index }) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(160px,1fr)_115px_110px_80px_90px_110px_105px_105px_120px_44px]">
        <Input aria-label="Producto" placeholder="Gaseosa, hielo, descartables..." value={item.name} onChange={(event) => updateProduct(index, { name: event.target.value })} />
        <Input aria-label="Categoría" placeholder="Categoría" value={item.category ?? ''} onChange={(event) => updateProduct(index, { category: event.target.value })} />
        <Select aria-label="Rubro de producción" value={item.productionCategory ?? 'other'} onChange={(event) => updateProduct(index, { productionCategory: event.target.value })}>{Object.entries(productionCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <NumberField label="Cantidad a comprar" min={0} value={item.quantity ?? ''} onChange={(event) => updateProduct(index, { quantity: numeric(event.target.value) })} />
        <Input aria-label="Unidad" placeholder="Unidad" value={item.unit ?? ''} onChange={(event) => updateProduct(index, { unit: event.target.value })} />
        <Input aria-label="Proveedor" placeholder="Proveedor" value={item.supplierName ?? ''} onChange={(event) => updateProduct(index, { supplierName: event.target.value })} />
        <NumberField label="Costo por unidad" min={0} value={item.unitCost ?? ''} onChange={(event) => updateProduct(index, { unitCost: numeric(event.target.value) })} />
        <NumberField label="Costo total" min={0} value={item.totalCost ?? ''} onChange={(event) => updateProduct(index, { totalCost: numeric(event.target.value) })} />
        <Select aria-label="Estado" value={item.status ?? 'planned'} onChange={(event) => updateProduct(index, { status: event.target.value })}>{Object.entries(resourceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar insumo" disabled={saving} onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-10" placeholder="Marca, compra pendiente, reposición..." value={item.notes ?? ''} onChange={(event) => updateProduct(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text={`No hay productos cargados en ${productCategory === 'all' ? 'stock' : productionCategoryLabels[productCategory].toLowerCase()}.`} />}
    </SectionCard>}
    {section !== 'products' && <SectionCard title="Mantelería, vajilla, mobiliario y equipos" icon={<PackageCheck className="h-4 w-4" />} action={<Button variant="secondary" onClick={() => setInventory((current) => [...current, { id: makeId(), name: '', category: 'Vajilla', quantityRequired: undefined, quantityReserved: undefined, quantityReturned: undefined, unit: 'unidad', status: 'planned', notes: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar recurso</Button>}>
      {inventory.length ? <div className="space-y-3">{inventory.map((item, index) => <div key={item.id ?? index} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(180px,1fr)_130px_100px_100px_100px_100px_130px_44px]">
        <Input aria-label="Recurso" placeholder="Copas, manteles, mesas..." value={item.name} onChange={(event) => updateInventory(index, { name: event.target.value })} />
        <Input aria-label="Categoría" placeholder="Vajilla" value={item.category ?? ''} onChange={(event) => updateInventory(index, { category: event.target.value })} />
        <NumberField label="Cantidad necesaria" min={0} value={item.quantityRequired ?? ''} onChange={(event) => updateInventory(index, { quantityRequired: numeric(event.target.value) })} />
        <NumberField label="Cantidad reservada" min={0} value={item.quantityReserved ?? ''} onChange={(event) => updateInventory(index, { quantityReserved: numeric(event.target.value) })} />
        <NumberField label="Cantidad devuelta" min={0} value={item.quantityReturned ?? ''} onChange={(event) => updateInventory(index, { quantityReturned: numeric(event.target.value) })} />
        <Input aria-label="Unidad" placeholder="Unidad" value={item.unit ?? ''} onChange={(event) => updateInventory(index, { unit: event.target.value })} />
        <Select aria-label="Estado" value={item.status ?? 'planned'} onChange={(event) => updateInventory(index, { status: event.target.value })}>{Object.entries(resourceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <IconButton label="Quitar recurso" disabled={saving} onClick={() => setInventory((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        <Textarea aria-label="Notas" className="lg:col-span-8" placeholder="Color, estado, faltantes, roturas..." value={item.notes ?? ''} onChange={(event) => updateInventory(index, { notes: event.target.value })} />
      </div>)}</div> : <EmptyRows text="No hay recursos operativos cargados." />}
    </SectionCard>}
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, productItems: cleanProducts, inventoryItems: cleanInventory })} />
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
      <NumberField label="Monto acordado" min={0} value={item.agreedAmount ?? ''} onChange={(event) => update(index, { agreedAmount: numeric(event.target.value) })} />
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
  const fillEmptyGuides = () => setLogistics((current) => Object.fromEntries(Object.entries(logisticsTemplates).map(([key, value]) => [key, current[key as keyof typeof emptyLogistics]?.trim() ? current[key as keyof typeof emptyLogistics] : value])) as typeof emptyLogistics);
  const guideButton = (key: keyof typeof emptyLogistics) => <button type="button" onClick={() => set(key, logisticsTemplates[key])} className="text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900">Usar guía</button>;
  return <SectionCard title="Logística y coordinación interna" icon={<ClipboardCheck className="h-4 w-4" />} action={<Button type="button" variant="secondary" onClick={fillEmptyGuides}>Completar guías vacías</Button>}>
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Usá estas instrucciones base como en el cronograma de ejemplo: completá cantidades, responsables y condiciones propias del evento. Podés editar cualquier texto.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Armado del salón" action={guideButton('eventSetupNotes')}><Textarea value={logistics.eventSetupNotes ?? ''} onChange={(event) => set('eventSetupNotes', event.target.value)} placeholder="Layout, mesas, pista, ceremonia, sectores..." /></Field>
      <Field label="Cocina" action={guideButton('kitchenNotes')}><Textarea value={logistics.kitchenNotes ?? ''} onChange={(event) => set('kitchenNotes', event.target.value)} placeholder="Producción, tiempos, restricciones, emplatado..." /></Field>
      <Field label="Barra y bebidas" action={guideButton('barNotes')}><Textarea value={logistics.barNotes ?? ''} onChange={(event) => set('barNotes', event.target.value)} placeholder="Bebidas, hielo, barra, alcohol, horarios..." /></Field>
      <Field label="Ambientación, mantelería y vajilla" action={guideButton('decorationNotes')}><Textarea value={logistics.decorationNotes ?? ''} onChange={(event) => set('decorationNotes', event.target.value)} placeholder="Decoración, mantelería, centros, colores..." /></Field>
      <Field label="Ingreso y accesos" action={guideButton('accessNotes')}><Textarea value={logistics.accessNotes ?? ''} onChange={(event) => set('accessNotes', event.target.value)} placeholder="Acceso proveedores, invitados, estacionamiento..." /></Field>
      <Field label="Cierre y puntos críticos" action={guideButton('riskNotes')}><Textarea value={logistics.riskNotes ?? ''} onChange={(event) => set('riskNotes', event.target.value)} placeholder="Alertas internas, dependencias, temas sensibles..." /></Field>
    </div>
    <SaveBar saving={saving} onSave={() => onSave({ ...basePlan, logistics })} />
  </SectionCard>;
}
