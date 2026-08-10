'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Check, GripVertical, Search, SlidersHorizontal, Users } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui/primitives';
import type { EventGuest, EventGuestTable } from '@/features/quotes/types';
import { guestAgeGroupLabel, guestAgeGroupMeta } from '@/features/events/guest-age-group';

type GuestDirectoryProps = {
  guests: EventGuest[];
  tables: EventGuestTable[];
  selectedGuestIds: string[];
  tableFilterId?: string;
  onToggleSelected: (guestId: string) => void;
  onClearSelected: () => void;
  onBulkAssign: (tableId: string) => void;
  onEditGuest: (guestId: string) => void;
  onDeleteGuest: (guestId: string) => void;
  onClearTableFilter: () => void;
};

type UnassignedGuestsPanelProps = Pick<GuestDirectoryProps, 'guests' | 'tables' | 'selectedGuestIds' | 'onToggleSelected' | 'onEditGuest'> & {
  onAssign: (guestId: string, tableId: string) => void;
};

function restrictionLabel(value?: string): string {
  return ({ vegetarian: 'Vegetariano/a', vegan: 'Vegano/a', celiac: 'Celíaco/a', lactose_free: 'Sin lactosa' } as Record<string, string>)[value ?? ''] ?? '';
}

function ageGroupLabel(value?: string) {
  const ageMeta = guestAgeGroupMeta(value);
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${ageMeta.chipClassName}`}>{guestAgeGroupLabel(value)}</span>;
}

function guestSubtitle(guest: EventGuest): string {
  return [guestAgeGroupLabel(guest.ageGroup), guest.meal || 'Sin menú', restrictionLabel(guest.dietaryPreference)].filter(Boolean).join(' · ');
}

function GuestListItem({ guest, selected, onToggle, onEdit }: { guest: EventGuest; selected: boolean; onToggle: () => void; onEdit: () => void }) {
  const ageMeta = guestAgeGroupMeta(guest.ageGroup);
  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    if (!guest.id) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/mym-event-guest-id', guest.id);
  };
  return <article draggable onDragStart={startDrag} onClick={onEdit} className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm transition ${ageMeta.chipClassName}`}><button type="button" aria-label={`Seleccionar ${guest.fullName}`} onClick={(event) => { event.stopPropagation(); onToggle(); }} className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></button><GripVertical className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-700" /><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${ageMeta.avatarClassName}`}>{guest.fullName.slice(0, 1).toUpperCase() || '?'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-950">{guest.fullName}</p><p className="truncate text-xs text-zinc-600">{guestSubtitle(guest)}</p></div><Users className="h-3.5 w-3.5 shrink-0 text-zinc-400" /></article>;
}

function AgeFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Filtrar por edad"><option value="">Todas las edades</option><option value="adult">Adultos</option><option value="child_1_4">1 a 4 años</option><option value="child_5_9">5 a 9 años</option><option value="minor_10_17">10 a 17 años</option></Select>;
}

