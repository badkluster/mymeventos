'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Eye, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Modal, PageHeader, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { CloudinaryUpload } from '@/components/cloudinary-upload';
import { api } from '@/lib/api';

type LandingSettings = Record<string, string | boolean | undefined>;
type LandingItem = Record<string, string | number | boolean | string[] | undefined> & { _id?: string; title?: string; active?: boolean; displayOrder?: number };
type LandingData = { settings?: LandingSettings; promotions: LandingItem[]; gallery: LandingItem[]; testimonials: LandingItem[]; faqs: LandingItem[]; services: LandingItem[]; eventTypes: LandingItem[] };
type ResourceKey = 'promotions' | 'gallery' | 'testimonials' | 'faqs' | 'services' | 'event-types';

const tabs: Array<{ key: ResourceKey | 'settings'; label: string }> = [
  { key: 'settings', label: 'Hero' },
  { key: 'promotions', label: 'Promociones' },
  { key: 'gallery', label: 'Galería' },
  { key: 'faqs', label: 'FAQ' },
  { key: 'testimonials', label: 'Testimonios' },
  { key: 'services', label: 'Servicios' },
  { key: 'event-types', label: 'Tipos de evento' },
];

const resourceTitles: Record<ResourceKey, string> = {
  promotions: 'promoción',
  gallery: 'imagen de galería',
  testimonials: 'testimonio',
  faqs: 'pregunta frecuente',
  services: 'servicio',
  'event-types': 'tipo de evento',
};

const emptyForms: Record<ResourceKey, LandingItem> = {
  promotions: { title: '', subtitle: '', description: '', imageUrl: '', badgeText: '', ctaLabel: '', ctaLink: '', startsAt: '', endsAt: '', active: true, visibleOnHome: true, displayOrder: 0 },
  gallery: { title: '', description: '', imageUrl: '', altText: '', category: 'Salones', eventType: '', featured: false, active: true, displayOrder: 0 },
  testimonials: { quote: '', customerName: '', eventType: '', rating: 5, imageUrl: '', featured: false, active: true, displayOrder: 0 },
  faqs: { question: '', answer: '', category: '', active: true, displayOrder: 0 },
  services: { title: '', description: '', icon: 'Sparkles', section: 'services', active: true, displayOrder: 0 },
  'event-types': { title: '', description: '', icon: 'Sparkles', imageUrl: '', active: true, displayOrder: 0 },
};

const settingsFields = ['heroTitle', 'heroSubtitle', 'heroImageUrl', 'heroPrimaryCtaLabel', 'heroSecondaryCtaLabel', 'whatsappNumber', 'whatsappDefaultMessage', 'contactEmail', 'contactPhone', 'instagramUrl', 'facebookUrl', 'tiktokUrl', 'footerText', 'seoTitle', 'seoDescription', 'openGraphImageUrl'];
const settingsImageFields = new Set(['heroImageUrl', 'openGraphImageUrl']);

function itemTitle(item: LandingItem, tab: ResourceKey) {
  if (tab === 'faqs') return String(item.question ?? '');
  if (tab === 'testimonials') return String(item.customerName ?? '');
  return String(item.title ?? '');
}

function normalizePayload(form: LandingItem) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    if (key === '_id') continue;
    if (['displayOrder', 'rating'].includes(key)) payload[key] = Number(value ?? 0);
    else payload[key] = value === '' ? undefined : value;
  }
  return payload;
}

function ImageUploadField({ label = 'Imagen', value, required, onChange }: { label?: string; value?: string; required?: boolean; onChange: (value: string) => void }) {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-zinc-800">{label}{required ? ' *' : ''}</p>
        <p className="mt-1 text-xs text-zinc-500">Subí la imagen a Cloudinary para usarla en la landing.</p>
      </div>
      <CloudinaryUpload context="general" accept="image/*" label={value ? 'Cambiar imagen' : 'Subir imagen'} onUploaded={(asset) => onChange(asset.secureUrl || asset.url)} />
    </div>
    {value ? <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="h-36 bg-cover bg-center" style={{ backgroundImage: `url(${value})` }} />
      <p className="truncate px-3 py-2 text-xs text-zinc-500">{value}</p>
    </div> : <p className={`mt-3 rounded-xl border border-dashed px-3 py-4 text-sm ${required ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-zinc-300 text-zinc-500'}`}>{required ? 'Subí una imagen para poder guardar este elemento.' : 'Sin imagen cargada.'}</p>}
  </div>;
}

