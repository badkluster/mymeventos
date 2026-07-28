'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Users2, Calculator, Eye } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, leadStatusLabels } from '@/lib/display-labels';

type LeadAudienceFilters = {
  statuses?: string[]; salonIds?: string[]; eventType?: string; tags?: string[];
  guestCountMin?: number; guestCountMax?: number; converted?: boolean; hasQuote?: boolean;
};
type CustomerAudienceFilters = {
  salonIds?: string[]; hasPastEvents?: boolean; hasFutureEvents?: boolean;
  eventType?: string; minEventsCount?: number; tags?: string[];
};
type AudienceFilters = { lead?: LeadAudienceFilters; customer?: CustomerAudienceFilters };
type Audience = {
  _id: string; name: string; description?: string; sourceTypes: string[]; filters?: AudienceFilters;
  manualRecipients?: Array<{ email: string; firstName?: string; lastName?: string }>;
  salonId?: string; isDynamic: boolean; estimatedCount: number; lastCalculatedAt?: string;
};
type Salon = { _id: string; name: string };
type Estimate = { estimatedCount: number; totalMatched: number; duplicatesRemoved: number; invalidEmailExcluded: number; manuallyExcluded: number };
type Sample = Estimate & { sample: Array<{ sourceType: string; email: string; fullName?: string; firstName?: string; lastName?: string }> };

const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'quote_sent', 'negotiation', 'won', 'lost', 'converted'];
const emptyForm = {
  name: '', description: '', sourceTypes: ['lead', 'customer'] as string[], salonId: '',
  leadStatuses: [] as string[], leadEventType: '', leadTags: '', leadGuestMin: '', leadGuestMax: '', leadConverted: '', leadHasQuote: '',
  customerHasPastEvents: '', customerHasFutureEvents: '', customerEventType: '', customerMinEvents: '', customerTags: '',
  manualRecipientsText: '', isDynamic: true
};

function buildFiltersAndManual(form: typeof emptyForm) {
  const filters: AudienceFilters = {};
  if (form.sourceTypes.includes('lead')) {
    filters.lead = {
      statuses: form.leadStatuses.length ? form.leadStatuses : undefined,
      salonIds: form.salonId ? [form.salonId] : undefined,
      eventType: form.leadEventType || undefined,
      tags: form.leadTags ? form.leadTags.split(',').map((v) => v.trim()).filter(Boolean) : undefined,
      guestCountMin: form.leadGuestMin ? Number(form.leadGuestMin) : undefined,
      guestCountMax: form.leadGuestMax ? Number(form.leadGuestMax) : undefined,
      converted: form.leadConverted === '' ? undefined : form.leadConverted === 'true',
      hasQuote: form.leadHasQuote === '' ? undefined : form.leadHasQuote === 'true'
    };
  }
  if (form.sourceTypes.includes('customer')) {
    filters.customer = {
      salonIds: form.salonId ? [form.salonId] : undefined,
      hasPastEvents: form.customerHasPastEvents === '' ? undefined : form.customerHasPastEvents === 'true',
      hasFutureEvents: form.customerHasFutureEvents === '' ? undefined : form.customerHasFutureEvents === 'true',
      eventType: form.customerEventType || undefined,
      minEventsCount: form.customerMinEvents ? Number(form.customerMinEvents) : undefined,
      tags: form.customerTags ? form.customerTags.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    };
  }
  const manualRecipients = form.sourceTypes.includes('manual')
    ? form.manualRecipientsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [email, firstName, lastName] = line.split(',').map((v) => v.trim());
        return { email, firstName: firstName || undefined, lastName: lastName || undefined, sourceType: 'manual' as const };
      }).filter((entry) => entry.email)
    : [];
  return { filters, manualRecipients };
}

