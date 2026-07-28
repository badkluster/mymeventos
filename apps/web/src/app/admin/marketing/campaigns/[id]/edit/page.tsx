'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Mail, Save, Send } from 'lucide-react';
import { Button, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingCampaignStatusLabels } from '@/lib/display-labels';
import { EmailBlockEditor } from '@/features/marketing/email-block-editor';
import { renderEmailContentToHtml, renderEmailContentToText } from '@/features/marketing/email-html-renderer';
import { renderPreviewSample } from '@/features/marketing/email-preview-sample';
import { emptyEmailContent, type EmailContent } from '@/features/marketing/email-content-types';

type Campaign = {
  _id: string; name: string; internalDescription?: string; status: string; subject?: string; preheader?: string;
  senderName?: string; replyTo?: string; templateId?: string; audienceId?: string; salonId?: string;
  excludedRecipientEmails?: string[]; contentJson?: EmailContent; renderedHtml?: string; scheduledAt?: string; timezone?: string;
  trackingEnabled?: boolean; tags?: string[];
};
type Audience = { _id: string; name: string; estimatedCount: number };
type Template = { _id: string; name: string; subject?: string; preheader?: string; contentJson?: EmailContent };
type Salon = { _id: string; name: string; address?: string; locality?: string; city?: string; province?: string; phone?: string; whatsapp?: string };
type Estimate = { estimatedCount: number; totalMatched: number; duplicatesRemoved: number; invalidEmailExcluded: number; manuallyExcluded: number };
type MarketingSettings = { companyName?: string; logoUrl?: string; logoAlternativeUrl?: string; defaultImageUrl?: string; senderName?: string; senderEmail?: string; replyToEmail?: string; legalFooterText?: string };

