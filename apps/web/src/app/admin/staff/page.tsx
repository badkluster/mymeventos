'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Eye, Pencil, Plus, Search, UserRoundCog } from 'lucide-react';
import { TableActionButton } from '@/components/admin/table-action-button';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, payrollPaymentTypeLabels, staffEmploymentStatusLabels, staffSubroleLabels } from '@/lib/display-labels';

type Salon = { _id: string; name?: string };
type Staff = {
  _id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  active?: boolean;
  salonIds?: Array<string | Salon>;
  staffProfile?: { staffCode?: string; staffSubroles?: string[]; employmentStatus?: string; notes?: string };
  workSchedule?: { type?: string; notes?: string };
  payrollProfile?: { paymentType?: string; eventRate?: number; hourlyRate?: number; monthlySalary?: number; currency?: string; active?: boolean };
};
type ListResponse = { items: Staff[]; staffSubroles: string[]; employmentStatuses: string[] };

const emptyForm = {
  username: '', email: '', firstName: '', lastName: '', phone: '', salonIds: [] as string[], active: true,
  staffCode: '', staffSubroles: [] as string[], employmentStatus: 'ACTIVE', staffNotes: '',
  workType: 'EVENT_BASED', workNotes: '',
  paymentType: 'PER_EVENT', eventRate: '', hourlyRate: '', monthlySalary: '', currency: 'ARS', paymentNotes: '',
};
const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const entityName = (value: unknown) => typeof value === 'string' ? value : (value as { name?: string } | undefined)?.name ?? entityId(value);
const staffName = (staff: Staff) => staff.fullName || [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.username || 'Staff';
const toggle = (items: string[], value: string) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

export default function StaffPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Staff[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [subroles, setSubroles] = useState(Object.keys(staffSubroleLabels));
  const [filters, setFilters] = useState({ search: '', salonId: '', employmentStatus: '', subrole: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    try {
      const [staffResponse, salonsResponse] = await Promise.all([
        api.get<ListResponse>(`/staff?${query}`),
        api.get<{ salons: Salon[] }>('/salons?active=true'),
      ]);
      setItems(staffResponse.items ?? []);
      setSubroles(staffResponse.staffSubroles ?? Object.keys(staffSubroleLabels));
      setSalons(salonsResponse.salons ?? []);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el staff.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [query, showToast]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  }

  function openEdit(staff: Staff) {
    setEditing(staff);
    setForm({
      username: staff.username ?? '', email: staff.email ?? '', firstName: staff.firstName ?? '', lastName: staff.lastName ?? '', phone: staff.phone ?? '',
      salonIds: (staff.salonIds ?? []).map(entityId), active: staff.active !== false,
      staffCode: staff.staffProfile?.staffCode ?? '', staffSubroles: staff.staffProfile?.staffSubroles ?? [], employmentStatus: staff.staffProfile?.employmentStatus ?? 'ACTIVE', staffNotes: staff.staffProfile?.notes ?? '',
      workType: staff.workSchedule?.type ?? 'EVENT_BASED', workNotes: staff.workSchedule?.notes ?? '',
      paymentType: staff.payrollProfile?.paymentType ?? 'PER_EVENT', eventRate: String(staff.payrollProfile?.eventRate ?? ''), hourlyRate: String(staff.payrollProfile?.hourlyRate ?? ''), monthlySalary: String(staff.payrollProfile?.monthlySalary ?? ''), currency: staff.payrollProfile?.currency ?? 'ARS', paymentNotes: '',
    });
    setModal(true);
  }

  async function save() {
    setSaving(true);
    const body = {
      username: form.username,
      email: form.email || undefined,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      salonIds: form.salonIds,
      primarySalonId: form.salonIds[0] || undefined,
      active: form.active,
      staffProfile: { staffCode: form.staffCode, staffSubroles: form.staffSubroles, employmentStatus: form.employmentStatus, notes: form.staffNotes },
      workSchedule: { type: form.workType, weeklyAvailability: [], notes: form.workNotes },
      payrollProfile: { paymentType: form.paymentType, eventRate: Number(form.eventRate) || undefined, hourlyRate: Number(form.hourlyRate) || undefined, monthlySalary: Number(form.monthlySalary) || undefined, currency: form.currency || 'ARS', paymentNotes: form.paymentNotes, active: true },
    };
    try {
      if (editing) await api.patch(`/staff/${editing._id}`, body);
      else await api.post('/staff', body);
      setModal(false);
      await load();
      showToast({ message: 'Staff guardado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el staff.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-6">
    <PageHeader title="Staff" description="Empleados operativos, subroles, horarios simples y datos de liquidación futura." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo staff</Button>} />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_180px_180px_180px]">
      <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} className="h-11 pl-10" placeholder="Buscar staff..." /></div>
      <Select value={filters.salonId} onChange={(event) => setFilters((current) => ({ ...current, salonId: event.target.value }))}><option value="">Todos los salones</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select>
      <Select value={filters.employmentStatus} onChange={(event) => setFilters((current) => ({ ...current, employmentStatus: event.target.value }))}><option value="">Todos los estados</option>{Object.entries(staffEmploymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select value={filters.subrole} onChange={(event) => setFilters((current) => ({ ...current, subrole: event.target.value }))}><option value="">Todos los subroles</option>{subroles.map((subrole) => <option key={subrole} value={subrole}>{displayLabel(staffSubroleLabels, subrole)}</option>)}</Select>
    </div>
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {loading ? <p className="p-8 text-sm text-zinc-500">Cargando staff...</p> : <div className="overflow-x-auto"><table className="min-w-[1080px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Staff', 'Teléfono', 'Subroles', 'Salones', 'Estado laboral', 'Pago', 'Estado'].map((label) => <th key={label} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((staff) => <tr key={staff._id} className="hover:bg-amber-50/35"><td className="px-5 py-4"><p className="font-medium text-zinc-950">{staffName(staff)}</p><p className="text-xs text-zinc-500">{staff.staffProfile?.staffCode || staff.username}</p></td><td className="px-5 py-4">{staff.phone || 'No informado'}</td><td className="px-5 py-4">{staff.staffProfile?.staffSubroles?.map((item) => displayLabel(staffSubroleLabels, item)).join(', ') || 'Sin subrol'}</td><td className="px-5 py-4">{staff.salonIds?.map(entityName).join(', ') || 'Sin salón'}</td><td className="px-5 py-4">{displayLabel(staffEmploymentStatusLabels, staff.staffProfile?.employmentStatus ?? 'ACTIVE')}</td><td className="px-5 py-4">{displayLabel(payrollPaymentTypeLabels, staff.payrollProfile?.paymentType ?? 'PER_EVENT')}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${staff.active === false ? 'bg-zinc-100 text-zinc-700' : 'bg-emerald-50 text-emerald-700'}`}>{staff.active === false ? 'Inactivo' : 'Activo'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/staff/${staff._id}`}><TableActionButton icon={Eye} label="Ver detalle" /></Link><TableActionButton icon={Pencil} label="Editar staff" onClick={() => openEdit(staff)} /><TableActionButton icon={CalendarPlus} label="Asignar desde un evento" onClick={() => showToast({ message: 'Abrí el evento y usá la pestaña Staff para asignarlo.', variant: 'info' })} /></div></td></tr>)}</tbody></table>{!items.length ? <div className="grid place-items-center px-6 py-16 text-center"><UserRoundCog className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay staff para los filtros seleccionados.</p></div> : null}</div>}
    </article>
    <StaffModal open={modal} form={form} setForm={setForm} salons={salons} subroles={subroles} saving={saving} editing={editing} onClose={() => setModal(false)} onSave={() => void save()} />
  </section>;
}

function StaffModal({ open, form, setForm, salons, subroles, saving, editing, onClose, onSave }: { open: boolean; form: typeof emptyForm; setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>; salons: Salon[]; subroles: string[]; saving: boolean; editing: Staff | null; onClose: () => void; onSave: () => void }) {
  if (!open) return null;
  return <Modal open title={editing ? 'Editar staff' : 'Nuevo staff'} onClose={onClose}><div className="space-y-5 p-6">
    <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Nombre" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /><Input placeholder="Apellido" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /><Input placeholder="Usuario / legajo único" value={form.username} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /><Input placeholder="Email opcional" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /><Input placeholder="Teléfono" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /><Input placeholder="Código staff" value={form.staffCode} onChange={(event) => setForm((current) => ({ ...current, staffCode: event.target.value }))} /></div>
    <section><h3 className="text-sm font-semibold text-zinc-900">Subroles operativos</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{subroles.map((subrole) => <label key={subrole} className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"><input type="checkbox" checked={form.staffSubroles.includes(subrole)} onChange={() => setForm((current) => ({ ...current, staffSubroles: toggle(current.staffSubroles, subrole) }))} />{displayLabel(staffSubroleLabels, subrole)}</label>)}</div></section>
    <section><h3 className="text-sm font-semibold text-zinc-900">Salones vinculados</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{salons.map((salon) => <label key={salon._id} className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"><input type="checkbox" checked={form.salonIds.includes(salon._id)} onChange={() => setForm((current) => ({ ...current, salonIds: toggle(current.salonIds, salon._id) }))} />{salon.name}</label>)}</div></section>
    <div className="grid gap-3 md:grid-cols-3"><Select value={form.employmentStatus} onChange={(event) => setForm((current) => ({ ...current, employmentStatus: event.target.value }))}>{Object.entries(staffEmploymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={form.workType} onChange={(event) => setForm((current) => ({ ...current, workType: event.target.value }))}><option value="EVENT_BASED">Por evento</option><option value="FIXED">Fijo</option><option value="FLEXIBLE">Flexible</option></Select><Select value={form.paymentType} onChange={(event) => setForm((current) => ({ ...current, paymentType: event.target.value }))}>{Object.entries(payrollPaymentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
    <div className="grid gap-3 md:grid-cols-4"><Input placeholder="Tarifa evento" value={form.eventRate} onChange={(event) => setForm((current) => ({ ...current, eventRate: event.target.value }))} /><Input placeholder="Tarifa hora" value={form.hourlyRate} onChange={(event) => setForm((current) => ({ ...current, hourlyRate: event.target.value }))} /><Input placeholder="Mensual" value={form.monthlySalary} onChange={(event) => setForm((current) => ({ ...current, monthlySalary: event.target.value }))} /><Input placeholder="Moneda" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} /></div>
    <Textarea placeholder="Notas laborales" value={form.staffNotes} onChange={(event) => setForm((current) => ({ ...current, staffNotes: event.target.value }))} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />Staff activo</label>
    <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !form.username || !form.firstName || !form.lastName} onClick={onSave}>Guardar</Button></div>
  </div></Modal>;
}
