'use client';

import { useState } from 'react';
import { ArrowRightLeft, MapPinned } from 'lucide-react';
import { Button, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import type { Event } from '@/features/quotes/types';

type SalonOption = { _id: string; name: string; active?: boolean };
type ChangeSalonResponse = { warnings?: string[]; contractImpact?: 'none' | 'draft_updated' | 'revision_created' };

function salonId(event: Event) {
  return typeof event.salonId === 'string' ? event.salonId : event.salonId?._id;
}

function salonName(event: Event) {
  return typeof event.salonId === 'string' ? 'Salón actual' : event.salonId?.name || 'Salón actual';
}

export function EventSalonChangeManager({ event, onChanged }: { event: Event; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [salons, setSalons] = useState<SalonOption[]>([]);
  const [selectedSalonId, setSelectedSalonId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentSalonId = salonId(event);

  const openManager = async () => {
    setOpen(true);
    setSelectedSalonId('');
    setReason('');
    setError('');
    setLoading(true);
    try {
      const response = await api.get<{ salons?: SalonOption[] }>('/salons?active=true&summary=true');
      setSalons((response.salons ?? []).filter((salon) => salon._id !== currentSalonId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los salones disponibles.');
    } finally {
      setLoading(false);
    }
  };

  const changeSalon = async () => {
    if (!selectedSalonId) return setError('Seleccioná el salón de destino.');
    if (reason.trim().length < 3) return setError('Indicá el motivo del cambio.');
    setLoading(true);
    setError('');
    try {
      const response = await api.post<ChangeSalonResponse>(`/events/${event._id}/change-salon`, {
        salonId: selectedSalonId,
        reason: reason.trim(),
        expectedUpdatedAt: event.updatedAt
      });
      setOpen(false);
      await onChanged();
      showToast({ message: 'Salón del evento actualizado correctamente.', variant: 'success' });
      response.warnings?.forEach((warning) => showToast({ message: warning, variant: 'info' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el salón del evento.');
    } finally {
      setLoading(false);
    }
  };

  return <>
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><MapPinned className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Salón del evento</h2>
            <p className="mt-1 truncate text-lg font-semibold text-foreground">{salonName(event)}</p>
            <p className="mt-1 text-sm text-muted-foreground">El cambio valida la disponibilidad y conserva el acuerdo comercial vigente.</p>
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={() => void openManager()}><ArrowRightLeft className="mr-2 h-4 w-4" />Cambiar salón</Button>
      </div>
    </article>

    <Modal open={open} title="Cambiar salón del evento" description="Revisá el impacto antes de trasladar la reserva." onClose={() => !loading && setOpen(false)}>
      <div className="space-y-5 p-5 sm:p-8">
        <div className="rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
          <p><strong>Se conserva:</strong> precio, cuotas, menú y servicios ya acordados.</p>
          <p className="mt-1 text-muted-foreground">Se valida el horario en el salón nuevo. Si hay vajilla propia reservada o personal sin habilitación allí, el traslado se detiene hasta resolverlo.</p>
        </div>

        <label className="block text-sm font-medium text-foreground">Salón de destino
          <Select className="mt-1.5" value={selectedSalonId} disabled={loading} onChange={(change) => { setSelectedSalonId(change.target.value); setError(''); }}>
            <option value="">Seleccionar salón</option>
            {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
          </Select>
        </label>
        {!loading && !salons.length && !error ? <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No hay otro salón activo disponible para seleccionar.</p> : null}
        <label className="block text-sm font-medium text-foreground">Motivo del cambio
          <Textarea className="mt-1.5" value={reason} disabled={loading} onChange={(change) => { setReason(change.target.value); setError(''); }} placeholder="Ej.: el cliente solicitó cambiar la fecha al salón principal." />
        </label>
        {error ? <p role="alert" className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-foreground">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" disabled={loading || !selectedSalonId || reason.trim().length < 3} onClick={() => void changeSalon()}>{loading ? 'Cambiando…' : 'Confirmar cambio'}</Button>
        </div>
      </div>
    </Modal>
  </>;
}
