'use client';

import Link from 'next/link';
import { CalendarPlus, Check, Clock3, Plus, ReceiptText, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { displayLabel, eventStatusLabels } from '@/lib/display-labels';
import { civilDateKey, parseCivilDateKey } from '@/lib/dates';
import type { Event, Salon } from '@/features/quotes/types';

export type AvailabilityView = 'day' | 'week' | 'month';

export type AvailabilitySlot = {
  date: string;
  salonId: string;
  salonName: string;
  startTime: string;
  endTime: string;
};

type PositionedEvent = {
  event: Event;
  start: number;
  end: number;
  lane: number;
  lanes: number;
};

type Props = {
  date: Date;
  view: AvailabilityView;
  events: Event[];
  salons: Salon[];
  loading: boolean;
  canCreateEvents: boolean;
  canCreateQuotes: boolean;
  selectedSlot: AvailabilitySlot | null;
  onSelectSlot: (slot: AvailabilitySlot | null) => void;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (slot: AvailabilitySlot) => void;
};

const START_MINUTES = 0;
const END_MINUTES = 24 * 60;
const SLOT_MINUTES = 60;
const HOUR_HEIGHT = 48;
const TIMELINE_HEIGHT = ((END_MINUTES - START_MINUTES) / 60) * HOUR_HEIGHT;
const lockedStatuses = new Set(['reserved', 'confirmed']);
const ignoredStatuses = new Set(['cancelled', 'lost']);
const dayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const compactDateFormatter = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const weekdayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });

function salonId(event: Event) {
  return typeof event.salonId === 'string' ? event.salonId : event.salonId?._id ?? '';
}

