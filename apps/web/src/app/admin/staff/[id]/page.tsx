'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Clock3, CreditCard, UserRoundCog } from 'lucide-react';
import { Button, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, eventStaffStatusLabels, payrollPaymentTypeLabels, staffEmploymentStatusLabels, staffSubroleLabels } from '@/lib/display-labels';

type Salon = { _id: string; name?: string };
type Staff = {
  _id: string; username?: string; email?: string; firstName?: string; lastName?: string; fullName?: string; phone?: string; salonIds?: Array<string | Salon>;
  staffProfile?: { staffCode?: string; staffSubroles?: string[]; employmentStatus?: string; emergencyContactName?: string; emergencyContactPhone?: string; notes?: string };
  workSchedule?: { type?: string; weeklyAvailability?: Array<{ dayOfWeek: number; enabled?: boolean; startTime?: string; endTime?: string }>; notes?: string };
  payrollProfile?: { paymentType?: string; hourlyRate?: number; eventRate?: number; monthlySalary?: number; currency?: string; paymentNotes?: string; active?: boolean };
};
type Assignment = { _id: string; eventId?: string | { _id: string; eventName?: string; eventType?: string; eventDate?: string; status?: string }; salonId?: string | Salon; roleLabel?: string; staffSubrole?: string; shiftStart?: string; shiftEnd?: string; status: string; notes?: string };
const entityId = (value: unknown) => typeof value === 'string' ? value : (value as { _id?: string } | undefined)?._id ?? '';
const entityName = (value: unknown) => typeof value === 'string' ? value : (value as { name?: string; eventName?: string; eventType?: string } | undefined)?.name ?? (value as { eventName?: string; eventType?: string } | undefined)?.eventName ?? (value as { eventType?: string } | undefined)?.eventType ?? entityId(value);
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';
const staffName = (staff?: Staff) => staff?.fullName || [staff?.firstName, staff?.lastName].filter(Boolean).join(' ') || staff?.username || 'Staff';

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<'profile' | 'work' | 'payroll' | 'events'>('profile');

  const load = useCallback(async () => {
    try {
      const [staffResponse, assignmentResponse] = await Promise.all([
        api.get<{ staff: Staff }>(`/staff/${params.id}`),
        api.get<{ items: Assignment[] }>(`/staff/${params.id}/event-assignments`),
      ]);
      setStaff(staffResponse.staff);
      setAssignments(assignmentResponse.items ?? []);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el staff.', variant: 'error' });
    }
  }, [params.id, showToast]);

  useEffect(() => { void load(); }, [load]);

  if (!staff) return <section><PageHeader title="Staff" description="Cargando ficha..." /></section>;

  return <section className="space-y-6">
    <PageHeader title={staffName(staff)} description={`${staff.phone || 'Sin teléfono'} · ${displayLabel(staffEmploymentStatusLabels, staff.staffProfile?.employmentStatus ?? 'ACTIVE')}`} action={<Link href="/admin/staff"><Button variant="secondary"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button></Link>} />
    <div className="grid gap-4 lg:grid-cols-4">
      <Card title="Subroles" icon={<UserRoundCog className="h-5 w-5" />}>{staff.staffProfile?.staffSubroles?.map((item) => displayLabel(staffSubroleLabels, item)).join(', ') || 'Sin subrol'}</Card>
      <Card title="Salones" icon={<BriefcaseBusiness className="h-5 w-5" />}>{staff.salonIds?.map(entityName).join(', ') || 'Sin salón'}</Card>
      <Card title="Horario" icon={<Clock3 className="h-5 w-5" />}>{staff.workSchedule?.type || 'EVENT_BASED'}</Card>
      <Card title="Pago" icon={<CreditCard className="h-5 w-5" />}>{displayLabel(payrollPaymentTypeLabels, staff.payrollProfile?.paymentType ?? 'PER_EVENT')}</Card>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-zinc-200">{([['profile','Perfil'],['work','Horarios'],['payroll','Liquidación'],['events','Eventos asignados']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm font-medium ${tab === key ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-500'}`}>{label}</button>)}</div>
    {tab === 'profile' && <Panel title="Perfil"><Field label="Usuario" value={staff.username} /><Field label="Email" value={staff.email} /><Field label="Legajo" value={staff.staffProfile?.staffCode} /><Field label="Contacto emergencia" value={[staff.staffProfile?.emergencyContactName, staff.staffProfile?.emergencyContactPhone].filter(Boolean).join(' · ')} /><p className="whitespace-pre-wrap text-sm text-zinc-600">{staff.staffProfile?.notes || 'Sin notas.'}</p></Panel>}
    {tab === 'work' && <Panel title="Horarios"><Field label="Tipo" value={staff.workSchedule?.type ?? 'EVENT_BASED'} /><p className="whitespace-pre-wrap text-sm text-zinc-600">{staff.workSchedule?.notes || 'Sin notas de horario.'}</p></Panel>}
    {tab === 'payroll' && <Panel title="Liquidación futura"><Field label="Tipo de pago" value={displayLabel(payrollPaymentTypeLabels, staff.payrollProfile?.paymentType ?? 'PER_EVENT')} /><Field label="Tarifa evento" value={String(staff.payrollProfile?.eventRate ?? 'No informada')} /><Field label="Tarifa hora" value={String(staff.payrollProfile?.hourlyRate ?? 'No informada')} /><Field label="Mensual" value={String(staff.payrollProfile?.monthlySalary ?? 'No informado')} /><p className="whitespace-pre-wrap text-sm text-zinc-600">{staff.payrollProfile?.paymentNotes || 'Sin notas de pago.'}</p></Panel>}
    {tab === 'events' && <Panel title="Eventos asignados">{assignments.length ? <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Evento</th><th>Salón</th><th>Rol</th><th>Turno</th><th>Estado</th></tr></thead><tbody className="divide-y divide-zinc-100">{assignments.map((assignment) => <tr key={assignment._id}><td className="py-3"><Link className="font-medium text-zinc-950 underline" href={`/admin/events/${entityId(assignment.eventId)}`}>{entityName(assignment.eventId)}</Link></td><td>{entityName(assignment.salonId)}</td><td>{assignment.roleLabel || displayLabel(staffSubroleLabels, assignment.staffSubrole ?? '')}</td><td>{[formatDate(assignment.shiftStart), assignment.shiftEnd ? formatDate(assignment.shiftEnd) : ''].filter(Boolean).join(' - ')}</td><td>{displayLabel(eventStaffStatusLabels, assignment.status)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-zinc-500">Sin eventos asignados.</p>}</Panel>}
  </section>;
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs font-semibold uppercase tracking-wide">{title}</p></div><p className="mt-3 text-sm font-semibold text-zinc-950">{children}</p></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <article className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-zinc-950">{title}</h2>{children}</article>; }
function Field({ label, value }: { label: string; value?: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 text-sm text-zinc-900">{value || 'No informado'}</p></div>; }
