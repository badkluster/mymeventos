'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, MessageCircle, ReceiptText, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { activityTypeLabels, displayLabel, quoteRequestSourceLabels, quoteRequestStatusLabels, quoteStatusLabels } from '@/lib/display-labels';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { QuoteFormModal } from '@/features/quotes/quote-form-modal';
import type { LeadOption, PackageTemplate, Quote, QuoteRequest, Salon } from '@/features/quotes/types';

type Activity = { _id: string; type: string; title: string; description?: string; createdAt: string };

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha';
const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';

export default function QuoteRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest>();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [previousRequests, setPreviousRequests] = useState<QuoteRequest[]>([]);
  const [previousQuotes, setPreviousQuotes] = useState<Quote[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [packages, setPackages] = useState<PackageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const notice = (message: string, variant: 'success' | 'error' = 'success') => showToast({ message, variant });
  const load = async (requestId: string) => {
    setLoading(true);
    try {
      const [detail, salonsResponse, leadsResponse, packagesResponse] = await Promise.all([
        api.get<{ quoteRequest: QuoteRequest; activities: Activity[]; previousRequests: QuoteRequest[]; previousQuotes: Quote[] }>(`/quote-requests/${requestId}`),
        api.get<{ salons?: Salon[] } | Salon[]>('/salons'),
        api.get<{ items?: LeadOption[]; leads?: LeadOption[] } | LeadOption[]>('/leads?limit=100'),
        api.get<{ packages?: PackageTemplate[]; items?: PackageTemplate[] } | PackageTemplate[]>('/quotes/packages'),
      ]);
      setQuoteRequest(detail.quoteRequest);
      setActivities(detail.activities ?? []);
      setPreviousRequests(detail.previousRequests ?? []);
      setPreviousQuotes(detail.previousQuotes ?? []);
      setSalons(Array.isArray(salonsResponse) ? salonsResponse : salonsResponse.salons ?? []);
      setLeads(Array.isArray(leadsResponse) ? leadsResponse : leadsResponse.items ?? leadsResponse.leads ?? []);
      setPackages(Array.isArray(packagesResponse) ? packagesResponse : packagesResponse.items ?? packagesResponse.packages ?? []);
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo cargar la solicitud.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void params.then(({ id: routeId }) => { setId(routeId); return load(routeId); }); }, [params]);

  const take = async () => {
    if (!quoteRequest) return;
    try { await api.patch(`/quote-requests/${quoteRequest._id}/take`); notice('Solicitud tomada correctamente.'); await load(id); }
    catch (error) { notice(error instanceof Error ? error.message : 'No se pudo tomar la solicitud.', 'error'); }
  };

  const saveQuote = async (payload: Record<string, unknown>) => {
    if (!quoteRequest) return;
    setSaving(true);
    try {
      await api.post(`/quote-requests/${quoteRequest._id}/convert-to-quotes`, payload);
      setFormOpen(false);
      notice('Solicitud presupuestada correctamente.');
      await load(id);
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo generar el presupuesto.', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const whatsapp = () => {
    if (!quoteRequest?.phone) return notice('La solicitud no tiene teléfono.', 'error');
    const message = `Hola ${quoteRequest.contactName}, somos M&M Eventos. Recibimos tu solicitud para ${quoteRequest.eventType || 'tu evento'} para aproximadamente ${quoteRequest.guestCount || 'varias'} personas. Te vamos a preparar una propuesta con las opciones disponibles. ¿Podemos avanzar con algunos datos más?`;
    window.open(`https://wa.me/${quoteRequest.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  if (loading || !quoteRequest) return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Cargando solicitud...</div>;
  const lead = typeof quoteRequest.leadId === 'string' ? undefined : quoteRequest.leadId;
  const requestSalons = (quoteRequest.interestedSalonIds ?? []).map((salon) => typeof salon === 'string' ? salons.find((item) => item._id === salon)?.name : salon.name).filter(Boolean);

  return <section className="space-y-6 pb-8">
    <Link href="/admin/quotes" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ChevronLeft className="h-4 w-4" />Volver a Presupuestos</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{quoteRequest.contactName}</h1><span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">{displayLabel(quoteRequestStatusLabels, quoteRequest.status)}</span></div><p className="mt-2 text-sm text-zinc-500">{displayLabel(quoteRequestSourceLabels, quoteRequest.source)} · {quoteRequest.eventType || 'Sin tipo de evento'}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void take()}><UserCheck className="mr-2 h-4 w-4" />Tomar solicitud</Button><Button variant="secondary" onClick={whatsapp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button><Button onClick={() => setFormOpen(true)}><ReceiptText className="mr-2 h-4 w-4" />Generar presupuesto</Button></div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Datos recibidos"><Item label="Teléfono" value={quoteRequest.phone || 'No informado'} /><Item label="Email" value={quoteRequest.email || 'No informado'} /><Item label="Fecha tentativa" value={formatDate(quoteRequest.estimatedEventDate)} /><Item label="Personas" value={quoteRequest.guestCount || 'Sin definir'} /><Item label="Salón/es" value={requestSalons.length ? requestSalons.join(' · ') : 'Sin salón'} /><Item label="Mensaje" value={quoteRequest.message || 'Sin mensaje'} /></Card>
      <Card title="Lead asociado"><Item label="Nombre" value={lead?.fullName || quoteRequest.contactName} /><Item label="Teléfono" value={lead?.phone || quoteRequest.phone || 'No informado'} /><Item label="Email" value={lead?.email || quoteRequest.email || 'No informado'} /><Link href={lead?._id ? `/admin/leads/${lead._id}` : '#'} className="mt-4 inline-flex text-sm font-medium text-zinc-950 underline">Ver lead</Link></Card>
      <Card title="Duplicados posibles">{quoteRequest.possibleDuplicateLeadIds?.length ? quoteRequest.possibleDuplicateLeadIds.map((item) => <Item key={item._id} label={item.fullName || 'Lead similar'} value={[item.phone, item.email].filter(Boolean).join(' · ') || 'Sin contacto'} />) : <p className="text-sm text-zinc-500">No se detectaron leads similares.</p>}</Card>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Solicitudes anteriores">{previousRequests.length ? previousRequests.map((item) => <Row key={item._id} title={`${formatDate(item.createdAt)} · ${displayLabel(quoteRequestStatusLabels, item.status)}`} description={`${item.eventType || 'Evento'} · ${displayLabel(quoteRequestSourceLabels, item.source)}`} />) : <Empty text="No hay solicitudes anteriores." />}</Panel>
      <Panel title="Presupuestos del lead">{previousQuotes.length ? previousQuotes.map((item) => <Row key={item._id} title={`${item.quoteNumber} · ${displayLabel(quoteStatusLabels, item.status)}`} description={`${item.packageName || 'Personalizado'} · ${formatDate(item.estimatedEventDate)}`} href={`/admin/quotes/${item._id}`} />) : <Empty text="No hay presupuestos asociados." />}</Panel>
    </div>

    <Panel title="Actividad del lead">{activities.length ? activities.map((activity) => <Row key={activity._id} title={`${displayLabel(activityTypeLabels, activity.type)} · ${formatDateTime(activity.createdAt)}`} description={activity.description || activity.title} />) : <Empty text="Todavía no hay actividad registrada." />}</Panel>
    <QuoteFormModal open={formOpen} quoteRequest={quoteRequest} salons={salons} leads={leads} packages={packages} saving={saving} onClose={() => setFormOpen(false)} onSubmit={saveQuote} />
  </section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><dl className="mt-5 space-y-4">{children}</dl></article>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-zinc-950">{title}</h2><div className="mt-5 space-y-3">{children}</div></article>; }
function Row({ title, description, href }: { title: string; description?: string; href?: string }) { const content = <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3"><p className="font-medium text-zinc-900">{title}</p>{description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}</div>; return href ? <Link href={href}>{content}</Link> : content; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-50 px-4 py-5 text-sm text-zinc-500">{text}</p>; }