export default function LandingAdminPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ResourceKey | 'settings'>('settings');
  const [data, setData] = useState<LandingData>({ promotions: [], gallery: [], testimonials: [], faqs: [], services: [], eventTypes: [] });
  const [settings, setSettings] = useState<LandingSettings>({});
  const [editing, setEditing] = useState<LandingItem | null>(null);
  const [loading, setLoading] = useState(true);

  const currentItems = useMemo(() => {
    if (activeTab === 'settings') return [];
    if (activeTab === 'event-types') return data.eventTypes;
    return data[activeTab] ?? [];
  }, [activeTab, data]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<LandingData>('/landing');
      setData(response);
      setSettings(response.settings ?? {});
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar Landing.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await api.patch<{ settings: LandingSettings }>('/landing/settings', settings);
      setSettings(response.settings);
      showToast({ message: 'Configuración de landing actualizada.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar.', variant: 'error' });
    }
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (activeTab === 'settings' || !editing) return;
    try {
      if (editing._id) await api.patch(`/landing/${activeTab}/${editing._id}`, normalizePayload(editing));
      else await api.post(`/landing/${activeTab}`, normalizePayload(editing));
      setEditing(null);
      await load();
      showToast({ message: `Se guardó la ${resourceTitles[activeTab]}.`, variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar.', variant: 'error' });
    }
  }

  async function removeItem(item: LandingItem) {
    if (activeTab === 'settings' || !item._id) return;
    try {
      await api.delete(`/landing/${activeTab}/${item._id}`);
      await load();
      showToast({ message: 'Elemento eliminado.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar.', variant: 'error' });
    }
  }

  function renderFields(tab: ResourceKey, form: LandingItem) {
    const set = (key: string, value: string | number | boolean) => setEditing((current) => ({ ...(current ?? emptyForms[tab]), [key]: value }));
    if (tab === 'faqs') return <>
      <Input required placeholder="Pregunta" value={String(form.question ?? '')} onChange={(event) => set('question', event.target.value)} />
      <Textarea required placeholder="Respuesta" value={String(form.answer ?? '')} onChange={(event) => set('answer', event.target.value)} />
      <Input placeholder="Categoría" value={String(form.category ?? '')} onChange={(event) => set('category', event.target.value)} />
      <Input type="number" placeholder="Orden" value={Number(form.displayOrder ?? 0)} onChange={(event) => set('displayOrder', event.target.value)} />
    </>;
    if (tab === 'testimonials') return <>
      <Textarea required placeholder="Testimonio" value={String(form.quote ?? '')} onChange={(event) => set('quote', event.target.value)} />
      <Input required placeholder="Cliente" value={String(form.customerName ?? '')} onChange={(event) => set('customerName', event.target.value)} />
      <Input placeholder="Tipo de evento" value={String(form.eventType ?? '')} onChange={(event) => set('eventType', event.target.value)} />
      <Input type="number" min={1} max={5} placeholder="Rating" value={Number(form.rating ?? 5)} onChange={(event) => set('rating', event.target.value)} />
      <div className="md:col-span-2"><ImageUploadField label="Imagen del testimonio" value={String(form.imageUrl ?? '')} onChange={(value) => set('imageUrl', value)} /></div>
    </>;
    if (tab === 'gallery') return <>
      <Input required placeholder="Título" value={String(form.title ?? '')} onChange={(event) => set('title', event.target.value)} />
      <div className="md:col-span-2"><ImageUploadField label="Imagen de galería" required value={String(form.imageUrl ?? '')} onChange={(value) => set('imageUrl', value)} /></div>
      <Input placeholder="Alt text" value={String(form.altText ?? '')} onChange={(event) => set('altText', event.target.value)} />
      <Input placeholder="Categoría" value={String(form.category ?? '')} onChange={(event) => set('category', event.target.value)} />
      <Textarea placeholder="Descripción" value={String(form.description ?? '')} onChange={(event) => set('description', event.target.value)} />
    </>;
    return <>
      <Input required placeholder="Título" value={String(form.title ?? '')} onChange={(event) => set('title', event.target.value)} />
      <Textarea placeholder="Descripción" value={String(form.description ?? '')} onChange={(event) => set('description', event.target.value)} />
      {tab === 'promotions' ? <>
        <Input placeholder="Subtítulo" value={String(form.subtitle ?? '')} onChange={(event) => set('subtitle', event.target.value)} />
        <div className="md:col-span-2"><ImageUploadField label="Imagen de promoción" value={String(form.imageUrl ?? '')} onChange={(value) => set('imageUrl', value)} /></div>
        <Input placeholder="Badge" value={String(form.badgeText ?? '')} onChange={(event) => set('badgeText', event.target.value)} />
        <Input type="date" placeholder="Inicio" value={String(form.startsAt ?? '').slice(0, 10)} onChange={(event) => set('startsAt', event.target.value)} />
        <Input type="date" placeholder="Fin" value={String(form.endsAt ?? '').slice(0, 10)} onChange={(event) => set('endsAt', event.target.value)} />
        <Input placeholder="CTA label" value={String(form.ctaLabel ?? '')} onChange={(event) => set('ctaLabel', event.target.value)} />
        <Input placeholder="CTA link" value={String(form.ctaLink ?? '')} onChange={(event) => set('ctaLink', event.target.value)} />
      </> : <>
        <Input placeholder="Icono lucide" value={String(form.icon ?? '')} onChange={(event) => set('icon', event.target.value)} />
        {'imageUrl' in form ? <div className="md:col-span-2"><ImageUploadField label="Imagen" value={String(form.imageUrl ?? '')} onChange={(value) => set('imageUrl', value)} /></div> : null}
      </>}
      <Input type="number" placeholder="Orden" value={Number(form.displayOrder ?? 0)} onChange={(event) => set('displayOrder', event.target.value)} />
    </>;
  }

  return <section className="space-y-6">
    <PageHeader title="Landing pública" description="Administrá el contenido comercial visible en la web pública." action={<a href="/" target="_blank" rel="noreferrer"><Button variant="secondary"><Eye className="mr-2 h-4 w-4" />Ver landing</Button></a>} />
    <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
      {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{tab.label}</button>)}
    </div>

    {activeTab === 'settings' ? <form onSubmit={saveSettings} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
      {settingsFields.map((field) => settingsImageFields.has(field)
        ? <div key={field} className="md:col-span-2"><ImageUploadField label={field} value={String(settings[field] ?? '')} onChange={(value) => setSettings((current) => ({ ...current, [field]: value }))} /></div>
        : <label key={field} className={field.includes('Subtitle') || field.includes('footer') || field.includes('Description') ? 'md:col-span-2' : ''}><span className="text-xs font-medium uppercase text-zinc-500">{field}</span>{field.includes('Subtitle') || field.includes('footer') || field.includes('Description') || field.includes('Message') ? <Textarea value={String(settings[field] ?? '')} onChange={(event) => setSettings((current) => ({ ...current, [field]: event.target.value }))} /> : <Input value={String(settings[field] ?? '')} onChange={(event) => setSettings((current) => ({ ...current, [field]: event.target.value }))} />}</label>)}
      <div className="md:col-span-2"><Button>Guardar hero/configuración</Button></div>
    </form> : <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{loading ? 'Cargando...' : `${currentItems.length} elementos`}</p>
        <Button onClick={() => setEditing({ ...emptyForms[activeTab] })}><Plus className="mr-2 h-4 w-4" />Nuevo</Button>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs uppercase text-zinc-400"><tr><th className="py-2">Título</th><th>Estado</th><th>Orden</th><th>Detalle</th><th></th></tr></thead><tbody className="divide-y divide-zinc-100">{currentItems.map((item) => <tr key={item._id}><td className="py-3 font-medium text-zinc-950">{itemTitle(item, activeTab)}</td><td>{item.active === false ? 'Inactivo' : 'Activo'}</td><td>{item.displayOrder ?? 0}</td><td className="max-w-md truncate text-zinc-500">{String(item.description ?? item.answer ?? item.quote ?? '')}</td><td className="flex justify-end gap-1 py-2"><TableActionButton icon={Edit3} label="Editar" onClick={() => setEditing(item)} /><TableActionButton icon={Trash2} label="Eliminar" onClick={() => void removeItem(item)} /></td></tr>)}</tbody></table></div>
    </div>}

    <Modal open={Boolean(editing && activeTab !== 'settings')} title={activeTab !== 'settings' ? `Editar ${resourceTitles[activeTab]}` : ''} onClose={() => setEditing(null)}>
      {editing && activeTab !== 'settings' ? <form onSubmit={saveItem} className="grid gap-4 p-5 md:grid-cols-2">{renderFields(activeTab, editing)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active !== false} onChange={(event) => setEditing((current) => ({ ...(current ?? {}), active: event.target.checked }))} /> Activo</label>{['promotions', 'gallery', 'testimonials'].includes(activeTab) ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(editing.featured ?? editing.visibleOnHome)} onChange={(event) => setEditing((current) => ({ ...(current ?? {}), [activeTab === 'promotions' ? 'visibleOnHome' : 'featured']: event.target.checked }))} /> Destacado/visible home</label> : null}<div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button>Guardar</Button></div></form> : null}
    </Modal>
  </section>;
}