export default function MarketingAudiencesPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Audience[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Audience | null | undefined>();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [estimating, setEstimating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get<{ items: Audience[] }>('/marketing/audiences'); setItems(response.items); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las audiencias.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.get<{ salons: Salon[] }>('/salons').then((response) => setSalons(response.salons)).catch(() => undefined); }, []);

  function open(audience?: Audience) {
    setEstimate(null); setSample(null);
    setEditing(audience ?? null);
    if (!audience) { setForm(emptyForm); return; }
    const leadFilters = audience.filters?.lead ?? {};
    const customerFilters = audience.filters?.customer ?? {};
    setForm({
      ...emptyForm,
      name: audience.name, description: audience.description ?? '', sourceTypes: audience.sourceTypes, salonId: audience.salonId ?? '',
      isDynamic: audience.isDynamic,
      leadStatuses: leadFilters.statuses ?? [], leadEventType: leadFilters.eventType ?? '', leadTags: (leadFilters.tags ?? []).join(', '),
      leadGuestMin: leadFilters.guestCountMin != null ? String(leadFilters.guestCountMin) : '', leadGuestMax: leadFilters.guestCountMax != null ? String(leadFilters.guestCountMax) : '',
      leadConverted: leadFilters.converted === undefined ? '' : String(leadFilters.converted), leadHasQuote: leadFilters.hasQuote === undefined ? '' : String(leadFilters.hasQuote),
      customerHasPastEvents: customerFilters.hasPastEvents === undefined ? '' : String(customerFilters.hasPastEvents),
      customerHasFutureEvents: customerFilters.hasFutureEvents === undefined ? '' : String(customerFilters.hasFutureEvents),
      customerEventType: customerFilters.eventType ?? '', customerMinEvents: customerFilters.minEventsCount != null ? String(customerFilters.minEventsCount) : '',
      customerTags: (customerFilters.tags ?? []).join(', '),
      manualRecipientsText: (audience.manualRecipients ?? []).map((m) => [m.email, m.firstName, m.lastName].filter(Boolean).join(', ')).join('\n')
    });
  }

  function toggleSourceType(type: string) {
    setForm((c) => ({ ...c, sourceTypes: c.sourceTypes.includes(type) ? c.sourceTypes.filter((t) => t !== type) : [...c.sourceTypes, type] }));
  }

  function toggleLeadStatus(status: string) {
    setForm((current) => ({
      ...current,
      leadStatuses: current.leadStatuses.includes(status)
        ? current.leadStatuses.filter((selectedStatus) => selectedStatus !== status)
        : [...current.leadStatuses, status]
    }));
  }

  async function runEstimate() {
    setEstimating(true);
    try {
      const { filters, manualRecipients } = buildFiltersAndManual(form);
      const response = await api.post<Estimate>('/marketing/audiences/estimate', { sourceTypes: form.sourceTypes, filters, manualRecipients });
      setEstimate(response);
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo estimar la audiencia.', variant: 'error' }); }
    finally { setEstimating(false); }
  }

  async function runPreview() {
    setEstimating(true);
    try {
      const { filters, manualRecipients } = buildFiltersAndManual(form);
      const response = await api.post<Sample>('/marketing/audiences/preview', { sourceTypes: form.sourceTypes, filters, manualRecipients, sampleSize: 10 });
      setSample(response);
      setEstimate(response);
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo obtener la muestra.', variant: 'error' }); }
    finally { setEstimating(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const { filters, manualRecipients } = buildFiltersAndManual(form);
    const payload = { name: form.name, description: form.description, sourceTypes: form.sourceTypes, filters, manualRecipients, salonId: form.salonId || undefined, isDynamic: form.isDynamic };
    try {
      if (editing) await api.patch(`/marketing/audiences/${editing._id}`, payload);
      else await api.post('/marketing/audiences', payload);
      setEditing(undefined);
      await load();
      showToast({ message: 'Audiencia guardada correctamente.', variant: 'success' });
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la audiencia.', variant: 'error' }); }
  }

  async function remove(audience: Audience) {
    try { await api.delete(`/marketing/audiences/${audience._id}`); await load(); showToast({ message: 'Audiencia eliminada.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar la audiencia.', variant: 'error' }); }
  }

  const salonName = useMemo(() => new Map(salons.map((s) => [s._id, s.name])), [salons]);

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Segmentos reutilizables de leads y clientes para dirigir campañas." />
      <MarketingTabs />
      <PageHeader title="Audiencias" description="Definí a quién le llega una campaña combinando filtros de leads y clientes." action={<Button onClick={() => open()}><Plus className="mr-2 h-4 w-4" />Nueva audiencia</Button>} />

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-sm text-zinc-500">Cargando audiencias...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="border-b bg-zinc-50/80 text-zinc-500"><tr>{['Nombre', 'Fuentes', 'Salón', 'Estimado', 'Última actualización', 'Tipo'].map((h) => <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase">{h}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase">Acciones</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <tr key={item._id} className="hover:bg-amber-50/35">
                    <td className="px-5 py-4"><p className="font-semibold text-zinc-950">{item.name}</p><p className="text-xs text-zinc-500">{item.description}</p></td>
                    <td className="px-5 py-4 text-xs">{item.sourceTypes.join(', ')}</td>
                    <td className="px-5 py-4 text-xs">{item.salonId ? salonName.get(item.salonId) ?? '—' : 'Todos'}</td>
                    <td className="px-5 py-4 font-semibold">{item.estimatedCount}</td>
                    <td className="px-5 py-4 text-xs">{item.lastCalculatedAt ? new Date(item.lastCalculatedAt).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-5 py-4 text-xs">{item.isDynamic ? 'Dinámica' : 'Estática'}</td>
                    <td className="px-5 py-4"><div className="flex justify-end">
                      <TableActionButton icon={Pencil} label="Editar" onClick={() => open(item)} />
                      <TableActionButton icon={Trash2} label="Eliminar" onClick={() => void remove(item)} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? <div className="grid place-items-center px-6 py-16 text-center"><Users2 className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay audiencias guardadas todavía.</p></div> : null}
          </div>
        )}
      </article>

      <Modal open={editing !== undefined} title={editing ? 'Editar audiencia' : 'Nueva audiencia'} onClose={() => setEditing(undefined)} wide>
        <form onSubmit={save} className="space-y-6 p-6">
          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Información general</legend>
            <Input required placeholder="Nombre de la audiencia" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
            <Select value={form.salonId} onChange={(e) => setForm((c) => ({ ...c, salonId: e.target.value }))}>
              <option value="">Todos los salones</option>
              {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
            </Select>
            <Textarea className="md:col-span-2" placeholder="Descripción" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} />
          </fieldset>

          <fieldset className="rounded-xl border border-zinc-200 p-4">
            <legend className="mb-2 text-sm font-semibold text-zinc-800">Fuentes de destinatarios</legend>
            <div className="flex flex-wrap gap-4">
              {[['lead', 'Leads'], ['customer', 'Clientes'], ['manual', 'Lista manual']].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sourceTypes.includes(value)} onChange={() => toggleSourceType(value)} />{label}</label>
              ))}
            </div>
          </fieldset>

          {form.sourceTypes.includes('lead') ? (
            <fieldset className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Filtros de leads</legend>
              <fieldset className="md:col-span-2">
                <legend className="text-sm text-zinc-700">Estados</legend>
                <p className="mt-1 text-xs text-zinc-500">Marcá uno o más estados. Si no marcás ninguno, se incluirán todos.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {LEAD_STATUSES.map((status) => (
                    <label key={status} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50">
                      <input type="checkbox" checked={form.leadStatuses.includes(status)} onChange={() => toggleLeadStatus(status)} />
                      {displayLabel(leadStatusLabels, status)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Input placeholder="Tipo de evento" value={form.leadEventType} onChange={(e) => setForm((c) => ({ ...c, leadEventType: e.target.value }))} />
              <Input placeholder="Etiquetas separadas por coma" value={form.leadTags} onChange={(e) => setForm((c) => ({ ...c, leadTags: e.target.value }))} />
              <Input placeholder="Invitados mínimo" value={form.leadGuestMin} onChange={(e) => setForm((c) => ({ ...c, leadGuestMin: e.target.value }))} />
              <Input placeholder="Invitados máximo" value={form.leadGuestMax} onChange={(e) => setForm((c) => ({ ...c, leadGuestMax: e.target.value }))} />
              <Select value={form.leadHasQuote} onChange={(e) => setForm((c) => ({ ...c, leadHasQuote: e.target.value }))}>
                <option value="">Presupuesto: indistinto</option><option value="true">Con presupuesto</option><option value="false">Sin presupuesto</option>
              </Select>
              <Select value={form.leadConverted} onChange={(e) => setForm((c) => ({ ...c, leadConverted: e.target.value }))}>
                <option value="">Conversión: indistinto</option><option value="true">Convertidos</option><option value="false">No convertidos</option>
              </Select>
            </fieldset>
          ) : null}

          {form.sourceTypes.includes('customer') ? (
            <fieldset className="grid gap-3 rounded-xl border border-zinc-200 p-4 md:grid-cols-2">
              <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Filtros de clientes</legend>
              <Select value={form.customerHasPastEvents} onChange={(e) => setForm((c) => ({ ...c, customerHasPastEvents: e.target.value }))}>
                <option value="">Eventos anteriores: indistinto</option><option value="true">Con eventos anteriores</option><option value="false">Sin eventos anteriores</option>
              </Select>
              <Select value={form.customerHasFutureEvents} onChange={(e) => setForm((c) => ({ ...c, customerHasFutureEvents: e.target.value }))}>
                <option value="">Eventos futuros: indistinto</option><option value="true">Con eventos futuros</option><option value="false">Sin eventos futuros</option>
              </Select>
              <Input placeholder="Tipo de evento contratado" value={form.customerEventType} onChange={(e) => setForm((c) => ({ ...c, customerEventType: e.target.value }))} />
              <Input placeholder="Cantidad mínima de eventos" value={form.customerMinEvents} onChange={(e) => setForm((c) => ({ ...c, customerMinEvents: e.target.value }))} />
              <Input className="md:col-span-2" placeholder="Etiquetas separadas por coma" value={form.customerTags} onChange={(e) => setForm((c) => ({ ...c, customerTags: e.target.value }))} />
            </fieldset>
          ) : null}

          {form.sourceTypes.includes('manual') ? (
            <fieldset className="rounded-xl border border-zinc-200 p-4">
              <legend className="mb-1 text-sm font-semibold text-zinc-800">Lista manual</legend>
              <p className="mb-2 text-xs text-zinc-500">Un contacto por línea: email, nombre, apellido (nombre y apellido son opcionales).</p>
              <Textarea rows={5} placeholder={'ana@ejemplo.com, Ana, Pérez\njuan@ejemplo.com'} value={form.manualRecipientsText} onChange={(e) => setForm((c) => ({ ...c, manualRecipientsText: e.target.value }))} />
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-4">
            <Button type="button" variant="secondary" onClick={() => void runEstimate()} disabled={estimating}><Calculator className="mr-2 h-4 w-4" />Estimar destinatarios</Button>
            <Button type="button" variant="secondary" onClick={() => void runPreview()} disabled={estimating}><Eye className="mr-2 h-4 w-4" />Ver muestra</Button>
            <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDynamic} onChange={(e) => setForm((c) => ({ ...c, isDynamic: e.target.checked }))} />Dinámica (recalcula antes de cada envío)</label>
          </div>

          {estimate ? (
            <div className="rounded-xl bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-zinc-900">{estimate.estimatedCount} destinatarios estimados</p>
              <p className="mt-1 text-xs text-zinc-500">{estimate.totalMatched} coincidencias totales · {estimate.duplicatesRemoved} duplicados eliminados · {estimate.invalidEmailExcluded} emails inválidos excluidos · {estimate.manuallyExcluded} exclusiones manuales</p>
              {sample?.sample?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                  {sample.sample.map((contact, index) => <li key={index}>{contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Sin nombre'} — {contact.email} ({contact.sourceType})</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          <footer className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancelar</Button><Button>Guardar</Button></footer>
        </form>
      </Modal>
    </section>
  );
}
