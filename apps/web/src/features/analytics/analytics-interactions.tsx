'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { AnalyticsNav } from './analytics-nav';
import { analyticsElementLabel, analyticsSectionLabel } from './analytics-labels';

type Item = { id: string; value: number };
type Response = { sections: Item[]; elements: Item[]; versions: string[] };

function period() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((item) => [item.type, item.value]));
  return { from: `${parts.year}-${parts.month}-01`, to: `${parts.year}-${parts.month}-${parts.day}` };
}

function ClickList({ items, label }: { items: Item[]; label: (id: string) => string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <p className="py-8 text-center text-sm text-zinc-500">No hay clics para los filtros seleccionados.</p>;
  return <div className="space-y-4">{items.map((item) => <div key={item.id}><div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate font-medium" title={label(item.id)}>{label(item.id)}</span><strong className="shrink-0">{item.value}</strong></div><div className="h-2 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-950" style={{ width: `${item.value / max * 100}%` }} /></div></div>)}</div>;
}

export function AnalyticsInteractions() {
  const initial = useMemo(() => period(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [device, setDevice] = useState('desktop');
  const [version, setVersion] = useState('');
  const [result, setResult] = useState<Response>({ sections: [], elements: [], versions: [] });
  const load = useCallback(async () => {
    const query = new URLSearchParams({ from, to, pagePath: '/', deviceType: device });
    if (version) query.set('pageVersion', version);
    setResult(await api.get<Response>(`/analytics/heatmap?${query}`));
  }, [from, to, device, version]);
  useEffect(() => { void load(); }, [load]);

  const totalClicks = useMemo(() => result.sections.reduce((total, item) => total + item.value, 0), [result.sections]);
  return <section className="space-y-5"><PageHeader title="Interacciones" description="Conocé qué secciones y botones despiertan más interés. Los datos son agregados: no hay capturas de pantalla ni grabaciones." /><AnalyticsNav />
    <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><label className="text-xs font-medium">Desde<Input type="date" className="mt-1.5 w-44" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-medium">Hasta<Input type="date" className="mt-1.5 w-44" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="text-xs font-medium">Dispositivo<Select className="mt-1.5 w-44" value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Computadora</option><option value="tablet">Tablet</option><option value="mobile">Celular</option></Select></label><label className="text-xs font-medium">Versión de la página<Select className="mt-1.5 w-56" value={version} onChange={(event) => setVersion(event.target.value)}><option value="">Todas las versiones</option>{result.versions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label><div className="self-end"><Button variant="secondary" onClick={() => void load()}>Aplicar filtros</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-zinc-500">Clics registrados</p><p className="mt-2 text-2xl font-semibold">{totalClicks}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-zinc-500">Secciones con clics</p><p className="mt-2 text-2xl font-semibold">{result.sections.length}</p></article><article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-zinc-500">Botones o enlaces elegidos</p><p className="mt-2 text-2xl font-semibold">{result.elements.length}</p></article></div>
    <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Interés por sección</h2><p className="mt-1 text-sm text-zinc-500">Sirve para detectar qué partes de la página invitan a seguir explorando.</p><div className="mt-5"><ClickList items={result.sections} label={analyticsSectionLabel} /></div></article><article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Botones y enlaces más elegidos</h2><p className="mt-1 text-sm text-zinc-500">Usalo para evaluar llamados a la acción, contacto y navegación.</p><div className="mt-5"><ClickList items={result.elements} label={analyticsElementLabel} /></div></article></div>
  </section>;
}
