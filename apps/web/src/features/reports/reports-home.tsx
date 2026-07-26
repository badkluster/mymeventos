'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';

type ReportDefinition = { key: string; group: string; title: string; description: string; columns: unknown[] };

export function ReportsHome() {
  const [items, setItems] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void api.get<{ items: ReportDefinition[] }>('/reports')
      .then((result) => setItems(result.items))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar el centro de reportes.'))
      .finally(() => setLoading(false));
  }, []);
  const groups = [...new Set(items.map((item) => item.group))];

  return <section className="space-y-7">
    <PageHeader title="Centro de reportes" description="Consultá información trazable, aplicá filtros y exportá solamente los reportes habilitados para tu rol." />
    {loading ? <div className="grid min-h-72 place-items-center rounded-2xl border border-zinc-200 bg-white"><span className="inline-flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando reportes…</span></div> : null}
    {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {!loading && !error && !items.length ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500">No tenés reportes habilitados.</div> : null}
    {groups.map((group) => <div key={group}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{group}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.filter((item) => item.group === group).map((item) => <Link key={item.key} href={`/admin/reports/${item.key}`} className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md">
          <div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-950 text-white">{item.group === 'Finanzas' ? <FileSpreadsheet className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}</span><ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700" /></div>
          <h3 className="mt-4 font-semibold text-zinc-950">{item.title}</h3><p className="mt-1 text-sm leading-6 text-zinc-500">{item.description}</p>
        </Link>)}
      </div>
    </div>)}
  </section>;
}
