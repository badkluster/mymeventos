'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, Pencil, Plus, Search, ShieldCheck, Trash2, ToggleLeft, ToggleRight, UserCog, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, roleLabels } from '@/lib/display-labels';
import { userCanAccess } from '@/lib/admin-permissions';
import { Button, Input, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { UsersStaffTabs } from '@/components/admin/users-staff-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { useSession } from '@/components/session-provider';
import { Permission, Role } from '@mym/shared';

type Salon = { _id: string; name?: string; slug?: string; active?: boolean };
type User = {
  _id: string; username?: string; email?: string; firstName?: string; lastName?: string; fullName?: string; phone?: string; documentType?: string; documentNumber?: string; roles?: string[];
  salonIds?: Array<string | Salon>; managedSalonIds?: Array<string | Salon>; primarySalonId?: string | Salon; primaryManagedSalonId?: string | Salon;
  permissionOverrides?: string[]; permissionDeniedOverrides?: string[]; canAccessBackoffice?: boolean; active?: boolean; lastLoginAt?: string; employeeProfile?: { position?: string };
  staffProfile?: { staffCode?: string; staffSubroles?: string[]; employmentStatus?: string };
  attendanceConfig?: { enabled?: boolean; canUseMobileApp?: boolean };
};
type ListResponse = { users?: User[]; items?: User[]; meta?: { page: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean }; roles?: string[]; permissions?: string[] };

const emptyForm = { firstName: '', lastName: '', username: '', email: '', password: '', phone: '', documentType: 'DNI', documentNumber: '', roles: ['STAFF'], salonIds: [] as string[], managedSalonIds: [] as string[], primarySalonId: '', primaryManagedSalonId: '', canAccessBackoffice: false, active: true, position: '' };
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin acceso';
const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const name = (user: User) => user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || 'Usuario sin nombre';
const salonLabel = (items?: Array<string | Salon>) => items?.length ? items.map((item) => typeof item === 'string' ? item : item.name || item._id).join(', ') : 'Sin asignar';

export default function UsersPage() {
  const searchParams = useSearchParams();
  const staffView = searchParams?.get('view') === 'staff';
  const { showToast } = useToast();
  const { user: sessionUser } = useSession();
  const isAdmin = sessionUser?.roles?.includes('ADMIN') ?? false;
  const canCreate = userCanAccess(sessionUser, [Permission.USERS_CREATE]);
  const canUpdate = userCanAccess(sessionUser, [Permission.USERS_UPDATE]);
  const canDelete = userCanAccess(sessionUser, [Permission.USERS_DELETE]);
  const [items, setItems] = useState<User[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [roles, setRoles] = useState<string[]>(Object.keys(roleLabels));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', active: '', attendanceEnabled: '', canAccessBackoffice: '', page: 1 });
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<User | null>(null);
  const [modal, setModal] = useState<'create' | 'edit' | 'roles' | 'salons' | 'delete' | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
    Object.entries({ ...filters, role: staffView ? Role.STAFF : filters.role }).forEach(([key, value]) => { if (value && key !== 'page') params.set(key, String(value)); });
    return params.toString();
  }, [filters, staffView]);

  const load = useCallback(async () => {
    try {
      const [usersResponse, salonsResponse] = await Promise.all([api.get<ListResponse>(`/users?${query}`), api.get<{ salons: Salon[] }>('/salons?active=true')]);
      setItems(usersResponse.items ?? usersResponse.users ?? []);
      setRoles(usersResponse.roles ?? Object.keys(roleLabels));
      setSalons(salonsResponse.salons ?? []);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [query, showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal('create'); };
  const openEdit = (user: User, next: typeof modal) => {
    setEditing(user);
    setForm({
      firstName: user.firstName ?? '', lastName: user.lastName ?? '', username: user.username ?? '', email: user.email ?? '', password: '', phone: user.phone ?? '', documentType: user.documentType ?? 'DNI', documentNumber: user.documentNumber ?? '',
      roles: user.roles?.length ? user.roles : ['STAFF'],
      salonIds: (user.salonIds ?? []).map(entityId),
      managedSalonIds: (user.managedSalonIds ?? []).map(entityId),
      primarySalonId: entityId(user.primarySalonId),
      primaryManagedSalonId: entityId(user.primaryManagedSalonId),
      canAccessBackoffice: user.canAccessBackoffice === true,
      active: user.active !== false,
      position: user.employeeProfile?.position ?? ''
    });
    setModal(next);
  };
  const close = () => { setModal(null); setEditing(null); setSavingId(''); };
  const save = async () => {
    setSavingId(editing?._id ?? 'new');
    try {
      const editableBody = { firstName: form.firstName, lastName: form.lastName, phone: form.phone, documentType: form.documentType, documentNumber: form.documentNumber, salonIds: form.salonIds, managedSalonIds: form.managedSalonIds, primarySalonId: form.primarySalonId || undefined, primaryManagedSalonId: form.primaryManagedSalonId || undefined, canAccessBackoffice: form.canAccessBackoffice, active: form.active, employeeProfile: form.position ? { position: form.position, employmentStatus: 'active' } : undefined };
      if (modal === 'create') await api.post('/users', { ...editableBody, username: form.username, email: form.email || undefined, password: form.password, roles: form.roles });
      if (modal === 'edit' && editing) await api.patch(`/users/${editing._id}`, editableBody);
      if (modal === 'roles' && editing) await api.patch(`/users/${editing._id}/roles`, { roles: form.roles, primaryRole: form.roles[0] });
      if (modal === 'salons' && editing) {
        await api.patch(`/users/${editing._id}/salons`, { salonIds: form.salonIds, primarySalonId: form.primarySalonId || undefined });
        await api.patch(`/users/${editing._id}/managed-salons`, { managedSalonIds: form.managedSalonIds, primaryManagedSalonId: form.primaryManagedSalonId || undefined });
      }
      close(); await load(); showToast({ message: 'Usuario actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el usuario.', variant: 'error' });
      setSavingId('');
    }
  };
  const toggleActive = async (user: User) => {
    setSavingId(user._id);
    try { await api.patch(`/users/${user._id}/${user.active === false ? 'activate' : 'deactivate'}`, {}); await load(); showToast({ message: user.active === false ? 'Usuario activado.' : 'Usuario desactivado.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo actualizar el usuario.', variant: 'error' }); }
    finally { setSavingId(''); }
  };
  const deleteUser = async () => {
    if (!editing) return;
    setSavingId(editing._id);
    try { await api.delete(`/users/${editing._id}`); close(); await load(); showToast({ message: 'Usuario eliminado correctamente.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar el usuario.', variant: 'error' }); setSavingId(''); }
  };

  return <section className="space-y-6">
    <PageHeader title={staffView ? 'Staff operativo' : 'Usuarios y equipo'} description={staffView ? 'La misma lista de usuarios, filtrada por el rol Staff. La ficha, la asistencia y la configuración son únicas.' : 'Una única ficha por persona: roles, operación, salones y asistencia configurable.'} action={canCreate ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{staffView ? 'Nuevo staff' : 'Nuevo usuario'}</Button> : undefined} />
    <UsersStaffTabs />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[1fr_190px_150px_170px_190px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, page: 1, search: event.target.value }))} className="h-11 pl-10" placeholder="Buscar por usuario, nombre, email, teléfono..." /></div>
      <Select value={staffView ? Role.STAFF : filters.role} disabled={staffView} onChange={(event) => setFilters((current) => ({ ...current, page: 1, role: event.target.value }))}><option value="">Todos los roles</option>{roles.map((role) => <option key={role} value={role}>{displayLabel(roleLabels, role)}</option>)}</Select>
      <Select value={filters.active} onChange={(event) => setFilters((current) => ({ ...current, page: 1, active: event.target.value }))}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></Select>
      <Select value={filters.attendanceEnabled} onChange={(event) => setFilters((current) => ({ ...current, page: 1, attendanceEnabled: event.target.value }))}><option value="">Asistencia</option><option value="true">Habilitada</option><option value="false">No habilitada</option></Select>
      <Select value={filters.canAccessBackoffice} onChange={(event) => setFilters((current) => ({ ...current, page: 1, canAccessBackoffice: event.target.value }))}><option value="">Acceso backoffice</option><option value="true">Con acceso</option><option value="false">Sin acceso</option></Select>
      <Button variant="secondary" onClick={() => setFilters((current) => ({ ...current, page: 1 }))}>Filtrar</Button>
    </div>
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading ? <p className="p-8 text-sm text-zinc-500">Cargando usuarios...</p> : <div className="overflow-x-auto"><table className="min-w-[1320px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Usuario', 'Email', 'Teléfono', 'Roles', 'Backoffice', 'Salones', 'Salones a cargo', 'Estado', 'Último acceso'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((user) => <tr key={user._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4"><p className="font-medium text-zinc-900">{name(user)}</p><p className="mt-1 text-xs text-zinc-500">{user.username}</p></td><td className="px-5 py-4 text-zinc-700">{user.email || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{user.phone || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{user.roles?.map((role) => displayLabel(roleLabels, role)).join(', ') || 'Sin rol'}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${user.canAccessBackoffice ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>{user.canAccessBackoffice ? 'Con acceso' : 'Sin acceso'}</span></td><td className="px-5 py-4 text-zinc-700">{salonLabel(user.salonIds)}</td><td className="px-5 py-4 text-zinc-700">{salonLabel(user.managedSalonIds)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${user.active === false ? 'bg-zinc-100 text-zinc-700' : 'bg-emerald-50 text-emerald-700'}`}>{user.active === false ? 'Inactivo' : 'Activo'}</span></td><td className="px-5 py-4 text-zinc-700">{formatDate(user.lastLoginAt)}</td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/users/${user._id}`}><TableActionButton icon={Eye} label="Ver detalle" /></Link>{isAdmin ? <Link href={`/admin/users/${user._id}?tab=access`}><TableActionButton icon={ShieldCheck} label="Accesos y permisos" /></Link> : null}{canUpdate ? <TableActionButton icon={Pencil} label="Editar usuario" onClick={() => openEdit(user, 'edit')} /> : null}{isAdmin ? <TableActionButton icon={UserCog} label="Roles" onClick={() => openEdit(user, 'roles')} /> : null}{canUpdate ? <TableActionButton icon={ShieldCheck} label="Salones" onClick={() => openEdit(user, 'salons')} /> : null}{canUpdate ? <TableActionButton icon={user.active === false ? ToggleRight : ToggleLeft} label={user.active === false ? 'Activar' : 'Desactivar'} disabled={savingId === user._id} onClick={() => void toggleActive(user)} /> : null}{canDelete ? <TableActionButton icon={Trash2} label="Eliminar" disabled={savingId === user._id} onClick={() => openEdit(user, 'delete')} /> : null}</div></td></tr>)}</tbody></table>{items.length === 0 ? <Empty /> : null}</div>}
    </article>
    <UserModal modal={modal} form={form} setForm={setForm} roles={roles} salons={salons} saving={Boolean(savingId)} editing={editing} onClose={close} onSave={() => void save()} onDelete={() => void deleteUser()} />
  </section>;
}