export function UnassignedGuestsPanel({ guests, tables, selectedGuestIds, onToggleSelected, onEditGuest, onAssign }: UnassignedGuestsPanelProps) {
  const [search, setSearch] = useState('');
  const [mealFilter, setMealFilter] = useState('');
  const [restrictionFilter, setRestrictionFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [assignTableId, setAssignTableId] = useState('');
  const unassigned = guests.filter((guest) => !guest.tableId && guest.fullName.trim());
  const meals = [...new Set(unassigned.map((guest) => guest.meal?.trim()).filter(Boolean))] as string[];
  const filtered = unassigned.filter((guest) => {
    const query = search.trim().toLocaleLowerCase('es');
    return (!query || guest.fullName.toLocaleLowerCase('es').includes(query)) && (!mealFilter || guest.meal === mealFilter) && (!restrictionFilter || guest.dietaryPreference === restrictionFilter) && (!ageFilter || (guest.ageGroup ?? 'adult') === ageFilter);
  });
  const selectedUnassigned = selectedGuestIds.filter((id) => unassigned.some((guest) => guest.id === id));
  const dropToUnassigned = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const guestId = event.dataTransfer.getData('text/mym-event-guest-id'); if (guestId) onAssign(guestId, ''); };
  const clearFilters = () => { setSearch(''); setMealFilter(''); setRestrictionFilter(''); setAgeFilter(''); };
  return <aside onDragOver={(event) => event.preventDefault()} onDrop={dropToUnassigned} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-zinc-950">Invitados sin asignar</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{unassigned.length}</span></div><div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar invitado..." aria-label="Buscar invitados sin asignar" /></div><div className="mt-3 grid gap-2"><Select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)} aria-label="Filtrar por menú"><option value="">Todos los menús</option>{meals.map((meal) => <option key={meal} value={meal}>{meal}</option>)}</Select><div className="grid grid-cols-2 gap-2"><Select value={restrictionFilter} onChange={(event) => setRestrictionFilter(event.target.value)} aria-label="Filtrar por restricción"><option value="">Restricciones</option><option value="vegetarian">Vegetariano/a</option><option value="vegan">Vegano/a</option><option value="celiac">Celíaco/a</option><option value="lactose_free">Sin lactosa</option></Select><AgeFilter value={ageFilter} onChange={setAgeFilter} /></div></div>{selectedUnassigned.length ? <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-white"><p className="text-xs font-medium">{selectedUnassigned.length} seleccionado{selectedUnassigned.length === 1 ? '' : 's'}</p><div className="mt-2 flex gap-2"><Select value={assignTableId} onChange={(event) => setAssignTableId(event.target.value)} className="border-zinc-700 bg-zinc-800 py-2 text-white"><option value="">Asignar a mesa</option>{tables.map((table, index) => <option key={table.id ?? index} value={table.id ?? ''}>{table.name}</option>)}</Select><Button type="button" variant="secondary" className="shrink-0 px-3 py-2" disabled={!assignTableId} onClick={() => { selectedUnassigned.forEach((guestId) => onAssign(guestId, assignTableId)); setAssignTableId(''); }}>Asignar</Button></div></div> : null}<p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><GripVertical className="h-3.5 w-3.5" />Arrastrá un invitado a una mesa o hacé clic para editarlo.</p><div className="mt-3 space-y-2">{filtered.length ? filtered.map((guest) => <GuestListItem key={guest.id} guest={guest} selected={Boolean(guest.id && selectedGuestIds.includes(guest.id))} onToggle={() => guest.id && onToggleSelected(guest.id)} onEdit={() => guest.id && onEditGuest(guest.id)} />) : <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">No hay invitados sin asignar con estos filtros.</p>}</div>{unassigned.length > filtered.length ? <button type="button" onClick={clearFilters} className="mt-4 w-full text-sm font-medium text-zinc-700 underline">Ver todos los invitados sin asignar</button> : null}</aside>;
}

