'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { ProductionNav } from './production-nav';

type Product = {
  _id: string; name: string; type: string; category: string; beverageType?: string;
  unitOfMeasure: string; active: boolean; notes?: string;
};

const typeLabels: Record<string, string> = { FOOD: 'Alimento', BEVERAGE: 'Bebida', DISPOSABLE: 'Descartable', CLEANING: 'Limpieza', DECORATION: 'Decoración', OTHER: 'Otro' };
const categoryLabels: Record<string, string> = { FOOD: 'Comida', BEVERAGE: 'Bebidas', TABLEWARE: 'Vajilla', LINEN: 'Mantelería', FURNITURE: 'Mobiliario', DECORATION: 'Decoración', EQUIPMENT: 'Equipamiento', CLEANING: 'Limpieza', DISPOSABLE: 'Descartables', OTHER: 'Otro' };
const beverageTypeLabels: Record<string, string> = { NON_ALCOHOLIC: 'No alcohólica', ALCOHOLIC: 'Alcohólica' };
const unitSuggestions = ['unidad', 'litro', 'kg', 'botella', 'porción', 'caja', 'paquete'];

export function ProductionCatalog() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get<{ items: Product[] }>('/catalog/items')).items); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') || ''),
      type: String(data.get('type') || 'FOOD'),
      category: String(data.get('category') || 'OTHER'),
      beverageType: data.get('type') === 'BEVERAGE' ? String(data.get('beverageType') || '') || undefined : undefined,
      unitOfMeasure: String(data.get('unitOfMeasure') || ''),
      active: data.get('active') === 'on',
      notes: String(data.get('notes') || ''),
    };
    try {
      if (editing && editing !== 'new') await api.patch(`/catalog/items/${editing._id}`, payload);
      else await api.post('/catalog/items', payload);
      setEditing(null); showToast({ message: editing && editing !== 'new' ? 'Producto actualizado.' : 'Producto creado.', variant: 'success' }); await load();
    } catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar el producto.', variant: 'error' }); }
    finally { setSaving(false); }
  };
  const toggle = async (item: Product) => {
    try { await api.patch(`/catalog/items/${item._id}`, { active: !item.active }); showToast({ message: item.active ? 'Producto desactivado.' : 'Producto activado.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo actualizar.', variant: 'error' }); }
  };
  const remove = async (item: Product) => {
    if (!confirm(`¿Eliminar "${item.name}" del catálogo? Si alguna regla de producción ya lo usa, esa regla queda sin producto válido.`)) return;
    try { await api.delete(`/catalog/items/${item._id}`); showToast({ message: 'Producto eliminado.', variant: 'success' }); await load(); }
    catch (cause) { showToast({ message: cause instanceof Error ? cause.message : 'No se pudo eliminar.', variant: 'error' }); }
  };

  const form = editing && editing !== 'new' ? editing : undefined;
  return <section className="space-y-5">
    <PageHeader title="Catálogo de productos" description="Los productos de acá son los que después podés elegir al crear una regla de producción." action={<Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" />Nuevo producto</Button>} />
    <ProductionNav />
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[820px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80"><tr>{['Producto', 'Tipo', 'Categoría', 'Unidad', 'Estado', ''].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{items.map((item) => <tr key={item._id}><td className="px-4 py-3 font-semibold">{item.name}{item.beverageType ? <span className="ml-2 font-normal text-zinc-400">({beverageTypeLabels[item.beverageType]})</span> : null}</td><td className="px-4 py-3">{typeLabels[item.type] || item.type}</td><td className="px-4 py-3">{categoryLabels[item.category] || item.category}</td><td className="px-4 py-3">{item.unitOfMeasure}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{item.active ? 'Activo' : 'Inactivo'}</span></td><td className="px-4 py-3"><div className="flex gap-1"><button title="Editar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => setEditing(item)}><Pencil className="h-4 w-4" /></button><button title={item.active ? 'Desactivar' : 'Activar'} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-zinc-100" onClick={() => void toggle(item)}><Power className="h-4 w-4" /></button><button title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg text-red-700 hover:bg-red-50" onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table>{!loading && !items.length ? <div className="grid min-h-52 place-items-center text-sm text-zinc-500">Todavía no hay productos en el catálogo.</div> : null}</div></article>
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={form ? 'Editar producto' : 'Nuevo producto'} description="Este producto queda disponible para elegir dentro de una regla de producción.">
      <ProductForm key={form?._id ?? 'new'} product={form} saving={saving} onSubmit={save} onCancel={() => setEditing(null)} />
    </Modal>
  </section>;
}

function ProductForm({ product, saving, onSubmit, onCancel }: { product?: Product; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const [type, setType] = useState(product?.type ?? 'FOOD');
  return <form onSubmit={onSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
    <label className="sm:col-span-2 text-sm font-medium">Nombre<Input name="name" required defaultValue={product?.name} className="mt-1.5" placeholder="Ej. Empanadas" /></label>
    <label className="text-sm font-medium">Tipo<Select name="type" value={type} onChange={(event) => setType(event.target.value)} className="mt-1.5">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
    <label className="text-sm font-medium">Categoría<Select name="category" defaultValue={product?.category ?? 'OTHER'} className="mt-1.5">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
    {type === 'BEVERAGE' ? <label className="text-sm font-medium">Tipo de bebida<Select name="beverageType" defaultValue={product?.beverageType ?? 'NON_ALCOHOLIC'} className="mt-1.5">{Object.entries(beverageTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label> : null}
    <label className="text-sm font-medium">Unidad de medida<Input name="unitOfMeasure" required list="unit-suggestions" defaultValue={product?.unitOfMeasure} className="mt-1.5" placeholder="unidad, litro, kg…" /><datalist id="unit-suggestions">{unitSuggestions.map((unit) => <option key={unit} value={unit} />)}</datalist></label>
    <label className="flex items-center gap-2 self-end pb-1.5 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={product?.active ?? true} />Producto activo</label>
    <label className="sm:col-span-2 text-sm font-medium">Notas<Textarea name="notes" defaultValue={product?.notes} className="mt-1.5" /></label>
    <footer className="sm:col-span-2 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button disabled={saving}>{saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}</Button></footer>
  </form>;
}
