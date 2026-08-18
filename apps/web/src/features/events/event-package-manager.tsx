'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, PackageCheck, RefreshCw } from 'lucide-react';
import { Button, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import type { Event, PackageTemplate } from '@/features/quotes/types';

type SectionKey = 'commercial' | 'schedule' | 'menu' | 'services';
type ChangeRow = { key: SectionKey; label: string; current: unknown; proposed: unknown; changed: boolean };
type PackagePreview = {
  package: { id: string; name: string };
  currentPackage: { id?: string; name?: string };
  changes: ChangeRow[];
  impact: {
    contract: 'none' | 'draft_updated' | 'revision_required';
    approvedContractNumber?: string;
    draftContractNumber?: string;
    paidAmount: number;
    paymentPlanNeedsReview: boolean;
    productionNeedsReview: boolean;
    reasonRequired: boolean;
    applyingBlocked: boolean;
    blockedReason?: string;
  };
};
type ApplicablePackage = PackageTemplate & { packageTemplateId?: string; packageName?: string; active?: boolean };
type ApplyMode = 'associate_only' | 'apply';

const money = (value: unknown) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const list = (value: unknown) => Array.isArray(value) ? value : [];

function packageId(event: Event) {
  return typeof event.packageTemplateId === 'string' ? event.packageTemplateId : event.packageTemplateId?._id;
}

function salonId(event: Event) {
  return typeof event.salonId === 'string' ? event.salonId : event.salonId?._id;
}

function summary(key: SectionKey, value: unknown) {
  if (key === 'commercial') {
    const item = record(value);
    const amount = item.totalAmount !== undefined ? money(item.totalAmount) : 'Sin importe';
    const deposit = item.depositAmount !== undefined ? `Seña ${money(item.depositAmount)}` : 'Sin seña';
    return <><strong className="block text-foreground">{String(item.packageName || 'Personalizado')} · {amount}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{deposit}{item.paymentTerms ? ` · ${String(item.paymentTerms)}` : ''}</span></>;
  }
  if (key === 'schedule') {
    const item = record(value);
    const times = [item.startTime, item.endTime].filter(Boolean).join(' — ');
    return <><strong className="block text-foreground">{times || 'Sin horario definido'}</strong>{item.durationHours ? <span className="mt-1 block text-xs text-muted-foreground">Duración: {String(item.durationHours)} h</span> : null}</>;
  }
  if (key === 'menu') {
    const sections = list(value).map(record);
    const items = sections.reduce((total, section) => total + list(section.items).length, 0);
    return <><strong className="block text-foreground">{sections.length ? `${sections.length} sección${sections.length === 1 ? '' : 'es'}` : 'Sin menú'}</strong><span className="mt-1 block text-xs text-muted-foreground">{items} ítem{items === 1 ? '' : 's'} en total</span></>;
  }
  const services = list(value).map(String);
  return <><strong className="block text-foreground">{services.length ? `${services.length} servicio${services.length === 1 ? '' : 's'}` : 'Sin servicios'}</strong>{services.length ? <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{services.join(' · ')}</span> : null}</>;
}

function ImpactNotice({ preview, selectedSections }: { preview: PackagePreview; selectedSections: Set<SectionKey> }) {
  const contractText = preview.impact.contract === 'revision_required'
    ? `Se creará una revisión en borrador del contrato ${preview.impact.approvedContractNumber ?? 'aprobado'}.`
    : preview.impact.contract === 'draft_updated'
      ? `Se actualizará el contrato ${preview.impact.draftContractNumber ?? 'en borrador'}.`
      : 'No hay un contrato que deba actualizarse.';
  return <div className="space-y-2 rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
    <p>{contractText}</p>
    {preview.impact.paidAmount > 0 ? <p>Los pagos registrados ({money(preview.impact.paidAmount)}) y sus comprobantes se conservarán.</p> : null}
    {preview.impact.paymentPlanNeedsReview && selectedSections.has('commercial') ? <p className="font-medium text-warning-foreground">El plan de cuotas no se redistribuirá automáticamente; deberá revisarse después.</p> : null}
    {preview.impact.productionNeedsReview && [...selectedSections].some((key) => ['commercial', 'menu', 'services'].includes(key)) ? <p className="font-medium text-warning-foreground">La producción puede quedar desactualizada y deberá regenerarse.</p> : null}
  </div>;
}

export function EventPackageManager({ event, onApplied }: { event: Event; onApplied: () => Promise<void> }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<ApplicablePackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [preview, setPreview] = useState<PackagePreview>();
  const [selectedSections, setSelectedSections] = useState<Set<SectionKey>>(new Set());
  const [mode, setMode] = useState<ApplyMode>('apply');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentName = String(event.commercialSnapshot?.packageName || '');
  const currentId = packageId(event);

  const openManager = async () => {
    const venueId = salonId(event);
    setOpen(true);
    setPreview(undefined);
    setSelectedPackageId(currentId ?? '');
    setReason('');
    setError('');
    if (!venueId) return setError('El evento necesita un salón antes de asociar un paquete.');
    setLoading(true);
    try {
      const response = await api.get<{ packageRules?: ApplicablePackage[] }>(`/salons/${venueId}/package-rules`);
      setPackages((response.packageRules ?? []).filter((item) => item.active !== false).map((item) => ({ ...item, _id: item.packageTemplateId || item._id, name: item.packageName || item.name })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los paquetes disponibles.');
    } finally {
      setLoading(false);
    }
  };

  const compare = async () => {
    if (!selectedPackageId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.post<{ preview: PackagePreview }>(`/events/${event._id}/package-change/preview`, { packageTemplateId: selectedPackageId });
      const nextPreview = response.preview;
      setPreview(nextPreview);
      setSelectedSections(new Set(nextPreview.changes.filter((item) => item.changed).map((item) => item.key)));
      setMode(!currentId && nextPreview.impact.reasonRequired ? 'associate_only' : 'apply');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo comparar el paquete.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    if (mode === 'apply' && !selectedSections.size) return setError('Seleccioná al menos una categoría para aplicar.');
    if (preview.impact.reasonRequired && !reason.trim()) return setError('Indicá el motivo del cambio para conservar la trazabilidad.');
    setLoading(true);
    setError('');
    try {
      const response = await api.post<{ warnings?: string[] }>(`/events/${event._id}/package-change`, {
        packageTemplateId: selectedPackageId,
        mode,
        sections: mode === 'apply' ? [...selectedSections] : undefined,
        reason: reason.trim() || undefined,
        expectedUpdatedAt: event.updatedAt
      });
      setOpen(false);
      await onApplied();
      showToast({ message: mode === 'associate_only' ? 'Paquete asociado sin reemplazar los datos acordados.' : 'Paquete aplicado al evento.' });
      response.warnings?.forEach((warning) => showToast({ message: warning, variant: 'info' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el paquete.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key: SectionKey) => setSelectedSections((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <>
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><PackageCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Paquete del evento</h2>
            {currentId ? <><p className="mt-1 truncate text-lg font-semibold text-foreground">{currentName || 'Paquete asociado'}</p><p className="mt-1 text-sm text-muted-foreground">Los datos acordados quedan guardados en este evento.</p></> : <><p className="mt-1 text-sm font-medium text-warning-foreground">Sin paquete asociado</p><p className="mt-1 text-sm text-muted-foreground">Podés corregir la asociación o aplicar valores, menú y servicios.</p></>}
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={() => void openManager()}><RefreshCw className="mr-2 h-4 w-4" />{currentId ? 'Revisar paquete' : 'Asignar paquete'}</Button>
      </div>
    </article>

    <Modal open={open} wide title={preview ? `Comparar con ${preview.package.name}` : 'Paquete del evento'} description="Revisá el impacto antes de modificar el acuerdo comercial." onClose={() => !loading && setOpen(false)}>
      <div className="space-y-6 p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm font-medium text-foreground">Paquete disponible
            <Select className="mt-1.5" value={selectedPackageId} disabled={loading} onChange={(change) => { setSelectedPackageId(change.target.value); setPreview(undefined); }}>
              <option value="">Seleccionar paquete</option>
              {packages.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </Select>
          </label>
          <Button type="button" variant="secondary" disabled={loading || !selectedPackageId} onClick={() => void compare()}>{loading ? 'Comparando…' : 'Comparar paquete'}</Button>
        </div>

        {!loading && !packages.length && !error ? <p className="rounded-xl bg-muted px-4 py-4 text-sm text-muted-foreground">No hay paquetes activos disponibles para este salón.</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-foreground">{error}</p> : null}

        {preview ? <>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground">¿Qué querés hacer?</legend>
            <label className={`flex gap-3 rounded-xl border p-4 ${mode === 'associate_only' ? 'border-foreground/35 bg-muted' : 'border-border'}`}>
              <input type="radio" name="package-mode" value="associate_only" checked={mode === 'associate_only'} onChange={() => setMode('associate_only')} />
              <span><strong className="block text-sm text-foreground">Corregir asociación solamente</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">Vincula el paquete como referencia, sin reemplazar precio, horario, menú ni servicios.</span></span>
            </label>
            <label className={`flex gap-3 rounded-xl border p-4 ${mode === 'apply' ? 'border-foreground/35 bg-muted' : 'border-border'}`}>
              <input type="radio" name="package-mode" value="apply" checked={mode === 'apply'} onChange={() => setMode('apply')} />
              <span><strong className="block text-sm text-foreground">Aplicar datos del paquete</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">Permite elegir qué categorías se reemplazan en el evento.</span></span>
            </label>
          </fieldset>

          {mode === 'apply' ? <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[2.2rem_10rem_1fr_2.2rem_1fr] gap-3 border-b border-border bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span /><span>Categoría</span><span>Evento actual</span><span /><span>Paquete</span>
            </div>
            <div className="divide-y divide-border">
              {preview.changes.map((row) => <label key={row.key} className={`grid gap-3 px-4 py-4 md:grid-cols-[2.2rem_10rem_1fr_2.2rem_1fr] md:items-center ${row.changed ? 'bg-card' : 'bg-muted/45'}`}>
                <input type="checkbox" checked={selectedSections.has(row.key)} disabled={!row.changed} onChange={() => toggleSection(row.key)} aria-label={`Aplicar ${row.label}`} />
                <span className="text-sm font-semibold text-foreground">{row.label}{!row.changed ? <span className="mt-1 block text-xs font-normal text-success-foreground">Sin diferencias</span> : null}</span>
                <span className="rounded-lg bg-muted px-3 py-2.5 text-sm">{summary(row.key, row.current)}</span>
                <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <span className="rounded-lg bg-muted px-3 py-2.5 text-sm">{summary(row.key, row.proposed)}</span>
              </label>)}
            </div>
          </div> : <div className="flex items-start gap-3 rounded-xl border border-success-border bg-success-bg px-4 py-3 text-sm leading-6 text-success-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0" /><p>Los datos actuales del evento quedarán exactamente como están. Solo se guardará la relación con {preview.package.name}.</p></div>}

          {mode === 'apply' ? <ImpactNotice preview={preview} selectedSections={selectedSections} /> : null}
          {mode === 'apply' && preview.impact.applyingBlocked && selectedSections.has('commercial') ? <div className="flex items-start gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm leading-6 text-danger-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{preview.impact.blockedReason}</p></div> : null}

          {preview.impact.reasonRequired ? <label className="block text-sm font-medium text-foreground">Motivo del cambio
            <Textarea className="mt-1.5" value={reason} onChange={(change) => setReason(change.target.value)} placeholder="Ej: el evento se había cerrado con Black Service y faltó asociarlo en la carga inicial." />
          </label> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={loading} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={loading || (mode === 'apply' && (!selectedSections.size || (preview.impact.applyingBlocked && selectedSections.has('commercial'))))} onClick={() => void apply()}>{loading ? 'Guardando…' : mode === 'associate_only' ? 'Confirmar asociación' : 'Aplicar cambios'}</Button>
          </div>
        </> : null}
      </div>
    </Modal>
  </>;
}
