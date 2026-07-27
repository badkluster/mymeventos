'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, LockKeyhole, RotateCcw } from 'lucide-react';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { Button, Modal, PageHeader, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { userCanAccess } from '@/lib/admin-permissions';

type StageName = 'operational' | 'financial' | 'administrative';
type Check = { id: string; label: string; ok: boolean; severity: 'blocker' | 'warning'; detail?: string; href?: string };
type Stage = { status: 'open' | 'closed'; closedAt?: string; notes?: string; reopenedAt?: string; reopenReason?: string };
type Response = {
  event: { _id: string; eventName?: string; eventType?: string; eventDate?: string; salonId?: { name?: string }; customerId?: { fullName?: string } };
  closure: { operational: Stage; financial: Stage; administrative: Stage };
  checks: { operational: Check[]; financial: Check[]; administrative: Check[] };
};

const stages: Array<{ id: StageName; title: string; description: string }> = [
  { id: 'operational', title: 'Cierre operativo', description: 'Confirma producción, personal y ejecución del evento.' },
  { id: 'financial', title: 'Cierre financiero', description: 'Concilia contrato, cobros y gastos definitivos.' },
  { id: 'administrative', title: 'Cierre administrativo', description: 'Finaliza el expediente cuando las etapas anteriores están resueltas.' },
];
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

export default function EventClosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useSession();
  const { showToast } = useToast();
  const [eventId, setEventId] = useState('');
  const [result, setResult] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<{ stage: StageName; type: 'close' | 'reopen' } | null>(null);
  const [notes, setNotes] = useState('');
  const canUpdateEvent = userCanAccess(user, [Permission.EVENTS_UPDATE]);
  const canCloseFinancial = userCanAccess(user, [Permission.PAYMENTS_UPDATE]);

  const load = async (id = eventId) => {
    if (!id) return;
    setLoading(true);
    try { setResult(await api.get<Response>(`/event-closures/${id}`)); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el cierre.', variant: 'error' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void params.then(({ id }) => { setEventId(id); return load(id); }); }, [params]);

  const execute = async () => {
    if (!action || !eventId) return;
    if (action.type === 'reopen' && notes.trim().length < 3) return;
    setSaving(true);
    try {
      const body = action.type === 'close' ? { notes: notes.trim() } : { reason: notes.trim() };
      setResult(await api.post<Response>(`/event-closures/${eventId}/${action.stage}/${action.type}`, body));
      showToast({ message: action.type === 'close' ? 'Etapa cerrada correctamente.' : 'Etapa reabierta correctamente.', variant: 'success' });
      setAction(null); setNotes('');
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo completar la acción.', variant: 'error' }); }
    finally { setSaving(false); }
  };

  if (loading && !result) return <div className="grid min-h-64 place-items-center text-sm text-zinc-500">Cargando cierre del evento…</div>;
  if (!result) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">No se pudo cargar el cierre del evento.</div>;

  return <section className="space-y-6">
    <Link href={`/admin/events/${eventId}`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver al evento</Link>
    <PageHeader title="Cierre integral del evento" description={`${result.event.eventName || result.event.eventType || 'Evento'} · ${result.event.customerId?.fullName || 'Sin cliente'} · ${result.event.salonId?.name || 'Sin salón'}`} />
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Las etapas se cierran en orden. Reabrir una etapa anterior también reabre las posteriores para evitar que el expediente quede inconsistente.</div>
    <div className="grid gap-5 xl:grid-cols-3">
      {stages.map((definition, index) => {
        const current = result.closure[definition.id];
        const checks = result.checks[definition.id];
        const blockers = checks.filter((item) => item.severity === 'blocker' && !item.ok);
        const warnings = checks.filter((item) => item.severity === 'warning' && !item.ok);
        const allowed = definition.id === 'financial' ? canCloseFinancial : canUpdateEvent;
        return <article key={definition.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${current.status === 'closed' ? 'border-emerald-200' : blockers.length ? 'border-amber-200' : 'border-zinc-200'}`}>
          <header className="border-b border-zinc-100 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Etapa {index + 1}</p><h2 className="mt-1 text-lg font-semibold">{definition.title}</h2><p className="mt-1 text-sm leading-5 text-zinc-500">{definition.description}</p></div>{current.status === 'closed' ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" /> : <Circle className="h-6 w-6 shrink-0 text-zinc-300" />}</div>{current.status === 'closed' && current.closedAt ? <p className="mt-3 text-xs text-emerald-700">Cerrado {date.format(new Date(current.closedAt))}</p> : null}</header>
          <div className="space-y-2 p-5">{checks.map((item) => <div key={item.id} className={`rounded-xl border px-3 py-3 text-sm ${item.ok ? 'border-emerald-100 bg-emerald-50/60' : item.severity === 'warning' ? 'border-sky-100 bg-sky-50/60' : 'border-amber-100 bg-amber-50/70'}`}><div className="flex items-start gap-2">{item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === 'warning' ? 'text-sky-600' : 'text-amber-600'}`} />}<span className="min-w-0 flex-1"><span className="font-medium">{item.label}</span>{item.detail ? <span className="mt-0.5 block text-xs text-zinc-500">{item.detail}</span> : null}{item.href && !item.ok ? <Link href={item.href} className="mt-1 inline-flex text-xs font-semibold underline">Resolver</Link> : null}</span></div></div>)}</div>
          <footer className="border-t border-zinc-100 p-4">{current.status === 'closed' ? <Button variant="secondary" className="w-full" disabled={!allowed || saving} onClick={() => { setNotes(''); setAction({ stage: definition.id, type: 'reopen' }); }}><RotateCcw className="mr-2 h-4 w-4" />Reabrir etapa</Button> : <Button className="w-full" disabled={!allowed || Boolean(blockers.length) || saving} onClick={() => { setNotes(''); setAction({ stage: definition.id, type: 'close' }); }}><LockKeyhole className="mr-2 h-4 w-4" />Cerrar etapa</Button>}{!allowed ? <p className="mt-2 text-center text-xs text-zinc-400">Tu rol no puede ejecutar esta etapa.</p> : blockers.length ? <p className="mt-2 text-center text-xs text-amber-700">Resolvé {blockers.length} requisito(s) obligatorio(s).</p> : warnings.length ? <p className="mt-2 text-center text-xs text-sky-700">Podés cerrar con {warnings.length} advertencia(s).</p> : null}</footer>
        </article>;
      })}
    </div>
    <Modal open={Boolean(action)} onClose={() => setAction(null)} title={action?.type === 'close' ? 'Confirmar cierre' : 'Reabrir etapa'} description={action?.type === 'close' ? 'El checklist actual quedará guardado como evidencia del cierre.' : 'El motivo es obligatorio y quedará registrado en auditoría.'}><div className="p-6"><label className="text-sm font-medium">{action?.type === 'close' ? 'Notas opcionales' : 'Motivo'}<Textarea className="mt-1.5" value={notes} onChange={(event) => setNotes(event.target.value)} /></label><footer className="mt-4 flex justify-end gap-3"><Button variant="secondary" onClick={() => setAction(null)}>Cancelar</Button><Button disabled={saving || (action?.type === 'reopen' && notes.trim().length < 3)} onClick={() => void execute()}>{saving ? 'Guardando…' : action?.type === 'close' ? 'Confirmar cierre' : 'Reabrir'}</Button></footer></div></Modal>
  </section>;
}
