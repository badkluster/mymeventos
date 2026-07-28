'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, BriefcaseBusiness, Clock3, KeyRound, MapPin, Save, ShieldCheck, UserRound, UserRoundCog } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, roleLabels, staffSubroleLabels } from '@/lib/display-labels';
import { userCanAccess } from '@/lib/admin-permissions';
import { permissionAreas } from '@/lib/permission-areas';
import { Button, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { useSession } from '@/components/session-provider';
import { formatMinutes, salonName, workSessionStatusLabels, type AttendanceAdjustmentRequest, type AttendanceIncident, type WorkSession } from '@/features/attendance/types';
import { Permission, Role, RolePresets, StaffSubrole } from '@mym/shared';

type Salon = { _id: string; name?: string; slug?: string; active?: boolean };
type User = {
  _id: string; username?: string; email?: string; firstName?: string; lastName?: string; fullName?: string; phone?: string; documentType?: string; documentNumber?: string;
  roles?: string[]; primaryRole?: string; permissionOverrides?: string[]; permissionDeniedOverrides?: string[]; canAccessBackoffice?: boolean; active?: boolean; mustChangePassword?: boolean; lastLoginAt?: string;
  salonIds?: Array<string | Salon>; managedSalonIds?: Array<string | Salon>; primarySalonId?: string | Salon; primaryManagedSalonId?: string | Salon;
  notificationPreferences?: Record<string, boolean>;
  employeeProfile?: { employeeCode?: string; position?: string; department?: string; employmentStatus?: string; emergencyContactName?: string; emergencyContactPhone?: string; notes?: string };
  staffProfile?: { staffCode?: string; staffSubroles?: string[]; employmentStatus?: string; notes?: string };
  workSchedule?: { type?: string; weeklyAvailability?: Array<{ dayOfWeek: number; enabled?: boolean; startTime?: string; endTime?: string }>; notes?: string };
  attendanceConfig?: { enabled?: boolean; canUseMobileApp?: boolean; requiresGeolocation?: boolean; requiresWifiOrIpValidation?: boolean; allowedIpAddresses?: string[]; allowManualAdjustment?: boolean; notes?: string };
};
type DetailResponse = { user: User; roles: string[]; permissions: string[] };
type Tab = 'profile' | 'access' | 'notifications' | 'employee' | 'operation' | 'attendance';
type AttendanceOverview = {
  sessions: WorkSession[];
  sessionTotal: number;
  incidents: AttendanceIncident[];
  incidentTotal: number;
  adjustments: AttendanceAdjustmentRequest[];
  adjustmentTotal: number;
};

const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const entityName = (value: unknown) => typeof value === 'string' ? value : (value as Salon | undefined)?.name ?? entityId(value);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin acceso';
const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
const name = (user?: User) => user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || user?.email || 'Usuario';
const toggle = (items: string[], value: string) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
const toStaffEmploymentStatus = (value: string) => value.toUpperCase();
function grantedByRole(roles: string[], permission: Permission): boolean { return roles.includes(Role.ADMIN) || roles.some((role) => (RolePresets[role as Role] ?? []).includes(permission)); }
function effectivePermission(roles: string[], draft: { allow: string[]; deny: string[] }, permission: Permission): boolean { if (roles.includes(Role.ADMIN)) return true; if (draft.deny.includes(permission)) return false; return grantedByRole(roles, permission) || draft.allow.includes(permission); }
function setExplicitPermission(draft: { allow: string[]; deny: string[] }, roles: string[], permission: Permission, enabled: boolean) {
  const inherited = grantedByRole(roles, permission);
  if (enabled) return { allow: inherited ? draft.allow.filter((item) => item !== permission) : [...new Set([...draft.allow, permission])], deny: draft.deny.filter((item) => item !== permission) };
  return { allow: draft.allow.filter((item) => item !== permission), deny: inherited ? [...new Set([...draft.deny, permission])] : draft.deny.filter((item) => item !== permission) };
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const userId = params?.id ?? '';
  const { showToast } = useToast();
  const { user: sessionUser } = useSession();
  const isAdmin = sessionUser?.roles?.includes('ADMIN') ?? false;
  const canUpdate = userCanAccess(sessionUser, [Permission.USERS_UPDATE]);
  const canReadAttendance = userCanAccess(sessionUser, [Permission.ATTENDANCE_READ]);
  const canManagePayrollProfiles = userCanAccess(sessionUser, [Permission.PAYROLL_MANAGE_PROFILES, Permission.PAYROLL_MANAGE]);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>(Object.keys(roleLabels));
  const [permissions, setPermissions] = useState<string[]>(Object.values(Permission));
  const requestedTab = searchParams?.get('tab');
  const [tab, setTab] = useState<Tab>(requestedTab === 'access' || requestedTab === 'employee' || requestedTab === 'operation' || requestedTab === 'attendance' || requestedTab === 'notifications' ? requestedTab : 'profile');
  const [saving, setSaving] = useState('');
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [permissionDraft, setPermissionDraft] = useState({ allow: [] as string[], deny: [] as string[] });
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [employee, setEmployee] = useState({ employeeCode: '', position: '', department: '', employmentStatus: 'active', emergencyContactName: '', emergencyContactPhone: '', notes: '' });
  const [operation, setOperation] = useState({ staffCode: '', staffSubroles: [] as string[], notes: '', scheduleType: 'EVENT_BASED', scheduleNotes: '' });
  const [attendance, setAttendance] = useState({ enabled: false, canUseMobileApp: true, requiresGeolocation: false, requiresWifiOrIpValidation: false, allowedIpAddresses: '', allowManualAdjustment: false, notes: '' });
  const [attendanceOverview, setAttendanceOverview] = useState<AttendanceOverview | null>(null);
  const [attendanceOverviewLoading, setAttendanceOverviewLoading] = useState(false);
  const [attendanceOverviewError, setAttendanceOverviewError] = useState('');

  const load = useCallback(async () => {
    const response = await api.get<DetailResponse>(`/users/${userId}`);
    setUser(response.user);
    setRoles(response.roles ?? Object.keys(roleLabels));
    setPermissions(response.permissions ?? Object.values(Permission));
    setRoleDraft(response.user.roles ?? []);
    setPermissionDraft({ allow: response.user.permissionOverrides ?? [], deny: response.user.permissionDeniedOverrides ?? [] });
    setNotifications(response.user.notificationPreferences ?? {});
    setEmployee({
      employeeCode: response.user.employeeProfile?.employeeCode ?? '',
      position: response.user.employeeProfile?.position ?? '',
      department: response.user.employeeProfile?.department ?? '',
      employmentStatus: response.user.employeeProfile?.employmentStatus ?? response.user.staffProfile?.employmentStatus?.toLowerCase() ?? 'active',
      emergencyContactName: response.user.employeeProfile?.emergencyContactName ?? '',
      emergencyContactPhone: response.user.employeeProfile?.emergencyContactPhone ?? '',
      notes: response.user.employeeProfile?.notes ?? ''
    });
    setOperation({
      staffCode: response.user.staffProfile?.staffCode ?? '',
      staffSubroles: response.user.staffProfile?.staffSubroles ?? [],
      notes: response.user.staffProfile?.notes ?? '',
      scheduleType: response.user.workSchedule?.type ?? 'EVENT_BASED',
      scheduleNotes: response.user.workSchedule?.notes ?? ''
    });
    setAttendance({
      enabled: response.user.attendanceConfig?.enabled ?? false,
      canUseMobileApp: response.user.attendanceConfig?.canUseMobileApp ?? true,
      requiresGeolocation: response.user.attendanceConfig?.requiresGeolocation ?? false,
      requiresWifiOrIpValidation: response.user.attendanceConfig?.requiresWifiOrIpValidation ?? false,
      allowedIpAddresses: response.user.attendanceConfig?.allowedIpAddresses?.join('\n') ?? '',
      allowManualAdjustment: response.user.attendanceConfig?.allowManualAdjustment ?? false,
      notes: response.user.attendanceConfig?.notes ?? ''
    });
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el usuario.', variant: 'error' })); }, [load, showToast]);

  const loadAttendanceOverview = useCallback(async () => {
    if (!userId || !canReadAttendance) return;
    setAttendanceOverviewLoading(true);
    setAttendanceOverviewError('');
    try {
      const query = new URLSearchParams({ userId, page: '1', limit: '8' });
      const [sessionsResponse, incidentsResponse, adjustmentsResponse] = await Promise.all([
        api.get<{ items: WorkSession[]; total: number }>(`/attendance/sessions?${query.toString()}`),
        api.get<{ items: AttendanceIncident[]; total: number }>(`/attendance/incidents?${query.toString()}`),
        api.get<{ items: AttendanceAdjustmentRequest[]; total: number }>(`/attendance/adjustments?${query.toString()}`)
      ]);
      setAttendanceOverview({
        sessions: sessionsResponse.items ?? [],
        sessionTotal: sessionsResponse.total ?? 0,
        incidents: incidentsResponse.items ?? [],
        incidentTotal: incidentsResponse.total ?? 0,
        adjustments: adjustmentsResponse.items ?? [],
        adjustmentTotal: adjustmentsResponse.total ?? 0
      });
    } catch (error) {
      setAttendanceOverview(null);
      setAttendanceOverviewError(error instanceof Error ? error.message : 'No se pudo cargar el resumen de asistencia.');
    } finally {
      setAttendanceOverviewLoading(false);
    }
  }, [canReadAttendance, userId]);

  useEffect(() => {
    if (tab !== 'attendance') return;
    const timer = window.setTimeout(() => void loadAttendanceOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadAttendanceOverview]);

  const primarySalon = useMemo(() => entityName(user?.primarySalonId) || 'Sin principal', [user]);
  const managedSalon = useMemo(() => entityName(user?.primaryManagedSalonId) || 'Sin principal a cargo', [user]);
  const isStaff = user?.roles?.includes(Role.STAFF) ?? false;
  const save = async (section: Tab) => {
    setSaving(section);
    try {
      if (section === 'access') {
        await api.patch(`/users/${userId}/roles`, { roles: roleDraft, primaryRole: roleDraft[0] });
        await api.patch(`/users/${userId}/permissions`, { permissionOverrides: permissionDraft.allow, permissionDeniedOverrides: permissionDraft.deny });
        const canAccessBackoffice = roleDraft.includes(Role.ADMIN) || permissionAreas.some((area) => effectivePermission(roleDraft, permissionDraft, area.accessPermission));
        await api.patch(`/users/${userId}`, { canAccessBackoffice });
      }
      if (section === 'notifications') await api.patch(`/users/${userId}/notification-preferences`, notifications);
      if (section === 'employee') {
        await api.patch(`/users/${userId}/employee-profile`, employee);
        if (isStaff) await api.patch(`/users/${userId}/staff-profile`, { staffCode: operation.staffCode, staffSubroles: operation.staffSubroles, employmentStatus: toStaffEmploymentStatus(employee.employmentStatus), notes: operation.notes });
      }
      if (section === 'operation') await Promise.all([
        api.patch(`/users/${userId}/staff-profile`, { staffCode: operation.staffCode, staffSubroles: operation.staffSubroles, employmentStatus: toStaffEmploymentStatus(employee.employmentStatus), notes: operation.notes }),
        api.patch(`/users/${userId}/work-schedule`, { type: operation.scheduleType, weeklyAvailability: user?.workSchedule?.weeklyAvailability ?? [], notes: operation.scheduleNotes })
      ]);
      if (section === 'attendance') await api.patch(`/users/${userId}/attendance-config`, { ...attendance, allowedIpAddresses: attendance.allowedIpAddresses.split('\n').map((item) => item.trim()).filter(Boolean) });
      await load();
      showToast({ message: 'Usuario actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el usuario.', variant: 'error' });
    } finally {
      setSaving('');
    }
  };
  const resetPassword = async (generateTemporary = false) => {
    if (!generateTemporary && resetPasswordValue.length < 8) {
      showToast({ message: 'La nueva contraseña debe tener al menos 8 caracteres.', variant: 'error' });
      return;
    }
    setSaving('password');
    setTemporaryPassword('');
    try {
      const response = await api.post<{ temporaryPassword?: string }>(`/users/${userId}/reset-password`, generateTemporary ? {} : { password: resetPasswordValue });
      setTemporaryPassword(response.temporaryPassword ?? resetPasswordValue);
      setResetPasswordValue('');
      setResetPasswordOpen(false);
      await load();
      showToast({ message: 'Contraseña restablecida. Se revocaron las sesiones que pueden renovarse.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo reiniciar la contraseña.', variant: 'error' });
    } finally {
      setSaving('');
    }
  };

  if (!user) return <section className="space-y-6"><PageHeader title="Usuario" description="Cargando información del usuario..." /></section>;

  return <section className="space-y-6">
    <PageHeader title={name(user)} description={`${user.email ?? 'Sin email'} · ${user.active === false ? 'Inactivo' : 'Activo'}`} action={<Link href="/admin/users"><Button variant="secondary"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button></Link>} />
    <div className="grid gap-4 lg:grid-cols-4">
      <SummaryCard label="Roles" value={user.roles?.map((role) => displayLabel(roleLabels, role)).join(', ') || 'Sin rol'} icon={<ShieldCheck className="h-5 w-5" />} />
      <SummaryCard label="Salón principal" value={primarySalon} icon={<MapPin className="h-5 w-5" />} />
      <SummaryCard label="Salón a cargo" value={managedSalon} icon={<BriefcaseBusiness className="h-5 w-5" />} />
      <SummaryCard label="Último acceso" value={formatDate(user.lastLoginAt)} icon={<Clock3 className="h-5 w-5" />} />
    </div>
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">
      {[
        ['profile', UserRound, 'Perfil'],
        ...(isAdmin ? [['access', KeyRound, 'Roles y permisos']] : []),
        ['notifications', Bell, 'Notificaciones'],
        ['employee', BriefcaseBusiness, 'Empleado'],
        ...(isStaff ? [['operation', UserRoundCog, 'Operación']] : []),
        ['attendance', Clock3, 'Asistencia']
      ].map(([key, Icon, label]) => <button key={key as string} onClick={() => setTab(key as Tab)} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab === key ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}><Icon className="h-4 w-4" />{label as string}</button>)}
    </div>
    {tab === 'profile' && <Panel title="Perfil y alcance">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Usuario" value={user.username} />
        <Field label="Email" value={user.email} />
        <Field label="Teléfono" value={user.phone} />
        <Field label="Documento" value={[user.documentType, user.documentNumber].filter(Boolean).join(' ')} />
        <Field label="Debe cambiar contraseña" value={user.mustChangePassword ? 'Sí' : 'No'} />
        <Field label="Acceso backoffice" value={user.canAccessBackoffice ? 'Sí' : 'No'} />
        <Field label="Estado" value={user.active === false ? 'Inactivo' : 'Activo'} />
      </div>
      <SalonList title="Salones con acceso" items={user.salonIds} />
      <SalonList title="Salones a cargo" items={user.managedSalonIds} />
      {isAdmin ? <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-zinc-900">Seguridad de cuenta</h3><p className="mt-1 text-sm text-zinc-600">Como administrador podés definir una nueva clave o generar una temporal. Se revocan las sesiones que podrían renovarse.</p></div><Button variant="danger" disabled={saving === 'password'} onClick={() => setResetPasswordOpen((current) => !current)}>{resetPasswordOpen ? 'Cancelar reseteo' : 'Restablecer contraseña'}</Button></div>{resetPasswordOpen ? <div className="mt-4 grid gap-3 rounded-xl border border-amber-200 bg-white p-3 md:grid-cols-[1fr_auto_auto]"><Input type="password" autoComplete="new-password" minLength={8} placeholder="Nueva contraseña (mínimo 8 caracteres)" value={resetPasswordValue} onChange={(event) => setResetPasswordValue(event.target.value)} /><Button variant="secondary" disabled={saving === 'password'} onClick={() => void resetPassword(true)}>Generar temporal</Button><Button disabled={saving === 'password' || resetPasswordValue.length < 8} onClick={() => void resetPassword()}>Guardar clave</Button></div> : null}{temporaryPassword ? <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Clave temporal o nueva clave</p><p className="mt-1 break-all font-mono text-sm text-zinc-900">{temporaryPassword}</p><p className="mt-1 text-xs text-zinc-500">Copiala ahora y compartila por un canal seguro; no volverá a mostrarse al recargar.</p></div> : null}</section> : null}
    </Panel>}
    {tab === 'access' && <Panel title="Accesos y permisos" action={<Button disabled={saving === 'access' || !roleDraft.length} onClick={() => void save('access')}><Save className="mr-2 h-4 w-4" />Guardar accesos</Button>}>
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><h3 className="text-sm font-semibold text-zinc-900">Rol base</h3><p className="mt-1 text-sm text-zinc-500">El rol propone permisos iniciales. Los accesos por área de abajo permiten ajustarlos de forma simple.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{roles.map((role) => <Check key={role} label={displayLabel(roleLabels, role)} checked={roleDraft.includes(role)} onChange={() => setRoleDraft((current) => toggle(current, role))} />)}</div></section>
      {roleDraft.includes(Role.ADMIN) ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><b>Administrador:</b> tiene acceso completo a todas las áreas y acciones. Sus permisos no pueden limitarse.</div> : <section><div className="mb-4"><h3 className="text-base font-semibold text-zinc-950">Áreas del backoffice</h3><p className="mt-1 text-sm text-zinc-500">El interruptor controla si el área aparece en el menú y si el usuario puede ingresar. Al habilitarla se muestran sus acciones.</p></div><div className="grid gap-4 xl:grid-cols-2">{permissionAreas.filter((area) => permissions.includes(area.accessPermission)).map((area) => { const enabled = effectivePermission(roleDraft, permissionDraft, area.accessPermission); return <article key={area.id} className={`rounded-2xl border p-4 transition ${enabled ? 'border-zinc-300 bg-white shadow-sm' : 'border-zinc-200 bg-zinc-50/70'}`}><header className="flex items-start justify-between gap-4"><div><h4 className="font-semibold text-zinc-950">{area.title}</h4><p className="mt-1 text-sm text-zinc-500">{area.description}</p></div><AreaSwitch checked={enabled} label={area.title} onChange={() => setPermissionDraft((current) => enabled ? area.permissions.reduce((draft, item) => setExplicitPermission(draft, roleDraft, item.permission, false), current) : setExplicitPermission(current, roleDraft, area.accessPermission, true))} /></header>{enabled ? <div className="mt-4 border-t border-zinc-100 pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Acciones permitidas</p><div className="flex flex-wrap gap-2">{area.permissions.map((item) => { const checked = effectivePermission(roleDraft, permissionDraft, item.permission); const inherited = grantedByRole(roleDraft, item.permission) && !permissionDraft.deny.includes(item.permission); return <button key={item.permission} type="button" onClick={() => setPermissionDraft((current) => setExplicitPermission(current, roleDraft, item.permission, !checked))} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${checked ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400'}`}>{item.label}{inherited ? <span className="ml-1 opacity-60">· rol</span> : ''}</button>; })}</div></div> : <p className="mt-4 border-t border-zinc-200 pt-3 text-sm text-zinc-500">No visible en el menú y sin acceso a la sección.</p>}</article>; })}</div></section>}
    </Panel>}
    {tab === 'notifications' && <Panel title="Preferencias de notificación" action={canUpdate ? <Button disabled={saving === 'notifications'} onClick={() => void save('notifications')}><Save className="mr-2 h-4 w-4" />Guardar</Button> : undefined}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{['emailNotificationsEnabled','systemNotificationsEnabled','notifyOnNewLead','notifyOnNewQuoteRequest','notifyOnQuoteApproved','notifyOnContractApproved','notifyOnPaymentReceived','paymentReminder','notifyOnEventReminder','notifyOnAssignedTask'].map((key) => <Check key={key} label={displayLabel(notificationLabels, key)} checked={notifications[key] !== false} onChange={() => setNotifications((current) => ({ ...current, [key]: current[key] === false }))} />)}</div>
    </Panel>}
    {tab === 'employee' && <Panel title="Ficha laboral" action={canUpdate ? <Button disabled={saving === 'employee'} onClick={() => void save('employee')}><Save className="mr-2 h-4 w-4" />Guardar</Button> : undefined}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Legajo"><Input value={employee.employeeCode} onChange={(event) => setEmployee((current) => ({ ...current, employeeCode: event.target.value }))} /></FormField>
        <FormField label="Cargo"><Input value={employee.position} onChange={(event) => setEmployee((current) => ({ ...current, position: event.target.value }))} /></FormField>
        <FormField label="Área"><Input value={employee.department} onChange={(event) => setEmployee((current) => ({ ...current, department: event.target.value }))} /></FormField>
        <FormField label="Estado laboral"><Select value={employee.employmentStatus} onChange={(event) => setEmployee((current) => ({ ...current, employmentStatus: event.target.value }))}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="suspended">Suspendido</option><option value="terminated">Finalizado</option></Select></FormField>
        <FormField label="Contacto de emergencia"><Input value={employee.emergencyContactName} onChange={(event) => setEmployee((current) => ({ ...current, emergencyContactName: event.target.value }))} /></FormField>
        <FormField label="Teléfono de emergencia"><Input type="tel" value={employee.emergencyContactPhone} onChange={(event) => setEmployee((current) => ({ ...current, emergencyContactPhone: event.target.value }))} /></FormField>
      </div>
      <FormField label="Notas internas"><Textarea value={employee.notes} onChange={(event) => setEmployee((current) => ({ ...current, notes: event.target.value }))} /></FormField>
    </Panel>}
    {tab === 'operation' && isStaff && <Panel title="Operación, horario y liquidación" action={canUpdate ? <Button disabled={saving === 'operation'} onClick={() => void save('operation')}><Save className="mr-2 h-4 w-4" />Guardar</Button> : undefined}>
      <p className="-mt-2 text-sm text-zinc-500">Estas opciones aparecen porque tiene el rol Staff. El estado laboral se administra en la pestaña Empleado y se mantiene sincronizado.</p>
      <section className="space-y-3"><div><h3 className="text-sm font-semibold text-zinc-900">Perfil operativo</h3><p className="mt-1 text-sm text-zinc-500">Identificación y especialidades para asignaciones de eventos.</p></div><div className="grid gap-4 md:grid-cols-2"><FormField label="Código de staff"><Input value={operation.staffCode} onChange={(event) => setOperation((current) => ({ ...current, staffCode: event.target.value }))} /></FormField><FormField label="Notas operativas"><Input value={operation.notes} onChange={(event) => setOperation((current) => ({ ...current, notes: event.target.value }))} /></FormField></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.values(StaffSubrole).map((subrole) => <Check key={subrole} label={displayLabel(staffSubroleLabels, subrole)} checked={operation.staffSubroles.includes(subrole)} onChange={() => setOperation((current) => ({ ...current, staffSubroles: toggle(current.staffSubroles, subrole) }))} />)}</div></section>
      <section className="border-t border-zinc-100 pt-5"><div><h3 className="text-sm font-semibold text-zinc-900">Horario</h3><p className="mt-1 text-sm text-zinc-500">La disponibilidad semanal se mantiene para una configuración posterior; esta ficha define la modalidad.</p></div><div className="mt-3 grid gap-4 md:grid-cols-2"><FormField label="Modalidad"><Select value={operation.scheduleType} onChange={(event) => setOperation((current) => ({ ...current, scheduleType: event.target.value }))}><option value="EVENT_BASED">Por evento</option><option value="FIXED">Fijo</option><option value="FLEXIBLE">Flexible</option></Select></FormField><FormField label="Notas de horario"><Input value={operation.scheduleNotes} onChange={(event) => setOperation((current) => ({ ...current, scheduleNotes: event.target.value }))} /></FormField></div></section>
      <section className="border-t border-zinc-100 pt-5"><div><h3 className="text-sm font-semibold text-zinc-900">Liquidación</h3><p className="mt-1 text-sm text-zinc-500">La modalidad de pago, importes y vigencias se administran únicamente desde Liquidación de Sueldos para que exista una sola fuente de verdad.</p></div>{canManagePayrollProfiles ? <Link href={`/admin/payroll?tab=profiles&employeeId=${encodeURIComponent(userId)}`} className="mt-3 inline-flex items-center rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-500 hover:bg-zinc-50">Abrir configuración de liquidación</Link> : <p className="mt-3 text-sm text-zinc-500">Tu perfil no tiene permiso para modificar la configuración salarial.</p>}</section>
    </Panel>}
    {tab === 'attendance' && <div className="space-y-5">
      <Panel title="Resumen de asistencia">
        {!canReadAttendance ? <EmptyAttendance message="No tenés permiso para ver el historial de asistencia." /> : attendanceOverviewLoading ? <p className="text-sm text-zinc-500">Cargando el resumen de asistencia…</p> : attendanceOverviewError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{attendanceOverviewError}</p> : <AttendanceSummary overview={attendanceOverview} />}
      </Panel>
      <Panel title="Configuración de registro horario" action={canUpdate ? <Button disabled={saving === 'attendance'} onClick={() => void save('attendance')}><Save className="mr-2 h-4 w-4" />Guardar</Button> : undefined}>
        <p className="-mt-2 text-sm text-zinc-500">La asistencia es una capacidad individual: puede habilitarse para cualquier usuario, independientemente de su rol. Los staff nuevos ya la reciben habilitada.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Check label="Asistencia habilitada" checked={attendance.enabled} onChange={() => setAttendance((current) => ({ ...current, enabled: !current.enabled }))} /><Check label="App móvil" checked={attendance.canUseMobileApp} onChange={() => setAttendance((current) => ({ ...current, canUseMobileApp: !current.canUseMobileApp }))} /><Check label="Geolocalización" checked={attendance.requiresGeolocation} onChange={() => setAttendance((current) => ({ ...current, requiresGeolocation: !current.requiresGeolocation }))} /><Check label="Validar red/IP" checked={attendance.requiresWifiOrIpValidation} onChange={() => setAttendance((current) => ({ ...current, requiresWifiOrIpValidation: !current.requiresWifiOrIpValidation }))} /><Check label="Permitir ajuste manual" checked={attendance.allowManualAdjustment} onChange={() => setAttendance((current) => ({ ...current, allowManualAdjustment: !current.allowManualAdjustment }))} /></div>
        <div className="grid gap-4 md:grid-cols-2"><FormField label="IPs permitidas"><Textarea className="min-h-28" placeholder="Una IP por línea" value={attendance.allowedIpAddresses} onChange={(event) => setAttendance((current) => ({ ...current, allowedIpAddresses: event.target.value }))} /></FormField><FormField label="Notas de asistencia"><Textarea className="min-h-28" value={attendance.notes} onChange={(event) => setAttendance((current) => ({ ...current, notes: event.target.value }))} /></FormField></div>
      </Panel>
    </div>}
  </section>;
}

const notificationLabels: Record<string, string> = {
  emailNotificationsEnabled: 'Email', systemNotificationsEnabled: 'Sistema', notifyOnNewLead: 'Nuevo lead', notifyOnNewQuoteRequest: 'Solicitud de presupuesto', notifyOnQuoteApproved: 'Presupuesto aprobado', notifyOnContractApproved: 'Contrato aprobado', notifyOnPaymentReceived: 'Pago recibido', paymentReminder: 'Recordatorios financieros', notifyOnEventReminder: 'Recordatorio de evento', notifyOnAssignedTask: 'Tarea asignada'
};
function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-zinc-500">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div><p className="mt-3 text-sm font-semibold text-zinc-950">{value}</p></article>; }
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <article className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-zinc-950">{title}</h2>{action}</header>{children}</article>; }
function Field({ label, value }: { label: string; value?: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 text-sm text-zinc-900">{value || 'No informado'}</p></div>; }
function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-zinc-700"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) { return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm text-zinc-800"><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>; }
function SalonList({ title, items }: { title: string; items?: Array<string | Salon> }) { return <section><h3 className="text-sm font-semibold text-zinc-900">{title}</h3><div className="mt-3 flex flex-wrap gap-2">{items?.length ? items.map((item) => <span key={entityId(item)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700">{entityName(item)}</span>) : <span className="text-sm text-zinc-500">Sin asignar</span>}</div></section>; }
function AreaSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) { return <button type="button" role="switch" aria-checked={checked} aria-label={`${checked ? 'Quitar' : 'Dar'} acceso a ${label}`} onClick={onChange} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-zinc-300'}`}><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} /></button>; }

function EmptyAttendance({ message }: { message: string }) { return <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">{message}</div>; }
function AttendanceSummary({ overview }: { overview: AttendanceOverview | null }) {
  if (!overview) return <EmptyAttendance message="Todavía no hay jornadas de asistencia para mostrar." />;
  const activeSession = overview.sessions.find((session) => session.status === 'active');
  const latestMinutes = overview.sessions.reduce((total, session) => total + (session.workedMinutes ?? 0), 0);
  const reviewCount = overview.sessions.filter((session) => session.requiresReview).length;
  const pendingItems = overview.incidents.filter((incident) => incident.status === 'pending' || incident.status === 'in_review').length + overview.adjustments.filter((adjustment) => adjustment.status === 'pending').length;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AttendanceMetric label="Estado actual" value={activeSession ? 'En jornada' : 'Sin jornada activa'} detail={activeSession ? `Desde ${formatDateTime(activeSession.startedAt)}` : 'Sin registro de horario activo'} />
      <AttendanceMetric label="Jornadas registradas" value={String(overview.sessionTotal)} detail="Historial completo" />
      <AttendanceMetric label="Horas recientes" value={formatMinutes(latestMinutes)} detail={`Últimas ${overview.sessions.length} jornadas`} />
      <AttendanceMetric label="Pendientes" value={String(pendingItems + reviewCount)} detail="Revisiones, incidencias y ajustes" />
    </div>
    {!overview.sessions.length ? <EmptyAttendance message="Este empleado todavía no registró jornadas." /> : <div className="overflow-hidden rounded-xl border border-zinc-200"><div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3"><h3 className="text-sm font-semibold text-zinc-900">Últimas jornadas</h3></div><div className="overflow-x-auto"><table className="min-w-[680px] w-full text-sm"><thead className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Inicio</th><th className="px-4 py-3">Salón</th><th className="px-4 py-3">Horas</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-zinc-100">{overview.sessions.map((session) => <tr key={session._id}><td className="px-4 py-3 text-zinc-700">{formatDateTime(session.startedAt)}</td><td className="px-4 py-3 text-zinc-700">{salonName(session.salonId)}</td><td className="px-4 py-3 font-medium text-zinc-950">{formatMinutes(session.workedMinutes)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${session.requiresReview ? 'bg-amber-100 text-amber-700' : session.status === 'active' || session.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{session.requiresReview ? 'Revisar' : workSessionStatusLabels[session.status]}</span></td></tr>)}</tbody></table></div></div>}
  </div>;
}
function AttendanceMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-lg font-semibold text-zinc-950">{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></article>; }
