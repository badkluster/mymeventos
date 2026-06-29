'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Truck } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, supplierCategoryLabels } from '@/lib/display-labels';

type Supplier = { _id: string; name: string; businessName?: string; category: string; contactPerson?: string; phone?: string; whatsapp?: string; email?: string; active?: boolean; notes?: string };
const empty = { name: '', businessName: '', taxId: '', category: 'OTHER', contactPerson: '', phone: '', whatsapp: '', email: '', address: '', notes: '', active: true };

export default function SuppliersPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [filters, setFilters] = useState({ search: '', category: '', active: '' });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Supplier | null | undefined>();
  const query = useMemo(() => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); return params.toString(); }, [filters]);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get<{ items: Supplier[] }>(`/suppliers?${query}`); setItems(response.items); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar los proveedores.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [query, showToast]);
  useEffect(() => { void load(); }, [load]);
  const open = (supplier?: Supplier) => { setEditing(supplier ?? null); setForm(supplier ? { ...empty, ...supplier } : empty); };
  async function save(event: FormEvent) {
    event.preventDefault();
    try { if (editing) await api.patch(`/suppliers/${editing._id}`, form); else await api.post('/suppliers', form); setEditing(undefined); await load(); showToast({ message: 'Proveedor guardado correctamente.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar el proveedor.', variant: 'error' }); }
  }
  async function remove(supplier: Supplier) {
    try { await api.delete(`/suppliers/${supplier._id}`); await load(); showToast({ message: 'Proveedor eliminado.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar el proveedor.', variant: 'error' }); }
  }
  return <section className="space-y-6"><PageHeader title="Proveedores" description="Proveedores para productos, servicios y compras futuras." action={<Button onClick={() => open()}><Plus className="mr-2 h-4 w-4" />Nuevo proveedor</Button>} />
    <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_160px]"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="h-11 pl-10" placeholder="Buscar proveedor..." value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))} /></div><Select value={filters.category} onChange={(e) => setFilters((c) => ({ ...c, category: e.target.value }))}><option value="">Todas las categorías</option>{Object.entries(supplierCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={filters.active} onChange={(e) => setFilters((c) => ({ ...c, active: e.target.value }))}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></Select></div>
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">{loading ? <p className="p-8 text-sm text-zinc-500">Cargando proveedores...</p> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="border-b bg-zinc-50/80 text-zinc-500"><tr>{['Proveedor','Categoría','Contacto','Teléfono','WhatsApp','Email','Estado'].map((h) => <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase">{h}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((item) => <tr key={item._id} className="hover:bg-amber-50/35"><td className="px-5 py-4"><p className="font-semibold text-zinc-950">{item.name}</p><p className="text-xs text-zinc-500">{item.businessName}</p></td><td className="px-5 py-4">{displayLabel(supplierCategoryLabels, item.category)}</td><td className="px-5 py-4">{item.contactPerson || 'No informado'}</td><td className="px-5 py-4">{item.phone || '-'}</td><td className="px-5 py-4">{item.whatsapp || '-'}</td><td className="px-5 py-4">{item.email || '-'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active === false ? 'bg-zinc-100 text-zinc-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.active === false ? 'Inactivo' : 'Activo'}</span></td><td className="px-5 py-4"><div className="flex justify-end"><TableActionButton icon={Pencil} label="Editar" onClick={() => open(item)} /><TableActionButton icon={Trash2} label="Eliminar" onClick={() => void remove(item)} /></div></td></tr>)}</tbody></table>{!items.length ? <Empty /> : null}</div>}</article>
    <Modal open={editing !== undefined} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setEditing(undefined)}><form onSubmit={save} className="grid gap-3 p-6 md:grid-cols-2"><Input required placeholder="Nombre" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /><Input placeholder="Razón social" value={form.businessName} onChange={(e) => setForm((c) => ({ ...c, businessName: e.target.value }))} /><Select value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}>{Object.entries(supplierCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Input placeholder="CUIT" value={form.taxId} onChange={(e) => setForm((c) => ({ ...c, taxId: e.target.value }))} /><Input placeholder="Contacto" value={form.contactPerson} onChange={(e) => setForm((c) => ({ ...c, contactPerson: e.target.value }))} /><Input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} /><Input placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => setForm((c) => ({ ...c, whatsapp: e.target.value }))} /><Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /><Textarea className="md:col-span-2" placeholder="Notas" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((c) => ({ ...c, active: e.target.checked }))} />Activo</label><footer className="flex justify-end gap-2 border-t pt-4 md:col-span-2"><Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>Cancelar</Button><Button>Guardar</Button></footer></form></Modal>
  </section>;
}
function Empty() { return <div className="grid place-items-center px-6 py-16 text-center"><Truck className="h-10 w-10 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">No hay proveedores para mostrar.</p></div>; }
