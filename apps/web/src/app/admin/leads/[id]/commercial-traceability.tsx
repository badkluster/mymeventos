'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

type Lead = { _id: string; salonId: string; salonIds?: string[]; commercialOrigin?: string; originAttribution?: string; campaignCode?: string; adCode?: string; lastContactAt?: string; nextContactAt?: string; followUpResult?: string; lostReason?: string; lostObservation?: string };
type Salon = { _id: string; name: string };
type User = { _id: string; fullName?: string; firstName?: string; lastName?: string; salonIds?: string[]; roles?: string[] };
type Visit = { _id: string; startAt: string; status: string; description?: string; salonId?: { _id: string; name: string }; assignedToUserId?: { _id: string; fullName?: string; firstName?: string; lastName?: string }; metadata?: { visitOutcome?: string } };

const origins: Record<string, string> = { meta_ads_whatsapp: 'WhatsApp de Meta Ads', organic_whatsapp: 'WhatsApp orgánico', instagram: 'Instagram', google: 'Google', referral: 'Referido', returning_customer: 'Cliente anterior', other: 'Otro', unknown: 'Desconocido' };
const lostReasons: Record<string, string> = { price: 'Precio', date_unavailable: 'Fecha no disponible', other_venue: 'Contrató otro salón', no_response: 'No responde', event_postponed: 'Evento postergado', other: 'Otro' };
const visitActions: Record<string, string> = { confirmed: 'Confirmar', completed: 'Realizada', no_show: 'No asistió', cancelled: 'Cancelar', rescheduled: 'Reprogramar' };
const visitOutcomes: Record<string, string> = { scheduled: 'Agendada', confirmed: 'Confirmada', completed: 'Realizada', no_show: 'No asistió', cancelled: 'Cancelada', rescheduled: 'Reprogramada' };
const dateTime = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium', timeStyle: 'short' });

