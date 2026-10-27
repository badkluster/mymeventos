'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Role } from '@mym/shared';
import { api } from '@/lib/api';
import { useSession } from '@/components/session-provider';
import { Button, Input, Modal, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

type Close = { eventId: string; eventName: string; customerName?: string; contractId: string; closedAt: string };
type GoalItem = {
  salonId: string; salonName: string; target: number | null; closed: number;
  percentage: number | null; remaining: number | null; status: string; auditAvailable: boolean;
  closes: Close[]; inconsistencies: { eventId: string; reason: string }[];
  activity: { leads: number; quotedPeople: number; visitsScheduled: number; visitsCompleted: number };
  conversion: { cohortSize: number; withoutQuote: number; quoted: number; visitScheduled: number; visited: number; followUp: number; won: number; lost: number; lossReasons: Record<string, number>; quoteRate: number | null; visitRate: number | null };
};
type GoalResponse = { year: number; month: number; items: GoalItem[]; pendingFollowUps: number };

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date());
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const years = Array.from({ length: 81 }, (_, index) => 2020 + index);

export function CommercialGoals({ salonId, periodEnd, onPeriodChange }: { salonId: string; periodEnd: string; onPeriodChange: (year: number, month: number) => void }) {
  const { user } = useSession();
  const { showToast } = useToast();
  const selectedPeriod = /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : `${today}-01`;
  const year = Number(selectedPeriod.slice(0, 4));
  const month = Number(selectedPeriod.slice(5, 7));
  const requestKey = `${year}-${month}-${salonId}`;
  const [loaded, setLoaded] = useState<{ key: string; response: GoalResponse }>();
  const [selected, setSelected] = useState<GoalItem>();
  const [editing, setEditing] = useState<GoalItem>();
  const [target, setTarget] = useState('10');
  const [reason, setReason] = useState('');
  const [requestError, setRequestError] = useState<{ key: string; message: string }>();
  const [saving, setSaving] = useState(false);
  const canEdit = user?.roles?.includes(Role.ADMIN) ?? false;
  const data = loaded?.key === requestKey ? loaded.response : undefined;
  const error = requestError?.key === requestKey ? requestError.message : '';

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (salonId) params.set('salonId', salonId);
      const response = await api.get<GoalResponse>(`/dashboard/commercial-goals?${params}`);
      setLoaded({ key: requestKey, response });
      setRequestError(undefined);
    } catch (cause) {
      setRequestError({ key: requestKey, message: cause instanceof Error ? cause.message : 'No se pudieron cargar los objetivos.' });
    }
  }, [year, month, salonId, requestKey]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (salonId) params.set('salonId', salonId);
    void api.get<GoalResponse>(`/dashboard/commercial-goals?${params}`)
      .then((response) => { if (active) { setLoaded({ key: requestKey, response }); setRequestError(undefined); } })
      .catch((cause) => { if (active) setRequestError({ key: requestKey, message: cause instanceof Error ? cause.message : 'No se pudieron cargar los objetivos.' }); });
    return () => { active = false; };
  }, [year, month, salonId, requestKey]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.put('/dashboard/commercial-goals', { salonId: editing.salonId, year, month, target: Number(target), reason: reason.trim() || undefined });
      setEditing(undefined);
      setReason('');
      await load();
      showToast({ message: 'Objetivo guardado.', variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar el objetivo.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Objetivos comerciales del mes">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-foreground">Objetivos comerciales de {monthNames[month - 1]} {year}</h2><p className="mt-1 text-sm text-muted-foreground">Se usa el mes de la fecha «Hasta» del dashboard. Cierres por primera aprobación formal; reservas con seña se informan por separado.</p></div>
      <div className="flex gap-2">
        <Select aria-label="Mes de objetivos" value={month} onChange={(event) => onPeriodChange(year, Number(event.target.value))}>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</Select>
        <Select aria-label="Año de objetivos" value={year} onChange={(event) => onPeriodChange(Number(event.target.value), month)} className="w-24">{years.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
      </div>
    </div>
    {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
    {!data && !error ? <p className="mt-4 text-sm text-muted-foreground" role="status">Cargando objetivos de {monthNames[month - 1]} {year}…</p> : null}
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data?.items.map((item) => <article key={item.salonId} className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-foreground">{item.salonName}</h3>{canEdit && `${year}-${String(month).padStart(2, '0')}` >= today ? <Button variant="secondary" onClick={() => { setEditing(item); setTarget(String(item.target ?? 10)); setReason(''); }}>Definir meta</Button> : null}</div>
        <p className="mt-4 text-3xl font-semibold tabular-nums text-foreground">{item.closed} <span className="text-lg text-muted-foreground">/ {item.target ?? '—'}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">{item.target ? `${item.percentage}% de cumplimiento · faltan ${item.remaining}` : 'Objetivo sin configurar'}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={item.percentage ?? 0} aria-valuemin={0} aria-valuemax={Math.max(100, item.percentage ?? 100)}><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, item.percentage ?? 0)}%` }} /></div>
        <p className="mt-3 text-xs font-medium text-muted-foreground">{item.status === 'review_required' ? 'Requiere revisión de registros' : item.status === 'achieved' ? 'Objetivo cumplido' : item.status === 'unconfigured' ? 'Sin meta definida' : 'En progreso'}</p>
        <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground"><span>Leads: {item.activity.leads}</span><span>Presupuestados: {item.activity.quotedPeople}</span><span>Visitas agendadas: {item.activity.visitsScheduled}</span><span>Visitas realizadas: {item.activity.visitsCompleted}</span></div>
        {item.auditAvailable ? <Button variant="secondary" onClick={() => setSelected(item)} className="mt-4">Auditar cálculo</Button> : null}
      </article>)}
    </div>
    {data?.items.length ? <div className="mt-6 border-t border-border pt-5"><h3 className="font-semibold text-foreground">Conversión comercial</h3><p className="mt-1 text-xs text-muted-foreground">Cohorte de leads creados en {monthNames[month - 1].toLowerCase()}. Sus avances se observan hasta hoy; cada persona se cuenta una sola vez por salón.</p><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.items.map((item) => <div key={item.salonId} className="rounded-xl border border-border p-4 text-sm"><h4 className="font-medium">{item.salonName}</h4><div className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground"><span>Sin presupuesto: {item.conversion.withoutQuote}</span><span>Presupuestados: {item.conversion.quoted}</span><span>Visita agendada: {item.conversion.visitScheduled}</span><span>Visitaron: {item.conversion.visited}</span><span>Seguimiento: {item.conversion.followUp}</span><span>Ganados: {item.conversion.won}</span><span>Perdidos: {item.conversion.lost}</span></div><p className="mt-2 text-xs text-muted-foreground">Presupuestados / leads: {item.conversion.quoteRate === null ? 'No medible' : `${item.conversion.quoteRate}%`} · Visitaron / presupuestados: {item.conversion.visitRate === null ? 'No medible' : `${item.conversion.visitRate}%`}</p>{Object.keys(item.conversion.lossReasons).length ? <p className="mt-2 text-xs text-muted-foreground">Motivos de pérdida: {Object.entries(item.conversion.lossReasons).map(([reason, count]) => `${reason}: ${count}`).join(' · ')}</p> : null}</div>)}</div></div> : null}
    {data ? <p className="mt-4 text-xs text-muted-foreground">Seguimientos pendientes en el alcance: {data.pendingFollowUps}. Las cifras de actividad son del período y no representan una misma cohorte.</p> : null}
    <Modal open={Boolean(selected)} onClose={() => setSelected(undefined)} title={`Detalle de ${selected?.salonName ?? ''}`} description="Un cierre por evento, con la fecha de su primera aprobación formal.">
      <div className="max-h-[65vh] space-y-3 overflow-y-auto p-6 text-sm">
        {selected?.closes.length ? selected.closes.map((close) => <div key={close.eventId} className="rounded-xl border border-border p-3"><Link href={`/admin/events/${close.eventId}`} className="font-medium underline">{close.eventName}</Link><p className="text-muted-foreground">{close.customerName || 'Cliente sin registrar'} · {new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium' }).format(new Date(close.closedAt))}</p><Link href={`/admin/contracts/${close.contractId}`} className="text-xs underline">Ver contrato</Link></div>) : <p>Sin cierres formales verificables en este período.</p>}
        {selected?.inconsistencies.map((issue) => <div key={issue.eventId} className="rounded-xl border border-amber-300 bg-amber-50 p-3"><Link href={`/admin/events/${issue.eventId}`} className="font-medium underline">Revisar evento</Link><p>{issue.reason}</p></div>)}
      </div>
    </Modal>
    <Modal open={Boolean(editing)} onClose={() => setEditing(undefined)} title={`Objetivo de ${editing?.salonName ?? ''}`} description={`${monthNames[month - 1]} ${year}`}>
      <form onSubmit={save} className="space-y-4 p-6"><label className="block text-sm font-medium">Contratos objetivo<Input type="number" min={1} max={1000} value={target} onChange={(event) => setTarget(event.target.value)} required className="mt-1" /></label><label className="block text-sm font-medium">Motivo del cambio<Input value={reason} onChange={(event) => setReason(event.target.value)} required={editing?.target !== null && Number(target) !== editing?.target} className="mt-1" /></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></div></form>
    </Modal>
  </section>;
}
