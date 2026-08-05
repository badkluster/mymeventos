'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileText, Mail, MessageCircle, Plus, RotateCcw, Save, Settings, TableProperties, UserPlus, Users } from 'lucide-react';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatCivilDate } from '@/lib/dates';
import type { Event, EventGuest, EventGuestList, EventGuestTable, EventResourcePlan } from '@/features/quotes/types';
import { GuestDirectory, UnassignedGuestsPanel } from '@/features/events/guest-list-directory';
import { GuestSeatingBoard } from '@/features/events/guest-seating-board';

type GuestListWorkspaceProps = {
  event: Event;
  plan?: EventResourcePlan;
  saving: boolean;
  onSave: (plan: EventResourcePlan) => void;
  onSyncSummary: (payload: Record<string, unknown>) => void;
  onNotice?: (message: string, variant?: 'success' | 'error') => void;
};

type GuestTab = 'guests' | 'seating' | 'summary';
type GuestDraft = EventGuest & { id: string };
type TableDraft = { id?: string; name: string; capacity: string; audience: string; notes: string };

const emptyGuestList: EventGuestList = { tables: [], guests: [], notes: '' };
const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');

function guestListPath(token: string): string {
  return `/invitados/${token}`;
}

function guestListUrl(token: string): string {
  return publicSiteUrl ? `${publicSiteUrl}${guestListPath(token)}` : guestListPath(token);
}

