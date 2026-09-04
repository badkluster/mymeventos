'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ClipboardList, Clock3, History, MapPin, Settings2, ShieldAlert, Square, UserRound } from 'lucide-react';
import { Permission } from '@mym/shared';
import { api } from '@/lib/api';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { useSession } from '@/components/session-provider';
import { userCanAccess } from '@/lib/admin-permissions';
import {
  attendanceAdjustmentStatusLabels, attendanceIncidentStatusLabels, attendanceIncidentTypeLabels, formatMinutes, locationValidationLabels, personName, salonName,
  workSessionStatusLabels, type AttendanceAdjustmentRequest, type AttendanceIncident, type AttendanceSettings, type TimePunch, type WorkSession
} from '@/features/attendance/types';

type Tab = 'active' | 'history' | 'incidents' | 'adjustments' | 'settings';
type SalonOption = { _id: string; name: string };

const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';

function dateTimeInputValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function elapsedLabel(startedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  return formatMinutes(minutes);
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const styles = { ok: 'bg-emerald-100 text-emerald-700', warn: 'bg-amber-100 text-amber-700', bad: 'bg-red-100 text-red-700', neutral: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{label}</span>;
}

function sessionStatusTone(status: WorkSession['status']): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (status === 'completed' || status === 'active') return 'ok';
  if (status === 'under_review' || status === 'adjusted') return 'warn';
  if (status === 'incomplete' || status === 'cancelled') return 'bad';
  return 'neutral';
}

