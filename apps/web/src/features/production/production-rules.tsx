'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Power } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { ProductionNav } from './production-nav';

type Product = { _id: string; name: string; unitOfMeasure: string; category?: string };
type Rule = {
  _id: string; name: string; productId?: Product; salonId?: { name?: string }; eventType?: string; guestsFrom?: number; guestsTo?: number;
  quantityPerGuest: number; fixedQuantity: number; roundingMode: string; packageSize?: number; wastePercentage: number; sectionType: string; isActive: boolean; notes?: string;
};
const sectionLabels: Record<string, string> = { savory: 'Salado', sweet: 'Dulce', beverages: 'Bebidas', cake: 'Tortas', bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros' };
const roundingLabels: Record<string, string> = { none: 'Sin redondeo', ceil: 'Hacia arriba', floor: 'Hacia abajo', round: 'Redondeo normal', package_size: 'Por empaque' };

export function ProductionRules() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Rule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const [rules, productResponse] = await Promise.all([api.get<{ items: Rule[] }>('/production/rules'), api.get<{ items: Product[] }>('/production/products')]);
      setItems(rules.items); setProducts(productResponse.items);
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudieron cargar las reglas.', variant: 'error' }); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') || ''), productId: String(data.get('productId') || ''), eventType: String(data.get('eventType') || ''),
      guestsFrom: data.get('guestsFrom') ? Number(data.get('guestsFrom')) : undefined, guestsTo: data.get('guestsTo') ? Number(data.get('guestsTo')) : undefined,
      quantityPerGuest: Number(data.get('quantityPerGuest') || 0), fixedQuantity: Number(data.get('fixedQuantity') || 0),
      roundingMode: String(data.get('roundingMode') || 'ceil'), packageSize: data.get('packageSize') ? Number(data.get('packageSize')) : undefined,
      wastePercentage: Number(data.get('wastePercentage') || 0), sectionType: String(data.get('sectionType') || 'miscellaneous'),
      isActive: data.get('isActive') === 'on', notes: String(data.get('notes') || ''),
    };
    try {
      if (editing && editing !== 'new') await api.patch(`/production/rules/${editing._id}`, payload);
      else await api.post('/production/rules', payload);
      setEditing(null); showToast({ message: editing && editing !== 'new' ? 'Regla actualizada.' : 'Regla creada correctamente.', variant: 'success' }); await load();
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar la regla.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const toggle = async (rule: Rule) => {
    try { await api.patch(`/production/rules/${rule._id}`, { isActive: !rule.isActive }); showToast({ message: rule.isActive ? 'Regla desactivada.' : 'Regla activada.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo actualizar.', variant: 'error' }); }
  };

  const form = editing === 'new' ? undefined : editing;
  return <section className="space-y-5">
    <PageHeader title="Reglas de producción" description="Transforman invitados y condiciones del evento en cantidades reproducibles. Cada generación conserva su snapshot." action={<Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" />Nueva regla</Button>} />
    <ProductionNav />
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Regla', 'Producto', 'Sección', 'Tipo de evento', 'Rango invitados', 'Cálculo', 'Merma', 'Estado', ''].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{items.map((rule) => <tr key={rule._id}><td className="px-4 py-3 font-semibold">{rule.name}</td><td className="px-4 py-3">{rule.productId?.name || 'Producto no disponible'}</td><td className="px-4 py-3">{sectionLabels[rule.sectionType]}</td><td className="px-4 py-3">{rule.eventType || 'Todos'}</td><td className="px-4 py-3">{rule.guestsFrom ?? 0} — {rule.guestsTo ?? 'sin máximo'}</td><td className="px-4 py-3">{rule.fixedQuantity || 0} + {rule.quantityPerGuest || 0} por invitado · {roundingLabels[rule.roundingMode]}</td><td className="px-4 py-3">{rule.wastePercentage || 0}%</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{rule.isActive ? 'Activa' : 'Inactiva'}</span></td><td className="px-4 py-3"><div className="flex gap-1"><button title="Editar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => setEditing(rule)}><Pencil className="h-4 w-4" /></button><button title={rule.isActive ? 'Desactivar' : 'Activar'} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => void toggle(rule)}><Power className="h-4 w-4" /></button></div></td></tr>)}</tbody></table>{!items.length ? <div className="grid min-h-52 place-items-center text-sm text-zinc-500">Todavía no hay reglas de producción.</div> : null}</div></article>
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={form ? 'Editar regla de producción' : 'Nueva regla de producción'} description="La cantidad final se calcula en backend y queda registrada en el snapshot del plan.">
      <form onSubmit={save} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<Input name="name" required defaultValue={form?.name} className="mt-1.5" placeholder="Ej. Empanadas por invitado" /></label><label className="text-sm font-medium">Producto<Select name="productId" required defaultValue={form?.productId?._id} className="mt-1.5"><option value="">Seleccionar…</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · {product.unitOfMeasure}</option>)}</Select></label><label className="text-sm font-medium">Sección<Select name="sectionType" defaultValue={form?.sectionType} className="mt-1.5">{Object.entries(sectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="text-sm font-medium">Tipo de evento<Input name="eventType" defaultValue={form?.eventType} className="mt-1.5" placeholder="Vacío: todos" /></label><label className="text-sm font-medium">Invitados desde<Input name="guestsFrom" type="number" min="0" defaultValue={form?.guestsFrom} className="mt-1.5" /></label><label className="text-sm font-medium">Invitados hasta<Input name="guestsTo" type="number" min="0" defaultValue={form?.guestsTo} className="mt-1.5" /></label><label className="text-sm font-medium">Cantidad fija<Input name="fixedQuantity" type="number" min="0" step="0.001" defaultValue={form?.fixedQuantity ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Cantidad por invitado<Input name="quantityPerGuest" type="number" min="0" step="0.001" defaultValue={form?.quantityPerGuest ?? 0} className="mt-1.5" /></label><label className="text-sm font-medium">Redondeo<Select name="roundingMode" defaultValue={form?.roundingMode ?? 'ceil'} className="mt-1.5">{Object.entries(roundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="text-sm font-medium">Tamaño de empaque<Input name="packageSize" type="number" min="0" step="0.001" defaultValue={form?.packageSize} className="mt-1.5" /></label><label className="text-sm font-medium">Merma %<Input name="wastePercentage" type="number" min="0" max="100" defaultValue={form?.wastePercentage ?? 0} className="mt-1.5" /></label><label className="flex items-center gap-2 self-end pb-1.5 text-sm font-medium"><input type="checkbox" name="isActive" defaultChecked={form?.isActive ?? true} />Regla activa</label><label className="sm:col-span-2 text-sm font-medium">Notas<Textarea name="notes" defaultValue={form?.notes} className="mt-1.5" /></label><footer className="sm:col-span-2 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : form ? 'Guardar cambios' : 'Crear regla'}</Button></footer></form>
    </Modal>
  </section>;
}
