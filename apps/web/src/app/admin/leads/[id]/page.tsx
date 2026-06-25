'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, Mail, MessageCircle, Pencil, StickyNote, Trash2, Users } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { activityTypeLabels, displayLabel, leadSourceLabels, leadStatusLabels } from '@/lib/display-labels';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

type Lead = {
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  alternativePhone?: string;
  email?: string;
  eventType: string;
  eventDate?: string;
  guestCount: number;
  salonId: string;
  salonIds?: string[];
  status: string;
  source: string;
  message?: string;
  notes?: string;
  createdAt?: string;
};

type Activity = { _id: string; type: string; title: string; description?: string; createdAt: string };
type Salon = { _id: string; name: string };

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value))
  : 'Sin fecha estimativa';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    contacted: 'bg-violet-50 text-violet-700 ring-violet-600/15',
    follow_up: 'bg-amber-50 text-amber-800 ring-amber-600/15',
    quote_sent: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    negotiation: 'bg-orange-50 text-orange-700 ring-orange-600/15',
    won: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    lost: 'bg-rose-50 text-rose-700 ring-rose-600/15',
    converted: 'bg-teal-50 text-teal-700 ring-teal-600/15',
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${colors[status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-600/10'}`}>{displayLabel(leadStatusLabels, status)}</span>;
}

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [lead, setLead] = useState<Lead>();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [id, setId] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNoticeState] = useState('');
  const setNotice = (value: string) => {
    setNoticeState(value);
    if (!value) return;
    const isSuccess = /correctamente|agregada|actualizado|actualizada|eliminado|eliminada/i.test(value);
    showToast({ message: value, variant: isSuccess ? 'success' : 'error' });
  };
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const load = async (currentId: string) => {
    const [leadResponse, activitiesResponse, salonsResponse] = await Promise.all([
      api.get<{ lead: Lead }>(`/leads/${currentId}`),
      api.get<{ activities: Activity[] }>(`/leads/${currentId}/activities`),
      api.get<{ salons: Salon[] }>('/salons'),
    ]);
    setLead(leadResponse.lead);
    setActivities(activitiesResponse.activities);
    setSalons(salonsResponse.salons);
  };

  useEffect(() => {
    void params
      .then(({ id: routeId }) => {
        setId(routeId);
        return load(routeId);
      })
      .catch((error: Error) => setNotice(error.message));
  }, [params]);

  const openEmail = () => {
    if (!lead?.email) {
      setNotice('Este lead no tiene un email registrado.');
      return;
    }
    window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent('Consulta M&M Eventos')}`;
  };

  const openWhatsApp = () => {
    if (!lead?.phone) {
      setNotice('Este lead no tiene un teléfono registrado.');
      return;
    }
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  };

  const saveLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lead) return;

    const form = new FormData(event.currentTarget);
    const salonIds = form.getAll('salonIds').map(String).filter(Boolean);
    if (!salonIds.length) {
      setNotice('Seleccioná al menos un salón de interés.');
      return;
    }

    setIsSaving(true);
    try {
      await api.patch(`/leads/${lead._id}`, {
        firstName: String(form.get('firstName') ?? ''),
        lastName: String(form.get('lastName') ?? ''),
        phone: String(form.get('phone') ?? ''),
        alternativePhone: String(form.get('alternativePhone') ?? ''),
        email: String(form.get('email') ?? ''),
        eventType: String(form.get('eventType') ?? ''),
        eventDate: String(form.get('eventDate') ?? '') || undefined,
        guestCount: Number(form.get('guestCount') ?? 0),
        salonId: salonIds[0],
        salonIds,
        source: String(form.get('source') ?? 'manual'),
        message: String(form.get('message') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
      await load(id);
      setIsEditOpen(false);
      setNotice('Lead actualizado correctamente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el lead.');
    } finally {
      setIsSaving(false);
    }
  };

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = note.trim();
    if (!description) return;
    setIsSaving(true);
    try {
      await api.post(`/leads/${id}/activities`, { description });
      setNote('');
      await load(id);
      setNotice('Nota agregada correctamente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo agregar la nota.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLead = async () => {
    if (!lead) return;
    setIsSaving(true);
    try {
      await api.delete(`/leads/${lead._id}`);
      router.push('/admin/leads');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el lead.');
      setIsDeleteOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (status: string) => {
    setIsUpdatingStatus(true);
    try {
      await api.patch(`/leads/${id}/status`, { status });
      await load(id);
      setNotice('Estado actualizado correctamente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el estado.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!lead) {
    return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">{notice || 'Cargando lead…'}</div>;
  }

  const selectedSalonIds = new Set(lead.salonIds?.length ? lead.salonIds : [lead.salonId]);
  const selectedSalonNames = salons.filter((salon) => selectedSalonIds.has(salon._id)).map((salon) => salon.name);

  return (
    <section className="space-y-6 pb-8">
      <Link href="/admin/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950">
        <ChevronLeft className="h-4 w-4" /> Volver a Leads
      </Link>

      <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950">{lead.fullName}</h1><StatusBadge status={lead.status} /></div>
            <p className="mt-2 text-sm text-zinc-500">Origen: {displayLabel(leadSourceLabels, lead.source)} · {lead.eventType}</p>
            <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-700">Estado
              <Select value={lead.status} disabled={isUpdatingStatus} onChange={(event) => void updateStatus(event.target.value)} className="w-52 py-2">
                {Object.entries(leadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openEmail}><Mail className="mr-2 h-4 w-4" />Email</Button>
            <Button variant="secondary" onClick={openWhatsApp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
            <Button onClick={() => setIsEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Editar lead</Button>
            <Button variant="danger" onClick={() => setIsDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-zinc-950">Datos de contacto</h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Teléfono</dt><dd className="mt-1 font-medium text-zinc-800">{lead.phone || 'Sin teléfono'}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Teléfono alternativo</dt><dd className="mt-1 font-medium text-zinc-800">{lead.alternativePhone || 'No informado'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Email</dt><dd className="mt-1 break-all font-medium text-zinc-800">{lead.email || 'No informado'}</dd></div>
          </dl>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 text-zinc-300"><CalendarDays className="h-4 w-4" /><span className="text-sm font-medium">Fecha estimativa</span></div>
          <p className="mt-4 text-xl font-semibold">{formatDate(lead.eventDate)}</p>
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-300"><Users className="h-4 w-4" />{lead.guestCount ? `${lead.guestCount} personas` : 'Cantidad sin definir'}</div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-zinc-950">Información comercial</h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Tipo de evento</dt><dd className="mt-1 font-medium text-zinc-800">{lead.eventType || 'Sin especificar'}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Origen</dt><dd className="mt-1 font-medium text-zinc-800">{displayLabel(leadSourceLabels, lead.source)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Salones de interés</dt><dd className="mt-1 font-medium text-zinc-800">{selectedSalonNames.length ? selectedSalonNames.join(' · ') : 'Sin salón asociado'}</dd></div>
          </dl>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">Mensaje y notas</h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-600">
            <div><p className="font-medium text-zinc-800">Mensaje</p><p className="mt-1 whitespace-pre-wrap">{lead.message || 'Sin mensaje.'}</p></div>
            <div className="border-t border-zinc-100 pt-4"><p className="font-medium text-zinc-800">Notas internas</p><p className="mt-1 whitespace-pre-wrap">{lead.notes || 'Sin notas internas.'}</p></div>
          </div>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-zinc-500" /><h2 className="text-base font-semibold text-zinc-950">Agregar nota</h2></div>
          <form onSubmit={addNote} className="mt-4 space-y-3">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} required placeholder="Escribí una nota para el equipo…" />
            <div className="flex justify-end"><Button disabled={isSaving || !note.trim()}>{isSaving ? 'Guardando…' : 'Agregar nota'}</Button></div>
          </form>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">Actividad</h2>
          {activities.length === 0 ? <p className="mt-5 rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">Todavía no hay actividades registradas.</p> : <div className="mt-5 space-y-4">{activities.map((activity) => <div key={activity._id} className="relative border-l-2 border-zinc-200 pl-5 pb-1 before:absolute before:-left-[5px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-zinc-950"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-zinc-900">{displayLabel(activityTypeLabels, activity.type)}</p><time className="text-xs text-zinc-400">{new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.createdAt))}</time></div><p className="mt-1 text-sm leading-6 text-zinc-600">{activity.description || activity.title}</p></div>)}</div>}
        </article>
      </div>

      <Modal open={isEditOpen} onClose={() => setIsEditOpen(false)} title="Editar lead" description="Actualizá los datos de esta oportunidad comercial.">
        <form onSubmit={saveLead} className="grid max-h-[70vh] gap-4 overflow-y-auto p-6 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">Nombre<Input required name="firstName" defaultValue={lead.firstName} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Apellido<Input required name="lastName" defaultValue={lead.lastName} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Teléfono<Input required name="phone" defaultValue={lead.phone} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Teléfono alternativo<Input name="alternativePhone" defaultValue={lead.alternativePhone ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Email<Input name="email" type="email" defaultValue={lead.email ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Tipo de evento<Input required name="eventType" defaultValue={lead.eventType} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Fecha estimativa<Input name="eventDate" type="date" defaultValue={lead.eventDate?.slice(0, 10) ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Cantidad de personas<Input required min="1" name="guestCount" type="number" defaultValue={lead.guestCount || ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700">Origen<Select name="source" defaultValue={lead.source} className="mt-1.5">{Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
          <label className="text-sm font-medium text-zinc-700">Salones de interés<Select required multiple name="salonIds" defaultValue={[...selectedSalonIds]} className="mt-1.5 min-h-32">{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select><span className="mt-1 block text-xs font-normal text-zinc-500">Mantené presionada la tecla Ctrl o Cmd para seleccionar más de un salón.</span></label>
          <label className="text-sm font-medium text-zinc-700 md:col-span-2">Mensaje<Textarea name="message" defaultValue={lead.message ?? ''} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-zinc-700 md:col-span-2">Notas internas<Textarea name="notes" defaultValue={lead.notes ?? ''} className="mt-1.5" /></label>
          <footer className="flex justify-end gap-3 pt-2 md:col-span-2"><Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>Cancelar</Button><Button disabled={isSaving}>{isSaving ? 'Guardando…' : 'Guardar cambios'}</Button></footer>
        </form>
      </Modal>

      <Modal open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Eliminar lead" description="Esta acción eliminará el lead del listado, pero conservará el registro internamente.">
        <div className="p-6"><footer className="flex justify-end gap-3"><Button variant="secondary" disabled={isSaving} onClick={() => setIsDeleteOpen(false)}>Cancelar</Button><Button variant="danger" disabled={isSaving} onClick={() => void deleteLead()}>{isSaving ? 'Eliminando…' : 'Eliminar'}</Button></footer></div>
      </Modal>
    </section>
  );
}
