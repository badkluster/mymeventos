'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Monitor, Plus, Save, Smartphone, Trash2 } from 'lucide-react';
import { CloudinaryUpload, type UploadedAsset } from '@/components/cloudinary-upload';
import { Button, Input, NumberField, Select, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { PublicInvitationRenderer } from './public-invitation-renderer';
import type { DigitalInvitation, InvitationMedia, InvitationSection, InvitationSectionBackground, InvitationSectionType, InvitationTemplateFeatures } from './types';

type Props = { invitation: DigitalInvitation; onUpdated: (invitation: DigitalInvitation) => void };
type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const labels: Record<InvitationSectionType, string> = {
  opening: 'Portada', hero: 'Hero', welcome: 'Bienvenida', hosts: 'Anfitriones', event_details: 'Datos del evento', countdown: 'Cuenta regresiva', message: 'Mensaje', custom: 'Contenido personalizado', gallery: 'Galería', schedule: 'Agenda', venue: 'Ubicación', map: 'Mapa', dress_code: 'Dress code', gift_registry: 'Regalos', music: 'Música', rsvp: 'RSVP', contact: 'Contacto', share: 'Compartir', footer: 'Cierre'
};
const fonts = ['Georgia', 'Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Poppins', 'DM Serif Display', 'Great Vibes', 'Inter', 'Montserrat', 'Lato', 'DM Sans', 'system-ui'];
const availableSections: InvitationSectionType[] = ['custom', 'message', 'gallery', 'schedule', 'map', 'dress_code', 'gift_registry', 'contact', 'footer'];

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function sectionData(type: InvitationSectionType): Record<string, unknown> {
  switch (type) {
    case 'message': return { title: 'Un mensaje especial', message: 'Queremos compartir este momento con vos.', signature: '' };
    case 'custom': return { eyebrow: 'Un detalle especial', title: 'Título de la sección', body: 'Escribí aquí el contenido que quieras comunicar.' };
    case 'gallery': return { title: 'Momentos para recordar', layout: 'grid', items: [] };
    case 'schedule': return { title: 'Momentos de la noche', items: [] };
    case 'map': return { title: 'Cómo llegar', mapsUrl: '' };
    case 'dress_code': return { title: 'Dress code', description: '', colors: [] };
    case 'gift_registry': return { title: 'Regalos', message: '', alias: '', cbu: '', bank: '', holder: '' };
    case 'contact': return { title: 'Contacto', phone: '', email: '' };
    case 'footer': return { message: '¡Te esperamos!' };
    default: return {};
  }
}
function newSection(type: InvitationSectionType, order: number): InvitationSection {
  return { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, enabled: true, order, layout: 'contained', background: { type: 'transparent' }, textStyle: { alignment: 'center' }, spacing: { paddingTop: 56, paddingBottom: 56 }, animation: { type: 'fade', duration: 350, delay: 0 }, data: sectionData(type) };
}
function withOrders(sections: InvitationSection[]) { return sections.map((section, order) => ({ ...section, order })); }
function sectionIsAllowed(type: InvitationSectionType, features: InvitationTemplateFeatures) {
  if (type === 'opening') return features.allowPersonalizedRecipients;
  if (type === 'schedule') return features.allowSchedule;
  if (type === 'gift_registry') return features.allowGiftSection;
  if (type === 'map') return features.allowMap;
  if (type === 'music') return features.allowMusic;
  return true;
}
function mediaFromAsset(asset: UploadedAsset): InvitationMedia {
  return { id: asset.publicId, type: asset.resourceType === 'video' ? 'video' : asset.resourceType === 'raw' ? 'audio' : 'image', url: asset.secureUrl || asset.url, storageKey: asset.publicId, filename: asset.originalFilename, size: asset.bytes, width: asset.width, height: asset.height };
}
function withoutAssetReferences(invitation: DigitalInvitation, asset: InvitationMedia): DigitalInvitation {
  const clearBackground = (background?: InvitationSectionBackground) => background?.image?.url === asset.url ? { type: 'transparent' as const } : background;
  const content = invitation.content ? { ...invitation.content, sections: invitation.content.sections.map((section) => {
    const data = { ...section.data };
    if (data.imageUrl === asset.url) data.imageUrl = '';
    if (data.url === asset.url) data.url = '';
    if (Array.isArray(data.items)) data.items = data.items.filter((item) => !(item && typeof item === 'object' && (item as { url?: unknown }).url === asset.url));
    return { ...section, background: clearBackground(section.background) ?? { type: 'transparent' }, data };
  }) } : invitation.content;
  return { ...invitation, media: (invitation.media ?? []).filter((item) => item.id !== asset.id), generalBackground: clearBackground(invitation.generalBackground), content };
}

export function InvitationVisualWorkspace({ invitation, onUpdated }: Props) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(invitation);
  const [selectedId, setSelectedId] = useState<string>();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewOpening, setPreviewOpening] = useState(false);
  const [panel, setPanel] = useState<'sections' | 'design' | 'preview'>('sections');
  const [state, setState] = useState<SaveState>('saved');
  const [removingMediaId, setRemovingMediaId] = useState<string>();
  const draftRef = useRef(draft);
  const initial = useRef(true);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  const sections = draft.content?.sections ?? [];
  const features = draft.templateFeatures;
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const selectedIndex = selected ? sections.findIndex((section) => section.id === selected.id) : -1;

  const update = (recipe: (current: DigitalInvitation) => DigitalInvitation) => {
    initial.current = false;
    setDraft((current) => recipe(current));
    setState('dirty');
  };
  const persist = useCallback(async () => {
    const payload = draftRef.current;
    setState('saving');
    try {
      const response = await api.patch<{ invitation: DigitalInvitation }>(`/invitations/${payload._id}`, {
        theme: payload.theme,
        generalBackground: payload.generalBackground,
        content: payload.content,
        media: payload.media
      });
      setDraft(response.invitation);
      draftRef.current = response.invitation;
      onUpdated(response.invitation);
      setState('saved');
    } catch {
      setState('error');
    }
  }, [onUpdated]);

  useEffect(() => {
    if (initial.current || state !== 'dirty') return;
    const timer = window.setTimeout(() => void persist(), 900);
    return () => window.clearTimeout(timer);
  }, [draft, persist, state]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (state === 'dirty' || state === 'saving') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  const updateSections = (next: InvitationSection[]) => update((current) => ({ ...current, content: { sections: withOrders(next) } }));
  const patchSection = (id: string, patch: Partial<InvitationSection>) => updateSections(sections.map((section) => section.id === id ? { ...section, ...patch } : section));
  const updateData = (id: string, key: string, value: unknown) => {
    const section = sections.find((item) => item.id === id);
    if (section) patchSection(id, { data: { ...section.data, [key]: value } });
  };
  const addMedia = (assets: UploadedAsset[]) => update((current) => ({ ...current, media: [...(current.media ?? []), ...assets.map(mediaFromAsset)] }));
  const removeMedia = async (asset: InvitationMedia) => {
    if (!window.confirm(`¿Eliminar “${asset.filename || 'este archivo'}”? Se quitará de la invitación y no podrá recuperarse.`)) return;
    setRemovingMediaId(asset.id);
    try {
      await api.delete(`/invitations/${draftRef.current._id}/media?mediaId=${encodeURIComponent(asset.id)}`);
      update((current) => withoutAssetReferences(current, asset));
      showToast({ message: 'Archivo eliminado de la invitación.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar el archivo.', variant: 'error' });
    } finally { setRemovingMediaId(undefined); }
  };
  const applyMedia = (asset: InvitationMedia) => {
    if (!selected) return;
    if (selected.type === 'gallery') {
      const items = Array.isArray(selected.data.items) ? selected.data.items : [];
      if (items.length >= (features?.maxGalleryImages ?? 4)) return;
      updateData(selected.id, 'items', [...items, { url: asset.url, storageKey: asset.storageKey, altText: asset.altText ?? '' }]);
    } else if (selected.type === 'hero' || selected.type === 'welcome') updateData(selected.id, 'imageUrl', asset.url);
    else if (selected.type === 'music' && asset.type === 'audio') updateData(selected.id, 'url', asset.url);
    else patchSection(selected.id, { background: { type: 'image', image: { url: asset.url, storageKey: asset.storageKey, altText: asset.altText, fit: 'cover', positionX: asset.focalPoint?.x ?? 50, positionY: asset.focalPoint?.y ?? 50, overlayColor: '#111827', overlayOpacity: .35 } } });
  };
  const allowedAdditions = useMemo(() => availableSections.filter((type) => features ? sectionIsAllowed(type, features) : true), [features]);

  return <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-zinc-950">Editor visual</h2><p className="text-sm text-zinc-500">La vista previa usa el mismo renderer de la invitación pública.</p></div>
      <div className="flex items-center gap-2"><span className={`text-xs font-medium ${state === 'error' ? 'text-red-600' : state === 'saved' ? 'text-emerald-700' : 'text-amber-700'}`}>{state === 'saving' ? 'Guardando…' : state === 'dirty' ? 'Cambios sin guardar' : state === 'error' ? 'No se pudo guardar' : 'Guardado'}</span><Button variant="secondary" onClick={() => void persist()} disabled={state === 'saving'}><Save className="mr-2 h-4 w-4" />Guardar</Button></div>
    </div>
    <div className="flex gap-2 border-b pb-3 lg:hidden"><Button variant={panel === 'sections' ? 'primary' : 'secondary'} onClick={() => setPanel('sections')}>Secciones</Button><Button variant={panel === 'design' ? 'primary' : 'secondary'} onClick={() => setPanel('design')}>Diseño</Button><Button variant={panel === 'preview' ? 'primary' : 'secondary'} onClick={() => setPanel('preview')}>Vista previa</Button></div>
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_310px]">
      <aside className={`${panel === 'sections' ? 'block' : 'hidden'} rounded-xl border border-zinc-200 p-3 lg:block`}>
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Secciones</p>
        <div className="space-y-1">{sections.map((section, index) => <div key={section.id} className={`flex items-center gap-1 rounded-lg p-1 ${selected?.id === section.id ? 'bg-zinc-100' : ''}`}><button type="button" className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm font-medium" onClick={() => setSelectedId(section.id)}>{labels[section.type]}</button><button type="button" aria-label={section.enabled ? `Ocultar ${labels[section.type]}` : `Mostrar ${labels[section.type]}`} className="rounded p-1.5 hover:bg-white" onClick={() => patchSection(section.id, { enabled: !section.enabled })}>{section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-zinc-400" />}</button><button type="button" aria-label="Subir sección" disabled={index === 0} className="rounded p-1.5 hover:bg-white disabled:opacity-30" onClick={() => { const next = [...sections]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateSections(next); }}><ChevronUp className="h-4 w-4" /></button><button type="button" aria-label="Bajar sección" disabled={index === sections.length - 1} className="rounded p-1.5 hover:bg-white disabled:opacity-30" onClick={() => { const next = [...sections]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; updateSections(next); }}><ChevronDown className="h-4 w-4" /></button></div>)}</div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Agregar sección<Select className="mt-1.5" value="" onChange={(event) => { const type = event.target.value as InvitationSectionType; if (!type || !features || sections.length >= features.maxSections) return; const next = newSection(type, sections.length); updateSections([...sections, next]); setSelectedId(next.id); event.target.value = ''; }}><option value="">Elegir sección</option>{allowedAdditions.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</Select></label>
        {features ? <p className="mt-2 px-1 text-xs text-zinc-500">{sections.length} de {features.maxSections} secciones permitidas</p> : null}
      </aside>

      <div className={`${panel === 'preview' ? 'block' : 'hidden'} min-w-0 rounded-xl bg-zinc-100 p-3 lg:block`}>
        <div className="mb-3 flex justify-end gap-2">{sections.some((section) => section.type === 'opening' && section.enabled) ? <Button variant={previewOpening ? 'primary' : 'secondary'} onClick={() => setPreviewOpening((current) => !current)}>Portada</Button> : null}<Button variant={device === 'desktop' ? 'primary' : 'secondary'} onClick={() => setDevice('desktop')} aria-label="Vista desktop"><Monitor className="h-4 w-4" /></Button><Button variant={device === 'mobile' ? 'primary' : 'secondary'} onClick={() => setDevice('mobile')} aria-label="Vista mobile"><Smartphone className="h-4 w-4" /></Button></div>
        <div className={`mx-auto overflow-hidden rounded-[1.5rem] bg-white shadow-xl ${device === 'mobile' ? 'max-w-[390px]' : 'max-w-5xl'}`}><PublicInvitationRenderer key={`${draft._id}-${previewOpening ? 'opening' : 'content'}`} invitation={draft} mode="preview" previewOpening={previewOpening} forceMobileLayout={device === 'mobile'} /></div>
      </div>

      <aside className={`${panel === 'design' ? 'block' : 'hidden'} space-y-5 rounded-xl border border-zinc-200 p-4 lg:block`}>
        <div><h3 className="font-semibold text-zinc-950">Diseño global</h3><div className="mt-3 grid grid-cols-2 gap-3"><ColorField label="Color principal" value={draft.theme?.primaryColor} onChange={(value) => update((current) => ({ ...current, theme: { ...current.theme, primaryColor: value } }))} /><ColorField label="Color secundario" value={draft.theme?.secondaryColor} onChange={(value) => update((current) => ({ ...current, theme: { ...current.theme, secondaryColor: value } }))} /><ColorField label="Fondo general" value={draft.theme?.backgroundColor} onChange={(value) => update((current) => ({ ...current, theme: { ...current.theme, backgroundColor: value } }))} /><ColorField label="Color de texto" value={draft.theme?.textColor} onChange={(value) => update((current) => ({ ...current, theme: { ...current.theme, textColor: value } }))} /></div>{features?.allowCustomFonts ? <div className="mt-3 grid gap-3"><label className="text-sm font-medium">Tipografía de títulos<Select className="mt-1" value={draft.theme?.headingFont ?? 'Georgia'} onChange={(event) => update((current) => ({ ...current, theme: { ...current.theme, headingFont: event.target.value } }))}>{fonts.map((font) => <option key={font}>{font}</option>)}</Select></label><label className="text-sm font-medium">Tipografía de cuerpo<Select className="mt-1" value={draft.theme?.bodyFont ?? 'system-ui'} onChange={(event) => update((current) => ({ ...current, theme: { ...current.theme, bodyFont: event.target.value } }))}>{fonts.map((font) => <option key={font}>{font}</option>)}</Select></label></div> : null}</div>
        <BackgroundEditor title="Fondo general" value={draft.generalBackground} allowImage={Boolean(features?.allowCustomBackgrounds)} media={draft.media ?? []} onChange={(generalBackground) => update((current) => ({ ...current, generalBackground }))} />
        {selected ? <SectionEditor section={selected} features={features} media={draft.media ?? []} onPatch={(patch) => patchSection(selected.id, patch)} onData={(key, value) => updateData(selected.id, key, value)} onRemove={() => { if (!selected) return; updateSections(sections.filter((section) => section.id !== selected.id)); setSelectedId(undefined); }} onDuplicate={() => { const duplicate = clone(selected); duplicate.id = `${selected.type}-${Date.now()}`; updateSections([...sections.slice(0, selectedIndex + 1), duplicate, ...sections.slice(selectedIndex + 1)]); setSelectedId(duplicate.id); }} onUseMedia={applyMedia} onAddMedia={addMedia} /> : <p className="text-sm text-zinc-500">Seleccioná una sección para editarla.</p>}
        <div className="border-t pt-4"><h3 className="font-semibold text-zinc-950">Biblioteca multimedia</h3><p className="mt-1 text-xs text-zinc-500">Subí y reutilizá imágenes, videos o audio. El ícono de papelera elimina el archivo de esta invitación y de la nube.</p><div className="mt-3"><CloudinaryUpload context="invitations" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/*" label="Subir medios" multiple onUploadedBatch={addMedia} /></div><div className="mt-3 grid grid-cols-3 gap-2">{(draft.media ?? []).map((item) => <article key={item.id} className="relative overflow-hidden rounded-lg border bg-white"><button type="button" title={item.type === 'audio' && selected?.type !== 'music' ? 'Seleccioná la sección Música para usar este audio' : 'Usar en la sección seleccionada'} disabled={item.type === 'audio' && selected?.type !== 'music'} onClick={() => applyMedia(item)} className="block h-16 w-full overflow-hidden text-left hover:ring-2 hover:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-60">{item.type === 'image' ? <img src={item.url} alt={item.altText || 'Imagen cargada'} className="h-full w-full object-cover" /> : item.type === 'video' ? <video src={item.url} muted className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center bg-amber-50 text-xs font-semibold text-amber-900">MP3 · Audio</span>}</button><button type="button" aria-label={`Eliminar ${item.filename || 'archivo'}`} title="Eliminar archivo" disabled={removingMediaId === item.id} onClick={() => void removeMedia(item)} className="absolute right-1 top-1 rounded-md bg-white/95 p-1 text-red-600 shadow hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button></article>)}</div></div>
      </aside>
    </div>
  </section>;
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) { return <label className="text-xs font-medium text-zinc-700"><span>{label}</span><input aria-label={label} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-1" type="color" value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'} onChange={(event) => onChange(event.target.value)} /></label>; }

function BackgroundEditor({ title, value, allowImage, media, onChange }: { title: string; value?: InvitationSectionBackground; allowImage: boolean; media: InvitationMedia[]; onChange: (value: InvitationSectionBackground) => void }) {
  const background = value ?? { type: 'transparent' as const };
  return <div className="border-t pt-4"><h3 className="font-semibold text-zinc-950">{title}</h3><label className="mt-3 block text-sm font-medium">Tipo de fondo<Select className="mt-1" value={background.type} onChange={(event) => { const type = event.target.value as InvitationSectionBackground['type']; onChange(type === 'solid' ? { type, color: '#ffffff' } : type === 'gradient' ? { type, gradient: { direction: '135deg', from: '#ffffff', to: '#eee8ff' } } : { type }); }}><option value="transparent">Transparente</option><option value="solid">Color sólido</option><option value="gradient">Degradado</option>{allowImage ? <option value="image">Imagen</option> : null}</Select></label>{background.type === 'solid' ? <ColorField label="Color de fondo" value={background.color} onChange={(color) => onChange({ type: 'solid', color })} /> : null}{background.type === 'gradient' ? <div className="mt-3 grid grid-cols-2 gap-3"><ColorField label="Color inicial" value={background.gradient?.from} onChange={(from) => onChange({ type: 'gradient', gradient: { direction: background.gradient?.direction ?? '135deg', from, to: background.gradient?.to ?? '#eee8ff' } })} /><ColorField label="Color final" value={background.gradient?.to} onChange={(to) => onChange({ type: 'gradient', gradient: { direction: background.gradient?.direction ?? '135deg', from: background.gradient?.from ?? '#ffffff', to } })} /></div> : null}{background.type === 'image' ? <div className="mt-3 space-y-3"><label className="block text-sm font-medium">Imagen de fondo<Select className="mt-1" value={background.image?.url ?? ''} onChange={(event) => { const image = media.find((item) => item.url === event.target.value); if (image) onChange({ type: 'image', image: { url: image.url, storageKey: image.storageKey, altText: image.altText, fit: 'cover', positionX: 50, positionY: 50, overlayColor: '#111827', overlayOpacity: .35 } }); }}><option value="">Elegir de la biblioteca</option>{media.filter((item) => item.type === 'image').map((item) => <option key={item.id} value={item.url}>{item.filename || 'Imagen cargada'}</option>)}</Select></label><div className="grid grid-cols-2 gap-3"><NumberField label="Posición horizontal" min={0} max={100} value={background.image?.positionX ?? 50} onChange={(event) => onChange({ ...background, type: 'image', image: { ...background.image!, positionX: Number(event.target.value) } })} /><NumberField label="Posición vertical" min={0} max={100} value={background.image?.positionY ?? 50} onChange={(event) => onChange({ ...background, type: 'image', image: { ...background.image!, positionY: Number(event.target.value) } })} /><NumberField label="Opacidad del overlay" min={0} max={1} step={.05} value={background.image?.overlayOpacity ?? .35} onChange={(event) => onChange({ ...background, type: 'image', image: { ...background.image!, overlayOpacity: Number(event.target.value) } })} /><NumberField label="Desenfoque" min={0} max={16} value={background.image?.blur ?? 0} onChange={(event) => onChange({ ...background, type: 'image', image: { ...background.image!, blur: Number(event.target.value) } })} /></div></div> : null}</div>;
}

function SectionEditor({ section, features, media, onPatch, onData, onRemove, onDuplicate, onUseMedia, onAddMedia }: { section: InvitationSection; features?: InvitationTemplateFeatures; media: InvitationMedia[]; onPatch: (patch: Partial<InvitationSection>) => void; onData: (key: string, value: unknown) => void; onRemove: () => void; onDuplicate: () => void; onUseMedia: (media: InvitationMedia) => void; onAddMedia: (assets: UploadedAsset[]) => void }) {
  const data = section.data;
  const value = (key: string) => typeof data[key] === 'string' ? String(data[key]) : '';
  const textField = (label: string, key: string, multiline = false) => <label className="block text-sm font-medium text-zinc-700">{label}{multiline ? <Textarea className="mt-1" value={value(key)} onChange={(event) => onData(key, event.target.value)} /> : <Input className="mt-1" value={value(key)} onChange={(event) => onData(key, event.target.value)} />}</label>;
  return <div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-zinc-950">{labels[section.type]}</h3><div className="flex gap-1"><Button variant="secondary" onClick={onDuplicate} aria-label="Duplicar sección"><Copy className="h-4 w-4" /></Button><Button variant="secondary" onClick={onRemove} aria-label="Eliminar sección"><Trash2 className="h-4 w-4" /></Button></div></div>
    {(section.type === 'opening' || section.type === 'hero' || section.type === 'welcome' || section.type === 'message' || section.type === 'countdown' || section.type === 'venue' || section.type === 'dress_code' || section.type === 'gift_registry' || section.type === 'rsvp' || section.type === 'contact' || section.type === 'footer') ? <div className="space-y-3">{['hero', 'welcome', 'message', 'countdown', 'venue', 'dress_code', 'gift_registry', 'rsvp', 'contact'].includes(section.type) ? textField('Título', 'title') : null}{section.type === 'opening' ? <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-violet-900">Contenido de la portada</p><p className="text-xs text-violet-800">Esta es la primera pantalla que ve cada persona antes de abrir la invitación general.</p>{textField('Marca o firma superior', 'overline')}{textField('Mensaje de portada', 'message', true)}{textField('Texto central de portada', 'recipientText')}{textField('Rótulo del evento (opcional)', 'eventLabel')}{textField('Título del evento (opcional)', 'eventTitle')}{textField('Texto del botón', 'buttonLabel')}<p className="text-xs text-violet-800">Más abajo, en Fondo de portada, podés elegir color, degradado o una imagen de la biblioteca.</p></div> : null}{section.type === 'hero' ? <>{textField('Subtítulo', 'subtitle')}{textField('Imagen del hero', 'imageUrl')}<label className="block text-sm font-medium">Altura del hero<Select className="mt-1" value={value('height') || '85vh'} onChange={(event) => onData('height', event.target.value)}><option value="70vh">70% de pantalla</option><option value="85vh">85% de pantalla</option><option value="100svh">Pantalla completa</option></Select></label></> : null}{section.type === 'welcome' || section.type === 'message' ? <>{textField('Mensaje', 'message', true)}{textField('Firma', 'signature')}</> : null}{section.type === 'welcome' ? <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Foto editorial de bienvenida</p><p className="mt-1 text-xs text-amber-800">Subí una imagen a la biblioteca y tocala para usarla aquí, o pegá su URL.</p><div className="mt-3 space-y-3">{textField('URL de la imagen', 'imageUrl')}<div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Ubicación<Select className="mt-1" value={value('imagePosition') || 'top'} onChange={(event) => onData('imagePosition', event.target.value)}><option value="top">Arriba del texto</option><option value="left">A la izquierda</option><option value="right">A la derecha</option></Select></label><label className="block text-sm font-medium">Marco<Select className="mt-1" value={value('imageStyle') || 'arch'} onChange={(event) => onData('imageStyle', event.target.value)}><option value="arch">Arco editorial</option><option value="rounded">Rectángulo redondeado</option><option value="circle">Círculo</option></Select></label></div></div></div> : null}{section.type === 'venue' ? textField('Descripción', 'description', true) : null}{section.type === 'dress_code' ? textField('Descripción del dress code', 'description', true) : null}{section.type === 'gift_registry' ? <>{textField('Mensaje', 'message', true)}{textField('Alias', 'alias')}{textField('CBU', 'cbu')}{textField('Banco', 'bank')}{textField('Titular', 'holder')}</> : null}{section.type === 'rsvp' ? <>{textField('Texto secundario', 'subtitle', true)}<label className="block text-sm font-medium">Email para notificaciones de RSVP<Input className="mt-1" type="email" value={value('notificationEmail')} onChange={(event) => onData('notificationEmail', event.target.value)} placeholder="confirmaciones@ejemplo.com" /></label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={data.notificationEnabled !== false} onChange={(event) => onData('notificationEnabled', event.target.checked)} />Enviar email al registrar una respuesta</label></> : null}{section.type === 'contact' ? <>{textField('Teléfono', 'phone')}{textField('Email', 'email')}</> : null}{section.type === 'footer' ? textField('Mensaje de cierre', 'message', true) : null}</div> : null}
    {section.type === 'custom' ? <div className="space-y-3"><p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">Sección libre: usá los controles inferiores para elegir alineación, tipografías, colores, tamaños, espaciado y fondo.</p>{textField('Etiqueta superior (opcional)', 'eyebrow')}{textField('Título', 'title')}{textField('Contenido', 'body', true)}</div> : null}
    {section.type === 'music' ? <div className="space-y-3"><label className="block text-sm font-medium">Texto del botón<Input className="mt-1" value={value('label')} onChange={(event) => onData('label', event.target.value)} /></label><label className="block text-sm font-medium">URL de audio MP3<Input className="mt-1" type="url" value={value('url')} onChange={(event) => onData('url', event.target.value)} placeholder="https://servidor.com/cancion.mp3" /></label><div className="rounded-xl border border-dashed border-zinc-300 p-3"><p className="text-sm font-medium text-zinc-700">Subir archivo MP3</p><p className="mt-1 text-xs text-zinc-500">Al finalizar la subida, el audio queda seleccionado automáticamente.</p><div className="mt-3"><CloudinaryUpload context="invitations" accept="audio/mpeg,audio/mp3" label="Subir MP3" onUploadedBatch={(assets) => { onAddMedia(assets); const audio = assets.find((asset) => asset.resourceType === 'raw' || asset.resourceType === 'audio'); if (audio) onData('url', audio.secureUrl || audio.url); }} /></div></div>{media.filter((item) => item.type === 'audio').length ? <label className="block text-sm font-medium">Audio de la biblioteca<Select className="mt-1" value={value('url')} onChange={(event) => onData('url', event.target.value)}><option value="">Elegir audio cargado</option>{media.filter((item) => item.type === 'audio').map((item) => <option key={item.id} value={item.url}>{item.filename || 'Audio cargado'}</option>)}</Select></label> : null}<NumberField label="Volumen inicial" min={0} max={1} step={.05} value={typeof data.volume === 'number' ? data.volume : .5} onChange={(event) => onData('volume', Number(event.target.value))} /></div> : null}
    {section.type === 'gallery' ? <GalleryEditor data={data} maxImages={features?.maxGalleryImages ?? 4} onData={onData} onUseMedia={onUseMedia} media={media} /> : null}
    {section.type === 'schedule' ? <ScheduleEditor data={data} onData={onData} /> : null}
    <label className="block text-sm font-medium">Alineación<Select className="mt-1" value={section.textStyle?.alignment ?? 'center'} onChange={(event) => onPatch({ textStyle: { ...section.textStyle, alignment: event.target.value as 'left' | 'center' | 'right' } })}><option value="left">Izquierda</option><option value="center">Centrada</option><option value="right">Derecha</option></Select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Fuente de títulos<Select className="mt-1" value={section.textStyle?.headingFont ?? ''} onChange={(event) => onPatch({ textStyle: { ...section.textStyle, headingFont: event.target.value || undefined } })}><option value="">Usar tema</option>{fonts.map((font) => <option key={font} value={font}>{font}</option>)}</Select></label><label className="text-sm font-medium">Fuente de cuerpo<Select className="mt-1" value={section.textStyle?.bodyFont ?? ''} onChange={(event) => onPatch({ textStyle: { ...section.textStyle, bodyFont: event.target.value || undefined } })}><option value="">Usar tema</option>{fonts.map((font) => <option key={font} value={font}>{font}</option>)}</Select></label><NumberField label="Tamaño de títulos" min={20} max={96} value={section.textStyle?.headingSize ?? 36} onChange={(event) => onPatch({ textStyle: { ...section.textStyle, headingSize: Number(event.target.value) } })} /><NumberField label="Tamaño de cuerpo" min={12} max={32} value={section.textStyle?.bodySize ?? 16} onChange={(event) => onPatch({ textStyle: { ...section.textStyle, bodySize: Number(event.target.value) } })} /><ColorField label="Color de títulos" value={section.textStyle?.headingColor} onChange={(headingColor) => onPatch({ textStyle: { ...section.textStyle, headingColor } })} /><ColorField label="Color de cuerpo" value={section.textStyle?.textColor} onChange={(textColor) => onPatch({ textStyle: { ...section.textStyle, textColor } })} /></div>
    <div className="grid grid-cols-2 gap-3"><NumberField label="Espacio superior" min={0} max={240} value={section.spacing?.paddingTop ?? 56} onChange={(event) => onPatch({ spacing: { ...section.spacing, paddingTop: Number(event.target.value) } })} /><NumberField label="Espacio inferior" min={0} max={240} value={section.spacing?.paddingBottom ?? 56} onChange={(event) => onPatch({ spacing: { ...section.spacing, paddingBottom: Number(event.target.value) } })} /></div>
    <BackgroundEditor title={section.type === 'opening' ? 'Fondo de portada' : 'Fondo de sección'} value={section.background} allowImage={section.type === 'opening' || Boolean(features?.allowSectionBackgrounds)} media={media} onChange={(background) => onPatch({ background })} />
  </div>;
}

function GalleryEditor({ data, maxImages, onData, onUseMedia, media }: { data: Record<string, unknown>; maxImages: number; onData: (key: string, value: unknown) => void; onUseMedia: (media: InvitationMedia) => void; media: InvitationMedia[] }) {
  const items = Array.isArray(data.items) ? data.items as Array<{ url?: string; altText?: string }> : [];
  return <div className="space-y-3"><label className="block text-sm font-medium">Título de la galería<Input className="mt-1" value={typeof data.title === 'string' ? data.title : ''} onChange={(event) => onData('title', event.target.value)} /></label><label className="block text-sm font-medium">Layout<Select className="mt-1" value={typeof data.layout === 'string' ? data.layout : 'grid'} onChange={(event) => onData('layout', event.target.value)}><option value="grid">Grilla</option><option value="carousel">Carrusel</option><option value="single">Imagen destacada</option>{maxImages > 4 ? <><option value="editorial">Editorial</option><option value="masonry">Masonry</option><option value="collage">Collage</option></> : null}</Select></label><p className="text-xs text-zinc-500">{items.length} de {maxImages} imágenes. Elegí una imagen de la biblioteca para agregarla.</p><div className="grid grid-cols-4 gap-2">{media.filter((item) => item.type === 'image').map((item) => <button key={item.id} type="button" title="Agregar a galería" disabled={items.length >= maxImages} onClick={() => onUseMedia(item)} className="overflow-hidden rounded-lg border disabled:opacity-40"><img src={item.url} alt={item.altText || 'Imagen cargada'} className="h-14 w-full object-cover" /></button>)}</div>{items.length ? <div className="space-y-2">{items.map((item, index) => <div key={`${item.url}-${index}`} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs">{item.altText || `Imagen ${index + 1}`}</span><button type="button" aria-label="Quitar imagen" className="rounded p-1 hover:bg-zinc-100" onClick={() => onData('items', items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></button></div>)}</div> : null}</div>;
}

function ScheduleEditor({ data, onData }: { data: Record<string, unknown>; onData: (key: string, value: unknown) => void }) {
  const items = Array.isArray(data.items) ? data.items as Array<{ id: string; time: string; title: string; description?: string }> : [];
  return <div className="space-y-3"><label className="block text-sm font-medium">Título de agenda<Input className="mt-1" value={typeof data.title === 'string' ? data.title : ''} onChange={(event) => onData('title', event.target.value)} /></label>{items.map((item, index) => <div key={item.id} className="rounded-lg border p-2"><Input aria-label={`Horario de actividad ${index + 1}`} value={item.time} placeholder="Horario" onChange={(event) => onData('items', items.map((entry, position) => position === index ? { ...entry, time: event.target.value } : entry))} /><Input aria-label={`Título de actividad ${index + 1}`} className="mt-2" value={item.title} placeholder="Actividad" onChange={(event) => onData('items', items.map((entry, position) => position === index ? { ...entry, title: event.target.value } : entry))} /><button type="button" className="mt-2 text-xs text-red-600" onClick={() => onData('items', items.filter((_, position) => position !== index))}>Eliminar actividad</button></div>)}<Button variant="secondary" onClick={() => onData('items', [...items, { id: `schedule-${Date.now()}`, time: '', title: '', description: '' }])}><Plus className="mr-2 h-4 w-4" />Agregar actividad</Button></div>;
}