function salonName(event: Event) {
  return typeof event.salonId === 'string' ? 'Salón' : event.salonId?.name ?? 'Sin salón';
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function eventDateKey(event: Event) {
  return civilDateKey(event.eventDate) ?? '';
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), 1 - day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function weekDays(date: Date) {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

function monthDays(date: Date) {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function sameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function timeMinutes(value?: string) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function formatMinutes(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function eventInterval(event: Event, boardDate: Date) {
  const previousKey = dateKey(addDays(boardDate, -1));
  const boardKey = dateKey(boardDate);
  const nextKey = dateKey(addDays(boardDate, 1));
  const eventKey = eventDateKey(event);
  const dayOffset = eventKey === previousKey ? -1440 : eventKey === boardKey ? 0 : eventKey === nextKey ? 1440 : undefined;
  if (dayOffset === undefined) return undefined;
  const start = timeMinutes(event.startTime);
  const rawEnd = timeMinutes(event.endTime);
  if (start === undefined || rawEnd === undefined) return { start: dayOffset, end: dayOffset + 1440, untimed: true };
  return { start: dayOffset + start, end: dayOffset + rawEnd + (rawEnd <= start ? 1440 : 0), untimed: false };
}

function layoutEvents(events: Event[], boardDate: Date): PositionedEvent[] {
  const timed = events.flatMap((event) => {
    const interval = eventInterval(event, boardDate);
    return interval && !interval.untimed ? [{ event, start: interval.start, end: interval.end }] : [];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const result: PositionedEvent[] = [];
  let group: Array<{ event: Event; start: number; end: number; lane: number }> = [];
  let groupEnd = -1;

  const flush = () => {
    if (!group.length) return;
    const lanes = Math.max(...group.map((item) => item.lane)) + 1;
    result.push(...group.map((item) => ({ ...item, lanes })));
    group = [];
    groupEnd = -1;
  };

  timed.forEach((item) => {
    if (group.length && item.start >= groupEnd) flush();
    const laneEnds: number[] = [];
    group.forEach((current) => { laneEnds[current.lane] = Math.max(laneEnds[current.lane] ?? -1, current.end); });
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    group.push({ ...item, lane });
    groupEnd = Math.max(groupEnd, item.end);
  });
  flush();
  return result;
}

function quoteHref(slot: AvailabilitySlot) {
  const query = new URLSearchParams({
    create: '1',
    salonId: slot.salonId,
    eventDate: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime
  });
  return `/admin/quotes?${query.toString()}`;
}

function slotIsBlocked(events: Event[], start: number, end: number, boardDate: Date) {
  return events.some((event) => {
    if (!lockedStatuses.has(event.status)) return false;
    const interval = eventInterval(event, boardDate);
    return Boolean(interval && start < interval.end && interval.start < end);
  });
}

function selectedSlotLabel(slot: AvailabilitySlot) {
  const startDate = parseCivilDateKey(slot.date);
  if (!startDate) return `${slot.salonName} · ${slot.startTime} a ${slot.endTime}`;
  const crossesMidnight = (timeMinutes(slot.endTime) ?? 0) <= (timeMinutes(slot.startTime) ?? 0);
  const endDay = crossesMidnight ? ` (${compactDateFormatter.format(addDays(startDate, 1))})` : '';
  return `${slot.salonName} · ${shortDateFormatter.format(startDate)} · ${slot.startTime} a ${slot.endTime}${endDay}`;
}

function EventOverviewCard({ event, compact = false }: { event: Event; compact?: boolean }) {
  const locked = lockedStatuses.has(event.status);
  return <Link href={`/admin/events/${event._id}`} className={`block rounded-xl border text-left transition hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500/30 ${compact ? 'px-2.5 py-2' : 'px-3 py-3'} ${locked ? 'border-zinc-800 bg-zinc-900 text-white' : 'border-amber-300 bg-amber-100 text-amber-950'}`}>
    <span className="block truncate text-xs font-semibold">{event.eventName || event.eventType || 'Evento'}</span>
    <span className="mt-1 block truncate text-[11px] font-medium tabular-nums opacity-80">{event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : 'Sin horario'} · {salonName(event)}</span>
    {!compact ? <span className="mt-1 block truncate text-[10px] opacity-70">{displayLabel(eventStatusLabels, event.status)}</span> : null}
  </Link>;
}

function AvailabilityWeek({ date, events, onSelectDate }: { date: Date; events: Event[]; onSelectDate: (date: Date) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
    <header className="border-b border-zinc-200 px-4 py-4">
      <h2 className="font-semibold text-zinc-950">Eventos de la semana</h2>
      <p className="mt-1 text-sm text-zinc-500">Abrí un evento para ver su detalle o elegí un día para consultar horarios libres.</p>
    </header>
    <div className="overflow-x-auto">
      <div className="grid min-w-[840px] grid-cols-7 divide-x divide-zinc-200 lg:min-w-0">
        {weekDays(date).map((day) => {
          const items = events.filter((event) => eventDateKey(event) === dateKey(day));
          return <section key={dateKey(day)} className={`min-h-[430px] p-3 ${sameDay(day, new Date()) ? 'bg-amber-50/40' : 'bg-white'}`}>
            <button type="button" onClick={() => onSelectDate(day)} className="flex min-h-12 w-full items-center justify-between rounded-xl px-2 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500/20">
              <span><span className="block text-xs font-medium capitalize text-zinc-500">{weekdayFormatter.format(day)}</span><span className="text-lg font-semibold text-zinc-950">{day.getDate()}</span></span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{items.length}</span>
            </button>
            <div className="mt-3 grid gap-2">{items.map((event) => <EventOverviewCard key={event._id} event={event} />)}</div>
            {!items.length ? <button type="button" onClick={() => onSelectDate(day)} className="mt-3 flex min-h-24 w-full items-center justify-center rounded-xl border border-dashed border-zinc-200 px-3 text-center text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900">Sin eventos<br />Ver horarios libres</button> : null}
          </section>;
        })}
      </div>
    </div>
  </section>;
}

function AvailabilityMonth({ date, events, onSelectDate }: { date: Date; events: Event[]; onSelectDate: (date: Date) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
    <header className="border-b border-zinc-200 px-4 py-4">
      <h2 className="font-semibold text-zinc-950">Eventos del mes</h2>
      <p className="mt-1 text-sm text-zinc-500">Los eventos siguen visibles aunque su horario ya haya finalizado. Elegí un día para abrir su disponibilidad.</p>
    </header>
    <div className="overflow-x-auto">
      <div className="min-w-[840px] lg:min-w-0">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-semibold text-zinc-500">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => <div key={label} className="px-2 py-3">{label}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {monthDays(date).map((day) => {
            const items = events.filter((event) => eventDateKey(event) === dateKey(day));
            const outside = day.getMonth() !== date.getMonth();
            return <section key={dateKey(day)} className={`min-h-44 border-b border-r border-zinc-200 p-2 ${outside ? 'bg-zinc-50/70' : 'bg-white'} ${sameDay(day, new Date()) ? 'ring-2 ring-inset ring-amber-600' : ''}`}>
              <button type="button" onClick={() => onSelectDate(day)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-1.5 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500/20">
                <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${outside ? 'text-zinc-500' : 'text-zinc-950'}`}>{day.getDate()}</span>
                {items.length ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{items.length}</span> : null}
              </button>
              <div className="mt-1 grid gap-1.5">{items.slice(0, 3).map((event) => <EventOverviewCard key={event._id} event={event} compact />)}</div>
              {items.length > 3 ? <button type="button" onClick={() => onSelectDate(day)} className="mt-1 min-h-9 w-full rounded-lg text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950">Ver {items.length - 3} más</button> : null}
              {!items.length && !outside ? <button type="button" onClick={() => onSelectDate(day)} className="mt-2 min-h-10 w-full rounded-lg text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950">Ver disponibilidad</button> : null}
            </section>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

export function EventAvailabilityBoard({ date, view, events, salons, loading, canCreateEvents, canCreateQuotes, selectedSlot, onSelectSlot, onSelectDate, onCreateEvent }: Props) {
  const visibleEvents = events.filter((event) => !ignoredStatuses.has(event.status) && eventDateKey(event));
  if (loading) return <div className="grid min-h-80 place-items-center rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-500 shadow-sm">Cargando disponibilidad…</div>;
  if (view === 'week') return <AvailabilityWeek date={date} events={visibleEvents} onSelectDate={onSelectDate} />;
  if (view === 'month') return <AvailabilityMonth date={date} events={visibleEvents} onSelectDate={onSelectDate} />;

  const consideredEvents = visibleEvents.filter((event) => eventInterval(event, date));
  const activeEvents = consideredEvents.filter((event) => {
    const interval = eventInterval(event, date)!;
    return interval.start < END_MINUTES && START_MINUTES < interval.end;
  });
  const canCreate = canCreateEvents || canCreateQuotes;
  const slots = Array.from({ length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES }, (_, index) => START_MINUTES + index * SLOT_MINUTES);
  const hours = Array.from({ length: (END_MINUTES - START_MINUTES) / 60 + 1 }, (_, index) => START_MINUTES + index * 60);
  const minimumWidth = Math.max(760, 88 + salons.length * 250);
  return <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold capitalize text-zinc-950">Disponibilidad del {dayFormatter.format(date)}</h2>
        <p className="mt-1 text-sm text-zinc-500">La grilla representa el día civil completo, de 00:00 a 24:00. Solo los espacios vacíos abren acciones de carga.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-zinc-600">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-900" />Reservado / confirmado</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100" />Posibilidad</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-zinc-300 bg-white" />Disponible</span>
      </div>
    </header>

    {!salons.length ? <div className="grid min-h-80 place-items-center px-6 text-center text-sm text-zinc-500">No hay salones disponibles para mostrar.</div> : <div className="max-h-[72dvh] overflow-auto">
      <div style={{ minWidth: minimumWidth }}>
        <div className="sticky top-0 z-30 grid border-b border-zinc-200 bg-zinc-50/95 shadow-sm backdrop-blur" style={{ gridTemplateColumns: `88px repeat(${salons.length}, minmax(250px, 1fr))` }}>
          <div className="sticky left-0 z-40 flex items-center border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Horario</div>
          {salons.map((salon) => {
            const salonEvents = activeEvents.filter((event) => salonId(event) === salon._id);
            const lockedCount = salonEvents.filter((event) => lockedStatuses.has(event.status)).length;
            return <div key={salon._id} className="border-r border-zinc-200 px-4 py-3 last:border-r-0">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-zinc-950">{salon.name}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 shadow-sm">{salonEvents.length}</span></div>
              <p className="mt-1 text-xs text-zinc-500">{lockedCount ? `${lockedCount} horario${lockedCount === 1 ? '' : 's'} bloqueado${lockedCount === 1 ? '' : 's'}` : 'Sin reservas firmes'}</p>
            </div>;
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: `88px repeat(${salons.length}, minmax(250px, 1fr))` }}>
          <div className="sticky left-0 z-20 border-r border-zinc-200 bg-white" style={{ height: TIMELINE_HEIGHT }}>
            {hours.map((minute, index) => <span key={minute} className="absolute right-3 -translate-y-1/2 text-xs font-medium tabular-nums text-zinc-600" style={{ top: index * HOUR_HEIGHT }}>{minute === 1440 ? '24:00' : formatMinutes(minute)}</span>)}
          </div>
          {salons.map((salon) => {
            const salonEvents = activeEvents.filter((event) => salonId(event) === salon._id);
            const positioned = layoutEvents(salonEvents, date);
            const untimed = salonEvents.filter((event) => eventInterval(event, date)?.untimed);
            const salonConsideredEvents = consideredEvents.filter((event) => salonId(event) === salon._id);
            return <div key={salon._id} className="relative border-r border-zinc-200 bg-white last:border-r-0" style={{ height: TIMELINE_HEIGHT }}>
              <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to bottom, rgb(228 228 231) 1px, transparent 1px)', backgroundSize: `100% ${HOUR_HEIGHT}px` }} />
              <div className="absolute inset-0">
                {slots.map((start) => {
                  const end = start + 4 * 60;
                  const blocked = !canCreate || slotIsBlocked(salonConsideredEvents, start, end, date);
                  const slotDate = date;
                  const slot: AvailabilitySlot = { date: dateKey(slotDate), salonId: salon._id, salonName: salon.name, startTime: formatMinutes(start), endTime: formatMinutes(end) };
                  return <button key={start} type="button" disabled={blocked} onClick={() => onSelectSlot(slot)} aria-label={blocked ? `${salon.name}, ${formatMinutes(start)}, no disponible` : `Seleccionar ${salon.name} el ${dateKey(slotDate)} a las ${formatMinutes(start)}`} className="group absolute left-0 right-0 border-b border-dashed border-zinc-100 text-left outline-none transition hover:bg-emerald-50/60 focus-visible:z-20 focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:border-solid disabled:border-zinc-200 disabled:bg-zinc-100/70" style={{ top: ((start - START_MINUTES) / 60) * HOUR_HEIGHT, height: (SLOT_MINUTES / 60) * HOUR_HEIGHT }}>
                    {!blocked ? <><span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-[11px] font-semibold text-emerald-700 md:hidden">Elegir horario</span><span className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[11px] font-semibold text-emerald-700 md:group-hover:flex md:group-focus-visible:flex"><Plus className="h-3 w-3" />Elegir horario</span></> : null}
                  </button>;
                })}
              </div>

              {untimed.map((event) => {
                const locked = lockedStatuses.has(event.status);
                const interval = eventInterval(event, date)!;
                const top = ((Math.max(interval.start, START_MINUTES) - START_MINUTES) / 60) * HOUR_HEIGHT + 6;
                return <Link key={event._id} href={`/admin/events/${event._id}`} className={`absolute left-2 right-2 z-20 rounded-xl border px-3 py-2 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500/30 ${locked ? 'border-zinc-800 bg-zinc-900 text-white' : 'border-amber-300 bg-amber-100 text-amber-950'}`} style={{ top }}>
                  <span className="block truncate text-xs font-semibold">{event.eventName || event.eventType || 'Evento'}</span>
                  <span className="mt-1 block text-[11px] opacity-75">Sin horario · {locked ? 'bloquea su día civil' : 'posibilidad'}</span>
                </Link>;
              })}

              {positioned.map(({ event, start, end, lane, lanes }) => {
                const locked = lockedStatuses.has(event.status);
                const visibleStart = Math.max(start, START_MINUTES);
                const visibleEnd = Math.min(end, END_MINUTES);
                if (visibleEnd <= visibleStart) return null;
                const gap = 6;
                const width = `calc(${100 / lanes}% - ${gap + gap / lanes}px)`;
                const left = `calc(${(lane * 100) / lanes}% + ${gap}px)`;
                const top = ((visibleStart - START_MINUTES) / 60) * HOUR_HEIGHT + 2;
                const height = Math.max(46, ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT - 4);
                const timeLabel = start < START_MINUTES ? `Continúa hasta ${event.endTime}` : end > END_MINUTES ? `${event.startTime}–${event.endTime} · continúa` : `${event.startTime}–${event.endTime}`;
                return <Link key={event._id} href={`/admin/events/${event._id}`} className={`absolute z-10 overflow-hidden rounded-xl border px-2.5 py-2 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500/30 ${locked ? 'border-zinc-800 bg-zinc-900 text-white' : 'border-amber-300 bg-amber-100 text-amber-950'}`} style={{ top, height, left, width }}>
                  <span className="block truncate text-xs font-semibold">{event.eventName || event.eventType || 'Evento'}</span>
                  <span className="mt-1 block truncate text-[11px] font-medium tabular-nums opacity-80">{timeLabel}</span>
                  {height >= 70 ? <span className="mt-1 block truncate text-[10px] opacity-70">{displayLabel(eventStatusLabels, event.status)}</span> : null}
                </Link>;
              })}
            </div>;
          })}
        </div>
      </div>
    </div>}

    {selectedSlot ? <aside className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-6 sm:w-[460px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="flex items-center gap-2 font-semibold text-zinc-950"><Check className="h-4 w-4 text-emerald-600" />Horario vacío seleccionado</p><p className="mt-1 text-sm leading-5 text-zinc-600">{selectedSlotLabel(selectedSlot)}</p></div>
        <button type="button" onClick={() => onSelectSlot(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950" aria-label="Cerrar selección"><X className="h-4 w-4" /></button>
      </div>
      <div className={`mt-4 grid gap-2 ${canCreateEvents && canCreateQuotes ? 'sm:grid-cols-2' : ''}`}>
        {canCreateQuotes ? <Link href={quoteHref(selectedSlot)} className="inline-flex items-center justify-center rounded-xl border border-transparent bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-zinc-500/30"><ReceiptText className="mr-2 h-4 w-4" />Crear presupuesto</Link> : null}
        {canCreateEvents ? <Button type="button" variant="secondary" onClick={() => onCreateEvent(selectedSlot)}><CalendarPlus className="mr-2 h-4 w-4" />Cargar evento</Button> : null}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-500"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Se proponen 4 horas. Los formularios mantienen sus validaciones y permiten ajustar el horario.</p>
    </aside> : null}
  </section>;
}
