'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type Salon = { _id: string; name: string };
type Summary = {
  metaConversations: number; metaLeads: number; metaSpend: number; metaConversationsUnassigned: number;
  crmLeads: number; metaLinkedLeads: number; requests: number; metaLinkedRequests: number; quotes: number;
  acceptedQuotes: number; events: number; bookedRevenue: number; collectedRevenue: number; observableCaptureRate: number;
};
type SalonRow = {
  id: string; salon: string; conversations: number; metaLeads: number; spend: number; crmLeads: number; requests: number;
  metaLinkedRequests: number; metaLinkedLeads: number; quotes: number; acceptedQuotes: number; events: number;
  bookedRevenue: number; collectedRevenue: number; observableCaptureRate: number; costPerConversation: number;
};
type CampaignRow = {
  id: string; campaign: string; salon: string; salonId: string | null; conversations: number; metaLeads: number; spend: number;
  crmLeads: number; requests: number; quotes: number; acceptedQuotes: number; events: number; bookedRevenue: number;
  collectedRevenue: number; observableCaptureRate: number; quoteRate: number; closeRate: number; costPerConversation: number; roas: number;
};
type FunnelResponse = {
  data: {
    connection: { status: 'connected' | 'pending' | 'error'; currency: string | null; lastSyncAt: string | null };
    currency: string; summary: Summary; salons: SalonRow[]; campaigns: CampaignRow[];
    unassignedCampaigns: Array<{ id: string; name: string; conversations: number; spend: number }>;
    methodology: { activity: string; campaign: string; attribution: string };
  };
  meta: { period: { from: string; to: string } };
};
type AssignmentResponse = {
  canManage: boolean;
  items: Array<{ campaignId: string; salonId: string | null; salonName: string | null; updatedAt: string }>;
};

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function argentinaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function initialRange() {
  const to = argentinaToday();
  return { from: `${to.slice(0, 8)}01`, to };
}

function initialFilters() {
  const range = initialRange();
  if (typeof window === 'undefined') return { ...range, salonId: '' };
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const to = params.get('to');
  const salonId = params.get('salonId');
  return {
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : range.from,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : range.to,
    salonId: salonId && /^[0-9a-fA-F]{24}$/.test(salonId) ? salonId : '',
  };
}

function amount(value: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
}

function Percentage({ value }: { value: number }) {
  return <span className="tabular-nums">{decimal.format(value)}%</span>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return <div className="min-w-0 border-b border-zinc-200 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><Icon className="h-4 w-4 shrink-0 text-zinc-400" /></div>
    <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">{value}</p>
    <p className="mt-1 min-h-8 text-xs leading-4 text-zinc-500">{detail}</p>
  </div>;
}

