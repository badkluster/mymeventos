'use client';

import { useState, type DragEvent } from 'react';
import { AlertTriangle, GripVertical, MoreVertical, Pencil, UserPlus, Users } from 'lucide-react';
import type { EventGuest, EventGuestTable } from '@/features/quotes/types';
import { guestAgeGroupLabel, guestAgeGroupMeta } from '@/features/events/guest-age-group';

type GuestSeatingBoardProps = {
  tables: EventGuestTable[];
  guests: EventGuest[];
  onAssign: (guestId: string, tableId: string) => void;
  showUnassigned?: boolean;
  onEditTable?: (tableId: string) => void;
  onViewTable?: (tableId: string) => void;
  onAddGuestToTable?: (tableId: string) => void;
  readOnly?: boolean;
};

function tableKey(table: EventGuestTable, index: number) {
  return table.id ?? `table-${index}`;
}

function tableAudienceLabel(audience?: string): string {
  return ({ children: 'Mesa de chicos', family: 'Mesa familiar', open: 'Mesa libre' } as Record<string, string>)[audience ?? ''] ?? 'Mesa libre';
}

function guestDetail(guest: EventGuest): string {
  const restriction = guest.dietaryPreference && guest.dietaryPreference !== 'none' ? guest.dietaryPreference : '';
  const ageLabel = guest.ageGroup && guest.ageGroup !== 'adult' ? guestAgeGroupLabel(guest.ageGroup) : '';
  return [ageLabel, guest.meal, restriction].filter(Boolean).join(' · ') || 'Sin menú definido';
}

function GuestChip({ guest, onDragStart, onDragEnd, readOnly = false }: { guest: EventGuest; onDragStart: (event: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void; readOnly?: boolean }) {
  const ageMeta = guestAgeGroupMeta(guest.ageGroup);
  return <div draggable={!readOnly} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`group flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs shadow-sm transition ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${ageMeta.chipClassName}`}><GripVertical className={`h-3.5 w-3.5 shrink-0 text-zinc-400 ${readOnly ? '' : 'group-hover:text-zinc-700'}`} /><div className="min-w-0"><p className="truncate font-medium text-zinc-950">{guest.fullName || 'Invitado sin nombre'}</p><p className="truncate text-[11px] text-zinc-600">{guestDetail(guest)}</p></div></div>;
}

