'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, GripVertical, ListChecks, Lock, Plus, Save, TableProperties, UserPlus, Users } from 'lucide-react';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { GuestSeatingBoard } from '@/features/events/guest-seating-board';
import { formatCivilDate } from '@/lib/dates';
import type { EventGuest, EventGuestList, EventGuestTable } from '@/features/quotes/types';

type PublicEvent = { eventName?: string; eventType?: string; eventDate?: string; guestCount?: number };
type PublicGuestListAccess = { editable: boolean; deadline?: string; deadlineDate?: string };
type PublicTab = 'tables' | 'guests' | 'review';
type GuestDraft = EventGuest & { id: string };
type TableDraft = { id?: string; name: string; capacity: string; audience: string; notes: string };
type LocalGuestListDraft = { version: 1; guestList: EventGuestList; event: PublicEvent; access: PublicGuestListAccess; updatedAt: string };
const emptyList: EventGuestList = { tables: [], guests: [], notes: '' };
const localDraftPrefix = 'mym:public-guest-list-draft:';

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultTableCapacity = 10;

function defaultGuestTables(guestCount?: number): EventGuestTable[] {
  const count = guestCount && guestCount > 0 ? Math.ceil(guestCount / defaultTableCapacity) : defaultTableCapacity;
  return Array.from({ length: count }, (_, index) => ({ id: makeId(), name: `Mesa ${index + 1}`, capacity: defaultTableCapacity, audience: 'open', notes: '' }));
}