function shareableGuestListUrl(token: string): string {
  return typeof window === 'undefined' ? guestListUrl(token) : new URL(guestListPath(token), window.location.origin).toString();
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultTableCapacity = 10;

function defaultGuestTables(guestCount?: number): EventGuestTable[] {
  const count = guestCount && guestCount > 0 ? Math.ceil(guestCount / defaultTableCapacity) : defaultTableCapacity;
  return Array.from({ length: count }, (_, index) => ({ id: makeId(), name: `Mesa ${index + 1}`, capacity: defaultTableCapacity, audience: 'open', notes: '' }));
}

function withIds(list: EventGuestList | undefined, guestCount?: number): EventGuestList {
  const tables = (list?.tables ?? []).map((table) => ({ ...table, id: table.id || makeId() }));
  return {
    ...emptyGuestList,
    ...list,
    tables: tables.length ? tables : defaultGuestTables(guestCount),
    guests: (list?.guests ?? []).map((guest) => ({ ...guest, id: guest.id || makeId() }))
  };
}

function customerName(event: Event): string {
  const customer = typeof event.customerId === 'string' ? undefined : event.customerId;
  return customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Cliente sin definir';
}

function customerContact(event: Event): { phone: string; email: string } {
  const customer = typeof event.customerId === 'string' ? undefined : event.customerId;
  return { phone: customer?.phone ?? '', email: customer?.email ?? '' };
}

function guestListShareMessage(event: Event, shareUrl: string): string {
  const customer = typeof event.customerId === 'string' ? undefined : event.customerId;
  const displayName = customer?.fullName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
  const greeting = displayName ? `Hola ${displayName},` : 'Hola,';
  const eventLabel = event.eventType ? ` de tu evento (${event.eventType})` : ' de tu evento';
  return `${greeting} te compartimos el formulario para cargar la lista de invitados y organizar las mesas${eventLabel}. Podés completarlo cuando quieras desde este enlace:\n${shareUrl}`;
}

function dateLabel(value?: string): string {
  return formatCivilDate(value, 'Fecha a confirmar');
}

function dietLabel(value?: string): string {
  return ({ vegetarian: 'Vegetarianos', vegan: 'Veganos', celiac: 'Celíacos', lactose_free: 'Sin lactosa' } as Record<string, string>)[value ?? ''] ?? '';
}

function Metric({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return <div className="flex min-w-28 items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-3 py-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-300/10 text-amber-300">{icon}</span><div><p className="text-lg font-semibold leading-5 text-white">{value}</p><p className="text-xs text-zinc-300">{label}</p></div></div>;
}

function SummaryMetric({ value, label, tone = 'zinc' }: { value: number; label: string; tone?: 'zinc' | 'amber' | 'red' | 'emerald' }) {
  const styles = { zinc: 'bg-zinc-50 text-zinc-950', amber: 'bg-amber-50 text-amber-950', red: 'bg-red-50 text-red-900', emerald: 'bg-emerald-50 text-emerald-900' };
  return <div className={`rounded-xl p-4 ${styles[tone]}`}><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-sm opacity-75">{label}</p></div>;
}

function GuestListTabs({ value, onChange }: { value: GuestTab; onChange: (value: GuestTab) => void }) {
  const tabs = [['guests', 'Invitados', Users], ['seating', 'Organización de mesas', TableProperties], ['summary', 'Resumen', FileText]] as const;
  return <nav className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm"><div className="flex min-w-max gap-1">{tabs.map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => onChange(tab)} className={`inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${value === tab ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></nav>;
}

export function GuestListWorkspace({ event, plan, saving, onSave, onSyncSummary, onNotice }: GuestListWorkspaceProps) {
  const initialGuestList = useMemo(() => withIds(plan?.guestList, event.guestCount), [plan, event.guestCount]);
  const [guestList, setGuestList] = useState<EventGuestList>(initialGuestList);
  const [tab, setTab] = useState<GuestTab>('seating');
  const [dirty, setDirty] = useState(false);
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [guestEditorOpen, setGuestEditorOpen] = useState(false);
  const [guestDraft, setGuestDraft] = useState<GuestDraft>();
  const [quickImportOpen, setQuickImportOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickTableId, setQuickTableId] = useState('');
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [tableDraft, setTableDraft] = useState<TableDraft>({ name: '', capacity: '', audience: 'open', notes: '' });
  const [tableError, setTableError] = useState('');
  const [tablesManagerOpen, setTablesManagerOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string>();
  const [tableFilterId, setTableFilterId] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const [shareToken, setShareToken] = useState(event.guestListAccessToken ?? '');
  const shareUrl = shareToken ? shareableGuestListUrl(shareToken) : '';
  const shareContact = customerContact(event);
  const whatsappShareHref = shareUrl ? `https://wa.me/${shareContact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(guestListShareMessage(event, shareUrl))}` : '';
  const emailShareHref = shareUrl ? `mailto:${shareContact.email}?subject=${encodeURIComponent('Lista de invitados de tu evento – M&M Eventos')}&body=${encodeURIComponent(guestListShareMessage(event, shareUrl))}` : '';
  const tables = guestList.tables ?? [];
  const guests = guestList.guests ?? [];
  const validGuests = guests.filter((guest) => guest.fullName.trim());
  const assignedGuests = validGuests.filter((guest) => guest.tableId && tables.some((table) => table.id === guest.tableId));
  const unassignedGuests = validGuests.filter((guest) => !guest.tableId || !tables.some((table) => table.id === guest.tableId));
  const fullTables = tables.filter((table) => table.capacity && guests.filter((guest) => guest.tableId === table.id && guest.fullName.trim()).length === table.capacity);
  const overCapacityTables = tables.filter((table) => table.capacity && guests.filter((guest) => guest.tableId === table.id && guest.fullName.trim()).length > table.capacity);
  const dietaryCounts = ['vegetarian', 'vegan', 'celiac', 'lactose_free'].map((diet) => [diet, validGuests.filter((guest) => guest.dietaryPreference === diet).length] as const).filter(([, count]) => count > 0);
  const mealSummary = validGuests.reduce<Record<string, number>>((summary, guest) => { const key = guest.meal?.trim() || 'Sin menú definido'; summary[key] = (summary[key] ?? 0) + 1; return summary; }, {});
  const adults = validGuests.filter((guest) => !guest.ageGroup || guest.ageGroup === 'adult').length;
  const children = validGuests.filter((guest) => guest.ageGroup && guest.ageGroup !== 'adult').length;
  const changeList = (changes: Partial<EventGuestList>) => { setGuestList((current) => ({ ...current, ...changes })); setDirty(true); };
  const assignGuest = (guestId: string, tableId: string) => { changeList({ guests: guests.map((guest) => guest.id === guestId ? { ...guest, tableId } : guest) }); };
  const toggleGuest = (guestId: string) => setSelectedGuestIds((current) => current.includes(guestId) ? current.filter((id) => id !== guestId) : [...current, guestId]);
  const openGuestEditor = (guestId?: string, tableId = '') => {
    const existing = guests.find((guest) => guest.id === guestId);
    setGuestDraft(existing ? { ...existing, id: existing.id ?? makeId(), ageGroup: existing.ageGroup ?? 'adult' } : { id: makeId(), fullName: '', tableId, meal: '', ageGroup: 'adult', dietaryPreference: 'none', notes: '', confirmed: true });
    setGuestEditorOpen(true);
  };
  const saveGuestDraft = () => {
    if (!guestDraft?.fullName.trim()) return;
    const next = { ...guestDraft, fullName: guestDraft.fullName.trim(), meal: guestDraft.meal?.trim(), notes: guestDraft.notes?.trim() };
    changeList({ guests: guests.some((guest) => guest.id === next.id) ? guests.map((guest) => guest.id === next.id ? next : guest) : [...guests, next] });
    setGuestEditorOpen(false);
  };
  const deleteGuest = (guestId: string) => { changeList({ guests: guests.filter((guest) => guest.id !== guestId) }); setSelectedGuestIds((current) => current.filter((id) => id !== guestId)); };
  const openTableEditor = (tableId?: string) => {
    const existing = tables.find((table) => table.id === tableId);
    setTableError('');
    setTableDraft(existing ? { id: existing.id, name: existing.name, capacity: existing.capacity?.toString() ?? '', audience: existing.audience ?? 'open', notes: existing.notes ?? '' } : { name: `Mesa ${tables.length + 1}`, capacity: '', audience: 'open', notes: '' });
    setTableEditorOpen(true);
  };
  const saveTableDraft = () => {
    const name = tableDraft.name.trim();
    const capacity = tableDraft.capacity ? Number(tableDraft.capacity) : undefined;
    if (!name) { setTableError('Indicá un nombre para la mesa.'); return; }
    if (tableDraft.capacity && (!Number.isInteger(capacity) || Number(capacity) <= 0)) { setTableError('La capacidad debe ser mayor a cero.'); return; }
    const next: EventGuestTable = { id: tableDraft.id || makeId(), name, capacity, audience: tableDraft.audience || 'open', notes: tableDraft.notes.trim() };
    changeList({ tables: tableDraft.id ? tables.map((table) => table.id === tableDraft.id ? next : table) : [...tables, next] });
    setTableEditorOpen(false);
  };
  const deleteTable = () => {
    if (!tableToDelete) return;
    changeList({ tables: tables.filter((table) => table.id !== tableToDelete), guests: guests.map((guest) => guest.tableId === tableToDelete ? { ...guest, tableId: '' } : guest) });
    setTableToDelete(undefined);
  };
  const quickLines = quickText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const importQuickGuests = () => {
    if (!quickLines.length) return;
    const imported = quickLines.map((line) => { const [fullName, meal] = line.split(',', 2).map((part) => part.trim()); return { id: makeId(), fullName, tableId: quickTableId, meal: meal ?? '', ageGroup: 'adult', dietaryPreference: 'none', notes: '', confirmed: true } satisfies EventGuest; });
    changeList({ guests: [...guests, ...imported] });
    setQuickText(''); setQuickTableId(''); setQuickImportOpen(false);
  };
  const bulkAssign = (tableId: string) => { changeList({ guests: guests.map((guest) => guest.id && selectedGuestIds.includes(guest.id) ? { ...guest, tableId } : guest) }); setSelectedGuestIds([]); };
  const save = () => {
    const cleanTables = tables.filter((table) => table.name.trim()).map((table) => ({ ...table, name: table.name.trim(), notes: table.notes?.trim() }));
    const tableIds = new Set(cleanTables.map((table) => table.id));
    const cleanGuests = guests.filter((guest) => guest.fullName.trim()).map((guest) => ({ ...guest, fullName: guest.fullName.trim(), meal: guest.meal?.trim(), notes: guest.notes?.trim(), tableId: tableIds.has(guest.tableId) ? guest.tableId : '' }));
    onSave({ ...(plan ?? {}), guestList: { tables: cleanTables, guests: cleanGuests, notes: guestList.notes?.trim(), submittedAt: guestList.submittedAt } });
  };
  const discard = () => { setGuestList(withIds(plan?.guestList, event.guestCount)); setDirty(false); setSelectedGuestIds([]); setTableFilterId(undefined); };
  const syncSummary = () => onSyncSummary({ guestCount: validGuests.length || undefined, vegetarianCount: validGuests.filter((guest) => guest.dietaryPreference === 'vegetarian').length, veganCount: validGuests.filter((guest) => guest.dietaryPreference === 'vegan').length, celiacCount: validGuests.filter((guest) => guest.dietaryPreference === 'celiac').length, lactoseIntolerantCount: validGuests.filter((guest) => guest.dietaryPreference === 'lactose_free').length });
  const createShareLink = async () => { setSharing(true); try { const response = await api.post<{ token: string; created: boolean }>(`/events/${event._id}/guest-list-link`, {}); setShareToken(response.token); try { await globalThis.navigator.clipboard.writeText(shareableGuestListUrl(response.token)); onNotice?.(response.created ? 'Enlace para el cliente creado y copiado.' : 'Enlace existente copiado.'); } catch { onNotice?.(response.created ? 'Enlace para el cliente creado. Copialo desde el campo mostrado.' : 'El enlace existente sigue activo. Copialo desde el campo mostrado.'); } } catch (error) { onNotice?.(error instanceof Error ? error.message : 'No se pudo obtener el enlace para el cliente.', 'error'); } finally { setSharing(false); } };
  const status = saving ? 'Guardando...' : dirty ? 'Hay cambios pendientes' : 'Cambios guardados';
  const selectedTable = tables.find((table) => table.id === tableToDelete);
  const selectedTableGuests = selectedTable ? guests.filter((guest) => guest.tableId === selectedTable.id && guest.fullName.trim()) : [];
  return <div className="mx-auto w-full max-w-[1440px] space-y-5 rounded-3xl bg-zinc-50/80 p-1 sm:p-3"><header className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-6 text-white shadow-lg sm:px-7"><div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div className="flex min-w-0 items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/50 bg-amber-300/10 font-serif text-xl font-semibold text-amber-300">M</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-300">M&M Eventos</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Lista de invitados</h1><p className="mt-1 truncate text-sm text-zinc-300">{event.eventType || 'Evento'} · {customerName(event)} · {dateLabel(event.eventDate)}</p></div></div><div className="flex flex-col gap-3 xl:items-end"><p className={`inline-flex items-center gap-2 text-sm ${saving ? 'text-amber-200' : dirty ? 'text-amber-200' : 'text-emerald-300'}`}><CheckCircle2 className="h-4 w-4" />{status}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={sharing} onClick={() => void createShareLink()}>{sharing ? 'Preparando enlace...' : shareUrl ? 'Copiar enlace cliente' : 'Crear enlace cliente'}</Button><Button type="button" variant="secondary" onClick={() => setTab('summary')}><Eye className="mr-2 h-4 w-4" />Vista previa</Button><Button type="button" disabled={saving || !dirty} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div></div></div><div className="mt-6 flex gap-3 overflow-x-auto pb-1"><Metric value={validGuests.length} label="invitados" icon={<Users className="h-4 w-4" />} /><Metric value={assignedGuests.length} label="asignados" icon={<CheckCircle2 className="h-4 w-4" />} /><Metric value={unassignedGuests.length} label="sin mesa" icon={<UserPlus className="h-4 w-4" />} /><Metric value={tables.length} label="mesas" icon={<TableProperties className="h-4 w-4" />} /></div></header><GuestListTabs value={tab} onChange={setTab} />
    {shareUrl ? <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><p className="font-medium">Enlace permanente del cliente</p><p className="mt-1 text-sky-800">Este mismo enlace seguirá activo aunque vuelvas a editar la lista.</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Input readOnly value={shareUrl} /><a className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2.5 font-medium shadow-sm ring-1 ring-sky-200" href={shareUrl} target="_blank" rel="noreferrer">Abrir formulario</a></div><div className="mt-2 flex flex-wrap gap-2"><a className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium shadow-sm ring-1 ring-sky-200" href={whatsappShareHref} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Compartir por WhatsApp</a><a className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium shadow-sm ring-1 ring-sky-200" href={emailShareHref}><Mail className="h-4 w-4" />Compartir por email</a></div></div> : null}
    {tab === 'seating' ? <div className="space-y-5"><section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><UnassignedGuestsPanel guests={guests} tables={tables} selectedGuestIds={selectedGuestIds} onToggleSelected={toggleGuest} onEditGuest={(guestId) => openGuestEditor(guestId)} onAssign={assignGuest} /><section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Organización de mesas</h2><p className="mt-1 text-sm text-zinc-500">Usá el plano para ubicar invitados y controlar la capacidad de cada mesa.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => openTableEditor()}><Plus className="mr-2 h-4 w-4" />Nueva mesa</Button><Button type="button" variant="secondary" onClick={() => setTablesManagerOpen(true)}><Settings className="mr-2 h-4 w-4" />Administrar mesas</Button><Button type="button" onClick={() => openGuestEditor()}><UserPlus className="mr-2 h-4 w-4" />Agregar invitado</Button></div></div><div className="mt-5"><GuestSeatingBoard tables={tables} guests={guests} showUnassigned={false} onAssign={assignGuest} onEditTable={openTableEditor} onViewTable={(tableId) => { setTableFilterId(tableId); setTab('guests'); }} onAddGuestToTable={(tableId) => openGuestEditor(undefined, tableId)} /></div></section></section><section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="text-base font-semibold text-zinc-950">Resumen rápido</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><SummaryMetric value={validGuests.filter((guest) => guest.dietaryPreference === 'vegetarian').length} label="vegetarianos" tone="emerald" /><SummaryMetric value={validGuests.filter((guest) => guest.dietaryPreference === 'celiac').length} label="celíacos" tone="amber" /><SummaryMetric value={children} label="menús infantiles" tone="zinc" />{unassignedGuests.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 xl:col-span-2"><p className="flex items-center gap-2 font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" />{unassignedGuests.length} invitado{unassignedGuests.length === 1 ? '' : 's'} todavía no tiene{unassignedGuests.length === 1 ? '' : 'n'} mesa</p><p className="mt-1 text-sm text-amber-800">Asignálos para completar la organización.</p></div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 xl:col-span-2"><p className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" />Todos los invitados tienen mesa</p><p className="mt-1 text-sm text-emerald-700">La distribución está completa.</p></div>}</div></section></div> : null}
    {tab === 'guests' ? <div className="space-y-5"><section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div><h2 className="font-semibold text-zinc-950">Gestión de invitados</h2><p className="mt-1 text-sm text-zinc-500">Podés cargar invitados individualmente o en lote.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setQuickImportOpen(true)}><Plus className="mr-2 h-4 w-4" />Carga rápida</Button><Button type="button" onClick={() => openGuestEditor()}><UserPlus className="mr-2 h-4 w-4" />Agregar invitado</Button></div></section><GuestDirectory guests={guests} tables={tables} selectedGuestIds={selectedGuestIds} tableFilterId={tableFilterId} onToggleSelected={toggleGuest} onClearSelected={() => setSelectedGuestIds([])} onBulkAssign={bulkAssign} onEditGuest={(guestId) => openGuestEditor(guestId)} onDeleteGuest={deleteGuest} onClearTableFilter={() => setTableFilterId(undefined)} /></div> : null}
    {tab === 'summary' ? <section className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SummaryMetric value={validGuests.length} label="invitados totales" /><SummaryMetric value={assignedGuests.length} label="invitados asignados" tone="emerald" /><SummaryMetric value={unassignedGuests.length} label="sin mesa" tone={unassignedGuests.length ? 'amber' : 'emerald'} /><SummaryMetric value={fullTables.length} label="mesas completas" tone="amber" /><SummaryMetric value={overCapacityTables.length} label="mesas excedidas" tone={overCapacityTables.length ? 'red' : 'zinc'} /></div><div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Menú y restricciones</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="text-sm font-medium text-zinc-700">Menú por cantidad</p><div className="mt-2 space-y-2">{Object.entries(mealSummary).map(([name, count]) => <div key={name} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"><span>{name}</span><strong>{count}</strong></div>)}</div></div><div><p className="text-sm font-medium text-zinc-700">Restricciones alimentarias</p><div className="mt-2 space-y-2">{dietaryCounts.length ? dietaryCounts.map(([diet, count]) => <div key={diet} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"><span>{dietLabel(diet)}</span><strong>{count}</strong></div>) : <p className="rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500">No hay restricciones cargadas.</p>}<div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">{adults} adultos · {children} niños/as</div></div></div></div></section><section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Alertas operativas</h2><div className="mt-4 space-y-3">{unassignedGuests.length ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{unassignedGuests.length} invitado{unassignedGuests.length === 1 ? '' : 's'} todavía no tiene{unassignedGuests.length === 1 ? '' : 'n'} mesa.</p> : null}{overCapacityTables.map((table) => { const count = guests.filter((guest) => guest.tableId === table.id && guest.fullName.trim()).length - Number(table.capacity); return <p key={table.id} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{table.name} supera su capacidad por {count} invitado{count === 1 ? '' : 's'}.</p>; })}{validGuests.filter((guest) => guest.dietaryPreference && guest.dietaryPreference !== 'none' && !guest.meal?.trim()).length ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay invitados con restricciones alimentarias sin menú definido.</p> : null}{!unassignedGuests.length && !overCapacityTables.length ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">No hay alertas críticas de distribución.</p> : null}</div></section></div><section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-zinc-950">Notas generales</h2><Textarea className="mt-4" value={guestList.notes ?? ''} onChange={(event) => changeList({ notes: event.target.value })} placeholder="Confirmaciones pendientes, cambios de última hora, contactos u observaciones para el equipo..." /><div className="mt-4 flex justify-end"><Button type="button" variant="secondary" disabled={saving || !validGuests.length} onClick={syncSummary}>Sincronizar cantidades con el evento</Button></div></section></section> : null}
    {dirty ? <div className="sticky bottom-3 z-20 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-white shadow-2xl"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Cambios pendientes</p><p className="mt-1 text-sm text-zinc-300">Guardá la lista para actualizar el cronograma, los documentos y la operación.</p></div><div className="flex gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={discard}><RotateCcw className="mr-2 h-4 w-4" />Descartar</Button><Button type="button" disabled={saving} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div></div></div> : null}
    <Modal open={guestEditorOpen} title={guestDraft && guests.some((guest) => guest.id === guestDraft.id) ? 'Editar invitado' : 'Agregar invitado'} description="Completá solo los datos necesarios para la organización del evento." onClose={() => setGuestEditorOpen(false)}>{guestDraft ? <div className="space-y-4 p-5 sm:p-6"><Input value={guestDraft.fullName} onChange={(event) => setGuestDraft({ ...guestDraft, fullName: event.target.value })} placeholder="Nombre y apellido" aria-label="Nombre y apellido" /><div className="grid gap-3 sm:grid-cols-2"><Select value={guestDraft.tableId ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, tableId: event.target.value })} aria-label="Mesa"><option value="">Sin mesa asignada</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</Select><Select value={guestDraft.ageGroup ?? 'adult'} onChange={(event) => setGuestDraft({ ...guestDraft, ageGroup: event.target.value })} aria-label="Edad y tarifa"><option value="adult">Adulto / 18 años o más</option><option value="child_1_4">1 a 4 años · no paga</option><option value="child_5_9">5 a 9 años · paga la mitad</option><option value="minor_10_17">10 a 17 años · menor</option></Select><Input value={guestDraft.meal ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, meal: event.target.value })} placeholder="Menú / plato" /><Select value={guestDraft.dietaryPreference ?? 'none'} onChange={(event) => setGuestDraft({ ...guestDraft, dietaryPreference: event.target.value })} aria-label="Restricción alimentaria"><option value="none">Sin restricción</option><option value="vegetarian">Vegetariano/a</option><option value="vegan">Vegano/a</option><option value="celiac">Celíaco/a</option><option value="lactose_free">Sin lactosa</option></Select></div><Textarea value={guestDraft.notes ?? ''} onChange={(event) => setGuestDraft({ ...guestDraft, notes: event.target.value })} placeholder="Observaciones, alergias o ubicación especial" /><label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={guestDraft.confirmed !== false} onChange={(event) => setGuestDraft({ ...guestDraft, confirmed: event.target.checked })} />Confirmado</label>{!guestDraft.fullName.trim() ? <p className="text-sm text-red-600">El nombre del invitado es obligatorio.</p> : null}<div className="flex justify-between gap-2 border-t border-zinc-100 pt-4">{guests.some((guest) => guest.id === guestDraft.id) ? <Button type="button" variant="danger" onClick={() => { deleteGuest(guestDraft.id); setGuestEditorOpen(false); }}>Eliminar</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setGuestEditorOpen(false)}>Cancelar</Button><Button type="button" disabled={!guestDraft.fullName.trim()} onClick={saveGuestDraft}>Guardar invitado</Button></div></div></div> : null}</Modal>
    <Modal open={quickImportOpen} title="Carga rápida de invitados" description="Pegá un invitado por línea. Podés agregar el menú separándolo con una coma." onClose={() => setQuickImportOpen(false)}><div className="space-y-4 p-5 sm:p-6"><Textarea value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder={'Juan Pérez, Menú tradicional\nMaría López, Vegetariano\nCarlos Díaz'} aria-label="Invitados a cargar" /><Select value={quickTableId} onChange={(event) => setQuickTableId(event.target.value)}><option value="">Sin mesa inicial</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</Select><p className="rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-600">Se agregarán <strong>{quickLines.length}</strong> invitado{quickLines.length === 1 ? '' : 's'}.</p><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" onClick={() => setQuickImportOpen(false)}>Cancelar</Button><Button type="button" disabled={!quickLines.length} onClick={importQuickGuests}>Agregar invitados</Button></div></div></Modal>
    <Modal open={tableEditorOpen} title={tableDraft.id ? 'Editar mesa' : 'Nueva mesa'} description="Definí nombre, capacidad, tipo de mesa y una referencia opcional para el salón." onClose={() => setTableEditorOpen(false)}><div className="space-y-4 p-5 sm:p-6"><Input value={tableDraft.name} onChange={(event) => { setTableError(''); setTableDraft({ ...tableDraft, name: event.target.value }); }} placeholder="Ej.: Mesa familia Gómez" aria-label="Nombre de mesa" /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-zinc-700">Capacidad de la mesa<Input className="mt-1" type="number" min={1} value={tableDraft.capacity} onChange={(event) => { setTableError(''); setTableDraft({ ...tableDraft, capacity: event.target.value }); }} placeholder="Ej.: 10" aria-label="Capacidad de mesa" /></label><Select value={tableDraft.audience} onChange={(event) => setTableDraft({ ...tableDraft, audience: event.target.value })} aria-label="Tipo de mesa"><option value="open">Mesa libre / general</option><option value="children">Mesa de chicos</option><option value="family">Mesa familiar</option></Select></div><Textarea value={tableDraft.notes} onChange={(event) => setTableDraft({ ...tableDraft, notes: event.target.value })} placeholder="Descripción o referencia opcional" />{tableDraft.id ? <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">Actualmente hay {guests.filter((guest) => guest.tableId === tableDraft.id && guest.fullName.trim()).length} invitado{guests.filter((guest) => guest.tableId === tableDraft.id && guest.fullName.trim()).length === 1 ? '' : 's'} asignado{guests.filter((guest) => guest.tableId === tableDraft.id && guest.fullName.trim()).length === 1 ? '' : 's'}. Si reducís la capacidad por debajo de ese número, la mesa quedará marcada como excedida.</p> : null}{tableError ? <p className="text-sm text-red-600">{tableError}</p> : null}<div className="flex justify-between gap-2 border-t border-zinc-100 pt-4">{tableDraft.id ? <Button type="button" variant="danger" onClick={() => { setTableEditorOpen(false); setTableToDelete(tableDraft.id); }}>Eliminar mesa</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setTableEditorOpen(false)}>Cancelar</Button><Button type="button" onClick={saveTableDraft}>Guardar mesa</Button></div></div></div></Modal>
    <Modal open={tablesManagerOpen} title="Administrar mesas" description="Editá capacidad, referencias y distribución sin ocupar la vista principal." onClose={() => setTablesManagerOpen(false)}><div className="space-y-3 p-5 sm:p-6"><div className="flex justify-end"><Button type="button" onClick={() => openTableEditor()}><Plus className="mr-2 h-4 w-4" />Nueva mesa</Button></div>{tables.length ? tables.map((table) => { const count = guests.filter((guest) => guest.tableId === table.id && guest.fullName.trim()).length; return <div key={table.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3"><div><p className="font-medium text-zinc-950">{table.name}</p><p className="mt-1 text-sm text-zinc-500">{count}{table.capacity ? ` / ${table.capacity}` : ''} invitados · {table.notes || 'Sin descripción'}</p></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => openTableEditor(table.id)}>Editar</Button><Button type="button" variant="danger" onClick={() => setTableToDelete(table.id)}>Eliminar</Button></div></div>; }) : <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">Todavía no hay mesas cargadas.</p>}</div></Modal>
    <Modal open={Boolean(tableToDelete)} title="Eliminar mesa" description="Esta acción modifica la organización de invitados." onClose={() => setTableToDelete(undefined)}><div className="space-y-4 p-5 sm:p-6"><p className="text-sm text-zinc-700">{selectedTableGuests.length ? <>La mesa <strong>{selectedTable?.name}</strong> tiene {selectedTableGuests.length} invitado{selectedTableGuests.length === 1 ? '' : 's'} asignado{selectedTableGuests.length === 1 ? '' : 's'}. Al eliminarla, quedarán sin mesa para que puedas reasignarlos.</> : <>La mesa <strong>{selectedTable?.name}</strong> no tiene invitados asignados y se eliminará de la organización.</>}</p><div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button type="button" variant="secondary" onClick={() => setTableToDelete(undefined)}>Cancelar</Button><Button type="button" variant="danger" onClick={deleteTable}>Eliminar mesa</Button></div></div></Modal>
  </div>;
}
