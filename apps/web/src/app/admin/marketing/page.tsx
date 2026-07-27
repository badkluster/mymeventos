'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Megaphone, Plus, Users2 } from 'lucide-react';
import { Button, PageHeader } from '@/components/ui/primitives';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingCampaignStatusLabels } from '@/lib/display-labels';

type Dashboard = {
  activeCampaigns: number; scheduledCampaigns: number; sentThisMonth: number; emailsSentThisMonth: number;
  deliveryRate: number | null; openRate: number | null; clickRate: number | null; failedEmails: number;
  campaignsWithErrors: number; reachableLeads: number; reachableCustomers: number;
  recentCampaigns: Array<{ _id: string; name: string; status: string; sentCount: number; totalRecipients: number; completedAt?: string; createdAt: string }>;
  upcomingCampaigns: Array<{ _id: string; name: string; scheduledAt?: string; estimatedRecipients: number }>;
  recentErrors: Array<{ _id: string; campaignId: string; errorMessage?: string; createdAt: string }>;
  mostUsedTemplates: Array<{ templateId: string; name: string; uses: number }>;
};

function pctLabel(value: number | null): string { return value === null ? 'Sin datos del proveedor' : `${Math.round(value * 100)}%`; }

export default function MarketingDashboardPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<Dashboard>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<Dashboard>('/marketing/dashboard')
      .then(setData)
      .catch((error: Error) => showToast({ message: error.message, variant: 'error' }))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Resumen de campañas y audiencias alcanzables." action={<Link href="/admin/marketing/campaigns/new"><Button><Plus className="mr-2 h-4 w-4" />Nueva campaña</Button></Link>} />
      <MarketingTabs />

      {loading || !data ? <p className="text-sm text-zinc-500">Cargando resumen...</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Campañas activas" value={data.activeCampaigns} />
            <StatCard label="Campañas programadas" value={data.scheduledCampaigns} />
            <StatCard label="Enviadas este mes" value={data.sentThisMonth} />
            <StatCard label="Emails enviados este mes" value={data.emailsSentThisMonth} />
            <StatCard label="Tasa de entrega" value={pctLabel(data.deliveryRate)} />
            <StatCard label="Tasa de apertura" value={pctLabel(data.openRate)} />
            <StatCard label="Tasa de clic" value={pctLabel(data.clickRate)} />
            <StatCard label="Emails fallidos" value={data.failedEmails} />
            <StatCard label="Leads alcanzables" value={data.reachableLeads} icon={Users2} />
            <StatCard label="Clientes alcanzables" value={data.reachableCustomers} icon={Users2} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Campañas recientes" icon={Megaphone} empty={!data.recentCampaigns.length} emptyText="Todavía no enviaste ninguna campaña.">
              {data.recentCampaigns.map((c) => (
                <Link key={c._id} href={`/admin/marketing/campaigns/${c._id}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-zinc-50">
                  <span className="font-medium text-zinc-900">{c.name}</span>
                  <span className="text-xs text-zinc-500">{displayLabel(marketingCampaignStatusLabels, c.status)} · {c.sentCount}/{c.totalRecipients}</span>
                </Link>
              ))}
            </Panel>

            <Panel title="Próximas campañas" icon={Megaphone} empty={!data.upcomingCampaigns.length} emptyText="No hay campañas programadas.">
              {data.upcomingCampaigns.map((c) => (
                <Link key={c._id} href={`/admin/marketing/campaigns/${c._id}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-zinc-50">
                  <span className="font-medium text-zinc-900">{c.name}</span>
                  <span className="text-xs text-zinc-500">{c.scheduledAt ? new Date(c.scheduledAt).toLocaleString('es-AR') : ''} · {c.estimatedRecipients} dest.</span>
                </Link>
              ))}
            </Panel>

            <Panel title="Errores recientes" icon={AlertTriangle} empty={!data.recentErrors.length} emptyText="Sin errores recientes.">
              {data.recentErrors.map((error) => (
                <Link key={error._id} href={`/admin/marketing/campaigns/${error.campaignId}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-zinc-50">
                  <p className="text-xs text-zinc-500">{new Date(error.createdAt).toLocaleString('es-AR')}</p>
                  <p className="truncate text-red-600">{error.errorMessage ?? 'Error sin detalle'}</p>
                </Link>
              ))}
            </Panel>
          </div>

          {data.mostUsedTemplates.length ? (
            <Panel title="Plantillas más utilizadas" icon={Megaphone} empty={false} emptyText="">
              {data.mostUsedTemplates.map((t) => (
                <div key={t.templateId} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm">
                  <span className="font-medium text-zinc-900">{t.name}</span>
                  <span className="text-xs text-zinc-500">{t.uses} campañas</span>
                </div>
              ))}
            </Panel>
          ) : null}
        </>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number; icon?: typeof Megaphone }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-950">{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children, empty, emptyText }: { title: string; icon: typeof Megaphone; children: React.ReactNode; empty: boolean; emptyText: string }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800"><Icon className="h-4 w-4" />{title}</p>
      {empty ? <p className="px-3 py-6 text-center text-xs text-zinc-400">{emptyText}</p> : <div className="divide-y divide-zinc-100">{children}</div>}
    </article>
  );
}