function normalizeGuestList(list: EventGuestList | undefined, guestCount?: number): EventGuestList {
  const tables = (list?.tables ?? []).map((table) => ({ ...table, id: table.id || makeId() }));
  return { ...emptyList, ...list, tables: tables.length ? tables : defaultGuestTables(guestCount), guests: (list?.guests ?? []).map((guest) => ({ ...guest, id: guest.id || makeId() })) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function localDraftKey(token: string) {
  return `${localDraftPrefix}${token}`;
}

function readLocalDraft(token: string): LocalGuestListDraft | undefined {
  if (typeof window === 'undefined' || !token) return undefined;
  try {
    const raw = window.localStorage.getItem(localDraftKey(token));
    if (!raw) return undefined;
    const draft: unknown = JSON.parse(raw);
    if (!isRecord(draft) || draft.version !== 1 || !isRecord(draft.guestList) || !Array.isArray(draft.guestList.tables) || !Array.isArray(draft.guestList.guests) || !isRecord(draft.event) || !isRecord(draft.access) || typeof draft.access.editable !== 'boolean') return undefined;
    return { version: 1, guestList: draft.guestList as EventGuestList, event: draft.event as PublicEvent, access: draft.access as PublicGuestListAccess, updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : '' };
  } catch {
    return undefined;
  }
}

function writeLocalDraft(token: string, guestList: EventGuestList, event: PublicEvent, access: PublicGuestListAccess): boolean {
  if (typeof window === 'undefined' || !token) return false;
  try {
    const draft: LocalGuestListDraft = { version: 1, guestList, event, access, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(localDraftKey(token), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function clearLocalDraft(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    window.localStorage.removeItem(localDraftKey(token));
  } catch {
    // A successful server save remains authoritative even if the browser blocks storage cleanup.
  }
}

function date(value?: string) {
  return formatCivilDate(value, 'Fecha a confirmar');
}

function restriction(value?: string) {
  return ({ vegetarian: 'Vegetariano/a', vegan: 'Vegano/a', celiac: 'Celíaco/a', lactose_free: 'Sin lactosa' } as Record<string, string>)[value ?? ''] ?? '';
}

function countdownParts(deadline?: string, now = Date.now()) {
  const milliseconds = deadline ? Math.max(0, new Date(deadline).getTime() - now) : 0;
  const totalSeconds = Math.floor(milliseconds / 1000);
  return { days: Math.floor(totalSeconds / 86_400), hours: Math.floor(totalSeconds % 86_400 / 3_600), minutes: Math.floor(totalSeconds % 3_600 / 60), seconds: totalSeconds % 60 };
}

function deadlineLabel(deadline?: string) {
  if (!deadline) return 'Fecha límite a confirmar';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(deadline));
}

function isGuestListReadOnly(access?: PublicGuestListAccess, currentTime = Date.now()) {
  return !access?.editable || Boolean(access.deadline && currentTime >= new Date(access.deadline).getTime());
}

function Metric({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return <div className="flex min-w-28 items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-3 py-2.5"><span className="text-amber-300">{icon}</span><div><p className="text-lg font-semibold leading-5 text-white">{value}</p><p className="text-xs text-zinc-300">{label}</p></div></div>;
}

export default function GuestListView({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [event, setEvent] = useState<PublicEvent>();
  const [access, setAccess] = useState<PublicGuestListAccess>();
  const [now, setNow] = useState(() => Date.now());
  const [guestList, setGuestList] = useState<EventGuestList>(emptyList);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [tab, setTab] = useState<PublicTab>('tables');
  const [guestEditorOpen, setGuestEditorOpen] = useState(false);
  const [guestDraft, setGuestDraft] = useState<GuestDraft>();
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [tableDraft, setTableDraft] = useState<TableDraft>({ name: '', capacity: '', audience: 'open', notes: '' });
  const [tableError, setTableError] = useState('');
  const [tableToDelete, setTableToDelete] = useState<string>();
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickTableId, setQuickTableId] = useState('');
  const draftRevision = useRef(0);
  const savedWhileLoading = useRef(false);
  const tables = guestList.tables ?? [];
  const guests = guestList.guests ?? [];
  const validGuests = guests.filter((item) => item.fullName.trim());
  const assignedGuests = validGuests.filter((guest) => guest.tableId && tables.some((table) => table.id === guest.tableId));
  const unassignedGuests = validGuests.filter((guest) => !guest.tableId || !tables.some((table) => table.id === guest.tableId));
  const remaining = countdownParts(access?.deadline, now);
  const readOnly = isGuestListReadOnly(access, now);

  useEffect(() => {
    let cancelled = false;
    void params.then(async ({ token: accessToken }) => {
      if (cancelled) return;
      setToken(accessToken); savedWhileLoading.current = false;
      const initialDraft = readLocalDraft(accessToken);
      draftRevision.current = initialDraft ? 1 : 0;
      if (initialDraft) {
        setEvent(initialDraft.event); setAccess(initialDraft.access); setGuestList(normalizeGuestList(initialDraft.guestList, initialDraft.event.guestCount));
        setDirty(true); setHasLocalDraft(true); setLoading(false);
      } else setHasLocalDraft(false);
      try {
        const response = await api.get<{ event: PublicEvent; guestList: EventGuestList; access: PublicGuestListAccess }>(`/public/guest-list/${accessToken}`);
        if (cancelled) return;
        setEvent(response.event); setAccess(response.access);
        if (!savedWhileLoading.current && isGuestListReadOnly(response.access)) {
          setGuestList(normalizeGuestList(response.guestList, response.event.guestCount)); setDirty(false); setHasLocalDraft(false);
        } else if (!savedWhileLoading.current) {
          const latestDraft = readLocalDraft(accessToken);
          if (latestDraft) {
            const restoredList = normalizeGuestList(latestDraft.guestList, response.event.guestCount);
            setGuestList(restoredList); setDirty(true); setHasLocalDraft(true);
            writeLocalDraft(accessToken, restoredList, response.event, response.access);
          } else {
            setGuestList(normalizeGuestList(response.guestList, response.event.guestCount)); setDirty(false); setHasLocalDraft(false);
          }
        }
      } catch (error) {
        if (cancelled) return;
        if (initialDraft || readLocalDraft(accessToken)) setNotice('No pudimos conectarnos al servidor. Estás viendo el borrador guardado en este dispositivo; podés seguir trabajando e intentar guardarlo más tarde.');
        else setNotice(error instanceof Error ? error.message : 'No se pudo abrir el formulario.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    if (!access?.deadline || !access.editable) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [access?.deadline, access?.editable]);

  const updateList = (changes: Partial<EventGuestList>) => {
    if (readOnly) return;
    const next = { ...guestList, ...changes };
    setGuestList(next); setDirty(true); draftRevision.current += 1;
    const stored = event && access ? writeLocalDraft(token, next, event, access) : false;
    setHasLocalDraft(stored);
    if (!stored) setNotice('No pudimos guardar una copia local en este dispositivo. Intentá guardar los cambios en el servidor antes de cerrar esta página.');
  };
  const assignGuest = (guestId: string, tableId: string) => { if (readOnly) return; updateList({ guests: guests.map((guest) => guest.id === guestId ? { ...guest, tableId } : guest) }); };
  const openGuestEditor = (guestId?: string, tableId = '') => {
    if (readOnly) return;
    const current = guests.find((guest) => guest.id === guestId);
    setGuestDraft(current ? { ...current, id: current.id ?? makeId(), ageGroup: current.ageGroup ?? 'adult' } : { id: makeId(), fullName: '', tableId, meal: '', ageGroup: 'adult', dietaryPreference: 'none', notes: '', confirmed: true });
    setGuestEditorOpen(true);
  };
  const saveGuest = () => {
    if (readOnly) return;
    if (!guestDraft?.fullName.trim()) return;
    const next = { ...guestDraft, fullName: guestDraft.fullName.trim(), meal: guestDraft.meal?.trim(), notes: guestDraft.notes?.trim() };
    updateList({ guests: guests.some((guest) => guest.id === next.id) ? guests.map((guest) => guest.id === next.id ? next : guest) : [...guests, next] });
    setGuestEditorOpen(false);
  };
  const removeGuest = (guestId: string) => { if (readOnly) return; updateList({ guests: guests.filter((guest) => guest.id !== guestId) }); setGuestEditorOpen(false); };
  const openTableEditor = (tableId?: string) => {
    if (readOnly) return;
    const current = tables.find((table) => table.id === tableId);
    setTableError(''); setTableDraft(current ? { id: current.id, name: current.name, capacity: current.capacity?.toString() ?? '', audience: current.audience ?? 'open', notes: current.notes ?? '' } : { name: `Mesa ${tables.length + 1}`, capacity: '', audience: 'open', notes: '' }); setTableEditorOpen(true);
  };
  const saveTable = () => {
    if (readOnly) return;
    const name = tableDraft.name.trim(); const capacity = tableDraft.capacity ? Number(tableDraft.capacity) : undefined;
    if (!name) { setTableError('Indicá un nombre para la mesa.'); return; }
    if (tableDraft.capacity && (!Number.isInteger(capacity) || Number(capacity) <= 0)) { setTableError('La capacidad debe ser mayor a cero.'); return; }
    const next: EventGuestTable = { id: tableDraft.id || makeId(), name, capacity, audience: tableDraft.audience || 'open', notes: tableDraft.notes.trim() };
    updateList({ tables: tableDraft.id ? tables.map((table) => table.id === tableDraft.id ? next : table) : [...tables, next] }); setTableEditorOpen(false);
  };
  const deleteTable = () => { if (!tableToDelete || readOnly) return; updateList({ tables: tables.filter((table) => table.id !== tableToDelete), guests: guests.map((guest) => guest.tableId === tableToDelete ? { ...guest, tableId: '' } : guest) }); setTableToDelete(undefined); };
  const quickLines = quickText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const importQuick = () => { if (!quickLines.length || readOnly) return; const imported = quickLines.map((line) => { const [fullName, meal] = line.split(',', 2).map((part) => part.trim()); return { id: makeId(), fullName, tableId: quickTableId, meal: meal ?? '', ageGroup: 'adult', dietaryPreference: 'none', notes: '', confirmed: true } satisfies EventGuest; }); updateList({ guests: [...guests, ...imported] }); setQuickText(''); setQuickTableId(''); setQuickOpen(false); };
  const save = async () => {
    if (readOnly) return;
    const revisionAtSave = draftRevision.current;
    setSaving(true); setNotice('');
    try {
      const cleanTables = tables.filter((table) => table.name.trim()).map((table) => ({ ...table, name: table.name.trim(), notes: table.notes?.trim() })); const ids = new Set(cleanTables.map((table) => table.id));
      const cleanGuests = guests.filter((guest) => guest.fullName.trim()).map((guest) => ({ ...guest, fullName: guest.fullName.trim(), meal: guest.meal?.trim(), notes: guest.notes?.trim(), tableId: ids.has(guest.tableId) ? guest.tableId : '' }));
      const response = await api.patch<{ guestList: EventGuestList }>(`/public/guest-list/${token}`, { guestList: { tables: cleanTables, guests: cleanGuests, notes: guestList.notes?.trim() } });
      savedWhileLoading.current = true;
      if (draftRevision.current === revisionAtSave) {
        setGuestList(normalizeGuestList(response.guestList)); setDirty(false); clearLocalDraft(token); setHasLocalDraft(false);
        setNotice('¡Listo! La lista fue guardada y el equipo de M&M Eventos ya puede verla.');
      } else setNotice('Se guardó una versión anterior. Tus cambios más recientes siguen guardados en este dispositivo: presioná Guardar cambios para confirmarlos también.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar la lista. Tus cambios siguen disponibles para intentar nuevamente.'); }
    finally { setSaving(false); }
  };
  const unassignDrop = (dragEvent: DragEvent<HTMLDivElement>) => { if (readOnly) return; dragEvent.preventDefault(); const guestId = dragEvent.dataTransfer.getData('text/mym-event-guest-id'); if (guestId) assignGuest(guestId, ''); };
  const deleteTableGuests = guests.filter((guest) => guest.tableId === tableToDelete && guest.fullName.trim());

  if (loading) return <main className="grid min-h-screen place-items-center bg-zinc-50 p-6 text-sm text-zinc-500">Cargando formulario…</main>;
  if (!event) return <main className="grid min-h-screen place-items-center bg-zinc-50 p-6"><div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><h1 className="text-lg font-semibold text-zinc-950">No pudimos abrir esta lista</h1><p className="mt-2 text-sm text-zinc-600">{notice || 'El enlace no es válido o fue reemplazado.'}</p></div></main>;
  if (readOnly) return <main className="min-h-screen bg-[#f8f7f4] py-5 sm:py-10"><div className="mx-auto max-w-[1100px] space-y-5 px-3 sm:px-6"><header className="rounded-3xl bg-zinc-950 p-5 text-white shadow-xl sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-rose-300/40 bg-rose-300/10 text-rose-200"><Lock className="h-5 w-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-300">M&M Eventos</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Lista de invitados</h1><p className="mt-2 text-sm text-zinc-300">{event.eventName || event.eventType || 'Tu evento'} · {date(event.eventDate)}</p></div></div><p className="inline-flex items-center gap-2 text-sm text-zinc-300"><Lock className="h-4 w-4" />Sólo lectura</p></div><section className="mt-6 rounded-2xl border border-rose-300 bg-rose-950/40 p-4 sm:p-5"><div className="flex gap-3"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" /><div><h2 className="font-semibold">La lista está cerrada para edición</h2><p className="mt-1 text-sm text-zinc-200">La fecha límite fue {deadlineLabel(access?.deadline)}. El equipo de M&M Eventos puede continuar gestionándola internamente.</p></div></div></section><div className="mt-6 flex gap-3 overflow-x-auto"><Metric value={validGuests.length} label="invitados" icon={<Users className="h-4 w-4" />} /><Metric value={assignedGuests.length} label="con mesa" icon={<CheckCircle2 className="h-4 w-4" />} /><Metric value={unassignedGuests.length} label="sin mesa" icon={<UserPlus className="h-4 w-4" />} /><Metric value={tables.length} label="mesas" icon={<TableProperties className="h-4 w-4" />} /></div></header><section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Mesas e invitados</h2><p className="mt-1 text-sm text-zinc-500">Esta es la última versión entregada al equipo.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{tables.map((table) => { const seated = validGuests.filter((guest) => guest.tableId === table.id); return <article key={table.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-zinc-950">{table.name}</h3><span className="text-sm text-zinc-500">{seated.length}{table.capacity ? ` / ${table.capacity}` : ''}</span></div><p className="mt-2 text-sm text-zinc-500">{seated.length ? seated.map((guest) => guest.fullName).join(' · ') : 'Sin invitados asignados.'}</p></article>; })}{!tables.length ? <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 sm:col-span-2">No hay mesas cargadas.</p> : null}</div></section><section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Notas para M&M Eventos</h2><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">{guestList.notes?.trim() || 'No se dejaron notas adicionales.'}</p></section></div></main>;

  const tabs = [['tables', '1. Mesas', TableProperties], ['guests', '2. Invitados', Users], ['review', '3. Revisar y guardar', ListChecks]] as const;
  return <main className="min-h-screen bg-[#f8f7f4] py-5 sm:py-10"><div className="mx-auto max-w-[1440px] px-3 sm:px-6"><header className="overflow-hidden rounded-3xl bg-zinc-950 p-5 text-white shadow-xl sm:p-7"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="flex gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/50 bg-amber-300/10 font-serif text-xl text-amber-300">M</span><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-300">M&M Eventos</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Armemos tu lista de invitados</h1><p className="mt-2 text-sm text-zinc-300">{event.eventName || event.eventType || 'Tu evento'} · {date(event.eventDate)}</p></div></div><div className="flex flex-col gap-3 xl:items-end"><p className={`inline-flex items-center gap-2 text-sm ${saving || hasLocalDraft || dirty ? 'text-amber-200' : 'text-emerald-300'}`}>{saving ? <Save className="h-4 w-4" /> : hasLocalDraft ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? 'Guardando cambios...' : hasLocalDraft ? 'Borrador local pendiente de confirmación' : dirty ? 'Tenés cambios pendientes' : 'Cambios guardados'}</p><Button disabled={saving || !dirty} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Guardar cambios</Button></div></div><section className="mt-6 rounded-2xl border border-amber-300/50 bg-amber-300/10 p-4 sm:p-5" role="status"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300"><Clock3 className="h-5 w-5" /></span><div><h2 className="font-semibold text-white">Tiempo para finalizar tu lista</h2><p className="mt-1 text-sm text-zinc-300">Tenés hasta el {deadlineLabel(access?.deadline)} para enviar la lista final.</p></div></div><div className="grid grid-cols-4 gap-2 text-center" aria-label="Tiempo restante"><span><strong className="block text-2xl tabular-nums text-amber-300 sm:text-3xl">{remaining.days}</strong><small className="text-xs text-zinc-300">días</small></span><span><strong className="block text-2xl tabular-nums text-amber-300 sm:text-3xl">{String(remaining.hours).padStart(2, '0')}</strong><small className="text-xs text-zinc-300">horas</small></span><span><strong className="block text-2xl tabular-nums text-amber-300 sm:text-3xl">{String(remaining.minutes).padStart(2, '0')}</strong><small className="text-xs text-zinc-300">min.</small></span><span><strong className="block text-2xl tabular-nums text-amber-300 sm:text-3xl">{String(remaining.seconds).padStart(2, '0')}</strong><small className="text-xs text-zinc-300">seg.</small></span></div></div></section><div className="mt-6 flex gap-3 overflow-x-auto"><Metric value={validGuests.length} label="invitados" icon={<Users className="h-4 w-4" />} /><Metric value={assignedGuests.length} label="con mesa" icon={<CheckCircle2 className="h-4 w-4" />} /><Metric value={unassignedGuests.length} label="sin mesa" icon={<UserPlus className="h-4 w-4" />} /><Metric value={tables.length} label="mesas" icon={<TableProperties className="h-4 w-4" />} /></div></header>{hasLocalDraft ? <section className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5" role="status" aria-live="polite"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Save className="h-5 w-5" /></span><div><h2 className="font-semibold text-amber-950">Borrador guardado en este dispositivo</h2><p className="mt-1 max-w-3xl text-sm text-amber-900">Tu lista y la distribución de mesas se conservan aunque actualices la página o se corte Internet. Todavía no fueron confirmadas con M&M Eventos: presioná <strong>Guardar cambios</strong> para enviarlas al servidor.</p></div></div><Button disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div></section> : null}<nav className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm"><div className="flex min-w-max gap-1">{tabs.map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${tab === value ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></nav>
    {tab === 'tables' ? <div className="mt-5 space-y-5"><section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm"><h2 className="font-semibold text-amber-950">Cómo completar la organización</h2><div className="mt-3 grid gap-3 md:grid-cols-3"><p className="rounded-xl bg-white/80 p-3 text-sm text-amber-950"><strong>1. Creá las mesas</strong><br /><span className="text-amber-800">Indicá un nombre y, si la conocés, la capacidad.</span></p><p className="rounded-xl bg-white/80 p-3 text-sm text-amber-950"><strong>2. Cargá invitados</strong><br /><span className="text-amber-800">Podés agregarlos uno a uno o en carga rápida.</span></p><p className="rounded-xl bg-white/80 p-3 text-sm text-amber-950"><strong>3. Ubicalos</strong><br /><span className="text-amber-800">Arrastralos hacia una mesa o elegí la mesa al editarlos.</span></p></div></section><section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><aside onDragOver={(event) => event.preventDefault()} onDrop={unassignDrop} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold text-zinc-950">Invitados sin mesa</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{unassignedGuests.length}</span></div><p className="mt-2 text-sm text-zinc-500">Arrastralos a una mesa cuando estés listo/a. Hacé clic para editar sus datos.</p><div className="mt-4 space-y-2">{unassignedGuests.length ? unassignedGuests.map((guest) => <button key={guest.id} draggable onDragStart={(dragEvent) => { if (guest.id) { dragEvent.dataTransfer.effectAllowed = 'move'; dragEvent.dataTransfer.setData('text/mym-event-guest-id', guest.id); } }} onClick={() => openGuestEditor(guest.id)} className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2.5 text-left shadow-sm hover:border-amber-300"><GripVertical className="h-4 w-4 text-zinc-300" /><span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">{guest.fullName.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm text-zinc-950">{guest.fullName}</strong><span className="block truncate text-xs text-zinc-500">{[guest.meal || 'Sin menú', restriction(guest.dietaryPreference)].filter(Boolean).join(' · ')}</span></span></button>) : <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">Todos los invitados tienen mesa.</p>}</div><div className="mt-4 grid gap-2"><Button type="button" variant="secondary" onClick={() => setQuickOpen(true)}><Plus className="mr-2 h-4 w-4" />Carga rápida</Button><Button type="button" onClick={() => openGuestEditor()}><UserPlus className="mr-2 h-4 w-4" />Agregar invitado</Button></div></aside><section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Plano de tus mesas</h2><p className="mt-1 text-sm text-zinc-500">Vas a poder modificarlo todas las veces que necesites antes del evento.</p></div><Button type="button" variant="secondary" onClick={() => openTableEditor()}><Plus className="mr-2 h-4 w-4" />Nueva mesa</Button></div><div className="mt-5"><GuestSeatingBoard tables={tables} guests={guests} showUnassigned={false} onAssign={assignGuest} onEditTable={openTableEditor} onViewTable={() => setTab('guests')} onAddGuestToTable={(tableId) => openGuestEditor(undefined, tableId)} /></div></section></section></div> : null}
    {tab === 'guests' ? <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Tus invitados</h2><p className="mt-1 text-sm text-zinc-500">Hacé clic sobre una tarjeta para completar menú, restricciones, mesa y observaciones.</p></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setQuickOpen(true)}>Carga rápida</Button><Button type="button" onClick={() => openGuestEditor()}><UserPlus className="mr-2 h-4 w-4" />Agregar invitado</Button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{validGuests.map((guest) => <button key={guest.id} type="button" onClick={() => openGuestEditor(guest.id)} className="rounded-xl border border-zinc-200 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50/40"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-zinc-950">{guest.fullName}</p><p className="mt-1 text-sm text-zinc-500">{tables.find((table) => table.id === guest.tableId)?.name || 'Sin mesa asignada'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${guest.confirmed === false ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{guest.confirmed === false ? 'Pendiente' : 'Confirmado'}</span></div><p className="mt-3 text-sm text-zinc-600">{guest.meal || 'Menú a definir'}{restriction(guest.dietaryPreference) ? ` · ${restriction(guest.dietaryPreference)}` : ''}</p></button>)}{!validGuests.length ? <div className="col-span-full rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">Empezá agregando a tus invitados. Podés continuar más tarde desde este mismo enlace.</div> : null}</div></section> : null}
    {tab === 'review' ? <section className="mt-5 space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"><p className="text-2xl font-semibold text-zinc-950">{validGuests.length}</p><p className="mt-1 text-sm text-zinc-500">invitados cargados</p></div><div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100"><p className="text-2xl font-semibold text-emerald-900">{assignedGuests.length}</p><p className="mt-1 text-sm text-emerald-700">con mesa asignada</p></div><div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100"><p className="text-2xl font-semibold text-amber-950">{unassignedGuests.length}</p><p className="mt-1 text-sm text-amber-800">todavía sin mesa</p></div><div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"><p className="text-2xl font-semibold text-zinc-950">{tables.length}</p><p className="mt-1 text-sm text-zinc-500">mesas creadas</p></div></div>{unassignedGuests.length ? <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" />Todavía hay {unassignedGuests.length} invitado{unassignedGuests.length === 1 ? '' : 's'} sin mesa. Podés guardarlos así o volver a la organización para asignarlos.</p> : <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" />La lista está organizada: todos los invitados cargados tienen mesa.</p>}<section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Notas para M&M Eventos</h2><p className="mt-1 text-sm text-zinc-500">Contanos cualquier detalle que debamos tener en cuenta al preparar el evento.</p><Textarea className="mt-4" value={guestList.notes ?? ''} onChange={(event) => updateList({ notes: event.target.value })} placeholder="Ej.: ubicar adultos mayores cerca de la entrada, confirmar menú infantil, restricciones importantes..." /><div className="mt-5 flex justify-end"><Button disabled={saving || !dirty} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar lista'}</Button></div></section></section> : null}
    {dirty ? <div className="sticky bottom-3 z-20 mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-white shadow-2xl"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p><strong>{hasLocalDraft ? 'Borrador local pendiente de confirmación.' : 'Cambios pendientes.'}</strong><span className="mt-1 block text-sm text-zinc-300">{hasLocalDraft ? 'Aunque actualices la página, estos datos siguen en este dispositivo. Guardalos para enviarlos a M&M Eventos.' : 'Guardalos cuando termines para que el equipo los vea.'}</span></p><Button disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div></div> : null}{notice ? <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.startsWith('¡Listo!') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{notice}</p> : null}
    <Modal open={guestEditorOpen} title={guestDraft && guests.some((guest) => guest.id === guestDraft.id) ? 'Editar invitado' : 'Agregar invitado'} description="Completá estos datos para que podamos organizar mesa, menú y necesidades especiales." onClose={() => setGuestEditorOpen(false)}>{guestDraft ? <div className="space-y-4 p-5 sm:p-6"><Input value={guestDraft.fullName} onChange={(event) => setGuestDraft({ ...guestDraft, fullName: event.target.value })} placeholder="Nombre y apellido" /><div className="grid gap-3 sm:grid-cols-2"><Select value={guestDraft.tableId ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, tableId: event.target.value })}><option value="">Sin mesa asignada</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</Select><Select value={guestDraft.ageGroup ?? 'adult'} onChange={(event) => setGuestDraft({ ...guestDraft, ageGroup: event.target.value })}><option value="adult">Adulto / 18 años o más</option><option value="child_1_4">1 a 4 años · no paga</option><option value="child_5_9">5 a 9 años · paga la mitad</option><option value="minor_10_17">10 a 17 años · menor</option></Select><Input value={guestDraft.meal ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, meal: event.target.value })} placeholder="Menú o plato (opcional)" /><Select value={guestDraft.dietaryPreference ?? 'none'} onChange={(event) => setGuestDraft({ ...guestDraft, dietaryPreference: event.target.value })}><option value="none">Sin restricción</option><option value="vegetarian">Vegetariano/a</option><option value="vegan">Vegano/a</option><option value="celiac">Celíaco/a</option><option value="lactose_free">Sin lactosa</option></Select></div><Textarea value={guestDraft.notes ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, notes: event.target.value })} placeholder="Alergias, ubicación o cualquier observación importante" /><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={guestDraft.confirmed !== false} onChange={(event) => setGuestDraft({ ...guestDraft, confirmed: event.target.checked })} />Confirmado</label>{!guestDraft.fullName.trim() ? <p className="text-sm text-red-600">El nombre es obligatorio.</p> : null}<div className="flex justify-between gap-2 border-t border-zinc-100 pt-4">{guests.some((guest) => guest.id === guestDraft.id) ? <Button type="button" variant="danger" onClick={() => removeGuest(guestDraft.id)}>Eliminar</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setGuestEditorOpen(false)}>Cancelar</Button><Button type="button" disabled={!guestDraft.fullName.trim()} onClick={saveGuest}>Guardar invitado</Button></div></div></div> : null}</Modal>
    <Modal open={tableEditorOpen} title={tableDraft.id ? 'Editar mesa' : 'Nueva mesa'} description="Creá una mesa antes de ubicar invitados. La capacidad es opcional, pero ayuda a controlar la organización." onClose={() => setTableEditorOpen(false)}><div className="space-y-4 p-5 sm:p-6"><Input value={tableDraft.name} onChange={(event) => { setTableError(''); setTableDraft({ ...tableDraft, name: event.target.value }); }} placeholder="Ej.: Mesa familia Pérez" /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-zinc-700">Capacidad de la mesa (opcional)<Input className="mt-1" type="number" min={1} value={tableDraft.capacity} onChange={(event) => { setTableError(''); setTableDraft({ ...tableDraft, capacity: event.target.value }); }} placeholder="Ej.: 10" /></label><Select value={tableDraft.audience} onChange={(event) => setTableDraft({ ...tableDraft, audience: event.target.value })}><option value="open">Mesa libre / general</option><option value="children">Mesa de chicos</option><option value="family">Mesa familiar</option></Select></div><Textarea value={tableDraft.notes} onChange={(event) => setTableDraft({ ...tableDraft, notes: event.target.value })} placeholder="Referencia opcional: familia, amigos, niños..." />{tableError ? <p className="text-sm text-red-600">{tableError}</p> : null}<div className="flex justify-between gap-2 border-t border-zinc-100 pt-4">{tableDraft.id ? <Button type="button" variant="danger" onClick={() => { setTableEditorOpen(false); setTableToDelete(tableDraft.id); }}>Eliminar mesa</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setTableEditorOpen(false)}>Cancelar</Button><Button type="button" onClick={saveTable}>Guardar mesa</Button></div></div></div></Modal>
    <Modal open={quickOpen} title="Carga rápida de invitados" description="Pegá un invitado por línea. Si querés indicar un menú, escribilo después de una coma." onClose={() => setQuickOpen(false)}><div className="space-y-4 p-5 sm:p-6"><Textarea value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder={'Juan Pérez, Menú tradicional\nMaría López, Vegetariano\nCarlos Díaz'} /><Select value={quickTableId} onChange={(event) => setQuickTableId(event.target.value)}><option value="">Sin mesa inicial</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</Select><p className="rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-600">Se agregarán <strong>{quickLines.length}</strong> invitado{quickLines.length === 1 ? '' : 's'}.</p><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" onClick={() => setQuickOpen(false)}>Cancelar</Button><Button type="button" disabled={!quickLines.length} onClick={importQuick}>Agregar invitados</Button></div></div></Modal>
    <Modal open={Boolean(tableToDelete)} title="Eliminar mesa" description="Esta acción modifica la organización de tu lista." onClose={() => setTableToDelete(undefined)}><div className="space-y-4 p-5 sm:p-6"><p className="text-sm text-zinc-700">{deleteTableGuests.length ? <>Esta mesa tiene {deleteTableGuests.length} invitado{deleteTableGuests.length === 1 ? '' : 's'} asignado{deleteTableGuests.length === 1 ? '' : 's'}. Si la eliminás, quedarán sin mesa para que puedas ubicarlos otra vez.</> : 'La mesa no tiene invitados asignados y se eliminará de tu organización.'}</p><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" onClick={() => setTableToDelete(undefined)}>Cancelar</Button><Button type="button" variant="danger" onClick={deleteTable}>Eliminar mesa</Button></div></div></Modal>
  </div></main>;
}