function toggle(list: string[], value: string) { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }
function UserModal({ modal, form, setForm, roles, salons, saving, editing, onClose, onSave, onDelete }: { modal: string | null; form: typeof emptyForm; setForm: Dispatch<SetStateAction<typeof emptyForm>>; roles: string[]; salons: Salon[]; saving: boolean; editing: User | null; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  if (!modal) return null;
  if (modal === 'delete') return <Modal open title="Eliminar usuario" description={`Se eliminará lógicamente a ${editing ? name(editing) : 'este usuario'}.`} onClose={onClose}><div className="space-y-5 p-6"><p className="text-sm text-zinc-600">El usuario quedará inactivo y no podrá iniciar sesión. No se borran auditorías ni referencias históricas.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={onDelete}>Eliminar</Button></div></div></Modal>;
  const canSubmit = Boolean(form.roles.length && (modal !== 'create' || (form.firstName.trim() && form.lastName.trim() && form.username.trim().length >= 3 && form.password.length >= 8)));
  return <Modal open title={modal === 'create' ? 'Nuevo usuario' : modal === 'roles' ? 'Asignar roles' : modal === 'salons' ? 'Asignar salones' : 'Editar usuario'} onClose={onClose}><div className="space-y-5 p-6">
    {(modal === 'create' || modal === 'edit') && <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Nombre" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /><Input placeholder="Apellido" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /><Input placeholder="Usuario" value={form.username} disabled={modal === 'edit'} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /><Input placeholder="Email" type="email" value={form.email} disabled={modal === 'edit'} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /><Input placeholder="Teléfono" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /><Select value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}><option value="DNI">DNI</option><option value="CUIL">CUIL</option><option value="CUIT">CUIT</option><option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otro</option></Select><Input placeholder="Número de documento" value={form.documentNumber} onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))} />{modal === 'create' ? <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-zinc-700">Contraseña inicial</span><Input type="password" autoComplete="new-password" minLength={8} required placeholder="Mínimo 8 caracteres" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><p className="mt-1.5 text-xs text-zinc-500">Es obligatoria y permite iniciar sesión. Un usuario Staff activo queda habilitado para entrar a la app móvil.</p></label> : <Input placeholder="Cargo / posición" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} />}</div>}
    {(modal === 'create' || modal === 'edit' || modal === 'roles') && <section><h3 className="text-sm font-semibold text-zinc-900">Roles</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{roles.map((role) => <label key={role} className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"><input type="checkbox" checked={form.roles.includes(role)} onChange={() => setForm((current) => ({ ...current, roles: toggle(current.roles, role) }))} />{displayLabel(roleLabels, role)}</label>)}</div></section>}
    {(modal === 'create' || modal === 'edit' || modal === 'salons') && <section className="grid gap-5 md:grid-cols-2"><div><h3 className="text-sm font-semibold text-zinc-900">Salones con acceso</h3><div className="mt-3 space-y-2">{salons.map((salon) => <label key={salon._id} className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"><input type="checkbox" checked={form.salonIds.includes(salon._id)} onChange={() => setForm((current) => ({ ...current, salonIds: toggle(current.salonIds, salon._id), primarySalonId: current.primarySalonId === salon._id ? '' : current.primarySalonId }))} />{salon.name}</label>)}</div><Select className="mt-3" value={form.primarySalonId} onChange={(event) => setForm((current) => ({ ...current, primarySalonId: event.target.value }))}><option value="">Salón principal</option>{salons.filter((salon) => form.salonIds.includes(salon._id)).map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></div><div><h3 className="text-sm font-semibold text-zinc-900">Salones a cargo</h3><div className="mt-3 space-y-2">{salons.map((salon) => <label key={salon._id} className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"><input type="checkbox" checked={form.managedSalonIds.includes(salon._id)} onChange={() => setForm((current) => ({ ...current, managedSalonIds: toggle(current.managedSalonIds, salon._id), salonIds: current.salonIds.includes(salon._id) ? current.salonIds : [...current.salonIds, salon._id], primaryManagedSalonId: current.primaryManagedSalonId === salon._id ? '' : current.primaryManagedSalonId }))} />{salon.name}</label>)}</div><Select className="mt-3" value={form.primaryManagedSalonId} onChange={(event) => setForm((current) => ({ ...current, primaryManagedSalonId: event.target.value }))}><option value="">Salón principal a cargo</option>{salons.filter((salon) => form.managedSalonIds.includes(salon._id)).map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></div></section>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />Usuario activo</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.canAccessBackoffice} onChange={(event) => setForm((current) => ({ ...current, canAccessBackoffice: event.target.checked }))} />Acceso al backoffice</label>
    </div>
    <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !canSubmit} onClick={onSave}>Guardar</Button></div>
  </div></Modal>;
}
function Empty() { return <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><Users className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay usuarios</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los usuarios creados para operar el backoffice aparecerán en este listado.</p></div>; }
