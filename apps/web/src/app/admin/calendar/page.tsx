'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Handshake,
  Info,
  Lock,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Share2,
  Sparkles,
  StickyNote,
  Trash2,
  Truck,
  UserRound,
  Users,
  XCircle,
  type LucideIcon
} from 'lucide-react';
import { Permission } from '@mym/shared';
import { api } from '@/lib/api';
import { eventStatusLabels } from '@/lib/display-labels';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { userCanAccess } from '@/lib/admin-permissions';
import { useSession } from '@/components/session-provider';
import type { Event, Salon } from '@/features/quotes/types';

type CalendarView = 'day' | 'week' | 'month' | 'year';
type CalendarItemType = 'event' | 'alert' | 'reminder' | 'note' | 'task' | 'payment_window' | 'meeting';
type CalendarSourceFilter = 'all' | 'events' | 'alerts' | 'notes' | 'reminders' | 'tasks' | 'payments' | 'meetings';
type Priority = 'low' | 'normal' | 'high' | 'critical';
type CalendarFilters = { query: string; status: string; salonId: string; source: CalendarSourceFilter; priority: '' | Priority; notifications: 'all' | 'with' | 'without' };
type ListResponse = { items?: Event[] };
type LinkedEntity = { _id: string; fullName?: string; firstName?: string; lastName?: string; name?: string; username?: string; email?: string; phone?: string; quoteNumber?: string; contractNumber?: string; paymentNumber?: string; businessName?: string; contactPerson?: string; eventName?: string; eventType?: string };
type CalendarItem = {
  _id: string;
  type: CalendarItemType;
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  status: string;
  priority?: Priority;
  visibility?: 'private' | 'shared';
  salonId?: string | Salon;
  assignedToUserId?: string | LinkedEntity;
  leadId?: string | LinkedEntity;
  customerId?: string | LinkedEntity;
  eventId?: string | LinkedEntity;
  quoteId?: string | LinkedEntity;
  contractId?: string | LinkedEntity;
  paymentId?: string | LinkedEntity;
  supplierId?: string | LinkedEntity;
  createdBy?: string | LinkedEntity;
  notification?: { enabled?: boolean; channels?: string[]; offsetValue?: number; offsetUnit?: string; status?: string };
};
type CalendarItemResponse = { items?: CalendarItem[] };
type OptionResponse<T> = { items?: T[]; users?: T[]; leads?: T[]; salons?: T[]; suppliers?: T[] };
type CalendarEntry = {
  id: string;
  source: 'event' | 'calendar-item';
  type: CalendarItemType;
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date;
  allDay?: boolean;
  status: string;
  priority: Priority;
  visibility?: 'private' | 'shared';
  salonName: string;
  href?: string;
  notification?: CalendarItem['notification'];
  item?: CalendarItem;
  event?: Event;
};
type CalendarForm = {
  type: CalendarItemType;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  priority: Priority;
  visibility: 'private' | 'shared';
  salonId: string;
  assignedToUserId: string;
  leadId: string;
  customerId: string;
  eventId: string;
  quoteId: string;
  contractId: string;
  paymentId: string;
  supplierId: string;
  notify: boolean;
  offsetValue: number;
  offsetUnit: 'minutes' | 'hours' | 'days' | 'weeks';
};