export default function AttendancePage() {
  const { showToast } = useToast();
  const { user: sessionUser } = useSession();
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get('tab');
  const requestedSessionId = searchParams?.get('sessionId');
  const canManage = userCanAccess(sessionUser, [Permission.ATTENDANCE_MANAGE]);
  const canManageSettings = userCanAccess(sessionUser, [Permission.ATTENDANCE_SETTINGS_MANAGE]);

  const [tab, setTab] = useState<Tab>(() => requestedTab === 'history' ? 'history' : 'active');
  const [loading, setLoading] = useState(false);
  const [salons, setSalons] = useState<SalonOption[]>([]);

  const [activeSessions, setActiveSessions] = useState<WorkSession[]>([]);

  const [historySessions, setHistorySessions] = useState<WorkSession[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilters, setHistoryFilters] = useState({ status: '', salonId: '', requiresReview: '', from: '', to: '' });

  const [incidents, setIncidents] = useState<AttendanceIncident[]>([]);
  const [incidentStatus, setIncidentStatus] = useState('');

  const [adjustments, setAdjustments] = useState<AttendanceAdjustmentRequest[]>([]);
  const [adjustmentStatus, setAdjustmentStatus] = useState('');

  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [detailSession, setDetailSession] = useState<WorkSession | null>(null);
  const [detailPunches, setDetailPunches] = useState<TimePunch[]>([]);
  const [detailIncidents, setDetailIncidents] = useState<AttendanceIncident[]>([]);
  const [detailAdjustments, setDetailAdjustments] = useState<AttendanceAdjustmentRequest[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mapPunch, setMapPunch] = useState<TimePunch | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<WorkSession | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ requestedStartAt: '', requestedEndAt: '', reviewNotes: '' });

  const [closeTarget, setCloseTarget] = useState<WorkSession | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [sessionReviewTarget, setSessionReviewTarget] = useState<WorkSession | null>(null);
  const [sessionReviewForm, setSessionReviewForm] = useState<{ status: 'completed' | 'incomplete' | 'cancelled'; reviewNotes: string }>({ status: 'completed', reviewNotes: '' });
  const [resolveTarget, setResolveTarget] = useState<AttendanceIncident | null>(null);
  const [resolveForm, setResolveForm] = useState({ status: 'resolved', resolution: '' });
  const [reviewTarget, setReviewTarget] = useState<AttendanceAdjustmentRequest | null>(null);
  const [reviewForm, setReviewForm] = useState<{ decision: 'approved' | 'rejected'; reviewNotes: string }>({ decision: 'approved', reviewNotes: '' });
  const [acting, setActing] = useState(false);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ sessions: WorkSession[] }>('/attendance/sessions/active');
      setActiveSessions(response.sessions ?? []);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudieron cargar las jornadas activas.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(historyPage), limit: '20' });
      if (historyFilters.status) query.set('status', historyFilters.status);
      if (historyFilters.salonId) query.set('salonId', historyFilters.salonId);
      if (historyFilters.requiresReview) query.set('requiresReview', historyFilters.requiresReview);
      if (historyFilters.from) query.set('from', historyFilters.from);
      if (historyFilters.to) query.set('to', historyFilters.to);
      const response = await api.get<{ items: WorkSession[]; total: number }>(`/attendance/sessions?${query.toString()}`);
      setHistorySessions(response.items ?? []);
      setHistoryTotal(response.total ?? 0);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo cargar el historial de jornadas.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [historyPage, historyFilters, showToast]);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', limit: '100' });
      if (incidentStatus) query.set('status', incidentStatus);
      const response = await api.get<{ items: AttendanceIncident[] }>(`/attendance/incidents?${query.toString()}`);
      setIncidents(response.items ?? []);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudieron cargar las incidencias.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [incidentStatus, showToast]);

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', limit: '100' });
      if (adjustmentStatus) query.set('status', adjustmentStatus);
      const response = await api.get<{ items: AttendanceAdjustmentRequest[] }>(`/attendance/adjustments?${query.toString()}`);
      setAdjustments(response.items ?? []);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudieron cargar las solicitudes de corrección.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [adjustmentStatus, showToast]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ settings: AttendanceSettings }>('/attendance/settings');
      setSettings(response.settings);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo cargar la configuración de asistencia.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void api.get<{ salons: SalonOption[] }>('/salons').then((response) => setSalons(response.salons ?? [])).catch(() => setSalons([])); }, []);

  useEffect(() => {
    if (tab === 'active') void loadActive();
    if (tab === 'history') void loadHistory();
    if (tab === 'incidents') void loadIncidents();
    if (tab === 'adjustments') void loadAdjustments();
    if (tab === 'settings' && canManageSettings) void loadSettings();
  }, [tab, loadActive, loadHistory, loadIncidents, loadAdjustments, loadSettings, canManageSettings]);

  const openDetail = useCallback(async (session: WorkSession | string) => {
    const sessionId = typeof session === 'string' ? session : session._id;
    if (typeof session !== 'string') setDetailSession(session);
    setLoadingDetail(true);
    try {
      const response = await api.get<{ session: WorkSession; punches: TimePunch[]; incidents: AttendanceIncident[]; adjustments: AttendanceAdjustmentRequest[] }>(`/attendance/sessions/${sessionId}`);
      setDetailSession(response.session);
      setDetailPunches(response.punches ?? []);
      setDetailIncidents(response.incidents ?? []);
      setDetailAdjustments(response.adjustments ?? []);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo cargar el detalle de la jornada.'), variant: 'error' });
      setDetailSession(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [showToast]);

  useEffect(() => { if (requestedTab === 'history') setTab('history'); }, [requestedTab]);
  useEffect(() => { if (tab === 'history' && requestedSessionId) void openDetail(requestedSessionId); }, [openDetail, requestedSessionId, tab]);

  async function confirmClose() {
    if (!closeTarget || !closeReason.trim()) return;
    setActing(true);
    try {
      await api.post(`/attendance/sessions/${closeTarget._id}/close`, { reason: closeReason.trim() });
      showToast({ message: 'Jornada cerrada administrativamente.', variant: 'success' });
      setCloseTarget(null);
      setCloseReason('');
      await loadActive();
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo cerrar la jornada.'), variant: 'error' });
    } finally {
      setActing(false);
    }
  }

  async function confirmSessionReview() {
    if (!sessionReviewTarget) return;
    setActing(true);
    try {
      const reviewNotes = sessionReviewForm.reviewNotes.trim();
      await api.post(`/attendance/sessions/${sessionReviewTarget._id}/review`, { status: sessionReviewForm.status, ...(reviewNotes ? { reviewNotes } : {}) });
      showToast({ message: 'Jornada revisada correctamente.', variant: 'success' });
      setSessionReviewTarget(null);
      setSessionReviewForm({ status: 'completed', reviewNotes: '' });
      await Promise.all([
        loadHistory(),
        detailSession?._id === sessionReviewTarget._id ? openDetail(sessionReviewTarget._id) : Promise.resolve()
      ]);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo revisar la jornada.'), variant: 'error' });
    } finally {
      setActing(false);
    }
  }

  async function confirmResolve() {
    if (!resolveTarget) return;
    const currentDetailSessionId = detailSession?._id;
    setActing(true);
    try {
      await api.post(`/attendance/incidents/${resolveTarget._id}/resolve`, resolveForm);
      showToast({ message: 'Incidencia actualizada correctamente.', variant: 'success' });
      setResolveTarget(null);
      setResolveForm({ status: 'resolved', resolution: '' });
      await Promise.all([
        loadIncidents(),
        currentDetailSessionId && currentDetailSessionId === resolveTarget.workSessionId ? openDetail(currentDetailSessionId) : Promise.resolve()
      ]);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo resolver la incidencia.'), variant: 'error' });
    } finally {
      setActing(false);
    }
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    setActing(true);
    try {
      await api.post(`/attendance/adjustments/${reviewTarget._id}/review`, reviewForm);
      showToast({ message: reviewForm.decision === 'approved' ? 'Corrección aprobada y aplicada a la jornada.' : 'Corrección rechazada.', variant: 'success' });
      setReviewTarget(null);
      setReviewForm({ decision: 'approved', reviewNotes: '' });
      await Promise.all([
        loadAdjustments(),
        loadHistory(),
        detailSession?._id === reviewTarget.workSessionId ? openDetail(detailSession._id) : Promise.resolve()
      ]);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo revisar la solicitud de corrección.'), variant: 'error' });
    } finally {
      setActing(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const response = await api.patch<{ settings: AttendanceSettings }>('/attendance/settings', settings);
      setSettings(response.settings);
      showToast({ message: 'Configuración de asistencia guardada correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo guardar la configuración.'), variant: 'error' });
    } finally {
      setSavingSettings(false);
    }
  }

  function openAdministrativeAdjustment(session: WorkSession) {
    setAdjustTarget(session);
    setAdjustmentForm({
      requestedStartAt: dateTimeInputValue(session.startedAt),
      requestedEndAt: dateTimeInputValue(session.endedAt),
      reviewNotes: ''
    });
  }

  async function confirmAdministrativeAdjustment() {
    if (!adjustTarget || !adjustmentForm.requestedStartAt) return;
    const requestedStartAt = new Date(adjustmentForm.requestedStartAt);
    const requestedEndAt = adjustmentForm.requestedEndAt ? new Date(adjustmentForm.requestedEndAt) : undefined;
    if (Number.isNaN(requestedStartAt.getTime()) || (requestedEndAt && Number.isNaN(requestedEndAt.getTime()))) {
      showToast({ message: 'Ingresá horarios válidos para continuar.', variant: 'error' });
      return;
    }
    if (requestedEndAt && requestedEndAt.getTime() <= requestedStartAt.getTime()) {
      showToast({ message: 'La salida debe ser posterior a la entrada.', variant: 'error' });
      return;
    }

    setActing(true);
    try {
      await api.post(`/attendance/sessions/${adjustTarget._id}/adjust`, {
        requestedStartAt: requestedStartAt.toISOString(),
        ...(requestedEndAt ? { requestedEndAt: requestedEndAt.toISOString() } : {}),
        ...(adjustmentForm.reviewNotes.trim() ? { reviewNotes: adjustmentForm.reviewNotes.trim() } : {})
      });
      showToast({ message: 'Horario ajustado y registrado en el historial.', variant: 'success' });
      setAdjustTarget(null);
      setAdjustmentForm({ requestedStartAt: '', requestedEndAt: '', reviewNotes: '' });
      await Promise.all([loadHistory(), openDetail(adjustTarget._id)]);
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo ajustar el horario.'), variant: 'error' });
    } finally {
      setActing(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof UserRound }[] = [
    { id: 'active', label: 'Activos', icon: UserRound },
    { id: 'history', label: 'Historial', icon: History },
    { id: 'incidents', label: 'Incidencias', icon: AlertTriangle },
    { id: 'adjustments', label: 'Correcciones', icon: ClipboardList },
    ...(canManageSettings ? [{ id: 'settings' as Tab, label: 'Configuración', icon: Settings2 }] : [])
  ];
  const adjustmentPreviewMinutes = adjustTarget && adjustmentForm.requestedStartAt && adjustmentForm.requestedEndAt
    ? Math.round((new Date(adjustmentForm.requestedEndAt).getTime() - new Date(adjustmentForm.requestedStartAt).getTime()) / 60_000)
    : null;

  return <section className="space-y-6">
    <PageHeader title="Asistencia y app móvil" description="Jornadas del personal fichadas desde la app móvil: control en vivo, historial, incidencias y correcciones." />
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Secciones de asistencia">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === id ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
    </nav>

    {tab === 'active' && <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500"><tr>{['Empleado', 'Salón', 'Inicio', 'Tiempo transcurrido', 'Estado'].map((label) => <th key={label} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead>
        <tbody className="divide-y divide-zinc-100">{activeSessions.map((session) => <tr key={session._id} className="hover:bg-amber-50/35">
          <td className="px-5 py-4 font-medium text-zinc-900">{personName(session.userId)}</td>
          <td className="px-5 py-4 text-zinc-600">{salonName(session.salonId)}</td>
          <td className="px-5 py-4 text-zinc-600">{formatDateTime(session.startedAt)}</td>
          <td className="px-5 py-4 font-semibold text-zinc-950">{elapsedLabel(session.startedAt)}</td>
          <td className="px-5 py-4">{session.requiresReview ? <StatusBadge label="Revisar" tone="warn" /> : <StatusBadge label="Normal" tone="ok" />}</td>
          <td className="px-5 py-4"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => void openDetail(session)}>Ver detalle</Button>{canManage ? <Button variant="danger" onClick={() => setCloseTarget(session)}><Square className="mr-2 h-4 w-4" />Cerrar</Button> : null}</div></td>
        </tr>)}</tbody>
      </table></div>
      {!loading && !activeSessions.length && <div className="grid place-items-center px-6 py-14 text-center"><UserRound className="h-9 w-9 text-zinc-400" /><p className="mt-3 text-sm text-zinc-500">Nadie tiene una jornada activa en este momento.</p></div>}
    </div>}

    {tab === 'history' && <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <FilterField label="Estado"><Select value={historyFilters.status} onChange={(event) => { setHistoryFilters((current) => ({ ...current, status: event.target.value })); setHistoryPage(1); }}><option value="">Todos</option>{Object.entries(workSessionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FilterField>
        <FilterField label="Salón"><Select value={historyFilters.salonId} onChange={(event) => { setHistoryFilters((current) => ({ ...current, salonId: event.target.value })); setHistoryPage(1); }}><option value="">Todos</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></FilterField>
        <FilterField label="Desde"><Input type="date" value={historyFilters.from} onChange={(event) => { setHistoryFilters((current) => ({ ...current, from: event.target.value })); setHistoryPage(1); }} /></FilterField>
        <FilterField label="Hasta"><Input type="date" value={historyFilters.to} onChange={(event) => { setHistoryFilters((current) => ({ ...current, to: event.target.value })); setHistoryPage(1); }} /></FilterField>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-zinc-700"><input type="checkbox" checked={historyFilters.requiresReview === 'true'} onChange={(event) => { setHistoryFilters((current) => ({ ...current, requiresReview: event.target.checked ? 'true' : '' })); setHistoryPage(1); }} />Solo marcadas para revisión</label>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="min-w-[950px] w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500"><tr>{['Empleado', 'Salón', 'Inicio', 'Fin', 'Horas', 'Estado'].map((label) => <th key={label} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{historySessions.map((session) => <tr key={session._id} className="hover:bg-amber-50/35">
            <td className="px-5 py-4 font-medium text-zinc-900">{personName(session.userId)}{session.hasIncident ? <ShieldAlert className="ml-2 inline h-3.5 w-3.5 text-amber-500" /> : null}</td>
            <td className="px-5 py-4 text-zinc-600">{salonName(session.salonId)}</td>
            <td className="px-5 py-4 text-zinc-600">{formatDateTime(session.startedAt)}</td>
            <td className="px-5 py-4 text-zinc-600">{formatDateTime(session.endedAt)}</td>
            <td className="px-5 py-4 font-semibold text-zinc-950">{formatMinutes(session.workedMinutes)}</td>
            <td className="px-5 py-4"><StatusBadge label={workSessionStatusLabels[session.status]} tone={sessionStatusTone(session.status)} /></td>
            <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => void openDetail(session)}>Ver detalle</Button>{canManage && session.status !== 'active' && (session.requiresReview || session.status === 'under_review') ? <Button onClick={() => { setSessionReviewTarget(session); setSessionReviewForm({ status: 'completed', reviewNotes: '' }); }}>Revisar estado</Button> : null}</div></td>
          </tr>)}</tbody>
        </table></div>
        {!loading && !historySessions.length && <div className="grid place-items-center px-6 py-14 text-center"><History className="h-9 w-9 text-zinc-400" /><p className="mt-3 text-sm text-zinc-500">No hay jornadas para los filtros seleccionados.</p></div>}
      </div>
      <div className="flex items-center justify-between text-sm text-zinc-500"><span>{historyTotal} jornadas en total</span><div className="flex gap-2"><Button variant="secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>Anterior</Button><Button variant="secondary" disabled={historyPage * 20 >= historyTotal} onClick={() => setHistoryPage((page) => page + 1)}>Siguiente</Button></div></div>
    </div>}

    {tab === 'incidents' && <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><FilterField label="Estado"><Select value={incidentStatus} onChange={(event) => setIncidentStatus(event.target.value)}><option value="">Todas</option>{Object.entries(attendanceIncidentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FilterField></div>
      <div className="space-y-3">{incidents.map((incident) => <article key={incident._id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">{attendanceIncidentTypeLabels[incident.type] ?? incident.type}</h2><p className="mt-1 text-sm text-zinc-500">{personName(incident.userId)} · {formatDateTime(incident.createdAt)}</p><p className="mt-2 max-w-2xl text-sm text-zinc-700">{incident.description}</p>{incident.resolution ? <p className="mt-2 text-sm text-zinc-500"><b>Resolución:</b> {incident.resolution}</p> : null}</div><div className="flex flex-col items-end gap-2"><StatusBadge label={attendanceIncidentStatusLabels[incident.status]} tone={incident.status === 'resolved' ? 'ok' : incident.status === 'rejected' ? 'bad' : 'warn'} />{canManage && incident.status !== 'resolved' && incident.status !== 'rejected' ? <Button variant="secondary" onClick={() => { setResolveTarget(incident); setResolveForm({ status: 'resolved', resolution: '' }); }}>Revisar</Button> : null}</div></div></article>)}
      {!loading && !incidents.length && <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">No hay incidencias para el filtro seleccionado.</p>}</div>
    </div>}

    {tab === 'adjustments' && <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><FilterField label="Estado"><Select value={adjustmentStatus} onChange={(event) => setAdjustmentStatus(event.target.value)}><option value="">Todas</option>{Object.entries(attendanceAdjustmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FilterField></div>
      <div className="space-y-3">{adjustments.map((adjustment) => <article key={adjustment._id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold text-zinc-950">{personName(adjustment.userId)}</h2><p className="mt-1 text-sm text-zinc-500">Solicitado el {formatDateTime(adjustment.createdAt)}</p><p className="mt-2 max-w-2xl text-sm text-zinc-700">{adjustment.reason}</p><p className="mt-2 text-sm text-zinc-500">Horario solicitado: {formatDateTime(adjustment.requestedStartAt)} → {formatDateTime(adjustment.requestedEndAt)}</p>{adjustment.reviewNotes ? <p className="mt-2 text-sm text-zinc-500"><b>Respuesta:</b> {adjustment.reviewNotes}</p> : null}</div><div className="flex flex-col items-end gap-2"><StatusBadge label={attendanceAdjustmentStatusLabels[adjustment.status]} tone={adjustment.status === 'approved' ? 'ok' : adjustment.status === 'rejected' ? 'bad' : 'warn'} />{canManage && adjustment.status === 'pending' ? <Button variant="secondary" onClick={() => { setReviewTarget(adjustment); setReviewForm({ decision: 'approved', reviewNotes: '' }); }}>Revisar</Button> : null}</div></div></article>)}
      {!loading && !adjustments.length && <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">No hay solicitudes de corrección para el filtro seleccionado.</p>}</div>
    </div>}

    {tab === 'settings' && canManageSettings && settings && <div className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-3">
      <FilterField label="Zona horaria"><Input value={settings.timezone} onChange={(event) => setSettings((current) => current && { ...current, timezone: event.target.value })} /></FilterField>
      <FilterField label="Precisión mínima de ubicación (m)"><Input type="number" min={1} value={settings.minLocationAccuracyMeters} onChange={(event) => setSettings((current) => current && { ...current, minLocationAccuracyMeters: Number(event.target.value) })} /></FilterField>
      <FilterField label="Radio de geocerca por defecto (m)"><Input type="number" min={10} value={settings.defaultGeofenceRadiusMeters} onChange={(event) => setSettings((current) => current && { ...current, defaultGeofenceRadiusMeters: Number(event.target.value) })} /></FilterField>
      <FilterField label="Tolerancia de llegada (minutos)"><Input type="number" min={0} value={settings.lateToleranceMinutes} onChange={(event) => setSettings((current) => current && { ...current, lateToleranceMinutes: Number(event.target.value) })} /></FilterField>
      <FilterField label="Tolerancia de salida (minutos)"><Input type="number" min={0} value={settings.earlyCheckoutToleranceMinutes} onChange={(event) => setSettings((current) => current && { ...current, earlyCheckoutToleranceMinutes: Number(event.target.value) })} /></FilterField>
      <FilterField label="Jornada máxima (horas)"><Input type="number" min={1} value={settings.maxShiftHours} onChange={(event) => setSettings((current) => current && { ...current, maxShiftHours: Number(event.target.value) })} /></FilterField>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-zinc-700"><input type="checkbox" checked={settings.requireShiftToClockIn} onChange={(event) => setSettings((current) => current && { ...current, requireShiftToClockIn: event.target.checked })} />Requerir turno asignado para fichar</label>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-zinc-700"><input type="checkbox" checked={settings.allowIncidents} onChange={(event) => setSettings((current) => current && { ...current, allowIncidents: event.target.checked })} />Permitir reportar incidencias</label>
      <footer className="lg:col-span-3 flex justify-end"><Button disabled={savingSettings} onClick={() => void saveSettings()}>{savingSettings ? 'Guardando…' : 'Guardar configuración'}</Button></footer>
    </div>}

    <Modal open={Boolean(detailSession)} onClose={() => { setDetailSession(null); setMapPunch(null); setAdjustTarget(null); }} title="Detalle de jornada" description={detailSession ? `${personName(detailSession.userId)} · ${salonName(detailSession.salonId)}` : ''}>
      <div className="space-y-4 p-6">
        {loadingDetail ? <p className="text-sm text-zinc-500">Cargando…</p> : detailSession && <>
          <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <dl className="grid flex-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2"><Metric label="Estado" value={workSessionStatusLabels[detailSession.status]} /><Metric label="Horas trabajadas" value={formatMinutes(detailSession.workedMinutes)} /><Metric label="Inicio" value={formatDateTime(detailSession.startedAt)} /><Metric label="Fin" value={formatDateTime(detailSession.endedAt)} /></dl>
            {canManage && detailSession.status !== 'active' ? <Button className="shrink-0" onClick={() => openAdministrativeAdjustment(detailSession)}><Clock3 className="mr-2 h-4 w-4" />Ajustar horario</Button> : null}
          </div>
          {detailSession.closeReason ? <section className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"><h3 className="text-sm font-semibold text-amber-950">Cierre administrativo</h3><p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{detailSession.closeReason}</p></section> : null}
          {detailSession.reviewNotes ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><h3 className="text-sm font-semibold text-emerald-950">Revisión administrativa</h3><p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{detailSession.reviewNotes}</p>{detailSession.reviewedAt ? <p className="mt-1 text-xs text-emerald-700">{formatDateTime(detailSession.reviewedAt)}</p> : null}</section> : null}
          <section><h3 className="text-sm font-semibold text-zinc-900">Registros de horario</h3><div className="mt-2 space-y-2">{detailPunches.map((punch) => <div key={punch._id} className="rounded-xl border border-zinc-100 px-3 py-2 text-sm">
            <div className="flex items-center justify-between"><span className="font-medium text-zinc-900">{punch.type === 'check_in' ? 'Entrada' : punch.type === 'check_out' ? 'Salida' : punch.type}</span><span className="text-zinc-500">{formatDateTime(punch.effectiveAt)}</span></div>
             <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
               {punch.locationValidationStatus !== 'outside_allowed_area' ? <span className="text-xs text-zinc-400">{locationValidationLabels[punch.locationValidationStatus ?? ''] ?? 'Sin ubicación'}{typeof punch.salonDistanceMeters === 'number' ? ` · ${Math.round(punch.salonDistanceMeters)} m del salón` : ''}</span> : null}
               {punch.location ? <button type="button" onClick={() => setMapPunch(punch)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"><MapPin className="h-3.5 w-3.5" />Ver en el mapa</button> : null}
             </div>
             <PunchTechnicalDetails punch={punch} />
           </div>)}{!detailPunches.length && <p className="text-sm text-zinc-500">Sin registros de horario.</p>}</div></section>
           <section className="border-t border-zinc-200 pt-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-zinc-900">Incidencias</h3><span className="text-xs tabular-nums text-zinc-500">{detailIncidents.length}</span></div>{detailIncidents.length ? <div className="mt-2 divide-y divide-zinc-100">{detailIncidents.map((incident) => <article key={incident._id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-zinc-900">{attendanceIncidentTypeLabels[incident.type] ?? incident.type}</p><p className="mt-1 text-sm text-zinc-600">{incident.description}</p><p className="mt-1 text-xs text-zinc-500">Reportada {formatDateTime(incident.createdAt)}</p>{incident.resolution ? <p className="mt-2 text-sm text-zinc-600"><span className="font-medium text-zinc-800">Resolución:</span> {incident.resolution}</p> : null}</div><div className="flex shrink-0 flex-col items-end gap-2"><StatusBadge label={attendanceIncidentStatusLabels[incident.status]} tone={incident.status === 'resolved' ? 'ok' : incident.status === 'rejected' ? 'bad' : 'warn'} />{canManage && incident.status !== 'resolved' && incident.status !== 'rejected' ? <Button variant="secondary" className="px-3 py-2" onClick={() => { setResolveTarget(incident); setResolveForm({ status: 'resolved', resolution: '' }); }}>Revisar</Button> : null}</div></div></article>)}</div> : <p className="mt-2 text-sm text-zinc-500">No hay incidencias en esta jornada.</p>}</section>
           <section className="border-t border-zinc-200 pt-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-zinc-900">Correcciones</h3><span className="text-xs tabular-nums text-zinc-500">{detailAdjustments.length}</span></div>{detailAdjustments.length ? <div className="mt-2 divide-y divide-zinc-100">{detailAdjustments.map((adjustment) => <article key={adjustment._id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-zinc-900">{adjustment.reason}</p><p className="mt-1 text-sm text-zinc-600">Horario solicitado: {formatDateTime(adjustment.requestedStartAt)} → {formatDateTime(adjustment.requestedEndAt)}</p><p className="mt-1 text-xs text-zinc-500">Solicitada {formatDateTime(adjustment.createdAt)}</p>{adjustment.reviewNotes ? <p className="mt-2 text-sm text-zinc-600"><span className="font-medium text-zinc-800">Respuesta:</span> {adjustment.reviewNotes}</p> : null}</div><div className="flex shrink-0 flex-col items-end gap-2"><StatusBadge label={attendanceAdjustmentStatusLabels[adjustment.status]} tone={adjustment.status === 'approved' ? 'ok' : adjustment.status === 'rejected' ? 'bad' : 'warn'} />{canManage && adjustment.status === 'pending' ? <Button variant="secondary" className="px-3 py-2" onClick={() => { setReviewTarget(adjustment); setReviewForm({ decision: 'approved', reviewNotes: '' }); }}>Revisar</Button> : null}</div></div></article>)}</div> : <p className="mt-2 text-sm text-zinc-500">No hay correcciones solicitadas para esta jornada.</p>}</section>
           {canManage && detailSession.status !== 'active' && (detailSession.requiresReview || detailSession.status === 'under_review') ? <div className="flex justify-end border-t border-zinc-100 pt-4"><Button onClick={() => { setSessionReviewTarget(detailSession); setSessionReviewForm({ status: 'completed', reviewNotes: '' }); }}>Revisar estado de jornada</Button></div> : null}
         </>}
       </div>
     </Modal>

    <Modal open={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title="Ajustar horario" description={adjustTarget ? `${personName(adjustTarget.userId)} · ${formatDateTime(adjustTarget.startedAt)}` : ''}>
      <div className="space-y-5 p-6">
        <p className="text-sm leading-6 text-zinc-600">Se actualizará la jornada y quedará registrada una corrección aprobada en su historial. Los fichajes originales se conservan como evidencia.</p>
        <div className="grid gap-4 sm:grid-cols-2"><FilterField label="Entrada"><Input type="datetime-local" value={adjustmentForm.requestedStartAt} onChange={(event) => setAdjustmentForm((current) => ({ ...current, requestedStartAt: event.target.value }))} /></FilterField><FilterField label="Salida"><Input type="datetime-local" value={adjustmentForm.requestedEndAt} onChange={(event) => setAdjustmentForm((current) => ({ ...current, requestedEndAt: event.target.value }))} /></FilterField></div>
        {adjustmentPreviewMinutes !== null ? adjustmentPreviewMinutes > 0
          ? <p className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">Duración recalculada: {formatMinutes(adjustmentPreviewMinutes)}.</p>
          : <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">La salida debe ser posterior a la entrada.</p>
          : null}
        <FilterField label="Nota de la corrección (opcional)"><Textarea placeholder="Ej.: se corrigió la entrada informada por el encargado." value={adjustmentForm.reviewNotes} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reviewNotes: event.target.value }))} /></FilterField>
        <footer className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={() => setAdjustTarget(null)}>Cancelar</Button><Button disabled={acting || !adjustmentForm.requestedStartAt || adjustmentPreviewMinutes === 0 || (adjustmentPreviewMinutes !== null && adjustmentPreviewMinutes < 0)} onClick={() => void confirmAdministrativeAdjustment()}>{acting ? 'Guardando…' : 'Guardar ajuste'}</Button></footer>
      </div>
    </Modal>

    <Modal open={Boolean(mapPunch?.location)} onClose={() => setMapPunch(null)} title="Ubicación del registro de horario" description={mapPunch ? `${mapPunch.type === 'check_in' ? 'Entrada' : mapPunch.type === 'check_out' ? 'Salida' : 'Registro de horario'} · ${formatDateTime(mapPunch.effectiveAt)}` : ''} wide>
      {mapPunch?.location ? <div className="space-y-4 p-5 sm:p-6">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
          <iframe title="Mapa de ubicación del registro de horario" src={`https://www.google.com/maps?q=${encodeURIComponent(`${mapPunch.location.latitude},${mapPunch.location.longitude}`)}&z=17&output=embed`} className="h-[48vh] min-h-80 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600"><span>Latitud: <strong className="font-medium text-zinc-900">{mapPunch.location.latitude.toFixed(6)}</strong></span><span>Longitud: <strong className="font-medium text-zinc-900">{mapPunch.location.longitude.toFixed(6)}</strong></span>{typeof mapPunch.location.accuracy === 'number' ? <span>Precisión: <strong className="font-medium text-zinc-900">{Math.round(mapPunch.location.accuracy)} m</strong></span> : null}</div>
      </div> : null}
    </Modal>

    <Modal open={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} title="Cerrar jornada administrativamente" description={closeTarget ? `${personName(closeTarget.userId)} · jornada iniciada el ${formatDateTime(closeTarget.startedAt)}` : ''}>
      <div className="space-y-4 p-6"><Textarea placeholder="Motivo del cierre administrativo" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} /><footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCloseTarget(null)}>Cancelar</Button><Button variant="danger" disabled={acting || !closeReason.trim()} onClick={() => void confirmClose()}>{acting ? 'Cerrando…' : 'Cerrar jornada'}</Button></footer></div>
    </Modal>

    <Modal open={Boolean(sessionReviewTarget)} onClose={() => setSessionReviewTarget(null)} title="Revisar estado de jornada" description={sessionReviewTarget ? `${personName(sessionReviewTarget.userId)} · ${formatDateTime(sessionReviewTarget.startedAt)}` : ''}>
      <div className="space-y-4 p-6">
        <FilterField label="Estado final"><Select value={sessionReviewForm.status} onChange={(event) => setSessionReviewForm((current) => ({ ...current, status: event.target.value as 'completed' | 'incomplete' | 'cancelled' }))}><option value="completed">Completada</option><option value="incomplete">Incompleta</option><option value="cancelled">Cancelada</option></Select></FilterField>
        <Textarea placeholder="Motivo de la decisión (opcional)" value={sessionReviewForm.reviewNotes} onChange={(event) => setSessionReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))} />
        <footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSessionReviewTarget(null)}>Cancelar</Button><Button disabled={acting} onClick={() => void confirmSessionReview()}>{acting ? 'Guardando…' : 'Confirmar revisión'}</Button></footer>
      </div>
    </Modal>

    <Modal open={Boolean(resolveTarget)} onClose={() => setResolveTarget(null)} title="Revisar incidencia" description={resolveTarget ? personName(resolveTarget.userId) : ''}>
      <div className="space-y-4 p-6">
        <FilterField label="Resultado"><Select value={resolveForm.status} onChange={(event) => setResolveForm((current) => ({ ...current, status: event.target.value }))}><option value="resolved">Resuelta</option><option value="in_review">En revisión</option><option value="rejected">Rechazada</option></Select></FilterField>
        <Textarea placeholder="Notas de la resolución" value={resolveForm.resolution} onChange={(event) => setResolveForm((current) => ({ ...current, resolution: event.target.value }))} />
        <footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setResolveTarget(null)}>Cancelar</Button><Button disabled={acting} onClick={() => void confirmResolve()}>{acting ? 'Guardando…' : 'Guardar'}</Button></footer>
      </div>
    </Modal>

    <Modal open={Boolean(reviewTarget)} onClose={() => setReviewTarget(null)} title="Revisar solicitud de corrección" description={reviewTarget ? `${personName(reviewTarget.userId)} · ${reviewTarget.reason}` : ''}>
      <div className="space-y-4 p-6">
        <FilterField label="Decisión"><Select value={reviewForm.decision} onChange={(event) => setReviewForm((current) => ({ ...current, decision: event.target.value as 'approved' | 'rejected' }))}><option value="approved">Aprobar (ajusta la jornada)</option><option value="rejected">Rechazar</option></Select></FilterField>
        <Textarea placeholder="Notas de la revisión" value={reviewForm.reviewNotes} onChange={(event) => setReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))} />
        <footer className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setReviewTarget(null)}>Cancelar</Button><Button disabled={acting} onClick={() => void confirmReview()}>{acting ? 'Guardando…' : 'Confirmar'}</Button></footer>
      </div>
    </Modal>
  </section>;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-700"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 font-medium text-zinc-800">{value}</dd></div>;
}

function technicalValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function PunchTechnicalDetails({ punch }: { punch: TimePunch }) {
  const device = punch.device;
  const network = punch.network;
  const entries = [
    ['Hora oficial del servidor', formatDateTime(punch.serverReceivedAt)],
    ['IP vista por el servidor', punch.publicIp],
    ['IP reportada por el dispositivo', network?.reportedIp],
    ['Conexión reportada', network?.connectionType],
    ['Conexión activa', network?.isConnected],
    ['Internet disponible', network?.isInternetReachable],
    ['Modo avión', network?.airplaneMode],
    ['Plataforma', device?.platform],
    ['Dispositivo físico', device?.isPhysicalDevice],
    ['Tipo de equipo', device?.deviceType],
    ['Marca / fabricante', [device?.brand, device?.manufacturer].filter(Boolean).join(' · ')],
    ['Modelo', [device?.deviceModel, device?.modelId].filter(Boolean).join(' · ')],
    ['Nombre configurado', device?.deviceName],
    ['Sistema operativo', [device?.osName, device?.osVersion].filter(Boolean).join(' · ')],
    ['Build de sistema', device?.osBuildId],
    ['Build interno de sistema', device?.osInternalBuildId],
    ['Huella de build Android', device?.osBuildFingerprint],
    ['API Android', device?.platformApiLevel],
    ['Diseño / producto del equipo', [device?.designName, device?.productName].filter(Boolean).join(' / ')],
    ['Clase estimada del equipo', device?.deviceYearClass],
    ['App / build', [device?.appVersion, device?.appBuildVersion].filter(Boolean).join(' · ')],
    ['Identificador de app', device?.applicationId],
    ['Identificador de instalación', device?.installationId],
    ['App instalada', device?.appInstalledAt ? formatDateTime(device.appInstalledAt) : undefined],
    ['Última actualización de la app', device?.appLastUpdatedAt ? formatDateTime(device.appLastUpdatedAt) : undefined],
    ['Indicador root / jailbreak', device?.rooted],
    ['Desvío del reloj del teléfono', typeof punch.clockSkewMs === 'number' ? `${Math.round(punch.clockSkewMs / 1000)} s` : undefined]
  ].map(([label, value]) => ({ label, value: technicalValue(value) })).filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

  if (!entries.length) return null;
  return <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-zinc-700">Datos técnicos del dispositivo y red</summary><p className="mt-2 text-xs text-zinc-500">La IP del servidor y la hora oficial son datos de servidor. El resto es informado por el dispositivo y sirve como evidencia técnica, no como prueba única.</p><dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">{entries.map((entry) => <div key={entry.label}><dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{entry.label}</dt><dd className="mt-0.5 break-all text-xs text-zinc-800">{entry.value}</dd></div>)}</dl></details>;
}
