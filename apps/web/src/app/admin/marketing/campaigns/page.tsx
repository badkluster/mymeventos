'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Megaphone, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingCampaignStatusLabels } from '@/lib/display-labels';

type Campaign = { _id: string; name: string; status: string; totalRecipients: number; sentCount: number; failedCount: number; scheduledAt?: string; completedAt?: string; createdAt: string };
type Meta = { page: number; limit: number; totalItems: number; totalPages: number };

const statusTone: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600', scheduled: 'bg-sky-50 text-sky-700', preparing: 'bg-amber-50 text-amber-700',
  sending: 'bg-amber-50 text-amber-700', paused: 'bg-zinc-100 text-zinc-600', completed: 'bg-emerald-50 text-emerald-700',
  completed_with_errors: 'bg-orange-50 text-orange-700', cancelled: 'bg-zinc-100 text-zinc-500', failed: 'bg-red-50 text-red-700'
};

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign>();
  const [deleting, setDeleting] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get<{ items: Campaign[]; meta: Meta }>(`/marketing/campaigns?${query}`); setItems(response.items); setMeta(response.meta); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las campañas.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [query, showToast]);
  useEffect(() => { void load(); }, [load]);

  async function duplicate(campaign: Campaign) {
    try { const response = await api.post<{ campaign: Campaign }>(`/marketing/campaigns/${campaign._id}/duplicate`, {}); router.push(`/admin/marketing/campaigns/${response.campaign._id}/edit`); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo duplicar la campaña.', variant: 'error' }); }
  }

  async function removeCampaign() {
    if (!campaignToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/marketing/campaigns/${campaignToDelete._id}`);
      setCampaignToDelete(undefined);
      await load();
      showToast({ message: 'Campaña eliminada.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar la campaña.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Campañas de email dirigidas a leads y clientes." />
      <MarketingTabs />
      <PageHeader title="Campañas" description="Creá, programá y seguí el resultado de cada envío." action={<Button onClick={() => router.push('/admin/marketing/campaigns/new')}><Plus className="mr-2 h-4 w-4" />Nueva campaña</Button>} />

      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="h-11 pl-10" placeholder="Buscar campaña..." value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value, page: 1 }))} /></div>
        <Select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value, page: 1 }))}>
          <option value="">Todos los estados</option>
          {Object.entries(marketingCampaignStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-sm text-zinc-500">Cargando campañas...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="border-b bg-zinc-50/80 text-zinc-500"><tr>{['Nombre', 'Estado', 'Destinatarios', 'Enviados', 'Fallidos', 'Programada / completada'].map((h) => <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase">{h}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase">Acciones</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <tr key={item._id} className="cursor-pointer hover:bg-amber-50/35" onClick={() => router.push(`/admin/marketing/campaigns/${item._id}`)}>
                    <td className="px-5 py-4 font-semibold text-zinc-950">{item.name}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[item.status]}`}>{displayLabel(marketingCampaignStatusLabels, item.status)}</span></td>
                    <td className="px-5 py-4">{item.totalRecipients}</td>
                    <td className="px-5 py-4">{item.sentCount}</td>
                    <td className="px-5 py-4">{item.failedCount}</td>
                    <td className="px-5 py-4 text-xs">{item.completedAt ? new Date(item.completedAt).toLocaleString('es-AR') : item.scheduledAt ? new Date(item.scheduledAt).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-end">
                      {item.status === 'draft' ? <TableActionButton icon={Copy} label="Editar" onClick={() => router.push(`/admin/marketing/campaigns/${item._id}/edit`)} /> : null}
                      <TableActionButton icon={Copy} label="Duplicar" onClick={() => void duplicate(item)} />
                      {['draft', 'cancelled', 'failed'].includes(item.status) ? <TableActionButton icon={Trash2} label="Eliminar" onClick={() => setCampaignToDelete(item)} /> : null}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? <div className="grid place-items-center px-6 py-16 text-center"><Megaphone className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay campañas todavía.</p></div> : null}
          </div>
        )}
        <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-zinc-500">
          <span>{meta.totalItems} campañas</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-8 px-2" disabled={filters.page <= 1} onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
            <span>Página {meta.page} de {meta.totalPages}</span>
            <Button variant="secondary" className="h-8 px-2" disabled={filters.page >= meta.totalPages} onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </footer>
      </article>

      <Modal open={Boolean(campaignToDelete)} onClose={() => setCampaignToDelete(undefined)} title="Eliminar campaña" description="La campaña se ocultará del listado, pero se conservará el registro de auditoría.">
        <div className="space-y-4 p-6">
          <p className="text-sm text-zinc-700">¿Querés eliminar la campaña <strong>{campaignToDelete?.name}</strong>?</p>
          <footer className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
            <Button variant="secondary" disabled={deleting} onClick={() => setCampaignToDelete(undefined)}>Cancelar</Button>
            <Button variant="danger" disabled={deleting} onClick={() => void removeCampaign()}>{deleting ? 'Eliminando...' : 'Eliminar campaña'}</Button>
          </footer>
        </div>
      </Modal>
    </section>
  );
}