const viewLabels: Record<CalendarView, string> = { day: 'Dia', week: 'Semana', month: 'Mes', year: 'Año' };
const sourceTypeByFilter: Partial<Record<CalendarSourceFilter, CalendarItemType>> = { alerts: 'alert', notes: 'note', reminders: 'reminder', tasks: 'task', payments: 'payment_window', meetings: 'meeting' };
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit' });
const longDateFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const fullDateTimeFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
const eventStatusOptions = { ...eventStatusLabels, pending: 'Pendiente', scheduled: 'Programado', done: 'Completado', cancelled: 'Cancelado' };
const typeMeta: Record<CalendarItemType, { label: string; icon: LucideIcon; tone: string; dot: string; badge: string }> = {
  event: { label: 'Evento', icon: Sparkles, tone: 'border-violet-200 bg-violet-50 text-violet-800', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  alert: { label: 'Alerta', icon: AlertTriangle, tone: 'border-rose-200 bg-rose-50 text-rose-800', dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  reminder: { label: 'Recordatorio', icon: Bell, tone: 'border-sky-200 bg-sky-50 text-sky-800', dot: 'bg-sky-500', badge: 'bg-sky-100 text-sky-700' },
  note: { label: 'Nota', icon: StickyNote, tone: 'border-amber-200 bg-amber-50 text-amber-900', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  task: { label: 'Tarea', icon: CheckSquare, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  payment_window: { label: 'Rango de pago', icon: CircleDollarSign, tone: 'border-indigo-200 bg-indigo-50 text-indigo-800', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  meeting: { label: 'Reunión', icon: Handshake, tone: 'border-teal-200 bg-teal-50 text-teal-800', dot: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' }
};
const priorityMeta: Record<Priority, { label: string; className: string; rail: string }> = {
  low: { label: 'Baja', className: 'bg-zinc-100 text-zinc-600', rail: 'border-l-zinc-300' },
  normal: { label: 'Normal', className: 'bg-blue-50 text-blue-700', rail: 'border-l-blue-400' },
  high: { label: 'Alta', className: 'bg-orange-50 text-orange-700', rail: 'border-l-orange-400' },
  critical: { label: 'Critica', className: 'bg-rose-50 text-rose-700', rail: 'border-l-rose-500' }
};
const statusTone: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  quoted: 'bg-amber-50 text-amber-800',
  contract_draft: 'bg-indigo-50 text-indigo-700',
  deposit_pending: 'bg-orange-50 text-orange-700',
  reserved: 'bg-sky-50 text-sky-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-800',
  scheduled: 'bg-sky-50 text-sky-700',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
  lost: 'bg-zinc-100 text-zinc-500'
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addYears(date: Date, amount: number) {
  return new Date(date.getFullYear() + amount, 0, 1);
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return startOfDay(addDays(date, 1 - day));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return endOfDay(new Date(date.getFullYear(), 11, 31));
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventDate(event: Event) {
  if (!event.eventDate) return undefined;
  // `event.eventDate` llega normalizado a medianoche UTC (`civilDateInput`, ver
  // apps/api/src/utils/argentina-date.ts) — parsearlo directo con `new Date(...)` y comparar con
  // `sameDay`/getters locales (como hace el resto de esta página) corre el día para atrás en
  // cualquier huso horario negativo (Argentina incluida): un evento el 16 aparecía en la celda
  // del 15. Se reconstruye la fecha a partir de los componentes Y-M-D del string para que los
  // getters locales devuelvan el día civil correcto sin importar el huso del navegador.
  const match = String(event.eventDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(event.eventDate);
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function combineDateTime(date: string, time: string, allDay = false) {
  return allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time || '09:00'}:00`);
}

function entityName(value: unknown) {
  if (!value || typeof value === 'string') return 'General';
  const item = value as LinkedEntity & { contactName?: string };
  return item.fullName || item.name || item.businessName || item.eventName || item.quoteNumber || item.contractNumber || item.paymentNumber || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.username || item.contactName || item.email || item.phone || item.eventType || item.contactPerson || 'General';
}

function entityId(value: unknown) {
  return typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
}

function optionLabel(value: LinkedEntity) {
  return value.fullName || value.name || value.businessName || value.eventName || value.quoteNumber || value.contractNumber || value.paymentNumber || [value.firstName, value.lastName].filter(Boolean).join(' ') || value.username || value.email || value.phone || 'Sin nombre';
}

function optionSubtitle(value: LinkedEntity) {
  return [value.email, value.phone, value.eventType, value.contactPerson].filter(Boolean).join(' · ');
}

function optionItems(response: OptionResponse<LinkedEntity>) {
  return response.items ?? response.users ?? response.leads ?? response.suppliers ?? [];
}

function relationSearchPath(endpoint: string, search: string) {
  const [path, query = ''] = endpoint.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('limit')) params.set('limit', '50');
  if (search.trim()) params.set('search', search.trim());
  else params.delete('search');
  return `${path}?${params.toString()}`;
}

function rangeFor(view: CalendarView, date: Date) {
  if (view === 'day') return { start: startOfDay(date), end: endOfDay(date) };
  if (view === 'week') return { start: startOfWeek(date), end: endOfDay(addDays(startOfWeek(date), 6)) };
  if (view === 'year') return { start: startOfYear(date), end: endOfYear(date) };
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

function titleFor(view: CalendarView, date: Date) {
  if (view === 'day') return longDateFormatter.format(date);
  if (view === 'week') {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${dayFormatter.format(start)} - ${dayFormatter.format(end)}`;
  }
  if (view === 'year') return String(date.getFullYear());
  return monthFormatter.format(date);
}

function moveDate(view: CalendarView, date: Date, direction: number) {
  if (view === 'day') return addDays(date, direction);
  if (view === 'week') return addDays(date, direction * 7);
  if (view === 'year') return addYears(date, direction);
  return addMonths(date, direction);
}

function monthDays(date: Date) {
  const firstGridDay = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index));
}

function weekDays(date: Date) {
  const firstDay = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
}

function entriesForDay(entries: CalendarEntry[], day: Date) {
  return entries.filter((entry) => sameDay(entry.startAt, day));
}

function entryTime(entry: CalendarEntry) {
  if (entry.allDay) return 'Todo el dia';
  return timeFormatter.format(entry.startAt);
}

function entryDateRange(entry: CalendarEntry) {
  if (entry.allDay) return longDateFormatter.format(entry.startAt);
  if (entry.endAt) return `${fullDateTimeFormatter.format(entry.startAt)} - ${timeFormatter.format(entry.endAt)}`;
  return fullDateTimeFormatter.format(entry.startAt);
}

function reminderChannelLabel(channels?: string[]) {
  const supportedChannels = (channels ?? []).filter((channel) => channel === 'system' || channel === 'email');
  return (supportedChannels.length ? supportedChannels : ['system']).join(', ');
}

function emptyForm(date = new Date(), type: CalendarItemType = 'reminder'): CalendarForm {
  return {
    type,
    title: '',
    description: '',
    date: toDateInputValue(date),
    startTime: toTimeInputValue(date.getHours() === 0 && date.getMinutes() === 0 ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0) : date),
    endTime: '',
    allDay: false,
    priority: 'normal',
    visibility: 'private',
    salonId: '',
    assignedToUserId: '',
    leadId: '',
    customerId: '',
    eventId: '',
    quoteId: '',
    contractId: '',
    paymentId: '',
    supplierId: '',
    notify: true,
    offsetValue: 1,
    offsetUnit: 'days'
  };
}

function formFromEntry(entry: CalendarEntry): CalendarForm {
  return {
    type: entry.type,
    title: entry.title,
    description: entry.description ?? '',
    date: toDateInputValue(entry.startAt),
    startTime: toTimeInputValue(entry.startAt),
    endTime: entry.endAt ? toTimeInputValue(entry.endAt) : '',
    allDay: Boolean(entry.allDay),
    priority: entry.priority,
    visibility: entry.item?.visibility ?? 'private',
    salonId: typeof entry.item?.salonId === 'string' ? entry.item.salonId : entry.item?.salonId?._id ?? '',
    assignedToUserId: entityId(entry.item?.assignedToUserId),
    leadId: entityId(entry.item?.leadId),
    customerId: entityId(entry.item?.customerId),
    eventId: entityId(entry.item?.eventId),
    quoteId: entityId(entry.item?.quoteId),
    contractId: entityId(entry.item?.contractId),
    paymentId: entityId(entry.item?.paymentId),
    supplierId: entityId(entry.item?.supplierId),
    notify: Boolean(entry.notification?.enabled),
    offsetValue: entry.notification?.offsetValue ?? 1,
    offsetUnit: (entry.notification?.offsetUnit as CalendarForm['offsetUnit']) ?? 'days'
  };
}

function TypeBadge({ type }: { type: CalendarItemType }) {
  const meta = typeMeta[type];
  const Icon = meta.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span>;
}

function EntryCard({ entry, compact = false, onOpen }: { entry: CalendarEntry; compact?: boolean; onOpen: (entry: CalendarEntry) => void }) {
  const meta = typeMeta[entry.type];
  const priority = priorityMeta[entry.priority];
  const Icon = meta.icon;
  return <button type="button" onClick={() => onOpen(entry)} className={`group block w-full rounded-lg border border-l-4 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${meta.tone} ${priority.rail}`}>
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate text-xs font-semibold">{entry.title}</span>
      {entry.notification?.enabled ? <Bell className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
    </span>
    {!compact ? <span className="mt-1 block truncate text-[11px] opacity-80">{entryTime(entry)} · {entry.salonName}</span> : null}
  </button>;
}

function Metric({ label, value, icon: Icon, tone = 'bg-zinc-100 text-zinc-700' }: { label: string; value: string | number; icon: LucideIcon; tone?: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p>
  </div>;
}

export default function CalendarPage() {
  const { showToast } = useToast();
  const { user } = useSession();
  const [view, setView] = useState<CalendarView>('month');
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [users, setUsers] = useState<LinkedEntity[]>([]);
  const [leads, setLeads] = useState<LinkedEntity[]>([]);
  const [customers, setCustomers] = useState<LinkedEntity[]>([]);
  const [linkEvents, setLinkEvents] = useState<LinkedEntity[]>([]);
  const [quotes, setQuotes] = useState<LinkedEntity[]>([]);
  const [contracts, setContracts] = useState<LinkedEntity[]>([]);
  const [payments, setPayments] = useState<LinkedEntity[]>([]);
  const [suppliers, setSuppliers] = useState<LinkedEntity[]>([]);
  const [filters, setFilters] = useState<CalendarFilters>({ query: '', status: '', salonId: '', source: 'all', priority: '', notifications: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<CalendarForm>(() => emptyForm());
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [dayStackDate, setDayStackDate] = useState<Date | null>(null);
  const canReadEvents = userCanAccess(user, [Permission.EVENTS_READ]);
  const currentUserId = user?._id ?? user?.id ?? '';

  const visibleRange = useMemo(() => rangeFor(view, focusDate), [focusDate, view]);
  const canShowEvents = filters.source === 'all' || filters.source === 'events';
  const canShowItems = filters.source !== 'events';

  const safeGet = useCallback(async <T,>(path: string, fallback: T): Promise<T> => {
    try {
      return await api.get<T>(path);
    } catch {
      return fallback;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: '1',
        limit: '200',
        sortBy: 'eventDate',
        sortOrder: 'asc',
        dateFrom: visibleRange.start.toISOString(),
        dateTo: visibleRange.end.toISOString(),
        search: filters.query
      });
      if (filters.status) query.set('status', filters.status);
      if (filters.salonId) query.set('salonId', filters.salonId);
      const itemQuery = new URLSearchParams(query);
      const filteredType = sourceTypeByFilter[filters.source];
      if (filteredType) itemQuery.set('type', filteredType);
      const [eventsResponse, itemsResponse, salonsResponse] = await Promise.all([
        canReadEvents && canShowEvents ? api.get<ListResponse>(`/events?${query.toString()}`) : Promise.resolve({ items: [] }),
        canShowItems ? api.get<CalendarItemResponse>(`/calendar-items?${itemQuery.toString()}`) : Promise.resolve({ items: [] }),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons')
      ]);
      setEvents(eventsResponse.items ?? []);
      setCalendarItems(itemsResponse.items ?? []);
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el calendario.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [canReadEvents, canShowEvents, canShowItems, filters.query, filters.salonId, filters.source, filters.status, showToast, visibleRange.end, visibleRange.start]);

  const loadOptions = useCallback(async () => {
    const [usersResponse, leadsResponse, customersResponse, eventsResponse, quotesResponse, contractsResponse, paymentsResponse, suppliersResponse] = await Promise.all([
      safeGet<OptionResponse<LinkedEntity>>('/users/options?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/leads?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/customers?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/events?limit=100&sortBy=eventDate&sortOrder=desc', {}),
      safeGet<OptionResponse<LinkedEntity>>('/quotes?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/contracts?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/payments/options?limit=100', {}),
      safeGet<OptionResponse<LinkedEntity>>('/suppliers/options?active=true', {})
    ]);
    setUsers(usersResponse.items ?? usersResponse.users ?? []);
    setLeads(leadsResponse.items ?? leadsResponse.leads ?? []);
    setCustomers(customersResponse.items ?? []);
    setLinkEvents(eventsResponse.items ?? []);
    setQuotes(quotesResponse.items ?? []);
    setContracts(contractsResponse.items ?? []);
    setPayments(paymentsResponse.items ?? []);
    setSuppliers(suppliersResponse.items ?? suppliersResponse.suppliers ?? []);
  }, [safeGet]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, query: searchInput.trim() })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const entries = useMemo<CalendarEntry[]>(() => {
    const eventEntries: CalendarEntry[] = canShowEvents ? events.filter((event) => {
      const date = eventDate(event);
      return date && date >= visibleRange.start && date <= visibleRange.end;
    }).map((event) => ({
      id: event._id,
      source: 'event' as const,
      type: 'event' as const,
      title: event.eventName || event.eventType || 'Evento',
      description: event.notes,
      startAt: eventDate(event)!,
      endAt: undefined,
      allDay: false,
      status: event.status,
      priority: event.status === 'deposit_pending' ? 'high' as const : 'normal' as const,
      visibility: 'shared' as const,
      salonName: entityName(event.salonId),
      href: `/admin/events/${event._id}`,
      event
    })) : [];
    const itemEntries: CalendarEntry[] = canShowItems ? calendarItems.map((item) => ({
      id: item._id,
      source: 'calendar-item' as const,
      type: item.type,
      title: item.title,
      description: item.description,
      startAt: new Date(item.startAt),
      endAt: item.endAt ? new Date(item.endAt) : undefined,
      allDay: item.allDay,
      status: item.status,
      priority: item.priority ?? 'normal',
      visibility: item.visibility ?? 'private',
      salonName: entityName(item.salonId),
      notification: item.notification,
      item
    })) : [];
    return [...eventEntries, ...itemEntries]
      .filter((entry) => !filters.status || entry.status === filters.status)
      .filter((entry) => !filters.priority || entry.priority === filters.priority)
      .filter((entry) => filters.notifications === 'all' || (filters.notifications === 'with' ? entry.notification?.enabled : !entry.notification?.enabled))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [calendarItems, canShowEvents, canShowItems, events, filters.notifications, filters.priority, filters.status, visibleRange.end, visibleRange.start]);

  const selectedDayEntries = useMemo(() => entriesForDay(entries, focusDate), [entries, focusDate]);
  const upcomingEntries = useMemo(() => entries.filter((entry) => entry.startAt >= startOfDay(new Date())).slice(0, 8), [entries]);
  const criticalCount = entries.filter((entry) => entry.priority === 'critical' || entry.status === 'deposit_pending').length;
  const notificationCount = entries.filter((entry) => entry.notification?.enabled).length;
  const doneCount = entries.filter((entry) => entry.status === 'confirmed' || entry.status === 'done').length;
  const dayStackEntries = useMemo(() => dayStackDate ? entriesForDay(entries, dayStackDate) : [], [dayStackDate, entries]);

  const updateFilters = (changes: Partial<CalendarFilters>) => setFilters((current) => ({ ...current, ...changes }));
  const openCreate = (date: Date, hour?: number) => {
    const nextDate = hour === undefined ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0);
    setFocusDate(date);
    setForm(emptyForm(nextDate, sourceTypeByFilter[filters.source] ?? 'reminder'));
    setFormMode('create');
    setEditingId('');
    setFormOpen(true);
  };
  const openEdit = (entry: CalendarEntry) => {
    if (!entry.item || entityId(entry.item.createdBy) !== currentUserId) return;
    setSelectedEntry(null);
    setForm(formFromEntry(entry));
    setEditingId(entry.id);
    setFormMode('edit');
    setFormOpen(true);
  };
  const saveCalendarItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const startAt = combineDateTime(form.date, form.startTime, form.allDay);
      const endAt = form.endTime ? combineDateTime(form.date, form.endTime, false) : undefined;
      const payload = {
        type: form.type,
        title: form.title,
        description: form.description,
        startAt,
        endAt,
        allDay: form.allDay,
        priority: form.priority,
        visibility: form.visibility,
        salonId: form.salonId || undefined,
        assignedToUserId: form.assignedToUserId || undefined,
        leadId: form.leadId || undefined,
        customerId: form.customerId || undefined,
        eventId: form.eventId || undefined,
        quoteId: form.quoteId || undefined,
        contractId: form.contractId || undefined,
        paymentId: form.paymentId || undefined,
        supplierId: form.supplierId || undefined,
        notification: { enabled: form.notify, channels: ['system', 'email'], offsetValue: form.offsetValue, offsetUnit: form.offsetUnit, status: form.notify ? 'scheduled' : 'pending' }
      };
      if (formMode === 'edit' && editingId) await api.patch(`/calendar-items/${editingId}`, payload);
      else await api.post('/calendar-items', payload);
      setFormOpen(false);
      await load();
      showToast({ message: formMode === 'edit' ? 'Item actualizado.' : 'Item de calendario creado.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el item.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const updateCalendarItem = async (entry: CalendarEntry, patch: Record<string, unknown>, message: string) => {
    if (!entry.item || entityId(entry.item.createdBy) !== currentUserId) return;
    try {
      await api.patch(`/calendar-items/${entry.id}`, patch);
      setSelectedEntry(null);
      await load();
      showToast({ message, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el item.', variant: 'error' });
    }
  };
  const deleteCalendarItem = async (entry: CalendarEntry) => {
    if (!entry.item || entityId(entry.item.createdBy) !== currentUserId) return;
    try {
      await api.delete(`/calendar-items/${entry.id}`);
      setSelectedEntry(null);
      await load();
      showToast({ message: 'Item eliminado.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar el item.', variant: 'error' });
    }
  };

  return <section className="space-y-6">
    <PageHeader title="Calendario" description="Agenda premium para eventos, alertas, notas, tareas, recordatorios y pagos." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setFocusDate(new Date())}>Hoy</Button><Button onClick={() => openCreate(focusDate)}><Plus className="mr-2 h-4 w-4" />Crear item</Button><Link href="/admin/events"><Button variant="secondary"><CalendarDays className="mr-2 h-4 w-4" />Eventos</Button></Link></div>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Agenda visible" value={entries.length} icon={CalendarClock} tone="bg-zinc-950 text-white" />
      <Metric label="Con aviso" value={notificationCount} icon={Bell} tone="bg-sky-50 text-sky-700" />
      <Metric label="Críticos" value={criticalCount} icon={AlertTriangle} tone="bg-rose-50 text-rose-700" />
      <Metric label="Resueltos / confirmados" value={doneCount} icon={BadgeCheck} tone="bg-emerald-50 text-emerald-700" />
    </div>

    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-10 w-10 px-0" onClick={() => setFocusDate((current) => moveDate(view, current, -1))} aria-label="Periodo anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="secondary" className="h-10 w-10 px-0" onClick={() => setFocusDate((current) => moveDate(view, current, 1))} aria-label="Periodo siguiente"><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="min-w-0 px-2 text-xl font-semibold capitalize text-zinc-950">{titleFor(view, focusDate)}</h2>
        </div>
        <div className="grid grid-cols-4 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          {(Object.keys(viewLabels) as CalendarView[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${view === item ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'}`}>{viewLabels[item]}</button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_repeat(5,minmax(130px,170px))]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por evento, alerta, nota, tarea o reunión" />
        </div>
        <Select aria-label="Filtrar origen" value={filters.source} onChange={(event) => updateFilters({ source: event.target.value as CalendarSourceFilter })} className="h-11">
          <option value="all">Todo</option><option value="events">Eventos</option><option value="alerts">Alertas</option><option value="notes">Notas</option><option value="reminders">Recordatorios</option><option value="tasks">Tareas</option><option value="payments">Pagos</option><option value="meetings">Reuniones</option>
        </Select>
        <Select aria-label="Filtrar estado" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })} className="h-11">
          <option value="">Estados</option>{Object.entries(eventStatusOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select aria-label="Filtrar prioridad" value={filters.priority} onChange={(event) => updateFilters({ priority: event.target.value as CalendarFilters['priority'] })} className="h-11">
          <option value="">Prioridad</option>{Object.entries(priorityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </Select>
        <Select aria-label="Filtrar salon" value={filters.salonId} onChange={(event) => updateFilters({ salonId: event.target.value })} className="h-11">
          <option value="">Salones</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
        </Select>
        <Select aria-label="Filtrar avisos" value={filters.notifications} onChange={(event) => updateFilters({ notifications: event.target.value as CalendarFilters['notifications'] })} className="h-11">
          <option value="all">Avisos</option><option value="with">Con aviso</option><option value="without">Sin aviso</option>
        </Select>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <CalendarSurface view={view} focusDate={focusDate} entries={entries} loading={loading} onSelectDate={setFocusDate} onCreate={openCreate} onOpenEntry={setSelectedEntry} onOpenDayStack={setDayStackDate} />
      </div>
      <aside className="space-y-4">
        <AgendaPanel title="Seleccionado" icon={CalendarDays} entries={selectedDayEntries} empty="Sin items para este dia." onOpen={setSelectedEntry} />
        <AgendaPanel title="Proximos" icon={Clock3} entries={upcomingEntries} empty="Sin próximos items en el rango." onOpen={setSelectedEntry} />
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><Filter className="h-4 w-4" />Lectura rápida</div>
          <div className="mt-3 grid gap-2">
            {(Object.keys(typeMeta) as CalendarItemType[]).map((type) => {
              const meta = typeMeta[type];
              const Icon = meta.icon;
              const count = entries.filter((entry) => entry.type === type).length;
              return <div key={type} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700"><span className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${meta.badge}`}><Icon className="h-4 w-4" /></span>{meta.label}</span><span className="font-semibold">{count}</span></div>;
            })}
          </div>
        </section>
      </aside>
    </div>

    <CalendarItemFormModal open={formOpen} mode={formMode} form={form} salons={salons} users={users} leads={leads} customers={customers} events={linkEvents} quotes={quotes} contracts={contracts} payments={payments} suppliers={suppliers} saving={saving} onClose={() => setFormOpen(false)} onSubmit={saveCalendarItem} onChange={setForm} />
    <EntryDetailModal entry={selectedEntry} currentUserId={currentUserId} onClose={() => setSelectedEntry(null)} onEdit={openEdit} onDelete={deleteCalendarItem} onPatch={updateCalendarItem} />
    <DayStackModal date={dayStackDate} entries={dayStackEntries} onClose={() => setDayStackDate(null)} onOpen={(entry) => { setDayStackDate(null); setSelectedEntry(entry); }} onCreate={(date) => { setDayStackDate(null); openCreate(date); }} />
  </section>;
}

function CalendarSurface({ view, focusDate, entries, loading, onSelectDate, onCreate, onOpenEntry, onOpenDayStack }: { view: CalendarView; focusDate: Date; entries: CalendarEntry[]; loading: boolean; onSelectDate: (date: Date) => void; onCreate: (date: Date, hour?: number) => void; onOpenEntry: (entry: CalendarEntry) => void; onOpenDayStack: (date: Date) => void }) {
  if (view === 'year') return <YearView focusDate={focusDate} entries={entries} onSelectDate={onSelectDate} />;
  if (view === 'week') return <WeekView focusDate={focusDate} entries={entries} onSelectDate={onSelectDate} onCreate={onCreate} onOpenEntry={onOpenEntry} />;
  if (view === 'day') return <DayView focusDate={focusDate} entries={entries} onCreate={onCreate} onOpenEntry={onOpenEntry} />;
  return <MonthView focusDate={focusDate} entries={entries} loading={loading} onSelectDate={onSelectDate} onCreate={onCreate} onOpenEntry={onOpenEntry} onOpenDayStack={onOpenDayStack} />;
}

function MonthView({ focusDate, entries, loading, onSelectDate, onCreate, onOpenEntry, onOpenDayStack }: { focusDate: Date; entries: CalendarEntry[]; loading: boolean; onSelectDate: (date: Date) => void; onCreate: (date: Date) => void; onOpenEntry: (entry: CalendarEntry) => void; onOpenDayStack: (date: Date) => void }) {
  const days = monthDays(focusDate);
  return <div className="overflow-hidden">
    <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-semibold text-zinc-500">
      {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((day) => <div key={day} className="px-2 py-3">{day}</div>)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-7">
      {days.map((day) => {
        const items = entriesForDay(entries, day);
        const outside = day.getMonth() !== focusDate.getMonth();
        const selected = sameDay(day, focusDate);
        return <div key={day.toISOString()} className={`min-h-36 border-b border-zinc-200 p-2 text-left transition sm:border-r ${outside ? 'bg-zinc-50/70 text-zinc-400' : 'bg-white text-zinc-950'} ${selected ? 'ring-2 ring-inset ring-zinc-950' : 'hover:bg-amber-50/40'}`}>
          <button type="button" onClick={() => { onSelectDate(day); onCreate(day); }} className="flex w-full items-center justify-between gap-2 rounded-lg text-left">
            <span className={`grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold ${sameDay(day, new Date()) ? 'bg-zinc-950 text-white' : ''}`}>{day.getDate()}</span>
            {items.length ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{items.length}</span> : null}
          </button>
          <div className="mt-2 grid max-h-28 gap-1 overflow-hidden">
            {items.slice(0, 4).map((entry) => <EntryCard key={`${entry.source}-${entry.id}`} entry={entry} compact onOpen={onOpenEntry} />)}
          </div>
          {items.length > 4 ? <button type="button" onClick={() => { onSelectDate(day); onOpenDayStack(day); }} className="mt-1 w-full rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-200">Ver {items.length - 4} más</button> : null}
        </div>;
      })}
    </div>
    {loading ? <div className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500">Cargando calendario...</div> : null}
  </div>;
}

function WeekView({ focusDate, entries, onSelectDate, onCreate, onOpenEntry }: { focusDate: Date; entries: CalendarEntry[]; onSelectDate: (date: Date) => void; onCreate: (date: Date) => void; onOpenEntry: (entry: CalendarEntry) => void }) {
  return <div className="grid gap-0 overflow-hidden md:grid-cols-7">
    {weekDays(focusDate).map((day) => {
      const items = entriesForDay(entries, day);
      return <section key={day.toISOString()} className={`min-h-80 border-b border-zinc-200 p-3 md:border-r md:border-b-0 ${sameDay(day, focusDate) ? 'bg-amber-50/40' : 'bg-white'}`}>
        <button type="button" onClick={() => { onSelectDate(day); onCreate(day); }} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-100">
          <span><span className="block text-xs font-medium capitalize text-zinc-500">{new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(day)}</span><span className="text-lg font-semibold text-zinc-950">{day.getDate()}</span></span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{items.length}</span>
        </button>
        <div className="mt-3 grid max-h-[520px] gap-2 overflow-y-auto pr-1">{items.map((entry) => <EntryCard key={`${entry.source}-${entry.id}`} entry={entry} onOpen={onOpenEntry} />)}</div>
      </section>;
    })}
  </div>;
}

function DayView({ focusDate, entries, onCreate, onOpenEntry }: { focusDate: Date; entries: CalendarEntry[]; onCreate: (date: Date, hour?: number) => void; onOpenEntry: (entry: CalendarEntry) => void }) {
  const items = entriesForDay(entries, focusDate);
  const hours = Array.from({ length: 15 }, (_, index) => index + 8);
  return <div className="divide-y divide-zinc-100">
    {items.filter((entry) => entry.allDay).length ? <div className="grid grid-cols-[72px_minmax(0,1fr)]"><div className="border-r border-zinc-100 px-3 py-3 text-xs font-medium text-zinc-400">Todo</div><div className="grid gap-2 p-3">{items.filter((entry) => entry.allDay).map((entry) => <EntryCard key={`${entry.source}-${entry.id}`} entry={entry} onOpen={onOpenEntry} />)}</div></div> : null}
    {hours.map((hour) => {
      const hourItems = items.filter((entry) => !entry.allDay && entry.startAt.getHours() === hour);
      return <div key={hour} className="grid min-h-20 grid-cols-[72px_minmax(0,1fr)]">
        <button type="button" onClick={() => onCreate(focusDate, hour)} className="border-r border-zinc-100 px-3 py-3 text-left text-xs font-medium text-zinc-400 transition hover:bg-zinc-50">{String(hour).padStart(2, '0')}:00</button>
        <div className="grid gap-2 p-3">{hourItems.map((entry) => <EntryCard key={`${entry.source}-${entry.id}`} entry={entry} onOpen={onOpenEntry} />)}</div>
      </div>;
    })}
  </div>;
}

function YearView({ focusDate, entries, onSelectDate }: { focusDate: Date; entries: CalendarEntry[]; onSelectDate: (date: Date) => void }) {
  const months = Array.from({ length: 12 }, (_, index) => new Date(focusDate.getFullYear(), index, 1));
  return <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
    {months.map((month) => {
      const count = entries.filter((entry) => entry.startAt.getFullYear() === month.getFullYear() && entry.startAt.getMonth() === month.getMonth()).length;
      return <button key={month.toISOString()} type="button" onClick={() => onSelectDate(month)} className="rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-400 hover:shadow-sm">
        <span className="flex items-center justify-between"><span className="font-semibold capitalize text-zinc-950">{new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(month)}</span><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{count}</span></span>
        <span className="mt-3 grid grid-cols-7 gap-1">{monthDays(month).slice(0, 35).map((day) => <span key={day.toISOString()} className={`h-6 rounded-md text-center text-[11px] leading-6 ${day.getMonth() === month.getMonth() ? entriesForDay(entries, day).length ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600' : 'text-zinc-300'}`}>{day.getDate()}</span>)}</span>
      </button>;
    })}
  </div>;
}

function AgendaPanel({ title, icon: Icon, entries, empty, onOpen }: { title: string; icon: LucideIcon; entries: CalendarEntry[]; empty: string; onOpen: (entry: CalendarEntry) => void }) {
  return <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><Icon className="h-4 w-4" />{title}</h2>
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">{entries.length}</span>
    </div>
    <div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
      {entries.map((entry) => <button type="button" key={`${entry.source}-${entry.id}`} onClick={() => onOpen(entry)} className={`rounded-xl border border-l-4 p-3 text-left transition hover:bg-zinc-50 ${priorityMeta[entry.priority].rail}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-950">{entry.title}</p><p className="mt-1 text-xs text-zinc-500">{entryTime(entry)} · {entry.salonName}</p></div>
          <TypeBadge type={entry.type} />
        </div>
      </button>)}
      {!entries.length ? <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">{empty}</p> : null}
    </div>
  </section>;
}

function relationLink(label: string, value: unknown, href: string, icon: LucideIcon) {
  const id = entityId(value);
  if (!id) return null;
  return { label, name: entityName(value), href: `${href}/${id}`, icon };
}

function relatedLinks(entry: CalendarEntry) {
  const item = entry.item;
  if (entry.event) {
    return [
      relationLink('Evento', entry.event, '/admin/events', CalendarDays),
      relationLink('Cliente', entry.event.customerId, '/admin/customers', UserRound),
      relationLink('Lead', entry.event.leadId ?? entry.event.sourceLeadId, '/admin/leads', Users),
      relationLink('Presupuesto', entry.event.sourceQuoteId ?? entry.event.quoteId, '/admin/quotes', ReceiptText)
    ].filter(Boolean) as Array<{ label: string; name: string; href: string; icon: LucideIcon }>;
  }
  return [
    relationLink('Usuario', item?.assignedToUserId, '/admin/users', Users),
    relationLink('Lead', item?.leadId, '/admin/leads', Users),
    relationLink('Cliente', item?.customerId, '/admin/customers', UserRound),
    relationLink('Evento', item?.eventId, '/admin/events', CalendarDays),
    relationLink('Proveedor', item?.supplierId, '/admin/suppliers', Truck),
    relationLink('Presupuesto', item?.quoteId, '/admin/quotes', ReceiptText),
    relationLink('Contrato', item?.contractId, '/admin/contracts', Info),
    relationLink('Pago', item?.paymentId, '/admin/payments', CircleDollarSign)
  ].filter(Boolean) as Array<{ label: string; name: string; href: string; icon: LucideIcon }>;
}

function SearchableRelationSelect({ label, value, options, placeholder, searchPlaceholder, searchEndpoint, onChange }: { label: string; value: string; options: LinkedEntity[]; placeholder: string; searchPlaceholder: string; searchEndpoint: string; onChange: (value: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteOptions, setRemoteOptions] = useState<LinkedEntity[]>(options);
  const [loading, setLoading] = useState(false);
  const selected = useMemo(() => [...options, ...remoteOptions].find((item) => item._id === value), [options, remoteOptions, value]);
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = searchEndpoint ? remoteOptions : options;
    if (!term || searchEndpoint) return source;
    return source.filter((item) => `${optionLabel(item)} ${optionSubtitle(item)}`.toLowerCase().includes(term));
  }, [options, query, remoteOptions, searchEndpoint]);
  const visibleOptions = filteredOptions.slice(0, 50);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (!searchEndpoint) {
      setRemoteOptions(options);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get<OptionResponse<LinkedEntity>>(relationSearchPath(searchEndpoint, query));
        if (!cancelled) setRemoteOptions(optionItems(response));
      } catch {
        if (!cancelled) setRemoteOptions(query.trim() ? [] : options);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, options, query, searchEndpoint]);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  return <div ref={containerRef} className="relative text-sm font-medium text-zinc-700" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
    <span>{label}</span>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="mt-1.5 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-900 shadow-sm outline-none transition hover:border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10">
      <span className={`min-w-0 truncate ${selected ? 'text-zinc-900' : 'text-zinc-400'}`}>{selected ? optionLabel(selected) : placeholder}</span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
    </button>
    {open ? <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
      <div className="border-b border-zinc-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input autoFocus className="h-10 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
        </div>
      </div>
      <div role="listbox" className="max-h-72 overflow-y-auto p-1">
        <button type="button" role="option" aria-selected={!value} onClick={() => selectValue('')} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-zinc-50 ${!value ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-600'}`}>
          <span>{placeholder}</span>
          {!value ? <CheckCircle2 className="h-4 w-4 text-zinc-900" /> : null}
        </button>
        {loading ? <p className="px-3 py-4 text-sm text-zinc-500">Buscando...</p> : visibleOptions.map((item) => {
          const subtitle = optionSubtitle(item);
          const active = item._id === value;
          return <button key={item._id} type="button" role="option" aria-selected={active} onClick={() => selectValue(item._id)} className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-zinc-50 ${active ? 'bg-zinc-100' : ''}`}>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-900">{optionLabel(item)}</span>{subtitle ? <span className="block truncate text-xs font-normal text-zinc-500">{subtitle}</span> : null}</span>
            {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-900" /> : null}
          </button>;
        })}
        {!loading && !visibleOptions.length ? <p className="px-3 py-4 text-sm text-zinc-500">Sin resultados para la búsqueda.</p> : null}
      </div>
    </div> : null}
  </div>;
}

function CalendarItemFormModal({ open, mode, form, salons, users, leads, customers, events, quotes, contracts, payments, suppliers, saving, onClose, onSubmit, onChange }: { open: boolean; mode: 'create' | 'edit'; form: CalendarForm; salons: Salon[]; users: LinkedEntity[]; leads: LinkedEntity[]; customers: LinkedEntity[]; events: LinkedEntity[]; quotes: LinkedEntity[]; contracts: LinkedEntity[]; payments: LinkedEntity[]; suppliers: LinkedEntity[]; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onChange: (next: CalendarForm | ((current: CalendarForm) => CalendarForm)) => void }) {
  return <Modal open={open} title={mode === 'edit' ? 'Editar item de calendario' : 'Crear item de calendario'} description="Agenda una alerta, recordatorio, nota, tarea, reunión o rango operativo." onClose={onClose}>
    <form onSubmit={onSubmit} className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-sm font-medium text-zinc-700">Tipo<Select className="mt-1.5" value={form.type} onChange={(event) => onChange((current) => ({ ...current, type: event.target.value as CalendarItemType }))}>{(Object.keys(typeMeta) as CalendarItemType[]).filter((type) => type !== 'event').map((value) => <option key={value} value={value}>{typeMeta[value].label}</option>)}</Select></label>
      <label className="text-sm font-medium text-zinc-700">Prioridad<Select className="mt-1.5" value={form.priority} onChange={(event) => onChange((current) => ({ ...current, priority: event.target.value as Priority }))}>{Object.entries(priorityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</Select></label>
      <label className="text-sm font-medium text-zinc-700 md:col-span-2">Visibilidad<Select className="mt-1.5" value={form.visibility} onChange={(event) => onChange((current) => ({ ...current, visibility: event.target.value as CalendarForm['visibility'] }))}><option value="private">Personal: solo yo</option><option value="shared">Visible para todos</option></Select></label>
      <label className="text-sm font-medium text-zinc-700 md:col-span-2">Título<Input required className="mt-1.5" value={form.title} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))} placeholder="Ej: Revisar documentación del evento" /></label>
      <label className="text-sm font-medium text-zinc-700">Fecha<Input required type="date" className="mt-1.5" value={form.date} onChange={(event) => onChange((current) => ({ ...current, date: event.target.value }))} /></label>
      <label className="flex items-end gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-700"><input type="checkbox" checked={form.allDay} onChange={(event) => onChange((current) => ({ ...current, allDay: event.target.checked }))} /> Todo el día</label>
      {!form.allDay ? <><label className="text-sm font-medium text-zinc-700">Inicio<Input type="time" className="mt-1.5" value={form.startTime} onChange={(event) => onChange((current) => ({ ...current, startTime: event.target.value }))} /></label><label className="text-sm font-medium text-zinc-700">Fin<Input type="time" className="mt-1.5" value={form.endTime} onChange={(event) => onChange((current) => ({ ...current, endTime: event.target.value }))} /></label></> : null}
      <label className="text-sm font-medium text-zinc-700">Salón<Select className="mt-1.5" value={form.salonId} onChange={(event) => onChange((current) => ({ ...current, salonId: event.target.value }))}><option value="">General</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></label>
      <label className="flex items-end gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-700"><input type="checkbox" checked={form.notify} onChange={(event) => onChange((current) => ({ ...current, notify: event.target.checked }))} /> Preparar recordatorio</label>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
        <p className="text-sm font-semibold text-zinc-950">Vínculos rápidos</p>
        <p className="mt-1 text-xs text-zinc-500">Relacioná este item con personas o registros para abrirlos directo desde el detalle.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SearchableRelationSelect label="Usuario" value={form.assignedToUserId} options={users} placeholder="Sin usuario vinculado" searchPlaceholder="Buscar usuario..." searchEndpoint="/users/options?limit=50" onChange={(value) => onChange((current) => ({ ...current, assignedToUserId: value }))} />
          <SearchableRelationSelect label="Lead" value={form.leadId} options={leads} placeholder="Sin lead vinculado" searchPlaceholder="Buscar lead..." searchEndpoint="/leads?limit=50" onChange={(value) => onChange((current) => ({ ...current, leadId: value }))} />
          <SearchableRelationSelect label="Cliente" value={form.customerId} options={customers} placeholder="Sin cliente vinculado" searchPlaceholder="Buscar cliente..." searchEndpoint="/customers?limit=50" onChange={(value) => onChange((current) => ({ ...current, customerId: value }))} />
          <SearchableRelationSelect label="Evento" value={form.eventId} options={events} placeholder="Sin evento vinculado" searchPlaceholder="Buscar evento..." searchEndpoint="/events?limit=50&sortBy=eventDate&sortOrder=desc" onChange={(value) => onChange((current) => ({ ...current, eventId: value }))} />
          <SearchableRelationSelect label="Presupuesto" value={form.quoteId} options={quotes} placeholder="Sin presupuesto vinculado" searchPlaceholder="Buscar presupuesto..." searchEndpoint="/quotes?limit=50" onChange={(value) => onChange((current) => ({ ...current, quoteId: value }))} />
          <SearchableRelationSelect label="Contrato" value={form.contractId} options={contracts} placeholder="Sin contrato vinculado" searchPlaceholder="Buscar contrato..." searchEndpoint="/contracts?limit=50" onChange={(value) => onChange((current) => ({ ...current, contractId: value }))} />
          <SearchableRelationSelect label="Pago" value={form.paymentId} options={payments} placeholder="Sin pago vinculado" searchPlaceholder="Buscar pago..." searchEndpoint="/payments/options?limit=50" onChange={(value) => onChange((current) => ({ ...current, paymentId: value }))} />
          <SearchableRelationSelect label="Proveedor" value={form.supplierId} options={suppliers} placeholder="Sin proveedor vinculado" searchPlaceholder="Buscar proveedor..." searchEndpoint="/suppliers/options?active=true&limit=50" onChange={(value) => onChange((current) => ({ ...current, supplierId: value }))} />
        </div>
      </div>
      {form.notify ? <><label className="text-sm font-medium text-zinc-700">Avisar antes<Input type="number" min={1} className="mt-1.5" value={form.offsetValue} onChange={(event) => onChange((current) => ({ ...current, offsetValue: Number(event.target.value) }))} /></label><label className="text-sm font-medium text-zinc-700">Unidad<Select className="mt-1.5" value={form.offsetUnit} onChange={(event) => onChange((current) => ({ ...current, offsetUnit: event.target.value as CalendarForm['offsetUnit'] }))}><option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Días</option><option value="weeks">Semanas</option></Select></label></> : null}
      <label className="text-sm font-medium text-zinc-700 md:col-span-2">Detalle<Textarea className="mt-1.5" value={form.description} onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))} placeholder="Notas internas, faltantes, condiciones de pago o contexto operativo." /></label>
      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 md:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando...' : mode === 'edit' ? 'Guardar' : 'Crear'}</Button></div>
    </form>
  </Modal>;
}

function EntryDetailModal({ entry, currentUserId, onClose, onEdit, onDelete, onPatch }: { entry: CalendarEntry | null; currentUserId: string; onClose: () => void; onEdit: (entry: CalendarEntry) => void; onDelete: (entry: CalendarEntry) => void; onPatch: (entry: CalendarEntry, patch: Record<string, unknown>, message: string) => void }) {
  const [confirmAction, setConfirmAction] = useState<null | { title: string; description: string; confirmLabel: string; action: () => void }>(null);
  if (!entry) return null;
  const meta = typeMeta[entry.type];
  const Icon = meta.icon;
  const links = relatedLinks(entry);
  const canModify = Boolean(entry.item && entityId(entry.item.createdBy) === currentUserId);
  return <>
  <Modal open={Boolean(entry)} title={entry.title} description={meta.label} onClose={onClose}>
    <div className="space-y-5 p-5">
      <div className={`rounded-2xl border p-4 ${meta.tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/75"><Icon className="h-5 w-5" /></span><div><p className="text-sm font-semibold">{entryDateRange(entry)}</p><p className="mt-1 text-xs opacity-75">{entry.salonName}</p></div></div>
          <div className="flex flex-wrap gap-2"><TypeBadge type={entry.type} /><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${entry.visibility === 'shared' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>{entry.visibility === 'shared' ? <Share2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{entry.visibility === 'shared' ? 'Todos' : 'Personal'}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityMeta[entry.priority].className}`}>{priorityMeta[entry.priority].label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[entry.status] ?? 'bg-zinc-100 text-zinc-700'}`}>{eventStatusOptions[entry.status as keyof typeof eventStatusOptions] ?? entry.status}</span></div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={Info} label="Detalle" value={entry.description || 'Sin detalle cargado.'} />
        <InfoCard icon={Mail} label="Recordatorio" value={entry.notification?.enabled ? `Activo: ${entry.notification.offsetValue ?? 1} ${entry.notification.offsetUnit ?? 'dias'} antes por ${reminderChannelLabel(entry.notification.channels)}` : 'Sin recordatorio configurado.'} />
        <InfoCard icon={UserRound} label="Creado por" value={entry.item ? entityName(entry.item.createdBy) : 'Generado automáticamente por el sistema'} />
      </div>
      {links.length ? <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase text-zinc-400">Vínculos rápidos</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {links.map((link) => {
            const LinkIcon = link.icon;
            return <Link key={`${link.label}-${link.href}`} href={link.href} className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm transition hover:border-zinc-400 hover:bg-zinc-50"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700"><LinkIcon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-medium text-zinc-400">{link.label}</span><span className="block truncate font-semibold text-zinc-900">{link.name}</span></span></Link>;
          })}
        </div>
      </section> : null}
      {entry.type === 'event' ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Este item viene del módulo Eventos. Para cambiar datos comerciales, salón, pagos o contrato, abrí el evento original.</div> : null}
      {entry.item && !canModify ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Este ítem fue creado por {entityName(entry.item.createdBy)}. Sólo esa persona puede editarlo, completarlo, cancelarlo o eliminarlo.</div> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Salir</Button>
        {entry.href ? <Link href={entry.href}><Button variant="secondary"><Eye className="mr-2 h-4 w-4" />Abrir evento</Button></Link> : null}
        {canModify ? <><Button variant="secondary" onClick={() => onEdit(entry)}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="secondary" onClick={() => setConfirmAction({ title: 'Completar item', description: '¿Estás seguro que deseas completar este item?', confirmLabel: 'Sí, completar', action: () => onPatch(entry, { status: 'done' }, 'Item marcado como completado.') })}><CheckCircle2 className="mr-2 h-4 w-4" />Completar</Button><Button variant="secondary" onClick={() => setConfirmAction({ title: 'Cancelar item', description: '¿Estás seguro que deseas cancelar este item?', confirmLabel: 'Sí, cancelar', action: () => onPatch(entry, { status: 'cancelled' }, 'Item cancelado.') })}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button><Button variant="danger" onClick={() => setConfirmAction({ title: 'Eliminar item', description: '¿Estás seguro que deseas eliminar este item? Esta acción no se mostrará más en el calendario.', confirmLabel: 'Sí, eliminar', action: () => onDelete(entry) })}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></> : null}
      </div>
    </div>
  </Modal>
  <Modal open={Boolean(confirmAction)} title={confirmAction?.title ?? ''} description={confirmAction?.description} onClose={() => setConfirmAction(null)}>
    <div className="flex justify-end gap-2 p-5">
      <Button type="button" variant="secondary" onClick={() => setConfirmAction(null)}>Salir</Button>
      <Button type="button" variant={confirmAction?.confirmLabel.includes('eliminar') ? 'danger' : 'primary'} onClick={() => { const action = confirmAction?.action; setConfirmAction(null); action?.(); }}>{confirmAction?.confirmLabel ?? 'Confirmar'}</Button>
    </div>
  </Modal>
  </>;
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400"><Icon className="h-4 w-4" />{label}</p><p className="mt-2 text-sm text-zinc-700">{value}</p></div>;
}

function DayStackModal({ date, entries, onClose, onOpen, onCreate }: { date: Date | null; entries: CalendarEntry[]; onClose: () => void; onOpen: (entry: CalendarEntry) => void; onCreate: (date: Date) => void }) {
  return <Modal open={Boolean(date)} title={date ? longDateFormatter.format(date) : ''} description="Todos los items del día seleccionado." onClose={onClose}>
    <div className="space-y-3 p-5">
      <div className="flex justify-end"><Button onClick={() => date && onCreate(date)}><Plus className="mr-2 h-4 w-4" />Crear en este día</Button></div>
      <div className="grid gap-2">{entries.map((entry) => <EntryCard key={`${entry.source}-${entry.id}`} entry={entry} onOpen={onOpen} />)}</div>
      {!entries.length ? <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-sm text-zinc-500">Sin items para este día.</p> : null}
    </div>
  </Modal>;
}