function Stage({ label, value, base, note, active = false }: { label: string; value: number; base: number; note: string; active?: boolean }) {
  const width = base ? Math.max(5, Math.min(100, value / base * 100)) : 0;
  return <div className={`min-w-0 rounded-xl p-4 ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-950'}`}>
    <p className={`text-xs font-semibold uppercase tracking-wide ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{label}</p>
    <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{integer.format(value)}</p>
    <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${active ? 'bg-white/20' : 'bg-zinc-200'}`}><div className={active ? 'h-full rounded-full bg-white' : 'h-full rounded-full bg-zinc-950'} style={{ width: `${width}%` }} /></div>
    <p className={`mt-2 text-xs leading-4 ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{note}</p>
  </div>;
}

function MetaStatus({ status }: { status: FunnelResponse['data']['connection']['status'] }) {
  const values = status === 'connected'
    ? { label: 'Meta conectado', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
    : status === 'error'
      ? { label: 'Meta no disponible', classes: 'border-red-200 bg-red-50 text-red-800' }
      : { label: 'Meta pendiente', classes: 'border-amber-200 bg-amber-50 text-amber-800' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${values.classes}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{values.label}</span>;
}

export function MarketingFunnelReport() {
  const { showToast } = useToast();
  const [initial] = useState(initialFilters);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [salonId, setSalonId] = useState(initial.salonId);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [report, setReport] = useState<FunnelResponse | null>(null);
  const [assignments, setAssignments] = useState<AssignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.get<{ salons?: Salon[] } | Salon[]>('/salons?limit=100')
      .then((result) => setSalons(Array.isArray(result) ? result : result.salons ?? []))
      .catch(() => setSalons([]));
  }, []);

  const load = useCallback(async () => {
    if (!from || !to || from > to) {
      setError('Elegí un rango de fechas válido.');
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to });
    if (salonId) params.set('salonId', salonId);
    try {
      const [data, assignmentData] = await Promise.all([
        api.get<FunnelResponse>(`/reports/marketing-funnel?${params.toString()}`),
        api.get<AssignmentResponse>('/reports/marketing-funnel/assignments'),
      ]);
      setReport(data);
      setAssignments(assignmentData);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el embudo comercial.');
    } finally {
      setLoading(false);
    }
  }, [from, salonId, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const download = async (format: 'csv' | 'excel') => {
    setExporting(true);
    const params = new URLSearchParams({ from, to, format });
    if (salonId) params.set('salonId', salonId);
    try {
      const result = await api.download(`/reports/marketing-funnel/export?${params.toString()}`);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click();
      URL.revokeObjectURL(url);
      showToast({ message: 'Exportación generada correctamente.', variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo exportar el reporte.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const saveAssignment = async (campaignId: string, nextSalonId: string) => {
    setSavingCampaign(campaignId);
    try {
      await api.put(`/reports/marketing-funnel/assignments/${campaignId}`, { salonId: nextSalonId || null });
      showToast({ message: nextSalonId ? 'Campaña asignada al salón.' : 'Campaña quitada de la asignación.', variant: 'success' });
      await load();
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar la asignación.', variant: 'error' });
    } finally {
      setSavingCampaign('');
    }
  };

  const data = report?.data;
  const summary = data?.summary;
  const currency = data?.currency || 'ARS';
  // El puente sólo representa campañas asignadas a un salón. Las no asignadas
  // pueden mostrarse para administradores, pero no se mezclan en esta cohorte.
  const attributedCampaigns = data?.campaigns.filter((campaign) => Boolean(campaign.salonId)) ?? [];
  const campaignAssignments = useMemo(() => {
    const seen = new Set<string>();
    const items = [...(data?.campaigns ?? []), ...(data?.unassignedCampaigns ?? []).map((campaign) => ({
      id: campaign.id, campaign: campaign.name, salonId: null, salon: 'Sin asignar', conversations: campaign.conversations, metaLeads: 0, spend: campaign.spend,
      crmLeads: 0, requests: 0, quotes: 0, acceptedQuotes: 0, events: 0, bookedRevenue: 0, collectedRevenue: 0,
      observableCaptureRate: 0, quoteRate: 0, closeRate: 0, costPerConversation: 0, roas: 0,
    }))];
    return items.filter((campaign) => !seen.has(campaign.id) && Boolean(seen.add(campaign.id))).sort((left, right) => left.campaign.localeCompare(right.campaign, 'es'));
  }, [data]);

  return <section className="space-y-6">
    <div><Link href="/admin/reports" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver al centro de reportes</Link></div>
    <PageHeader title="Embudo Meta → CRM por salón" description="Leé la captación del mes sin confundir el resultado de Meta con la conversión comprobada dentro del CRM." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>} />

    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-40" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-40" value={to} min={from} max={argentinaToday()} onChange={(event) => setTo(event.target.value)} /></label>
      <label className="min-w-52 flex-1 text-xs font-semibold text-zinc-600 sm:flex-none">Salón<Select className="mt-1.5" value={salonId} onChange={(event) => setSalonId(event.target.value)}><option value="">Todo mi alcance</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select></label>
      <Button onClick={() => void load()} disabled={loading}>Aplicar</Button>
      <span className="hidden flex-1 lg:block" />
      <Button variant="secondary" disabled={exporting || loading} onClick={() => void download('csv')}><Download className="mr-2 h-4 w-4" />CSV</Button>
      <Button variant="secondary" disabled={exporting || loading} onClick={() => void download('excel')}><Download className="mr-2 h-4 w-4" />{exporting ? 'Generando…' : 'Excel'}</Button>
    </div>

    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div></div> : null}
    {loading && !report ? <div className="grid min-h-96 place-items-center rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-500 shadow-sm"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Preparando la comparación comercial…</span></div> : null}

    {data && summary ? <>
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4"><div><h2 className="text-lg font-semibold text-zinc-950">Lectura del período</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-500">Las métricas CRM son actividad efectiva del rango. La atribución por campaña sigue la cohorte de solicitudes captadas durante ese mismo rango.</p></div><MetaStatus status={data.connection.status} /></div>
        <div className="grid divide-y divide-zinc-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <Metric label="Conversaciones Meta" value={integer.format(summary.metaConversations)} detail={summary.metaConversationsUnassigned ? `${integer.format(summary.metaConversationsUnassigned)} sin salón asignado` : 'Sólo campañas asignadas a un salón'} icon={Target} />
          <Metric label="Leads creados CRM" value={integer.format(summary.crmLeads)} detail={`${integer.format(summary.metaLinkedLeads)} vinculados a una campaña por UTM`} icon={Users} />
          <Metric label="Solicitudes" value={integer.format(summary.requests)} detail={`${integer.format(summary.metaLinkedRequests)} con vínculo de campaña observable`} icon={FileText} />
          <Metric label="Cobrado" value={amount(summary.collectedRevenue, currency)} detail={`${amount(summary.bookedRevenue, currency)} contratado en el período`} icon={BadgeDollarSign} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Puente observable: campaña → negocio</h2><p className="mt-1 max-w-3xl text-sm leading-5 text-zinc-500">No es una atribución individual de las conversaciones de WhatsApp. Sólo cuenta como vínculo CRM la solicitud que llegó con un ID de campaña o un UTM inequívoco.</p></div><div className="rounded-xl bg-zinc-100 px-3 py-2 text-right"><p className="text-xs font-medium text-zinc-500">Captura observable</p><p className="mt-0.5 text-lg font-semibold text-zinc-950"><Percentage value={summary.observableCaptureRate} /></p></div></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <Stage label="Conversaciones Meta" value={summary.metaConversations} base={summary.metaConversations} note="Campañas con salón asignado" active />
          <Stage label="Solicitudes vinculadas" value={summary.metaLinkedRequests} base={summary.metaConversations} note="Cohorte con UTM comprobable" />
          <Stage label="Presupuestos vinculados" value={attributedCampaigns.reduce((sum, row) => sum + row.quotes, 0)} base={summary.metaLinkedRequests} note="Avance de esa cohorte" />
          <Stage label="Eventos cerrados" value={attributedCampaigns.reduce((sum, row) => sum + row.events, 0)} base={summary.metaLinkedRequests} note="Reservados o confirmados" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 p-5"><div><h2 className="text-lg font-semibold text-zinc-950">Comparativa por salón</h2><p className="mt-1 text-sm text-zinc-500">La actividad CRM se agrupa por el salón real; las conversaciones sólo aparecen cuando la campaña está asignada.</p></div><span className="text-xs text-zinc-500">No sumes filas: una solicitud puede interesarse en más de un salón.</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="bg-zinc-50 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Salón</th><th className="px-4 py-3 text-right">Conv. Meta</th><th className="px-4 py-3 text-right">Leads CRM</th><th className="px-4 py-3 text-right">Solicitudes<br /><span className="normal-case tracking-normal text-zinc-400">total · UTM</span></th><th className="px-4 py-3 text-right">Presup.</th><th className="px-4 py-3 text-right">Aceptados</th><th className="px-4 py-3 text-right">Eventos</th><th className="px-4 py-3 text-right">Contratado</th><th className="px-4 py-3 text-right">Cobrado</th><th className="px-4 py-3 text-right">Captura</th></tr></thead><tbody className="divide-y divide-zinc-100">{data.salons.map((row) => <tr key={row.id} className="hover:bg-zinc-50/70"><td className="px-4 py-3 font-semibold text-zinc-950">{row.salon}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.conversations)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.crmLeads)}</td><td className="px-4 py-3 text-right tabular-nums"><span className="font-medium text-zinc-950">{integer.format(row.requests)}</span><span className="ml-1 text-xs text-zinc-400">· {integer.format(row.metaLinkedRequests)}</span></td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.quotes)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.acceptedQuotes)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.events)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{amount(row.bookedRevenue, currency)}</td><td className="px-4 py-3 text-right tabular-nums">{amount(row.collectedRevenue, currency)}</td><td className="px-4 py-3 text-right tabular-nums"><Percentage value={row.observableCaptureRate} /></td></tr>)}{!data.salons.length ? <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-500">No hay salones dentro de este alcance.</td></tr> : null}</tbody></table></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 p-5"><div><h2 className="text-lg font-semibold text-zinc-950">Detalle por campaña</h2><p className="mt-1 text-sm text-zinc-500">Compara inversión, conversaciones y el recorrido CRM que podemos vincular sin aproximaciones.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><Link2 className="h-3.5 w-3.5" />Vínculo por ID o UTM único</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1510px] text-sm"><thead className="bg-zinc-50 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Campaña</th><th className="px-4 py-3">Salón</th><th className="px-4 py-3 text-right">Inversión</th><th className="px-4 py-3 text-right">Conv.</th><th className="px-4 py-3 text-right">Leads CRM</th><th className="px-4 py-3 text-right">Solic.</th><th className="px-4 py-3 text-right">Presup.</th><th className="px-4 py-3 text-right">Eventos</th><th className="px-4 py-3 text-right">Captura</th><th className="px-4 py-3 text-right">Costo/conv.</th><th className="px-4 py-3 text-right">Facturación</th><th className="px-4 py-3 text-right">Cobrado</th><th className="px-4 py-3 text-right">ROAS</th></tr></thead><tbody className="divide-y divide-zinc-100">{data.campaigns.map((row) => <tr key={row.id} className="hover:bg-zinc-50/70"><td className="max-w-80 px-4 py-3 font-semibold text-zinc-950"><span className="block truncate" title={row.campaign}>{row.campaign}</span><span className="mt-1 block text-[11px] font-normal text-zinc-400">{row.id}</span></td><td className="px-4 py-3 text-zinc-600">{row.salon}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{amount(row.spend, currency)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.conversations)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.crmLeads)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.requests)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.quotes)}</td><td className="px-4 py-3 text-right tabular-nums">{integer.format(row.events)}</td><td className="px-4 py-3 text-right tabular-nums"><Percentage value={row.observableCaptureRate} /></td><td className="px-4 py-3 text-right tabular-nums">{row.conversations ? amount(row.costPerConversation, currency) : '—'}</td><td className="px-4 py-3 text-right tabular-nums">{amount(row.bookedRevenue, currency)}</td><td className="px-4 py-3 text-right tabular-nums">{amount(row.collectedRevenue, currency)}</td><td className="px-4 py-3 text-right tabular-nums">{row.spend ? `${decimal.format(row.roas)}x` : '—'}</td></tr>)}{!data.campaigns.length ? <tr><td colSpan={13} className="px-4 py-10 text-center text-zinc-500">No hay campañas Meta para este período o el filtro elegido.</td></tr> : null}</tbody></table></div>
      </section>

      {assignments?.canManage ? <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 p-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Asignación de campañas a salones</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-zinc-500">Esta configuración habilita la comparación por salón. Asigná cada campaña antes de usarla como referencia comercial; las no asignadas permanecen fuera de los totales por salón.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl border border-warning-border bg-warning-bg px-3 py-2 text-xs font-semibold text-warning-foreground"><AlertTriangle className="h-4 w-4" />{data.unassignedCampaigns.length} sin asignar</span>
        </div>
        <div className="divide-y divide-zinc-100">
          {campaignAssignments.map((campaign) => <div key={campaign.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0"><p className="truncate font-semibold text-zinc-950" title={campaign.campaign}>{campaign.campaign}</p><p className="mt-1 text-xs text-zinc-500">{integer.format(campaign.conversations)} conversaciones · {amount(campaign.spend, currency)}</p></div>
            <Select aria-label={`Asignar ${campaign.campaign} a un salón`} value={campaign.salonId ?? ''} disabled={savingCampaign === campaign.id} onChange={(event) => void saveAssignment(campaign.id, event.target.value)}><option value="">Sin asignar</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select>
          </div>)}
          {!campaignAssignments.length ? <p className="p-5 text-sm text-zinc-500">Meta no devolvió campañas para este período.</p> : null}
        </div>
      </section> : null}

      <section className="rounded-2xl bg-zinc-950 p-5 text-white"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Cómo se calcula</h2><ul className="mt-2 space-y-1.5 text-sm leading-5 text-zinc-300"><li>{data.methodology.activity}</li><li>{data.methodology.campaign}</li><li>{data.methodology.attribution}</li></ul></div></div></section>
    </> : null}
  </section>;
}