export function GuestSeatingBoard({ tables, guests, onAssign, showUnassigned = true, onEditTable, onViewTable, onAddGuestToTable, readOnly = false }: GuestSeatingBoardProps) {
  const [draggingGuestId, setDraggingGuestId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [openMenu, setOpenMenu] = useState<string>();
  const validGuests = guests.filter((guest) => guest.fullName.trim());
  const guestsFor = (id: string) => validGuests.filter((guest) => guest.tableId === id);
  const unassigned = validGuests.filter((guest) => !guest.tableId || !tables.some((table, index) => tableKey(table, index) === guest.tableId));
  const beginDrag = (guestId?: string) => (event: DragEvent<HTMLDivElement>) => {
    if (!guestId || readOnly) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/mym-event-guest-id', guestId);
    setDraggingGuestId(guestId);
  };
  const drop = (tableId: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const guestId = event.dataTransfer.getData('text/mym-event-guest-id') || draggingGuestId;
    if (guestId && !readOnly) onAssign(guestId, tableId);
    setDraggingGuestId(undefined);
    setDropTarget(undefined);
  };
  const dropProps = (id: string) => readOnly ? {} : ({ onDragOver: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(id); }, onDragLeave: () => setDropTarget(undefined), onDrop: (event: DragEvent<HTMLDivElement>) => drop(id, event) });
  return <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-zinc-950"><Users className="h-4 w-4 text-amber-600" />Plano visual de mesas</h3><p className="mt-1 text-sm text-zinc-500">Arrastrá invitados desde el panel izquierdo o entre mesas. En celular, usá el selector de mesa al editar.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm">{tables.length} mesa{tables.length === 1 ? '' : 's'} · {validGuests.length} invitados</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs font-medium"><span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">1 a 4 · sin cargo</span><span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">5 a 9 · media tarifa</span><span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-800">10 a 17 · menor</span></div>
    {tables.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">{tables.map((table, index) => { const id = tableKey(table, index); const seated = guestsFor(id); const capacity = Number(table.capacity ?? 0); const difference = capacity ? capacity - seated.length : undefined; const overflow = capacity > 0 && seated.length > capacity; const full = capacity > 0 && seated.length === capacity; const percentage = capacity ? Math.min(100, Math.round(seated.length / capacity * 100)) : 0; const visibleGuests = seated.slice(0, 4); return <article key={id} {...dropProps(id)} className={`relative min-h-64 rounded-2xl border bg-white p-4 shadow-sm transition ${dropTarget === id ? 'border-amber-400 ring-2 ring-amber-200' : overflow ? 'border-red-200' : 'border-zinc-200'}`}><div className="absolute right-3 top-3">{!readOnly ? <><button type="button" aria-label={`Acciones de ${table.name}`} onClick={() => setOpenMenu((current) => current === id ? undefined : id)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"><MoreVertical className="h-4 w-4" /></button>{openMenu === id && (onEditTable || onViewTable || onAddGuestToTable) ? <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"><button type="button" onClick={() => { setOpenMenu(undefined); onEditTable?.(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"><Pencil className="h-4 w-4" />Editar mesa</button><button type="button" onClick={() => { setOpenMenu(undefined); onViewTable?.(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"><Users className="h-4 w-4" />Ver invitados</button><button type="button" onClick={() => { setOpenMenu(undefined); onAddGuestToTable?.(id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"><UserPlus className="h-4 w-4" />Agregar invitado</button></div> : null}</> : null}</div><div className="flex items-center gap-3 pr-8"><div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 ${overflow ? 'border-red-200 bg-red-50 text-red-600' : full ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><Users className="h-6 w-6" /></div><div className="min-w-0"><p className="truncate font-semibold text-zinc-950">{table.name}</p><p className="mt-0.5 text-xs font-medium text-amber-700">{tableAudienceLabel(table.audience)}</p><p className={`mt-1 text-sm font-medium ${overflow ? 'text-red-700' : 'text-zinc-600'}`}>{seated.length}{capacity ? ` / ${capacity}` : ''} invitados</p></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${overflow ? 'bg-red-500' : full ? 'bg-amber-500' : 'bg-amber-400'}`} style={{ width: `${overflow ? 100 : percentage}%` }} /></div><div className="mt-4 space-y-2">{visibleGuests.map((guest, guestIndex) => <GuestChip key={guest.id ?? `${id}-${guestIndex}`} guest={guest} readOnly={readOnly} onDragStart={beginDrag(guest.id)} onDragEnd={() => { setDraggingGuestId(undefined); setDropTarget(undefined); }} />)}{seated.length > visibleGuests.length ? <button type="button" onClick={() => onViewTable?.(id)} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-100">+ {seated.length - visibleGuests.length} más</button> : null}{!seated.length ? <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-center text-xs text-zinc-400">{readOnly ? 'No hay invitados asignados.' : 'Soltá invitados aquí'}</p> : null}</div><div className={`mt-4 flex items-center gap-1.5 text-xs font-medium ${overflow ? 'text-red-700' : full ? 'text-amber-700' : difference === undefined ? 'text-zinc-500' : 'text-emerald-700'}`}>{overflow ? <><AlertTriangle className="h-3.5 w-3.5" />{Math.abs(difference ?? 0)} invitado{Math.abs(difference ?? 0) === 1 ? '' : 's'} excede{Math.abs(difference ?? 0) === 1 ? '' : 'n'} la capacidad</> : full ? 'Mesa completa' : difference === undefined ? 'Capacidad sin definir' : difference === 0 ? 'Mesa completa' : `${difference} lugar${difference === 1 ? '' : 'es'} disponible${difference === 1 ? '' : 's'}`}</div></article>; })}</div> : <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">{readOnly ? 'No hay mesas cargadas.' : 'Todavía no hay mesas. Creá la primera mesa para comenzar a organizar el salón.'}</div>}
    {showUnassigned ? <div {...dropProps('')} className={`mt-4 rounded-xl border-2 border-dashed p-4 transition ${dropTarget === '' ? 'border-sky-400 bg-sky-50' : 'border-zinc-300 bg-white/70'}`}><p className="font-medium text-zinc-700">Sin mesa asignada · {unassigned.length}</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{unassigned.map((guest, index) => <GuestChip key={guest.id ?? `unassigned-${index}`} guest={guest} readOnly={readOnly} onDragStart={beginDrag(guest.id)} onDragEnd={() => { setDraggingGuestId(undefined); setDropTarget(undefined); }} />)}</div></div> : null}
  </section>;
}
