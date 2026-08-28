'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Link2,
  Percent,
  ReceiptText,
  RefreshCw,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type AttributionSummary = {
  requests: number;
  leads: number;
  attributedRequests: number;
  attributionCoverage: number;
  quotes: number;
  acceptedQuotes: number;
  confirmedEvents: number;
  bookedRevenue: number;
  collectedRevenue: number;
  quoteRate: number;
  closeRate: number;
  averageTicket: number;
};

type AttributionRow = {
  key: string;
  source: string;
  medium: string | null;
  campaign?: string | null;
  requests: number;
  leads: number;
  quotes: number;
  acceptedQuotes: number;
  confirmedEvents: number;
  bookedRevenue: number;
  collectedRevenue: number;
  quoteRate: number;
  closeRate: number;
  averageTicket: number;
};

type SalonRow = {
  salonId: string;
  name: string;
  requests: number;
  leads: number;
  quotes: number;
  acceptedQuotes: number;
  confirmedEvents: number;
  bookedRevenue: number;
  collectedRevenue: number;
  closeRate: number;
};

type CrmAttribution = {
  period: { from: string; to: string };
  summary: AttributionSummary;
  sources: AttributionRow[];
  campaigns: AttributionRow[];
  salons: SalonRow[];
  methodology: {
    cohort: string;
    revenue: string;
    collected?: string;
    historicalUnknownIsNotGuessed: boolean;
  };
};

type MetaPerformance = {
  account: { currency: string | null } | null;
  campaigns: Array<{ id: string; name: string; spend: number }>;
  connection: { status: string; lastSyncAt: string | null };
};

type Kpi = {
  label: string;
  value: string;
  note: string;
  help: string;
  icon: typeof Users;
};

type CampaignWithMeta = AttributionRow & {
  metaSpend: number | null;
  roas: number | null;
  metaCampaignName: string | null;
};

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

const HELP = {
  requests: 'Solicitudes de presupuesto creadas en el CRM durante el período seleccionado. El reporte sigue a esa cohorte aunque el presupuesto o cierre ocurra después.',
  leads: 'Leads únicos asociados a las solicitudes del período. Una misma persona puede enviar más de una consulta.',
  coverage: 'Porcentaje de consultas en las que pudimos identificar una fuente o campaña mediante UTM, sesión web o fuente explícita del CRM. El histórico sin evidencia no se adivina.',
  quotes: 'Presupuestos creados desde las solicitudes seleccionadas. Una solicitud puede generar propuestas para más de un salón.',
  acceptedQuotes: 'Presupuestos aceptados o convertidos dentro del recorrido comercial de esas consultas.',
  closedEvents: 'Eventos reservados o confirmados que nacieron de los presupuestos vinculados a las consultas del período.',
  bookedRevenue: 'Facturación comercial atribuida. Prioriza el contrato aprobado; si no existe, usa el monto del evento confirmado y luego el presupuesto.',
  collectedRevenue: 'Importe efectivamente cobrado mediante pagos pagados vinculados a los eventos atribuidos, neto de devoluciones y sin depósitos de garantía.',
  quoteRate: 'Porcentaje de consultas que avanzaron al menos a un presupuesto.',
  closeRate: 'Porcentaje de consultas que terminaron en al menos un evento reservado o confirmado.',
  averageTicket: 'Facturación atribuida dividida por cantidad de eventos cerrados.',
  campaign: 'Campaña identificada por UTM o sesión. Si no hay evidencia histórica suficiente se muestra sin campaña, en vez de asignar una campaña arbitraria.',
  roas: 'Retorno sobre inversión publicitaria: facturación atribuida dividida por gasto de Meta. Solo se calcula cuando el nombre UTM coincide exactamente con una campaña leída desde Meta.',
  source: 'Fuente detectada para la consulta: UTM, sesión web o canal explícito del CRM.',
  salon: 'Rendimiento comercial por salón. Consultas se asignan al salón interesado; presupuestos y cierres usan el salón real de cada entidad.',
} as const;

function asInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: asInputDate(from), to: asInputDate(to) };
}

function currency(value: number, code = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value || 0);
}

function normalizeCampaignName(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function InfoLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <Tooltip label={help}>
        <button type="button" aria-label={`Información sobre ${label}`} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800">
          <Info className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </span>
  );
}