export function GuestDirectory({ guests, tables, selectedGuestIds, tableFilterId, onToggleSelected, onClearSelected, onBulkAssign, onEditGuest, onDeleteGuest, onClearTableFilter }: GuestDirectoryProps) {
  const [search, setSearch] = useState('');
  const [restrictionFilter, setRestrictionFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [sort, setSort] = useState<'name' | 'table'>('name');
  const [bulkTableId, setBulkTableId] = useState('');
  const tableById = useMemo(() => new Map(tables.map((table, index) => [table.id ?? `table-${index}`, table.name])), [tables]);
  const visibleGuests = guests.filter((guest) => {
    const query = search.trim().toLocaleLowerCase('es');
    return (!query || guest.fullName.toLocaleLowerCase('es').includes(query)) && (!restrictionFilter || guest.dietaryPreference === restrictionFilter) && (!ageFilter || (guest.ageGroup ?? 'adult') === ageFilter) && (!tableFilterId || guest.tableId === tableFilterId);
  }).sort((first, second) => sort === 'name' ? first.fullName.localeCompare(second.fullName, 'es') : (tableById.get(first.tableId ?? '') ?? 'Sin mesa').localeCompare(tableById.get(second.tableId ?? '') ?? 'Sin mesa', 'es'));
  return <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Invitados</h2><p className="mt-1 text-sm text-zinc-500">Editá cada invitado desde una ventana compacta, sin desplegar todos los campos.</p></div>{tableFilterId ? <Button type="button" variant="secondary" onClick={onClearTableFilter}>Quitar filtro de mesa</Button> : null}</div><div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_180px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre..." /></div><Select value={restrictionFilter} onChange={(event) => setRestrictionFilter(event.target.value)}><option value="">Todas las restricciones</option><option value="vegetarian">Vegetariano/a</option><option value="vegan">Vegano/a</option><option value="celiac">Celíaco/a</option><option value="lactose_free">Sin lactosa</option></Select><AgeFilter value={ageFilter} onChange={setAgeFilter} /><Select value={sort} onChange={(event) => setSort(event.target.value as 'name' | 'table')}><option value="name">Ordenar por nombre</option><option value="table">Ordenar por mesa</option></Select></div>{selectedGuestIds.length ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><span className="text-sm font-medium text-amber-950">{selectedGuestIds.length} seleccionado{selectedGuestIds.length === 1 ? '' : 's'}</span><Select value={bulkTableId} onChange={(event) => setBulkTableId(event.target.value)} className="min-w-48 flex-1 py-2"><option value="">Asignar a mesa</option><option value="__unassigned">Dejar sin mesa</option>{tables.map((table, index) => <option key={table.id ?? index} value={table.id ?? ''}>{table.name}</option>)}</Select><Button type="button" disabled={!bulkTableId} onClick={() => { onBulkAssign(bulkTableId === '__unassigned' ? '' : bulkTableId); setBulkTableId(''); }}>Asignar</Button><Button type="button" variant="secondary" onClick={onClearSelected}>Cancelar selección</Button></div> : null}<div className="mt-5 overflow-x-auto"><table className="min-w-[940px] w-full text-sm"><thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400"><tr><th className="w-10 px-2 py-3"><SlidersHorizontal className="h-4 w-4" /><span className="sr-only">Selección</span></th><th className="px-2 py-3">Nombre</th><th className="px-2 py-3">Mesa</th><th className="px-2 py-3">Edad / tarifa</th><th className="px-2 py-3">Menú</th><th className="px-2 py-3">Restricción</th><th className="px-2 py-3">Confirmado</th><th className="px-2 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{visibleGuests.map((guest) => <tr key={guest.id} className="hover:bg-zinc-50"><td className="px-2 py-3"><button type="button" aria-label={`Seleccionar ${guest.fullName}`} onClick={() => guest.id && onToggleSelected(guest.id)} className={`grid h-5 w-5 place-items-center rounded border ${guest.id && selectedGuestIds.includes(guest.id) ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-300 text-transparent'}`}><Check className="h-3.5 w-3.5" /></button></td><td className="px-2 py-3 font-medium text-zinc-950"><button type="button" onClick={() => guest.id && onEditGuest(guest.id)} className="text-left hover:underline">{guest.fullName}</button></td><td className="px-2 py-3 text-zinc-600">{tableById.get(guest.tableId ?? '') ?? 'Sin mesa'}</td><td className="px-2 py-3 text-zinc-600">{ageGroupLabel(guest.ageGroup)}</td><td className="px-2 py-3 text-zinc-600">{guest.meal || '—'}</td><td className="px-2 py-3 text-zinc-600">{restrictionLabel(guest.dietaryPreference) || '—'}</td><td className="px-2 py-3">{guest.confirmed === false ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">Pendiente</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Confirmado</span>}</td><td className="px-2 py-3 text-right"><div className="inline-flex gap-2"><button type="button" onClick={() => guest.id && onEditGuest(guest.id)} className="text-sm font-medium text-zinc-700 hover:underline">Editar</button><button type="button" onClick={() => guest.id && onDeleteGuest(guest.id)} className="text-sm font-medium text-red-600 hover:underline">Quitar</button></div></td></tr>)}{!visibleGuests.length ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-zinc-500">No hay invitados con los filtros seleccionados.</td></tr> : null}</tbody></table></div></section>;
}
