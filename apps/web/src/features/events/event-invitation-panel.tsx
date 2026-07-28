'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, Mail, MessageCircle, Palette, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { InvitationDeliveryActions } from '@/features/digital/invitation-delivery-actions';
import type { DigitalInvitation, InvitationTemplate, InvitationTemplateCategory } from '@/features/digital/types';
import type { Event } from '@/features/quotes/types';

type InvitationPrefill = {
  title: string;
  honoreeName: string;
  eventDate: string;
  address: string;
  mapsUrl: string;
  introduction: string;
  celebrationType: InvitationTemplateCategory | 'other';
};
type Binding = { invitation: DigitalInvitation | null; prefill: InvitationPrefill };

const categoryLabels: Record<InvitationTemplateCategory | 'other', string> = {
  wedding: 'Casamiento', fifteen: 'Quince años', birthday: 'Cumpleaños', kids: 'Cumple infantil', baby_shower: 'Baby shower', baptism: 'Bautismo', communion: 'Comunión', anniversary: 'Aniversario', corporate: 'Corporativo', general: 'General', other: 'Otra celebración'
};

const emptyPrefill: InvitationPrefill = { title: '', honoreeName: '', eventDate: '', address: '', mapsUrl: '', introduction: '', celebrationType: 'general' };

export function EventInvitationPanel({ event }: { event: Event }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [binding, setBinding] = useState<Binding>();
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<InvitationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [form, setForm] = useState<InvitationPrefill & { templateId: string }>({ ...emptyPrefill, templateId: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<Binding>(`/invitations/event/${event._id}`);
      setBinding(result);
      setForm((current) => ({ ...result.prefill, templateId: current.templateId }));
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar la invitación del evento.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [event._id, showToast]);

  useEffect(() => { const timer = window.setTimeout(() => void load()); return () => window.clearTimeout(timer); }, [load]);

  const openCreateDialog = async () => {
    setDialogOpen(true);
    if (templates.length) return;
    setTemplatesLoading(true);
    try {
      const result = await api.get<{ templates: InvitationTemplate[] }>('/invitations/templates');
      setTemplates(result.templates ?? []);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las plantillas.', variant: 'error' });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const create = async () => {
    if (!form.title.trim() || !form.eventDate || !form.address.trim() || !form.templateId) return;
    setSaving(true);
    try {
      const { invitation } = await api.post<{ invitation: DigitalInvitation }>(`/invitations/from-event/${event._id}`, {
        title: form.title.trim(), honoreeName: form.honoreeName.trim() || undefined, eventDate: form.eventDate, address: form.address.trim(), mapsUrl: form.mapsUrl.trim() || undefined,
        introduction: form.introduction.trim() || undefined, celebrationType: form.celebrationType, templateId: form.templateId
      });
      showToast({ message: 'Invitación creada. Ya podés personalizar su diseño.', variant: 'success' });
      router.push(`/admin/digital-invitations/${invitation._id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la invitación.';
      showToast({ message, variant: 'error' });
      if ((error as { code?: string }).code === 'EVENT_INVITATION_EXISTS') { setDialogOpen(false); void load(); }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Buscando invitación digital…</div>;
  const invitation = binding?.invitation;
  const url = invitation ? `${typeof window === 'undefined' ? '' : window.location.origin}/invitacion/${invitation.publicToken ?? ''}` : '';
  const copyUrl = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    showToast({ message: 'URL de la invitación copiada.', variant: 'success' });
  };

  return <section className="space-y-5">
    {invitation ? <article className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-800 px-6 py-6 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Invitación digital</p><h2 className="mt-2 text-2xl font-semibold">{invitation.title || 'Invitación del evento'}</h2><p className="mt-1 text-sm text-violet-100">{invitation.status === 'published' ? 'Publicada y lista para compartir.' : 'Está en borrador: publicala al terminar el diseño.'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${invitation.status === 'published' ? 'bg-emerald-300 text-emerald-950' : 'bg-white/15 text-white'}`}>{invitation.status === 'published' ? 'PUBLICADA' : 'BORRADOR'}</span></div>
      </div>
      <div className="space-y-4 p-5 sm:p-6"><div><label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">URL asignada</label><div className="mt-1.5 flex gap-2"><Input readOnly value={url} aria-label="URL pública de la invitación" /><Button type="button" variant="secondary" onClick={() => void copyUrl()}><ClipboardCopy className="h-4 w-4" /><span className="sr-only">Copiar URL</span></Button></div></div><div className="flex flex-wrap gap-2"><Link href={`/admin/digital-invitations/${invitation._id}`}><Button><Palette className="mr-2 h-4 w-4" />Abrir editor</Button></Link><Link href={`/invitacion/${invitation.publicToken}`} target="_blank"><Button variant="secondary"><ExternalLink className="mr-2 h-4 w-4" />Vista pública</Button></Link></div><div className="border-t border-zinc-100 pt-4"><p className="mb-3 text-sm font-medium text-zinc-700">Compartir con el cliente</p><InvitationDeliveryActions invitation={invitation} compact /><p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Mail className="h-3.5 w-3.5" /><MessageCircle className="h-3.5 w-3.5" />El envío por correo y WhatsApp se habilita al publicar la invitación.</p></div></div>
    </article> : <article className="rounded-3xl border border-dashed border-violet-300 bg-violet-50/50 p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-violet-800"><Sparkles className="h-3.5 w-3.5" /> Invitación digital</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950">Creá la tarjeta de invitación del evento</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Elegí una plantilla y verificá los datos ya cargados del evento. Al crearla vas directo al editor visual para terminar el diseño.</p></div><Button type="button" onClick={() => void openCreateDialog()}><Plus className="mr-2 h-4 w-4" />Crear invitación</Button></div></article>}
    <Modal open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} title="Crear invitación para el evento" description="Los datos se precargan desde el evento. Completá los que falten antes de continuar al editor." wide><div className="space-y-6 p-5 sm:p-7"><section><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-700" /><h3 className="font-semibold text-zinc-950">1. Elegí una plantilla</h3></div>{templatesLoading ? <p className="mt-3 text-sm text-zinc-500">Cargando plantillas…</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{templates.map((template) => { const selected = form.templateId === template._id; const theme = template.theme ?? {}; return <button key={template._id} type="button" onClick={() => set('templateId', template._id)} className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${selected ? 'border-violet-700 ring-2 ring-violet-200' : 'border-zinc-200 hover:border-violet-300'}`}><div className="-mx-4 -mt-4 mb-3 h-14" style={{ background: `linear-gradient(135deg, ${theme.primaryColor ?? '#6d28d9'}, ${theme.secondaryColor ?? '#312e81'})` }} />{selected ? <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-white text-violet-700"><Check className="h-4 w-4" /></span> : null}<p className="font-semibold text-zinc-950">{template.name}</p><p className="mt-1 text-xs text-zinc-500">{template.description || categoryLabels[template.category ?? 'general']}</p></button>; })}</div>} {!templatesLoading && !templates.length ? <p className="mt-3 text-sm text-red-700">No hay plantillas disponibles. Creá una desde Invitaciones digitales.</p> : null}</section><section><div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">2</span><h3 className="font-semibold text-zinc-950">Confirmá los datos de la invitación</h3></div><p className="mt-1 text-sm text-zinc-500">Los campos marcados con * son necesarios para poder publicarla.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-zinc-700">Título público *<Input required className="mt-1.5" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Ej.: Los 15 de Mica" /></label><label className="text-sm font-medium text-zinc-700">Homenajeado/a o anfitriones<Input className="mt-1.5" value={form.honoreeName} onChange={(event) => set('honoreeName', event.target.value)} placeholder="Ej.: Micaela" /></label><label className="text-sm font-medium text-zinc-700">Fecha y hora *<Input required className="mt-1.5" type="datetime-local" value={form.eventDate} onChange={(event) => set('eventDate', event.target.value)} /></label><label className="text-sm font-medium text-zinc-700">Tipo de celebración<Select className="mt-1.5" value={form.celebrationType} onChange={(event) => set('celebrationType', event.target.value as InvitationTemplateCategory | 'other')}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="text-sm font-medium text-zinc-700 md:col-span-2">Lugar o dirección *<Input required className="mt-1.5" value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="Ej.: Salón M&M, La Plata" /></label><label className="text-sm font-medium text-zinc-700 md:col-span-2">Enlace de Maps<Input className="mt-1.5" type="url" value={form.mapsUrl} onChange={(event) => set('mapsUrl', event.target.value)} placeholder="https://maps.google.com/..." /></label><label className="text-sm font-medium text-zinc-700 md:col-span-2">Mensaje de bienvenida<Textarea className="mt-1.5" value={form.introduction} onChange={(event) => set('introduction', event.target.value)} placeholder="Nos encantaría que nos acompañes..." /></label></div></section><div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-5"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="button" disabled={saving || !form.templateId || !form.title.trim() || !form.eventDate || !form.address.trim()} onClick={() => void create()}>{saving ? 'Creando…' : 'Crear y abrir editor'}</Button></div></div></Modal>
  </section>;
}
