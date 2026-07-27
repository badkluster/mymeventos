'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Archive, BadgePercent } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, promotionDiscountTypeLabels } from '@/lib/display-labels';

type Promotion = {
  _id: string; name: string; internalDescription?: string; publicTitle?: string; publicDescription?: string;
  code?: string; discountType: string; discountValue?: number; minimumAmount?: number; maximumDiscount?: number;
  validFrom?: string; validUntil?: string; usageLimit?: number; usageLimitPerCustomer?: number; usedCount: number;
  applicableSalonIds?: string[]; eventTypes?: string[]; isPublic?: boolean; isActive: boolean; archivedAt?: string | null;
  termsAndConditions?: string; bannerImageUrl?: string; buttonLabel?: string; buttonUrl?: string;
};
type Salon = { _id: string; name: string };

const empty = {
  name: '', internalDescription: '', publicTitle: '', publicDescription: '', code: '', discountType: 'percentage',
  discountValue: 0, minimumAmount: '', maximumDiscount: '', validFrom: '', validUntil: '', usageLimit: '', usageLimitPerCustomer: '',
  applicableSalonIds: [] as string[], eventTypesText: '', isPublic: false, isActive: true, termsAndConditions: '', bannerImageUrl: '', buttonLabel: '', buttonUrl: ''
};

const statusTone: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700', scheduled: 'bg-sky-50 text-sky-700', expired: 'bg-zinc-100 text-zinc-600',
  inactive: 'bg-amber-50 text-amber-700', archived: 'bg-zinc-100 text-zinc-500'
};
function statusOf(promotion: Promotion): { key: string; label: string } {
  if (promotion.archivedAt) return { key: 'archived', label: 'Archivada' };
  if (!promotion.isActive) return { key: 'inactive', label: 'Inactiva' };
  const now = Date.now();
  if (promotion.validFrom && new Date(promotion.validFrom).getTime() > now) return { key: 'scheduled', label: 'Programada' };
  if (promotion.validUntil && new Date(promotion.validUntil).getTime() < now) return { key: 'expired', label: 'Vencida' };
  return { key: 'active', label: 'Activa' };
}