export function CommercialTraceability({ lead, salons, reload }: { lead: Lead; salons: Salon[]; reload: () => Promise<void> }) {
  const { showToast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [modal, setModal] = useState<'origin' | 'followup' | 'offer' | 'schedule' | 'lost' | 'visit' | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<Visit>();
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState(lead.commercialOrigin ?? 'unknown');
  const [campaignCode, setCampaignCode] = useState(lead.campaignCode ?? '');
  const [adCode, setAdCode] = useState(lead.adCode ?? '');
  const [result, setResult] = useState('');
  const [nextContactAt, setNextContactAt] = useState('');
  const [observation, setObservation] = useState('');
  const [salonId, setSalonId] = useState(lead.salonId);
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [visitAction, setVisitAction] = useState('confirmed');
  const [lostReason, setLostReason] = useState('price');
  const allowedSalons = salons.filter((salon) => (lead.salonIds?.length ? lead.salonIds : [lead.salonId]).includes(salon._id));

  useEffect(() => {
    void api.get<{ visits: Visit[] }>(`/leads/${lead._id}/visits`).then((response) => setVisits(response.visits)).catch(() => setVisits([]));
  }, [lead._id]);
  useEffect(() => {
    void api.get<{ users: User[] }>(`/leads/${lead._id}/visit-assignees`).then((response) => setUsers(response.users)).catch(() => setUsers([]));
  }, [lead._id]);
  const refresh = async () => {
    await reload();
    const response = await api.get<{ visits: Visit[] }>(`/leads/${lead._id}/visits`);
    setVisits(response.visits);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (modal === 'origin') await api.patch(`/leads/${lead._id}/attribution`, { origin, campaignCode, adCode });
      if (modal === 'followup') await api.post(`/leads/${lead._id}/follow-up`, { result, nextContactAt: nextContactAt ? new Date(`${nextContactAt}:00-03:00`).toISOString() : undefined });
      if (modal === 'offer') await api.post(`/leads/${lead._id}/visits/offer`, { observation });
      if (modal === 'schedule') await api.post(`/leads/${lead._id}/visits`, { salonId, assignedToUserId, startAt: new Date(`${startAt}:00-03:00`).toISOString(), observation });
      if (modal === 'lost') await api.post(`/leads/${lead._id}/mark-lost`, { lostReason, observation });
      if (modal === 'visit' && selectedVisit) await api.patch(`/leads/${lead._id}/visits/${selectedVisit._id}`, { action: visitAction, startAt: visitAction === 'rescheduled' ? new Date(`${startAt}:00-03:00`).toISOString() : undefined, salonId: visitAction === 'rescheduled' ? salonId : undefined, assignedToUserId: visitAction === 'rescheduled' ? assignedToUserId : undefined, observation });
      setModal(null); setObservation(''); setResult(''); setNextContactAt('');
      await refresh();
      showToast({ message: 'Actividad comercial registrada.', variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo registrar la actividad.', variant: 'error' });
    } finally { setSaving(false); }
  };
  const openVisit = (visit: Visit) => {
    setSelectedVisit(visit); setVisitAction('confirmed'); setObservation(''); setStartAt('');
    setSalonId(visit.salonId?._id ?? lead.salonId);
    setAssignedToUserId(visit.assignedToUserId?._id ?? '');
    setModal('visit');
  };
  const openSchedule = () => { setSalonId(lead.salonId); setAssignedToUserId(''); setStartAt(''); setObservation(''); setModal('schedule'); };
  const eligibleUsers = users.filter((user) => user.roles?.includes('ADMIN') || user.salonIds?.includes(salonId));

  return <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-950">Recorrido comercial</h2><p className="mt-1 text-sm text-zinc-500">Origen publicitario, visitas y próximos contactos de esta oportunidad.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setModal('origin')}>Origen</Button><Button variant="secondary" onClick={() => { setResult(''); setModal('followup'); }}>Seguimiento</Button><Button variant="secondary" onClick={() => { setObservation(''); setModal('offer'); }}>Ofrecer visita</Button><Button onClick={openSchedule}>Agendar visita</Button><Button variant="danger" onClick={() => { setObservation(''); setModal('lost'); }}>Registrar pérdida</Button></div></div>
    <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><p><span className="text-zinc-500">Origen comercial</span><br /><strong>{origins[lead.commercialOrigin ?? 'unknown']}</strong> {lead.originAttribution === 'manual' ? <span className="text-xs text-zinc-500">· manual</span> : null}</p><p><span className="text-zinc-500">Último contacto</span><br /><strong>{lead.lastContactAt ? dateTime.format(new Date(lead.lastContactAt)) : 'Sin registrar'}</strong></p><p><span className="text-zinc-500">Próximo contacto</span><br /><strong>{lead.nextContactAt ? dateTime.format(new Date(lead.nextContactAt)) : 'Sin registrar'}</strong></p></div>
    {lead.campaignCode || lead.adCode ? <p className="mt-2 text-xs text-zinc-500">Campaña: {lead.campaignCode || 'Sin registrar'} · Anuncio: {lead.adCode || 'Sin registrar'}</p> : null}
    {lead.lostReason ? <p className="mt-3 text-sm text-rose-700">Pérdida: {lostReasons[lead.lostReason] ?? lead.lostReason}{lead.lostObservation ? ` · ${lead.lostObservation}` : ''}</p> : null}
    <div className="mt-5 space-y-2"><h3 className="text-sm font-semibold">Visitas</h3>{visits.length ? visits.map((visit) => <div key={visit._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-3 text-sm"><div><p className="font-medium">{dateTime.format(new Date(visit.startAt))} · {visit.salonId?.name ?? 'Salón'}</p><p className="text-zinc-500">{visitOutcomes[visit.metadata?.visitOutcome ?? 'scheduled'] ?? visit.status} · {visit.assignedToUserId?.fullName || `${visit.assignedToUserId?.firstName ?? ''} ${visit.assignedToUserId?.lastName ?? ''}`.trim() || 'Sin responsable'}</p>{visit.description ? <p className="text-zinc-500">{visit.description}</p> : null}</div><Button variant="secondary" onClick={() => openVisit(visit)}>Actualizar</Button></div>) : <p className="text-sm text-zinc-500">Todavía no hay visitas agendadas.</p>}</div>
    <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'origin' ? 'Origen comercial' : modal === 'followup' ? 'Registrar seguimiento' : modal === 'offer' ? 'Visita ofrecida' : modal === 'schedule' ? 'Agendar visita' : modal === 'lost' ? 'Registrar pérdida' : 'Actualizar visita'} description="La acción quedará en la actividad del lead.">
      <form onSubmit={submit} className="space-y-4 p-6">
        {modal === 'origin' ? <><label className="block text-sm">Origen<Select value={origin} onChange={(event) => setOrigin(event.target.value)} className="mt-1">{Object.entries(origins).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="block text-sm">Campaña o código<Input value={campaignCode} onChange={(event) => setCampaignCode(event.target.value)} className="mt-1" /></label><label className="block text-sm">Anuncio o código<Input value={adCode} onChange={(event) => setAdCode(event.target.value)} className="mt-1" /></label><p className="text-xs text-zinc-500">La atribución se registra como manual. Usá Meta Ads sólo cuando haya evidencia.</p></> : null}
        {modal === 'followup' ? <><label className="block text-sm">Resultado del contacto<Textarea required value={result} onChange={(event) => setResult(event.target.value)} className="mt-1" /></label><label className="block text-sm">Próximo contacto (opcional)<Input type="datetime-local" value={nextContactAt} onChange={(event) => setNextContactAt(event.target.value)} className="mt-1" /></label></> : null}
        {modal === 'lost' ? <label className="block text-sm">Motivo<Select value={lostReason} onChange={(event) => setLostReason(event.target.value)} className="mt-1">{Object.entries(lostReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label> : null}
        {modal === 'visit' ? <label className="block text-sm">Resultado<Select value={visitAction} onChange={(event) => setVisitAction(event.target.value)} className="mt-1">{Object.entries(visitActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label> : null}
        {modal === 'schedule' || (modal === 'visit' && visitAction === 'rescheduled') ? <><label className="block text-sm">Fecha y horario<Input type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-1" /></label><label className="block text-sm">Salón<Select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="mt-1">{allowedSalons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></label><label className="block text-sm">Responsable<Select required value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)} className="mt-1"><option value="">Seleccionar</option>{eligibleUsers.map((user) => <option key={user._id} value={user._id}>{user.fullName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}</option>)}</Select></label></> : null}
        {['offer', 'schedule', 'lost', 'visit'].includes(modal ?? '') ? <label className="block text-sm">Observación (opcional)<Textarea value={observation} onChange={(event) => setObservation(event.target.value)} className="mt-1" /></label> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</Button></div>
      </form>
    </Modal>
  </section>;
}