function KpiCard({ item }: { item: Kpi }) {
  const Icon = item.icon;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500"><InfoLabel label={item.label} help={item.help} /></div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white"><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">{item.value}</div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.note}</p>
    </div>
  );
}

function FunnelStep({ index, label, value, base, help }: { index: number; label: string; value: number; base: number; help: string }) {
  const width = base ? Math.max(3, Math.min(100, (value / base) * 100)) : 0;
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-800"><InfoLabel label={`${index}. ${label}`} help={help} /></div>
        <strong className="text-lg text-zinc-950">{integer.format(value)}</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-zinc-950" style={{ width: `${width}%` }} /></div>
      <div className="mt-2 text-xs text-zinc-500">{base ? `${decimal.format((value / base) * 100)}% de consultas` : 'Sin consultas en el período'}</div>
    </div>
  );
}

export default function MarketingAttributionPage() {
  const { showToast } = useToast();
  const initial = useMemo(() => defaultPeriod(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [appliedFrom, setAppliedFrom] = useState(initial.from);
  const [appliedTo, setAppliedTo] = useState(initial.to);
  const [data, setData] = useState<CrmAttribution | null>(null);
  const [meta, setMeta] = useState<MetaPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (rangeFrom: string, rangeTo: string) => {
    setLoading(true);
    setData(null);
    setMeta(null);
    try {
      const [crmResult, metaResult] = await Promise.allSettled([
        api.get<CrmAttribution>(`/marketing/performance/attribution?from=${rangeFrom}&to=${rangeTo}`),
        api.get<MetaPerformance>(`/marketing/performance/meta-attribution?from=${rangeFrom}&to=${rangeTo}`),
      ]);
      if (crmResult.status === 'rejected') throw crmResult.reason;
      setData(crmResult.value);
      setMeta(metaResult.status === 'fulfilled' ? metaResult.value : null);
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar la atribución CRM.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(appliedFrom, appliedTo); }, [appliedFrom, appliedTo, load]);

  const summary = data?.summary;
  const metaCurrency = meta?.account?.currency || 'ARS';
  const metaCampaignMap = useMemo(() => new Map((meta?.campaigns ?? []).map((campaign) => [normalizeCampaignName(campaign.name), campaign])), [meta]);
  const campaignRows: CampaignWithMeta[] = useMemo(() => (data?.campaigns ?? []).map((row) => {
    const campaignName = row.campaign;
    const match = campaignName ? metaCampaignMap.get(normalizeCampaignName(campaignName)) : undefined;
    const metaSpend = match ? Number(match.spend || 0) : null;
    return {
      ...row,
      metaSpend,
      metaCampaignName: match?.name ?? null,
      roas: metaSpend && metaSpend > 0 ? row.bookedRevenue / metaSpend : null,
    };
  }), [data, metaCampaignMap]);

  const kpis: Kpi[] = summary ? [
    { label: 'Consultas', value: integer.format(summary.requests), note: 'Solicitudes de la cohorte seleccionada', help: HELP.requests, icon: Users },
    { label: 'Cobertura atribución', value: `${decimal.format(summary.attributionCoverage)}%`, note: `${integer.format(summary.attributedRequests)} consultas con fuente identificable`, help: HELP.coverage, icon: Link2 },
    { label: 'Leads CRM únicos', value: integer.format(summary.leads), note: 'Personas/leads asociados a las consultas', help: HELP.leads, icon: UserRoundCheck },
    { label: 'Presupuestos', value: integer.format(summary.quotes), note: `${decimal.format(summary.quoteRate)}% de consultas avanzó`, help: HELP.quotes, icon: ReceiptText },
    { label: 'Presupuestos aceptados', value: integer.format(summary.acceptedQuotes), note: 'Aceptados o convertidos', help: HELP.acceptedQuotes, icon: CheckCircle2 },
    { label: 'Eventos cerrados', value: integer.format(summary.confirmedEvents), note: `${decimal.format(summary.closeRate)}% de tasa de cierre`, help: HELP.closedEvents, icon: Target },
    { label: 'Facturación atribuida', value: currency(summary.bookedRevenue), note: 'Valor comercial de cierres atribuibles', help: HELP.bookedRevenue, icon: BadgeDollarSign },
    { label: 'Cobrado', value: currency(summary.collectedRevenue), note: 'Pagos efectivamente registrados', help: HELP.collectedRevenue, icon: CircleDollarSign },
    { label: 'Tasa de cierre', value: `${decimal.format(summary.closeRate)}%`, note: 'Consultas que llegaron a evento', help: HELP.closeRate, icon: Percent },
    { label: 'Ticket promedio', value: currency(summary.averageTicket), note: 'Facturación / eventos cerrados', help: HELP.averageTicket, icon: TrendingUp },
  ] : [];

  const applyRange = () => {
    if (!from || !to || from > to) {
      showToast({ message: 'Seleccioná un rango de fechas válido.', variant: 'error' });
      return;
    }
    setAppliedFrom(from);
    setAppliedTo(to);
    if (from === appliedFrom && to === appliedTo) void load(from, to);
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title="Atribución CRM"
        description="Une marketing con el negocio real: consulta → presupuesto → evento → facturación → cobro."
        action={<Button variant="secondary" onClick={() => void load(appliedFrom, appliedTo)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>}
      />
      <MarketingTabs />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mr-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700"><CalendarRange className="h-5 w-5" /></div>
        <label className="text-xs font-semibold text-zinc-600">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs font-semibold text-zinc-600">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <Button onClick={applyRange} disabled={loading}>Aplicar período</Button>
        <div className="ml-auto text-right text-xs text-zinc-500">
          <div className="font-semibold text-zinc-700">Cohorte de consultas</div>
          <div>{appliedFrom} → {appliedTo}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Lectura confiable:</strong> el histórico sin UTM o sesión identificable queda como Directo / sin identificar. Performance 360 no asigna una campaña por aproximación.
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="grid min-h-72 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div>
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-zinc-700" />
            <div className="mt-4 text-sm font-semibold text-zinc-900">Cargando Performance 360…</div>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500">Estamos cruzando consultas, presupuestos, cierres, facturación y el gasto de Meta Ads. El panel aparecerá cuando la lectura esté completa.</p>
          </div>
        </div>
      ) : summary ? (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div><h2 className="text-lg font-bold text-zinc-950">Resultado comercial atribuible</h2><p className="text-sm text-zinc-500">Métricas del CRM vinculadas a las consultas originadas en el período.</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${summary.attributionCoverage >= 70 ? 'bg-emerald-100 text-emerald-800' : summary.attributionCoverage >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-700'}`}>Cobertura {decimal.format(summary.attributionCoverage)}%</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((item) => <KpiCard key={item.label} item={item} />)}</div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4"><h2 className="text-lg font-bold text-zinc-950">Embudo comercial atribuido</h2><p className="text-sm text-zinc-500">Seguimos la misma cohorte desde la consulta inicial hasta el cierre.</p></div>
            <div className="grid gap-3 lg:grid-cols-4">
              <FunnelStep index={1} label="Consultas" value={summary.requests} base={summary.requests} help={HELP.requests} />
              <FunnelStep index={2} label="Con presupuesto" value={summary.quotes} base={summary.requests} help={HELP.quotes} />
              <FunnelStep index={3} label="Presupuestos aceptados" value={summary.acceptedQuotes} base={summary.requests} help={HELP.acceptedQuotes} />
              <FunnelStep index={4} label="Eventos cerrados" value={summary.confirmedEvents} base={summary.requests} help={HELP.closedEvents} />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 p-5">
              <div><h2 className="text-lg font-bold text-zinc-950">Campañas → negocio real</h2><p className="text-sm text-zinc-500">Compara consultas, cierres y facturación. ROAS aparece solo cuando hay coincidencia exacta con Meta Ads.</p></div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500"><InfoLabel label="ROAS atribuible" help={HELP.roas} /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1150px] w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr>
                  <th className="px-4 py-3"><InfoLabel label="Campaña" help={HELP.campaign} /></th>
                  <th className="px-4 py-3"><InfoLabel label="Fuente" help={HELP.source} /></th>
                  <th className="px-4 py-3 text-right">Consultas</th><th className="px-4 py-3 text-right">Presup.</th><th className="px-4 py-3 text-right">Cerrados</th>
                  <th className="px-4 py-3 text-right"><InfoLabel label="Facturación" help={HELP.bookedRevenue} /></th>
                  <th className="px-4 py-3 text-right"><InfoLabel label="Cobrado" help={HELP.collectedRevenue} /></th>
                  <th className="px-4 py-3 text-right">Gasto Meta</th><th className="px-4 py-3 text-right"><InfoLabel label="ROAS" help={HELP.roas} /></th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {campaignRows.slice(0, 100).map((row) => (
                    <tr key={row.key} className="hover:bg-zinc-50/80">
                      <td className="px-4 py-3"><div className="max-w-sm font-semibold text-zinc-900">{row.campaign || 'Sin campaña identificada'}</div>{row.medium ? <div className="mt-0.5 text-xs text-zinc-400">{row.medium}</div> : null}</td>
                      <td className="px-4 py-3 text-zinc-600">{row.source}</td>
                      <td className="px-4 py-3 text-right font-medium">{integer.format(row.requests)}</td><td className="px-4 py-3 text-right">{integer.format(row.quotes)}</td><td className="px-4 py-3 text-right">{integer.format(row.confirmedEvents)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{currency(row.bookedRevenue)}</td><td className="px-4 py-3 text-right">{currency(row.collectedRevenue)}</td>
                      <td className="px-4 py-3 text-right">{row.metaSpend === null ? '—' : currency(row.metaSpend, metaCurrency)}</td>
                      <td className="px-4 py-3 text-right"><span className={`rounded-lg px-2 py-1 font-semibold ${row.roas !== null && row.roas >= 3 ? 'bg-emerald-100 text-emerald-800' : row.roas !== null && row.roas < 1 ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-700'}`}>{row.roas === null ? '—' : `${decimal.format(row.roas)}x`}</span></td>
                    </tr>
                  ))}
                  {!campaignRows.length ? <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-500">Todavía no hay consultas atribuibles en este período.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 p-5"><h2 className="text-lg font-bold text-zinc-950"><InfoLabel label="Rendimiento por fuente" help={HELP.source} /></h2><p className="text-sm text-zinc-500">Qué canales originan consultas que avanzan comercialmente.</p></div>
              <div className="divide-y divide-zinc-100">
                {(data?.sources ?? []).slice(0, 12).map((row) => (
                  <div key={row.key} className="grid grid-cols-[1fr_auto] gap-4 p-4">
                    <div><div className="font-semibold text-zinc-900">{row.source}</div><div className="mt-1 text-xs text-zinc-500">{integer.format(row.requests)} consultas · {integer.format(row.confirmedEvents)} cierres · {decimal.format(row.closeRate)}%</div></div>
                    <div className="text-right"><div className="font-semibold text-zinc-900">{currency(row.bookedRevenue)}</div><div className="text-xs text-zinc-500">{currency(row.collectedRevenue)} cobrado</div></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 p-5"><h2 className="text-lg font-bold text-zinc-950"><InfoLabel label="Rendimiento por salón" help={HELP.salon} /></h2><p className="text-sm text-zinc-500">Consulta, propuesta y cierre por unidad comercial.</p></div>
              <div className="divide-y divide-zinc-100">
                {(data?.salons ?? []).map((row) => (
                  <div key={row.salonId} className="grid grid-cols-[1fr_auto] gap-4 p-4">
                    <div><div className="font-semibold text-zinc-900">{row.name}</div><div className="mt-1 text-xs text-zinc-500">{integer.format(row.requests)} consultas · {integer.format(row.quotes)} presupuestos · {integer.format(row.confirmedEvents)} cierres</div></div>
                    <div className="text-right"><div className="font-semibold text-zinc-900">{currency(row.bookedRevenue)}</div><div className="text-xs text-zinc-500">{decimal.format(row.closeRate)}% cierre</div></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white">
            <div className="flex gap-3"><BarChart3 className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-bold">Cómo leer esta atribución</h2><p className="mt-1 max-w-4xl text-sm leading-relaxed text-zinc-300">El período selecciona consultas creadas en el CRM. Luego seguimos sus presupuestos, eventos, contratos y pagos aunque esas etapas ocurran después. Esto evita medir solo clics y permite saber qué marketing termina generando negocio real.</p></div></div>
          </section>
        </>
      ) : null}
    </section>
  );
}