export default function MarketingPromotionsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Promotion[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [filters, setFilters] = useState({ search: '', status: '', discountType: '' });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Promotion | null | undefined>();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ items: Promotion[] }>(`/marketing/promotions?${query}`);
      setItems(response.items);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las promociones.', variant: 'error' });
    } finally { setLoading(false); }
  }, [query, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { void api.get<{ salons: Salon[] }>('/salons').then((response) => setSalons(response.salons)).catch(() => undefined); }, []);

  function open(promotion?: Promotion) {
    setEditing(promotion ?? null);
    setForm(promotion ? {
      ...empty,
      ...promotion,
      discountValue: promotion.discountValue ?? 0,
      minimumAmount: promotion.minimumAmount != null ? String(promotion.minimumAmount) : '',
      maximumDiscount: promotion.maximumDiscount != null ? String(promotion.maximumDiscount) : '',
      usageLimit: promotion.usageLimit != null ? String(promotion.usageLimit) : '',
      usageLimitPerCustomer: promotion.usageLimitPerCustomer != null ? String(promotion.usageLimitPerCustomer) : '',
      validFrom: promotion.validFrom ? promotion.validFrom.slice(0, 10) : '',
      validUntil: promotion.validUntil ? promotion.validUntil.slice(0, 10) : '',
      applicableSalonIds: promotion.applicableSalonIds ?? [],
      eventTypesText: (promotion.eventTypes ?? []).join(', ')
    } : empty);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...form,
      discountValue: Number(form.discountValue) || 0,
      minimumAmount: form.minimumAmount ? Number(form.minimumAmount) : undefined,
      maximumDiscount: form.maximumDiscount ? Number(form.maximumDiscount) : undefined,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
      usageLimitPerCustomer: form.usageLimitPerCustomer ? Number(form.usageLimitPerCustomer) : undefined,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      eventTypes: form.eventTypesText.split(',').map((value) => value.trim()).filter(Boolean),
      eventTypesText: undefined
    };
    try {
      if (editing) await api.patch(`/marketing/promotions/${editing._id}`, payload);
      else await api.post('/marketing/promotions', payload);
      setEditing(undefined);
      await load();
      showToast({ message: 'Promoción guardada correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la promoción.', variant: 'error' });
    }
  }

  async function duplicate(promotion: Promotion) {
    try { await api.post(`/marketing/promotions/${promotion._id}/duplicate`, {}); await load(); showToast({ message: 'Promoción duplicada.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo duplicar la promoción.', variant: 'error' }); }
  }
  async function archive(promotion: Promotion) {
    try { await api.post(`/marketing/promotions/${promotion._id}/archive`, {}); await load(); showToast({ message: 'Promoción archivada.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo archivar la promoción.', variant: 'error' }); }
  }
  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Promociones comerciales vinculables a campañas de email." />
      <MarketingTabs />
      <PageHeader title="Promociones" description="Descuentos y beneficios que pueden mostrarse dentro de una campaña." action={<Button onClick={() => open()}><Plus className="mr-2 h-4 w-4" />Nueva promoción</Button>} />

      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_200px_200px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="h-11 pl-10" placeholder="Buscar por nombre o código..." value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))} /></div>
        <Select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="scheduled">Programadas</option>
          <option value="expired">Vencidas</option>
          <option value="inactive">Inactivas</option>
          <option value="archived">Archivadas</option>
        </Select>
        <Select value={filters.discountType} onChange={(e) => setFilters((c) => ({ ...c, discountType: e.target.value }))}>
          <option value="">Todos los tipos</option>
          {Object.entries(promotionDiscountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-sm text-zinc-500">Cargando promociones...</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b bg-zinc-50/80 text-zinc-500">
                <tr>{['Nombre', 'Código', 'Tipo', 'Valor', 'Vigencia', 'Estado', 'Uso'].map((h) => <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase">{h}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item) => {
                  const status = statusOf(item);
                  return (
                    <tr key={item._id} className="hover:bg-amber-50/35">
                      <td className="px-5 py-4"><p className="font-semibold text-zinc-950">{item.name}</p><p className="text-xs text-zinc-500">{item.publicTitle}</p></td>
                      <td className="px-5 py-4 font-mono text-xs">{item.code || '-'}</td>
                      <td className="px-5 py-4">{displayLabel(promotionDiscountTypeLabels, item.discountType)}</td>
                      <td className="px-5 py-4">{item.discountType === 'percentage' ? `${item.discountValue}%` : item.discountType === 'fixed_amount' ? `$${item.discountValue}` : '—'}</td>
                      <td className="px-5 py-4 text-xs">{item.validFrom ? new Date(item.validFrom).toLocaleDateString('es-AR') : 'Sin inicio'} — {item.validUntil ? new Date(item.validUntil).toLocaleDateString('es-AR') : 'Sin fin'}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[status.key]}`}>{status.label}</span></td>
                      <td className="px-5 py-4 text-xs">{item.usedCount}{item.usageLimit ? ` / ${item.usageLimit}` : ''}</td>
                      <td className="px-5 py-4"><div className="flex justify-end">
                        <TableActionButton icon={Pencil} label="Editar" onClick={() => open(item)} />
                        <TableActionButton icon={Copy} label="Duplicar" onClick={() => void duplicate(item)} />
                        {!item.archivedAt ? <TableActionButton icon={Archive} label="Archivar" onClick={() => void archive(item)} /> : null}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!items.length ? <Empty /> : null}
          </div>
        )}
      </article>

      <Modal open={editing !== undefined} title={editing ? 'Editar promoción' : 'Nueva promoción'} onClose={() => setEditing(undefined)} wide>
        <form onSubmit={save} className="space-y-6 p-6">
          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Información interna</legend>
            <Input required placeholder="Nombre interno" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
            <Input placeholder="Código (opcional)" value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} />
            <Textarea className="md:col-span-2" placeholder="Descripción interna" value={form.internalDescription} onChange={(e) => setForm((c) => ({ ...c, internalDescription: e.target.value }))} />
          </fieldset>

          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Información visible en la campaña</legend>
            <Input placeholder="Título público" value={form.publicTitle} onChange={(e) => setForm((c) => ({ ...c, publicTitle: e.target.value }))} />
            <Input placeholder="Etiqueta del botón" value={form.buttonLabel} onChange={(e) => setForm((c) => ({ ...c, buttonLabel: e.target.value }))} />
            <Textarea className="md:col-span-2" placeholder="Descripción pública" value={form.publicDescription} onChange={(e) => setForm((c) => ({ ...c, publicDescription: e.target.value }))} />
            <Input placeholder="URL del botón" value={form.buttonUrl} onChange={(e) => setForm((c) => ({ ...c, buttonUrl: e.target.value }))} />
            <Input placeholder="Imagen de banner (URL)" value={form.bannerImageUrl} onChange={(e) => setForm((c) => ({ ...c, bannerImageUrl: e.target.value }))} />
          </fieldset>

          <fieldset className="grid gap-3 md:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-3">Beneficio</legend>
            <Select value={form.discountType} onChange={(e) => setForm((c) => ({ ...c, discountType: e.target.value }))}>
              {Object.entries(promotionDiscountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Input type="number" min={0} max={form.discountType === 'percentage' ? 100 : undefined} placeholder={form.discountType === 'custom_benefit' ? 'No aplica' : 'Valor'} disabled={form.discountType === 'custom_benefit'} value={form.discountValue} onChange={(e) => setForm((c) => ({ ...c, discountValue: Number(e.target.value) }))} />
            <Input placeholder="Monto mínimo de compra" value={form.minimumAmount} onChange={(e) => setForm((c) => ({ ...c, minimumAmount: e.target.value }))} />
            <Input placeholder="Descuento máximo" value={form.maximumDiscount} onChange={(e) => setForm((c) => ({ ...c, maximumDiscount: e.target.value }))} />
            <Input type="date" value={form.validFrom} onChange={(e) => setForm((c) => ({ ...c, validFrom: e.target.value }))} />
            <Input type="date" value={form.validUntil} onChange={(e) => setForm((c) => ({ ...c, validUntil: e.target.value }))} />
          </fieldset>

          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Restricciones</legend>
            <Input placeholder="Límite total de usos" value={form.usageLimit} onChange={(e) => setForm((c) => ({ ...c, usageLimit: e.target.value }))} />
            <Input placeholder="Límite por cliente" value={form.usageLimitPerCustomer} onChange={(e) => setForm((c) => ({ ...c, usageLimitPerCustomer: e.target.value }))} />
            <label className="text-sm font-medium text-zinc-700 md:col-span-2">Salones aplicables (vacío = todos)
              <Select multiple value={form.applicableSalonIds} onChange={(e) => setForm((c) => ({ ...c, applicableSalonIds: Array.from(e.target.selectedOptions).map((o) => o.value) }))} className="mt-1.5 min-h-24">
                {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
              </Select>
            </label>
            <Input className="md:col-span-2" placeholder="Tipos de evento aplicables, separados por coma" value={form.eventTypesText} onChange={(e) => setForm((c) => ({ ...c, eventTypesText: e.target.value }))} />
            <Textarea className="md:col-span-2" placeholder="Términos y condiciones" value={form.termsAndConditions} onChange={(e) => setForm((c) => ({ ...c, termsAndConditions: e.target.value }))} />
          </fieldset>

          <div className="flex flex-wrap gap-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((c) => ({ ...c, isActive: e.target.checked }))} />Activa</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((c) => ({ ...c, isPublic: e.target.checked }))} />Visible públicamente</label>
          </div>

          {form.publicTitle || form.publicDescription ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Previsualización dentro de una campaña</p>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <p className="text-lg font-bold text-zinc-950">{form.publicTitle || form.name}</p>
                <p className="mt-1 text-sm text-zinc-600">{form.publicDescription}</p>
                {form.buttonLabel ? <span className="mt-3 inline-block rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white">{form.buttonLabel}</span> : null}
              </div>
            </div>
          ) : null}

          <footer className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancelar</Button><Button>Guardar</Button></footer>
        </form>
      </Modal>
    </section>
  );
}

function Empty() {
  return <div className="grid place-items-center px-6 py-16 text-center"><BadgePercent className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay promociones para mostrar.</p></div>;
}
