'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Calculator, Trash2 } from 'lucide-react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, serviceExtraTypeLabels } from '@/lib/display-labels';

type Salon = { _id: string; name: string };
type CatalogItem = { _id: string; name: string; unitOfMeasure: string; unitCost?: number; suggestedSalePrice?: number };
type ServiceExtra = { _id: string; name: string; type: string; cost?: number; basePrice?: number };
type LineItem = { sourceType: string; catalogItemId?: string; serviceExtraId?: string; name: string; quantity: number; unitOfMeasure: string; unitCost: number; unitPrice: number; affectsInventory: boolean };
const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0);

export default function CustomQuotePage() {
  const { showToast } = useToast();
  const [salons, setSalons] = useState<Salon[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [services, setServices] = useState<ServiceExtra[]>([]);
  const [form, setForm] = useState({ salonId: '', contactName: '', phone: '', email: '', eventType: '', eventDate: '', guestCount: '80', adultsCount: '40', minorsCount: '40', adultsWithAlcoholCount: '40', includesAlcohol: true, quoteMode: 'CUSTOM' });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [calculation, setCalculation] = useState<{ totalAmount: number; subtotalCost: number } | null>(null);
  const load = useCallback(async () => {
    const [salonsResponse, catalogResponse, servicesResponse] = await Promise.all([api.get<{ salons: Salon[] }>('/salons?active=true'), api.get<{ items: CatalogItem[] }>('/catalog/items?active=true'), api.get<{ items: ServiceExtra[] }>('/catalog/services?active=true')]);
    setSalons(salonsResponse.salons ?? []); setCatalog(catalogResponse.items); setServices(servicesResponse.items);
  }, []);
  useEffect(() => { void load().catch((error) => showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el cotizador.', variant: 'error' })); }, [load, showToast]);
  function addCatalogItem(id: string) { const item = catalog.find((entry) => entry._id === id); if (!item) return; setLineItems((current) => [...current, { sourceType: 'CATALOG_ITEM', catalogItemId: item._id, name: item.name, quantity: 1, unitOfMeasure: item.unitOfMeasure, unitCost: item.unitCost ?? 0, unitPrice: item.suggestedSalePrice ?? 0, affectsInventory: true }]); }
  function addService(id: string) { const item = services.find((entry) => entry._id === id); if (!item) return; setLineItems((current) => [...current, { sourceType: 'SERVICE_EXTRA', serviceExtraId: item._id, name: item.name, quantity: 1, unitOfMeasure: displayLabel(serviceExtraTypeLabels, item.type), unitCost: item.cost ?? 0, unitPrice: item.basePrice ?? 0, affectsInventory: false }]); }
  function updateLine(index: number, change: Partial<LineItem>) { setLineItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item)); }
  async function calculate() {
    try { const response = await api.post<{ totalAmount: number; subtotalCost: number; lineItems: LineItem[] }>('/quotes/custom-calculate', { ...form, guestCount: Number(form.guestCount), adultsCount: Number(form.adultsCount), minorsCount: Number(form.minorsCount), adultsWithAlcoholCount: Number(form.adultsWithAlcoholCount), lineItems }); setCalculation(response); setLineItems(response.lineItems); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo calcular.', variant: 'error' }); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try { const response = await api.post<{ totalAmount: number; subtotalCost: number; lineItems: LineItem[] }>('/quotes/custom-calculate', { ...form, guestCount: Number(form.guestCount), adultsCount: Number(form.adultsCount), minorsCount: Number(form.minorsCount), adultsWithAlcoholCount: Number(form.adultsWithAlcoholCount), lineItems }); setCalculation(response); setLineItems(response.lineItems); await api.post('/quotes/from-custom-calculation', { ...form, salonId: form.salonId, eventDate: form.eventDate || undefined, guestCount: Number(form.guestCount), adultsCount: Number(form.adultsCount), minorsCount: Number(form.minorsCount), adultsWithAlcoholCount: Number(form.adultsWithAlcoholCount), lineItems: response.lineItems }); showToast({ message: 'Presupuesto personalizado creado.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo crear el presupuesto.', variant: 'error' }); }
  }
  return <section className="space-y-6"><PageHeader title="Cotizador personalizado" description="Armá un presupuesto por componentes, productos y servicios extra." action={<Link href="/admin/quotes"><Button variant="secondary"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button></Link>} />
    <form onSubmit={save} className="space-y-6"><article className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-3"><Select required value={form.salonId} onChange={(e) => setForm((c) => ({ ...c, salonId: e.target.value }))}><option value="">Seleccionar salón</option>{salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}</Select><Select value={form.quoteMode} onChange={(e) => setForm((c) => ({ ...c, quoteMode: e.target.value }))}><option value="CUSTOM">Personalizado</option><option value="HYBRID">Híbrido</option></Select><Input required placeholder="Nombre contacto" value={form.contactName} onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))} /><Input required placeholder="Teléfono" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} /><Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /><Input required placeholder="Tipo de evento" value={form.eventType} onChange={(e) => setForm((c) => ({ ...c, eventType: e.target.value }))} /><Input type="date" value={form.eventDate} onChange={(e) => setForm((c) => ({ ...c, eventDate: e.target.value }))} /><Input placeholder="Invitados" value={form.guestCount} onChange={(e) => setForm((c) => ({ ...c, guestCount: e.target.value }))} /><Input placeholder="Adultos con alcohol" value={form.adultsWithAlcoholCount} onChange={(e) => setForm((c) => ({ ...c, adultsWithAlcoholCount: e.target.value }))} /></article>
      <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-2"><Select onChange={(e) => { addCatalogItem(e.target.value); e.currentTarget.value = ''; }}><option value="">Agregar producto</option>{catalog.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select><Select onChange={(e) => { addService(e.target.value); e.currentTarget.value = ''; }}><option value="">Agregar servicio extra</option>{services.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></div><div className="mt-5 overflow-x-auto"><table className="min-w-[880px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th>Item</th><th>Cantidad</th><th>Unidad</th><th>Costo</th><th>Precio</th><th>Total</th><th></th></tr></thead><tbody className="divide-y divide-zinc-100">{lineItems.map((item, index) => <tr key={`${item.name}-${index}`}><td className="py-3 font-medium">{item.name}</td><td><Input className="w-24" value={item.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /></td><td>{item.unitOfMeasure}</td><td><Input className="w-28" value={item.unitCost} onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) })} /></td><td><Input className="w-28" value={item.unitPrice} onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })} /></td><td>{money(item.quantity * item.unitPrice)}</td><td><TableActionButton icon={Trash2} label="Quitar" onClick={() => setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></td></tr>)}</tbody></table>{!lineItems.length ? <p className="py-8 text-center text-sm text-zinc-500">Agregá productos o servicios para calcular el presupuesto.</p> : null}</div></article>
      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div><p className="text-sm text-zinc-500">Total estimado</p><p className="text-3xl font-semibold text-zinc-950">{money(calculation?.totalAmount ?? lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))}</p></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => void calculate()}><Calculator className="mr-2 h-4 w-4" />Calcular</Button><Button disabled={!lineItems.length}>Guardar presupuesto</Button></div></footer></form>
  </section>;
}