const STEPS = ['Información general', 'Audiencia', 'Diseño', 'Configuración de envío', 'Revisión'];

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [campaign, setCampaign] = useState<Campaign>();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [marketingSettings, setMarketingSettings] = useState<MarketingSettings>({});

  const [name, setName] = useState('');
  const [internalDescription, setInternalDescription] = useState('');
  const [salonId, setSalonId] = useState('');
  const [audienceId, setAudienceId] = useState('');
  const [excludedText, setExcludedText] = useState('');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [content, setContent] = useState<EmailContent>(emptyEmailContent());
  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [testEmails, setTestEmails] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; }, [content]);

  useEffect(() => {
    void Promise.all([
      api.get<{ salons: Salon[] }>('/salons').then((r) => setSalons(r.salons)).catch(() => undefined),
      api.get<{ items: Audience[] }>('/marketing/audiences?limit=100').then((r) => setAudiences(r.items)).catch(() => undefined),
      api.get<{ items: Template[] }>('/marketing/templates?limit=100&isActive=true').then((r) => setTemplates(r.items)).catch(() => undefined),
      api.get<{ settings: MarketingSettings }>('/marketing/settings').then((r) => setMarketingSettings(r.settings)).catch(() => undefined)
    ]);
  }, []);

  useEffect(() => {
    void params.then(({ id: routeId }) => {
      setId(routeId);
      void api.get<{ campaign: Campaign }>(`/marketing/campaigns/${routeId}`)
        .then((response) => {
          const c = response.campaign;
          setCampaign(c);
          setName(c.name); setInternalDescription(c.internalDescription ?? ''); setSalonId(c.salonId ?? '');
          setAudienceId(c.audienceId ?? ''); setExcludedText((c.excludedRecipientEmails ?? []).join('\n'));
          setSubject(c.subject ?? ''); setPreheader(c.preheader ?? ''); setContent(c.contentJson ?? emptyEmailContent());
          setSenderName(c.senderName ?? ''); setReplyTo(c.replyTo ?? '');
          if (c.scheduledAt) { setSendMode('schedule'); setScheduledAtLocal(new Date(c.scheduledAt).toISOString().slice(0, 16)); }
        })
        .catch((error: Error) => showToast({ message: error.message, variant: 'error' }))
        .finally(() => setLoading(false));
    });
  }, [params, showToast]);

  const persist = useCallback(async (extra: Record<string, unknown> = {}) => {
    if (!id) return null;
    setSaving(true);
    try {
      const payload = {
        name, internalDescription, salonId: salonId || '', audienceId: audienceId || '',
        excludedRecipientEmails: excludedText.split('\n').map((v) => v.trim()).filter(Boolean),
        subject, preheader, contentJson: contentRef.current,
        renderedHtml: renderEmailContentToHtml(contentRef.current), renderedText: renderEmailContentToText(contentRef.current),
        senderName, replyTo,
        ...extra
      };
      const response = await api.patch<{ campaign: Campaign }>(`/marketing/campaigns/${id}`, payload);
      setCampaign(response.campaign);
      return response.campaign;
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la campaña.', variant: 'error' });
      return null;
    } finally { setSaving(false); }
  }, [id, name, internalDescription, salonId, audienceId, excludedText, subject, preheader, senderName, replyTo, showToast]);

  async function goToStep(nextStep: number) {
    const saved = await persist();
    if (saved) setStep(nextStep);
  }

  async function runEstimate() {
    const saved = await persist();
    if (!saved) return;
    try { const response = await api.post<Estimate>(`/marketing/campaigns/${id}/estimate`, {}); setEstimate(response); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo estimar la audiencia.', variant: 'error' }); }
  }

  async function sendTest() {
    const emails = testEmails.split(',').map((v) => v.trim()).filter(Boolean);
    if (!emails.length) { showToast({ message: 'Ingresá al menos un email de prueba.', variant: 'error' }); return; }
    const saved = await persist();
    if (!saved) return;
    setSendingTest(true);
    try {
      const response = await api.post<{ results: Array<{ to: string; success: boolean; errorMessage?: string }> }>(`/marketing/campaigns/${id}/send-test`, { emails });
      const failed = response.results.filter((r) => !r.success);
      showToast({ message: failed.length ? `Fallaron ${failed.length} de ${response.results.length} envíos de prueba.` : 'Prueba enviada correctamente.', variant: failed.length ? 'error' : 'success' });
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo enviar la prueba.', variant: 'error' }); }
    finally { setSendingTest(false); }
  }

  async function confirmSend() {
    const saved = await persist();
    if (!saved) return;
    try {
      if (sendMode === 'now') {
        await api.post(`/marketing/campaigns/${id}/send`, {});
        showToast({ message: 'Campaña en curso de envío.', variant: 'success' });
      } else {
        if (!scheduledAtLocal) { showToast({ message: 'Elegí fecha y hora de envío.', variant: 'error' }); return; }
        await api.post(`/marketing/campaigns/${id}/schedule`, { scheduledAt: new Date(scheduledAtLocal).toISOString(), timezone: 'America/Argentina/Buenos_Aires' });
        showToast({ message: 'Campaña programada correctamente.', variant: 'success' });
      }
      router.push(`/admin/marketing/campaigns/${id}`);
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo enviar/programar la campaña.', variant: 'error' }); }
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t._id === templateId);
    if (!template) return;
    if (template.subject) setSubject(template.subject);
    if (template.preheader) setPreheader(template.preheader);
    if (template.contentJson) setContent(template.contentJson);
  }

  const selectedAudience = audiences.find((a) => a._id === audienceId);
  const selectedSalon = salons.find((salon) => salon._id === salonId);
  const previewContext = useMemo(() => {
    const location = selectedSalon
      ? [selectedSalon.address, selectedSalon.locality || selectedSalon.city, selectedSalon.province].filter(Boolean).join(', ')
      : 'Elegí un salón en Información general';
    return {
      companyName: marketingSettings.companyName || 'Nombre de la empresa',
      companyLogoUrl: marketingSettings.logoUrl || marketingSettings.logoAlternativeUrl || marketingSettings.defaultImageUrl || '',
      legalFooterText: marketingSettings.legalFooterText || 'Pie institucional sin configurar',
      salonName: selectedSalon?.name || 'Salón sin seleccionar',
      salonAddress: location || 'Dirección sin configurar',
      salonPhone: selectedSalon?.phone || 'Teléfono sin configurar',
      salonWhatsApp: selectedSalon?.whatsapp || 'WhatsApp sin configurar'
    };
  }, [marketingSettings, selectedSalon]);
  const previewHtml = useMemo(() => renderPreviewSample(renderEmailContentToHtml(content), previewContext), [content, previewContext]);
  const configuredSenderName = marketingSettings.senderName || marketingSettings.companyName || '';
  const configuredReplyTo = marketingSettings.replyToEmail || '';
  const hasContactBlock = content.blocks.some((block) => block.type === 'contact' && block.enabled);

  if (loading) return <p className="p-6 text-sm text-zinc-500">Cargando campaña...</p>;
  const editable = campaign ? ['draft', 'scheduled'].includes(campaign.status) : true;

  return (
    <section className="space-y-4">
      <button type="button" onClick={() => router.push('/admin/marketing/campaigns')} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ChevronLeft className="h-4 w-4" />Volver a campañas</button>
      <PageHeader title={name || 'Campaña'} description={campaign ? `Estado: ${displayLabel(marketingCampaignStatusLabels, campaign.status)}` : ''} />

      {!editable ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Esta campaña ya no admite ediciones porque está {displayLabel(marketingCampaignStatusLabels, campaign?.status ?? '')}.</p> : null}

      <nav className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <button key={label} type="button" onClick={() => void goToStep(index)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${step === index ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${step === index ? 'bg-white text-zinc-950' : 'bg-white text-zinc-500'}`}>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      <fieldset disabled={!editable} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {step === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Nombre interno" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={salonId} onChange={(e) => setSalonId(e.target.value)}>
              <option value="">Todos los salones</option>
              {salons.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </Select>
            <Textarea className="md:col-span-2" placeholder="Descripción interna" value={internalDescription} onChange={(e) => setInternalDescription(e.target.value)} />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <label className="text-sm font-medium text-zinc-700">Audiencia
              <Select className="mt-1.5" value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
                <option value="">Seleccioná una audiencia</option>
                {audiences.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.estimatedCount} estimados)</option>)}
              </Select>
            </label>
            <p className="text-xs text-zinc-500">¿Necesitás un segmento nuevo? Creálo desde <a href="/admin/marketing/audiences" target="_blank" rel="noreferrer" className="font-semibold underline">Audiencias</a> y volvé a esta pantalla.</p>
            <label className="text-sm font-medium text-zinc-700">Excluir destinatarios específicos (un email por línea)
              <Textarea className="mt-1.5" rows={3} value={excludedText} onChange={(e) => setExcludedText(e.target.value)} />
            </label>
            <Button type="button" variant="secondary" onClick={() => void runEstimate()}>Consultar estimación</Button>
            {estimate ? <div className="rounded-xl bg-zinc-50 p-4 text-sm"><p className="font-semibold">{estimate.estimatedCount} destinatarios estimados</p><p className="mt-1 text-xs text-zinc-500">{estimate.duplicatesRemoved} duplicados · {estimate.invalidEmailExcluded} emails inválidos · {estimate.manuallyExcluded} exclusiones manuales</p></div> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="font-semibold">Armá el email en tres pasos simples</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-sky-900">
                <li>Elegí una plantilla o empezá con las secciones que ya aparecen.</li>
                <li>Hacé clic en una sección para cambiar su texto, imagen o botón.</li>
                <li>Usá “Agregar dato” si querés personalizar el mensaje: se completa solo al enviarlo.</li>
              </ol>
            </div>
            {hasContactBlock && !salonId ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Incluiste datos de contacto, pero todavía no elegiste un salón. Seleccionalo en “Información general” para que el email muestre dirección, teléfono y WhatsApp reales.</p> : null}
            <div className="grid gap-3 md:grid-cols-3">
              <Select onChange={(e) => e.target.value && applyTemplate(e.target.value)} defaultValue="">
                <option value="">Partir de una plantilla...</option>
                {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </Select>
              <Input placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Input placeholder="Preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} />
            </div>
            <EmailBlockEditor content={content} onChange={setContent} previewContext={previewContext} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm md:col-span-2">
              <p className="font-semibold text-zinc-900">Datos institucionales configurados</p>
              <div className="mt-2 grid gap-1 text-xs text-zinc-600 md:grid-cols-2">
                <p><span className="font-medium text-zinc-800">Remitente:</span> {configuredSenderName || 'Sin configurar'}</p>
                <p><span className="font-medium text-zinc-800">Email de envío:</span> {marketingSettings.senderEmail || 'Sin configurar'}</p>
                <p className="md:col-span-2"><span className="font-medium text-zinc-800">Email de respuesta:</span> {configuredReplyTo || 'Sin configurar'}</p>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Dejá los campos vacíos para usar estos datos. Completalos solo si esta campaña necesita una excepción.</p>
            </div>
            <label className="text-sm font-medium text-zinc-700">Nombre visible del remitente (opcional)
              <Input className="mt-1.5" placeholder={configuredSenderName || 'Configuración institucional'} value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-zinc-700">Email de respuesta (opcional)
              <Input className="mt-1.5" type="email" placeholder={configuredReplyTo || 'Configuración institucional'} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sendMode === 'now'} onChange={() => setSendMode('now')} />Enviar ahora</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sendMode === 'schedule'} onChange={() => setSendMode('schedule')} />Programar</label>
              {sendMode === 'schedule' ? (
                <div className="flex items-center gap-2">
                  <Input type="datetime-local" value={scheduledAtLocal} onChange={(e) => setScheduledAtLocal(e.target.value)} />
                  <span className="text-xs text-zinc-500">Hora de Argentina (America/Argentina/Buenos_Aires)</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm md:grid-cols-2">
              <p><span className="font-semibold">Asunto:</span> {subject || 'Sin definir'}</p>
              <p><span className="font-semibold">Remitente:</span> {senderName || configuredSenderName || 'Sin configurar'}</p>
              <p><span className="font-semibold">Respuestas a:</span> {replyTo || configuredReplyTo || 'Sin configurar'}</p>
              <p><span className="font-semibold">Audiencia:</span> {selectedAudience?.name ?? 'Sin seleccionar'}</p>
              <p><span className="font-semibold">Envío:</span> {sendMode === 'now' ? 'Inmediato' : scheduledAtLocal ? new Date(scheduledAtLocal).toLocaleString('es-AR') : 'Sin programar'}</p>
              <p><span className="font-semibold">Destinatarios estimados:</span> {estimate?.estimatedCount ?? campaign?.excludedRecipientEmails?.length ?? '—'}</p>
            </div>

            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-100 p-4">
              <div className="mx-auto max-w-[600px] overflow-hidden rounded-xl bg-white shadow"><div dangerouslySetInnerHTML={{ __html: previewHtml }} /></div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-4">
              <Input placeholder="Emails de prueba, separados por coma" value={testEmails} onChange={(e) => setTestEmails(e.target.value)} className="flex-1" />
              <Button type="button" variant="secondary" onClick={() => void sendTest()} disabled={sendingTest}><Mail className="mr-2 h-4 w-4" />{sendingTest ? 'Enviando...' : 'Enviar prueba'}</Button>
            </div>

            <Button type="button" onClick={() => void confirmSend()} className="w-full justify-center"><Send className="mr-2 h-4 w-4" />{sendMode === 'now' ? 'Enviar campaña ahora' : 'Programar campaña'}</Button>
          </div>
        ) : null}
      </fieldset>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={step === 0} onClick={() => void goToStep(step - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => void goToStep(step + 1)} disabled={saving}>{saving ? 'Guardando...' : 'Siguiente'}<ChevronRight className="ml-1 h-4 w-4" /></Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void persist()} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar borrador'}</Button>
        )}
      </div>
    </section>
  );
}
