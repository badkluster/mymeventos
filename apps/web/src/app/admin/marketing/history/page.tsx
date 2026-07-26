'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { PageHeader, Select } from '@/components/ui/primitives';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingCampaignStatusLabels } from '@/lib/display-labels';

type Campaign = {
  _id: string; name: string; status: string; totalRecipients: number; sentCount: number; deliveredCount: number;
  failedCount: number; unsubscribedCount: number; startedAt?: string; completedAt?: string;
};

const HISTORY_STATUSES = ['sending', 'paused', 'completed', 'completed_with_errors', 'cancelled', 'failed'];

export default function MarketingHistoryPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      const response = await api.get<{ items: Campaign[] }>(`/marketing/campaigns?${params.toString()}`);
      setItems(status ? response.items : response.items.filter((c) => HISTORY_STATUSES.includes(c.status)));
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el historial.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [status, showToast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Historial de envíos ya iniciados, completados o cancelados." />
      <MarketingTabs />
      <PageHeader title="Historial de envíos" description="Seguimiento de resultados de campañas ya procesadas." action={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
          <option value="">Todos los estados relevantes</option>
          {HISTORY_STATUSES.map((value) => <option key={value} value={value}>{displayLabel(marketingCampaignStatusLabels, value)}</option>)}
        </Select>
      } />

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-sm text-zinc-500">Cargando historial...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-[880px] w-full text-sm">
              <thead className="border-b bg-zinc-50/80 text-zinc-500"><tr>{['Campaña', 'Estado', 'Inicio', 'Fin', 'Enviados', 'Entregados', 'Fallidos', 'Bajas'].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <tr key={item._id} className="hover:bg-amber-50/35">
                    <td className="px-5 py-3"><Link href={`/admin/marketing/campaigns/${item._id}`} className="font-semibold text-zinc-950 hover:underline">{item.name}</Link></td>
                    <td className="px-5 py-3 text-xs">{displayLabel(marketingCampaignStatusLabels, item.status)}</td>
                    <td className="px-5 py-3 text-xs">{item.startedAt ? new Date(item.startedAt).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-5 py-3 text-xs">{item.completedAt ? new Date(item.completedAt).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-5 py-3">{item.sentCount}/{item.totalRecipients}</td>
                    <td className="px-5 py-3">{item.deliveredCount}</td>
                    <td className="px-5 py-3">{item.failedCount}</td>
                    <td className="px-5 py-3">{item.unsubscribedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? <div className="grid place-items-center px-6 py-16 text-center"><History className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">Todavía no hay envíos registrados.</p></div> : null}
          </div>
        )}
      </article>
    </section>
  );
}
