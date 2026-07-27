'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, Pencil, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { Button, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingCampaignStatusLabels, marketingRecipientStatusLabels } from '@/lib/display-labels';

type Campaign = {
  _id: string; name: string; status: string; subject?: string; totalRecipients: number; sentCount: number; deliveredCount: number;
  failedCount: number; skippedCount: number; openedCount: number; clickedCount: number; unsubscribedCount: number;
  scheduledAt?: string; startedAt?: string; completedAt?: string; createdAt: string;
};
type Recipient = { _id: string; email: string; firstName?: string; lastName?: string; sourceType: string; status: string; attemptCount: number; failureReason?: string; sentAt?: string };
type Meta = { page: number; limit: number; totalItems: number; totalPages: number };

function pct(part: number, total: number): string { return total > 0 ? `${Math.round((part / total) * 100)}%` : '—'; }

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [campaign, setCampaign] = useState<Campaign>();
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, limit: 50, totalItems: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCampaign = useCallback(async (campaignId: string) => {
    try { const response = await api.get<{ campaign: Campaign }>(`/marketing/campaigns/${campaignId}`); setCampaign(response.campaign); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar la campaña.', variant: 'error' }); }
  }, [showToast]);

  const loadRecipients = useCallback(async (campaignId: string) => {
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (statusFilter) params.set('status', statusFilter);
    const response = await api.get<{ items: Recipient[]; meta: Meta }>(`/marketing/campaigns/${campaignId}/recipients?${params.toString()}`);
    setRecipients(response.items);
    setMeta(response.meta);
  }, [page, statusFilter]);

  useEffect(() => {
    void params.then(({ id: routeId }) => {
      setId(routeId);
      void Promise.all([loadCampaign(routeId), loadRecipients(routeId)]).finally(() => setLoading(false));
    });
  }, [params, loadCampaign, loadRecipients]);

  useEffect(() => { if (id) void loadRecipients(id); }, [id, loadRecipients]);

  async function retryFailed() {
    try { await api.post(`/marketing/campaigns/${id}/retry-failed`, {}); await Promise.all([loadCampaign(id), loadRecipients(id)]); showToast({ message: 'Reintento programado.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo reintentar.', variant: 'error' }); }
  }
  async function cancel() {
    try { await api.post(`/marketing/campaigns/${id}/cancel`, { reason: cancelReason }); setCancelOpen(false); await loadCampaign(id); showToast({ message: 'Campaña cancelada.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo cancelar.', variant: 'error' }); }
  }
  async function removeCampaign() {
    setDeleting(true);
    try {
      await api.delete(`/marketing/campaigns/${id}`);
      showToast({ message: 'Campaña eliminada.', variant: 'success' });
      router.push('/admin/marketing/campaigns');
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar la campaña.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }
  function exportCsv() {
    window.open(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/marketing/campaigns/${id}/export`, '_blank');
  }

  const deliveryRate = useMemo(() => campaign ? pct(campaign.deliveredCount, campaign.sentCount) : '—', [campaign]);
  const openRate = useMemo(() => campaign ? pct(campaign.openedCount, campaign.deliveredCount) : '—', [campaign]);
  const clickRate = useMemo(() => campaign ? pct(campaign.clickedCount, campaign.deliveredCount) : '—', [campaign]);

  if (loading || !campaign) return <p className="p-6 text-sm text-zinc-500">Cargando campaña...</p>;

  return (
    <section className="space-y-6">
      <button type="button" onClick={() => router.push('/admin/marketing/campaigns')} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ChevronLeft className="h-4 w-4" />Volver a campañas</button>
      <PageHeader
        title={campaign.name}
        description={`Estado: ${displayLabel(marketingCampaignStatusLabels, campaign.status)} · Asunto: ${campaign.subject ?? 'Sin asunto'}`}
        action={<div className="flex flex-wrap gap-2">
          {campaign.status === 'draft' ? <Button variant="secondary" onClick={() => router.push(`/admin/marketing/campaigns/${id}/edit`)}><Pencil className="mr-2 h-4 w-4" />Editar</Button> : null}
          {['draft', 'scheduled', 'preparing', 'sending', 'paused'].includes(campaign.status) ? <Button variant="danger" onClick={() => setCancelOpen(true)}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button> : null}
          {['draft', 'cancelled', 'failed'].includes(campaign.status) ? <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button> : null}
          {campaign.failedCount > 0 ? <Button variant="secondary" onClick={() => void retryFailed()}><RotateCcw className="mr-2 h-4 w-4" />Reintentar fallidos</Button> : null}
          <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        </div>}
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Destinatarios', campaign.totalRecipients],
          ['Enviados', campaign.sentCount],
          ['Entregados', `${campaign.deliveredCount} (${deliveryRate})`],
          ['Fallidos', campaign.failedCount],
          ['Aperturas', `${campaign.openedCount} (${openRate})`],
          ['Clics', `${campaign.clickedCount} (${clickRate})`]
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{value}</p>
          </div>
        ))}
      </div>

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b p-4">
          <p className="text-sm font-semibold text-zinc-800">Destinatarios</p>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 w-48">
            <option value="">Todos</option>
            {Object.entries(marketingRecipientStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="border-b bg-zinc-50/80 text-zinc-500"><tr>{['Nombre', 'Email', 'Origen', 'Estado', 'Intentos', 'Error'].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {recipients.map((recipient) => (
                <tr key={recipient._id}>
                  <td className="px-5 py-3">{[recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-5 py-3">{recipient.email}</td>
                  <td className="px-5 py-3 text-xs">{recipient.sourceType}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">{displayLabel(marketingRecipientStatusLabels, recipient.status)}</span></td>
                  <td className="px-5 py-3 text-xs">{recipient.attemptCount}</td>
                  <td className="px-5 py-3 text-xs text-red-600">{recipient.failureReason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recipients.length ? <p className="p-8 text-center text-sm text-zinc-500">No hay destinatarios para este filtro.</p> : null}
        </div>
        <footer className="flex items-center justify-between border-t px-5 py-3 text-xs text-zinc-500">
          <span>{meta.totalItems} destinatarios</span>
          <div className="flex items-center gap-2">
            <TableActionButton icon={ChevronLeft} label="Anterior" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} />
            <span>Página {meta.page} de {meta.totalPages}</span>
            <TableActionButton icon={ChevronRight} label="Siguiente" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages} />
          </div>
        </footer>
      </article>

      <Modal open={cancelOpen} title="Cancelar campaña" onClose={() => setCancelOpen(false)}>
        <div className="space-y-3 p-6">
          <p className="text-sm text-zinc-600">Los destinatarios pendientes no recibirán la campaña.</p>
          <Textarea placeholder="Motivo (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <footer className="flex justify-end gap-2 border-t pt-4"><Button variant="secondary" onClick={() => setCancelOpen(false)}>Volver</Button><Button variant="danger" onClick={() => void cancel()}>Confirmar cancelación</Button></footer>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Eliminar campaña" description="La campaña se ocultará del listado, pero se conservará el registro de auditoría." onClose={() => setDeleteOpen(false)}>
        <div className="space-y-4 p-6">
          <p className="text-sm text-zinc-700">¿Querés eliminar esta campaña?</p>
          <footer className="flex justify-end gap-2 border-t pt-4"><Button variant="secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="danger" disabled={deleting} onClick={() => void removeCampaign()}>{deleting ? 'Eliminando...' : 'Eliminar campaña'}</Button></footer>
        </div>
      </Modal>
    </section>
  );
}
