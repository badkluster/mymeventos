'use client';

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye, PackageCheck, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { slugify } from '@/lib/slugify';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import type { Salon, UserOption } from '@/features/salons/types';

type SalonForm = {
  name: string;
  slug: string;
  address: string;
  city: string;
  whatsapp: string;
  email: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  managerUserId: string;
  maxCapacity: number;
  active: boolean;
  visibleOnWebsite: boolean;
  publicShortDescription: string;
};

const emptyForm: SalonForm = { name: '', slug: '', address: '', city: '', whatsapp: '', email: '', instagramUrl: '', facebookUrl: '', tiktokUrl: '', managerUserId: '', maxCapacity: 0, active: true, visibleOnWebsite: true, publicShortDescription: '' };
const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && 'code' in error && error.code === 'ROUTE_NOT_FOUND') return 'La API no encontró el endpoint de Salones. Revisá que el backend esté actualizado y en ejecución.';
  return error instanceof Error ? error.message : fallback;
};

export default function SalonsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [salons, setSalons] = useState<Salon[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [visible, setVisible] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSalon, setEditingSalon] = useState<Salon>();
  const [remove, setRemove] = useState<Salon>();
  const [form, setForm] = useState<SalonForm>(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('active', status);
      if (visible) params.set('visibleOnWebsite', visible);
      const response = await api.get<{ salons: Salon[] }>(`/salons?${params.toString()}`);
      setSalons(response.salons ?? []);
      try {
        const usersResponse = await api.get<{ users: UserOption[] }>('/users/options');
        setUsers((usersResponse.users ?? []).filter((user) => user.active !== false));
      } catch (usersError) {
        setUsers([]);
        showToast({ message: errorMessage(usersError, 'Los salones cargaron, pero no se pudieron cargar los usuarios para asignar encargado.'), variant: 'error' });
      }
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudieron cargar los salones.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredSummary = useMemo(() => {
    const active = salons.filter((salon) => salon.active).length;
    const visibleCount = salons.filter((salon) => salon.visibleOnWebsite).length;
    return `${salons.length} salones · ${active} activos · ${visibleCount} visibles en web`;
  }, [salons]);

  function updateForm<K extends keyof SalonForm>(key: K, value: SalonForm[K]) {
    setForm((current) => ({ ...current, [key]: value, ...(key === 'name' && !current.slug ? { slug: slugify(String(value)) } : {}) }));
  }

  function managerLabel(user?: UserOption) {
    if (!user) return 'Sin encargado asignado';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email;
    const roles = user.roles?.length ? ` · ${user.roles.join(', ')}` : '';
    return `${name}${user.email ? ` · ${user.email}` : ''}${roles}`;
  }

  function openCreate() {
    setEditingSalon(undefined);
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(salon: Salon) {
    setEditingSalon(salon);
    setForm({
      name: salon.name ?? '',
      slug: salon.slug ?? '',
      address: salon.address ?? '',
      city: salon.locality || salon.city || '',
      whatsapp: salon.whatsapp ?? '',
      email: salon.email ?? '',
      instagramUrl: salon.instagramUrl ?? '',
      facebookUrl: salon.facebookUrl ?? '',
      tiktokUrl: salon.tiktokUrl ?? '',
      managerUserId: typeof salon.managerUserId === 'string' ? salon.managerUserId : salon.manager?._id ?? '',
      maxCapacity: salon.maxCapacity ?? 0,
      active: salon.active,
      visibleOnWebsite: salon.visibleOnWebsite !== false,
      publicShortDescription: salon.publicShortDescription ?? ''
    });
    setCreateOpen(true);
  }

  async function saveSalon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return showToast({ message: 'Nombre y slug son obligatorios.', variant: 'error' });
    if (form.maxCapacity < 0) return showToast({ message: 'La capacidad máxima no puede ser negativa.', variant: 'error' });
    setSaving(true);
    try {
      const payload = { ...form, managerUserId: form.managerUserId || undefined, locality: form.city, recommendedCapacity: form.maxCapacity, defaultDurationHours: 8, defaultQuoteValidityDays: 7 };
      if (editingSalon) await api.patch(`/salons/${editingSalon._id}`, payload);
      else await api.post('/salons', payload);
      setCreateOpen(false);
      setEditingSalon(undefined);
      setForm(emptyForm);
      showToast({ message: editingSalon ? 'Salón actualizado correctamente.' : 'Salón creado correctamente.', variant: 'success' });
      await load();
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo guardar el salón.'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleSalon(salon: Salon) {
    if (!salon._id) return showToast({ message: 'No se pudo identificar el salón para cambiar su estado.', variant: 'error' });
    setSaving(true);
    try {
      await api.patch(`/salons/${salon._id}/${salon.active ? 'deactivate' : 'activate'}`);
      showToast({ message: salon.active ? 'Salón desactivado correctamente.' : 'Salón activado correctamente.', variant: 'success' });
      await load();
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo cambiar el estado del salón.'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function removeSalon() {
    if (!remove) return;
    setSaving(true);
    try {
      await api.delete(`/salons/${remove._id}`);
      setRemove(undefined);
      showToast({ message: 'Salón eliminado correctamente.', variant: 'success' });
      await load();
    } catch (error) {
      showToast({ message: errorMessage(error, 'No se pudo eliminar el salón.'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-6">
    <PageHeader title="Salones" description="Configuración comercial, operativa y pública de cada salón." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo salón</Button>} />
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-10" placeholder="Buscar por nombre, localidad o dirección…" /></div>
        <Select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 min-w-44"><option value="">Todos los estados</option><option value="true">Activos</option><option value="false">Inactivos</option></Select>
        <Select aria-label="Filtrar por visibilidad web" value={visible} onChange={(event) => setVisible(event.target.value)} className="h-11 min-w-44"><option value="">Web: todos</option><option value="true">Visibles</option><option value="false">Ocultos</option></Select>
        <Button variant="secondary" onClick={() => void load()}>Aplicar filtros</Button>
      </div>
      <p className="mt-3 text-sm text-zinc-500">{filteredSummary}</p>
    </div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500"><tr>{['Salón', 'Encargado', 'Localidad', 'Capacidad', 'WhatsApp', 'Paquetes activos', 'Visible en web', 'Estado'].map((label) => <th key={label} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {salons.map((salon) => <tr key={salon._id} className="hover:bg-amber-50/35">
              <td className="px-5 py-4"><p className="font-semibold text-zinc-900">{salon.name}</p><p className="mt-0.5 text-xs text-zinc-500">{salon.address || 'Sin dirección cargada'}</p></td>
              <td className="px-5 py-4 text-zinc-700"><p>{managerLabel(salon.manager)}</p>{salon.manager?.phone && <p className="mt-0.5 text-xs text-zinc-500">{salon.manager.phone}</p>}</td>
              <td className="px-5 py-4 text-zinc-700">{salon.locality || salon.city || 'Sin localidad'}</td>
              <td className="px-5 py-4 text-zinc-700">{salon.minCapacity || salon.maxCapacity ? `${salon.minCapacity ?? 0} a ${salon.maxCapacity ?? 0}` : 'Sin configurar'}</td>
              <td className="px-5 py-4 text-zinc-700">{salon.whatsapp || 'No informado'}</td>
              <td className="px-5 py-4 text-zinc-700">{salon.activePackageCount ?? 0}</td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${salon.visibleOnWebsite !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{salon.visibleOnWebsite !== false ? 'Visible' : 'Oculto'}</span></td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${salon.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{salon.active ? 'Activo' : 'Inactivo'}</span></td>
              <td className="px-5 py-4"><div className="flex justify-end gap-0.5">
                <TableActionButton icon={Eye} label="Ver detalle" onClick={() => salon._id ? router.push(`/admin/salons/${salon._id}`) : showToast({ message: 'No se pudo identificar el salón para ver el detalle.', variant: 'error' })} />
                <TableActionButton icon={Pencil} label="Editar salón" onClick={() => openEdit(salon)} />
                <TableActionButton icon={PackageCheck} label="Configurar paquetes" onClick={() => salon._id ? router.push(`/admin/salons/${salon._id}?tab=packages`) : showToast({ message: 'No se pudo identificar el salón para configurar paquetes.', variant: 'error' })} />
                <TableActionButton icon={Power} label={salon.active ? 'Desactivar salón' : 'Activar salón'} onClick={() => void toggleSalon(salon)} />
                <TableActionButton icon={Trash2} label="Eliminar salón" onClick={() => setRemove(salon)} />
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando salones…</div>}
      {!loading && salons.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><Building2 className="h-10 w-10 text-zinc-400" /><h2 className="mt-4 font-semibold text-zinc-900">No encontramos salones</h2><p className="mt-1 text-sm text-zinc-500">Creá un salón o ajustá los filtros.</p></div>}
    </div>
    <p className="text-xs text-zinc-500">Exportar queda pendiente hasta que exista un patrón común de exportaciones administrativas.</p>
    <Modal open={createOpen} onClose={() => { setCreateOpen(false); setEditingSalon(undefined); }} title={editingSalon ? 'Editar salón' : 'Nuevo salón'} description="Datos principales del salón. La configuración completa se puede ajustar en el detalle.">
      <form onSubmit={saveSalon} className="grid gap-4 p-6 sm:grid-cols-2">
        <label className="text-sm font-medium text-zinc-700">Nombre<Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} required /></label>
        <label className="text-sm font-medium text-zinc-700">Slug<Input value={form.slug} onChange={(event) => updateForm('slug', slugify(event.target.value))} required /></label>
        <label className="text-sm font-medium text-zinc-700 sm:col-span-2">Dirección<Input value={form.address} onChange={(event) => updateForm('address', event.target.value)} /></label>
        <label className="text-sm font-medium text-zinc-700">Localidad<Input value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label>
        <label className="text-sm font-medium text-zinc-700">WhatsApp<Input value={form.whatsapp} onChange={(event) => updateForm('whatsapp', event.target.value)} /></label>
        <label className="text-sm font-medium text-zinc-700">Email<Input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} /></label>
        <label className="text-sm font-medium text-zinc-700">Instagram<Input value={form.instagramUrl} onChange={(event) => updateForm('instagramUrl', event.target.value)} placeholder="https://instagram.com/..." /></label>
        <label className="text-sm font-medium text-zinc-700">Facebook<Input value={form.facebookUrl} onChange={(event) => updateForm('facebookUrl', event.target.value)} placeholder="https://facebook.com/..." /></label>
        <label className="text-sm font-medium text-zinc-700">TikTok<Input value={form.tiktokUrl} onChange={(event) => updateForm('tiktokUrl', event.target.value)} placeholder="https://tiktok.com/@..." /></label>
        <label className="text-sm font-medium text-zinc-700">Encargado del salón<Select value={form.managerUserId} onChange={(event) => updateForm('managerUserId', event.target.value)}><option value="">Sin encargado asignado</option>{users.map((user) => <option key={user._id} value={user._id}>{managerLabel(user)}</option>)}</Select></label>
        <label className="text-sm font-medium text-zinc-700">Capacidad máxima<Input type="number" min={0} value={form.maxCapacity} onChange={(event) => updateForm('maxCapacity', Number(event.target.value))} /></label>
        <label className="text-sm font-medium text-zinc-700 sm:col-span-2">Descripción corta pública<Textarea value={form.publicShortDescription} onChange={(event) => updateForm('publicShortDescription', event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} />Activo</label>
        <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={form.visibleOnWebsite} onChange={(event) => updateForm('visibleOnWebsite', event.target.checked)} />Visible en web</label>
        <footer className="flex justify-end gap-3 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => { setCreateOpen(false); setEditingSalon(undefined); }}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : editingSalon ? 'Guardar cambios' : 'Crear salón'}</Button></footer>
      </form>
    </Modal>
    <Modal open={Boolean(remove)} onClose={() => setRemove(undefined)} title="Eliminar salón" description="El salón se ocultará con borrado lógico.">
      <div className="p-6"><p className="text-sm text-zinc-600">¿Querés eliminar {remove?.name}? Esta acción puede afectar presupuestos futuros si el salón deja de estar disponible.</p><footer className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRemove(undefined)}>Cancelar</Button><Button variant="danger" disabled={saving} onClick={() => void removeSalon()}>{saving ? 'Eliminando…' : 'Eliminar'}</Button></footer></div>
    </Modal>
  </section>;
}
