'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Copy, Edit3, Search, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { InvitationDeliveryActions } from './invitation-delivery-actions';
import type { DigitalInvitation, InvitationTemplateCategory } from './types';

const categoryLabels: Record<InvitationTemplateCategory | 'other', string> = { wedding: 'Casamiento', fifteen: 'Quince años', birthday: 'Cumpleaños', kids: 'Cumple infantil', baby_shower: 'Baby shower', baptism: 'Bautismo', communion: 'Comunión', anniversary: 'Aniversario', corporate: 'Corporativo', general: 'General', other: 'Otra celebración' };
// `DigitalInvitation.eventDate` es un instante real con hora propia de Argentina
// (`civilDateTimeInput`, no `civilDateInput` — a diferencia de `Event.eventDate`) — se fija el
// huso horario en vez de depender del huso del navegador de quien mira la pantalla.
const eventDateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

export function InvitationListWorkspace() {
  const { showToast } = useToast();
  const [items, setItems] = useState<DigitalInvitation[]>([]);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [filters, setFilters] = useState({ search: '', date: '' });
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.date) params.set('date', filters.date);
      const data = await api.get<{ invitations: DigitalInvitation[] }>(`/invitations${params.size ? `?${params}` : ''}`);
      setItems(data.invitations ?? []);
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las invitaciones.', variant: 'error' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }); return () => window.clearTimeout(timer); }, [filters.search, filters.date]);
  const mutate = async (item: DigitalInvitation, action: 'publish' | 'unpublish' | 'clone' | 'delete') => {
    try {
      if (action === 'delete' && !window.confirm(`¿Eliminar “${item.title}”? Esta acción la quitará del listado.`)) return;
      if (action === 'delete') await api.delete(`/invitations/${item._id}`);
      else if (action === 'clone') await api.post(`/invitations/${item._id}/clone`, {});
      else await api.post(`/invitations/${item._id}/${action}`, {});
      showToast({ message: action === 'clone' ? 'Invitación clonada como borrador.' : action === 'delete' ? 'Invitación eliminada.' : action === 'publish' ? 'Invitación activada.' : 'Invitación desactivada.', variant: 'success' });
      await load();
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo completar la acción.', variant: 'error' }); }
  };
  const copy = async (item: DigitalInvitation) => { await navigator.clipboard.writeText(`${window.location.origin}/invitacion/${item.publicToken}`); showToast({ message: 'URL única copiada.', variant: 'success' }); };
  return <><form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_220px_auto_auto]" onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), date }); }}><label className="text-sm font-medium text-zinc-700">Buscar por cliente, evento, correo o texto relacionado<Input className="mt-1.5" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej.: Mica, casamiento, cliente@correo.com" /></label><label className="text-sm font-medium text-zinc-700">Fecha del evento<Input className="mt-1.5" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><Button className="self-end" type="submit"><Search className="mr-2 h-4 w-4" />Buscar</Button><Button className="self-end" type="button" variant="secondary" onClick={() => { setSearch(''); setDate(''); setFilters({ search: '', date: '' }); }}>Limpiar</Button></form>
    {loading ? <p className="text-sm text-zinc-500">Cargando invitaciones…</p> : <div className="space-y-4">{items.map((item) => <article key={item._id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="h-2" style={{ background: `linear-gradient(90deg, ${item.theme?.primaryColor ?? '#71717a'}, ${item.theme?.secondaryColor ?? '#18181b'})` }} /><div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-zinc-950">{item.title}</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{item.status === 'published' ? 'Activa' : 'Desactivada / borrador'}</span></div><p className="mt-1 text-sm text-zinc-500">{categoryLabels[item.celebrationType ?? 'general']} · {item.honoreeName || 'Sin cliente/homenajeado'}</p><p className="mt-3 text-sm text-zinc-500">{item.eventDate ? eventDateTime.format(new Date(item.eventDate)) : 'Fecha a confirmar'}</p><button type="button" onClick={() => void copy(item)} className="mt-3 inline-flex max-w-full items-center gap-1 text-left text-xs text-zinc-500 hover:text-zinc-950"><Copy className="h-3.5 w-3.5 shrink-0" /><span className="truncate">/invitacion/{item.publicToken}</span></button></div><div className="flex flex-wrap items-start gap-2 xl:max-w-sm xl:justify-end"><Link href={`/admin/digital-invitations/${item._id}`}><Button variant="secondary"><Edit3 className="mr-2 h-4 w-4" />Editar</Button></Link><Button variant="secondary" onClick={() => void mutate(item, item.status === 'published' ? 'unpublish' : 'publish')}>{item.status === 'published' ? 'Desactivar' : 'Activar'}</Button><Button variant="secondary" onClick={() => void mutate(item, 'clone')}>Clonar</Button><Button variant="danger" aria-label={`Eliminar ${item.title}`} onClick={() => void mutate(item, 'delete')}><Trash2 className="h-4 w-4" /></Button><InvitationDeliveryActions invitation={item} compact /></div></div></article>)}{!items.length ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-zinc-500">No encontramos invitaciones con esos criterios.</div> : null}</div>}</>;
}
