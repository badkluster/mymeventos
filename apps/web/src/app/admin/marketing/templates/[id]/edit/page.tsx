'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save } from 'lucide-react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { EmailBlockEditor } from '@/features/marketing/email-block-editor';
import { renderEmailContentToHtml, renderEmailContentToText } from '@/features/marketing/email-html-renderer';
import { emptyEmailContent, type EmailContent } from '@/features/marketing/email-content-types';

type Template = { _id: string; name: string; subject?: string; preheader?: string; contentJson?: EmailContent; isSystemTemplate: boolean };

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [id, setId] = useState('');
  const [template, setTemplate] = useState<Template>();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [content, setContent] = useState<EmailContent>(emptyEmailContent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; }, [content]);

  useEffect(() => {
    void params.then(({ id: routeId }) => {
      setId(routeId);
      void api.get<{ template: Template }>(`/marketing/templates/${routeId}`)
        .then((response) => {
          setTemplate(response.template);
          setName(response.template.name);
          setSubject(response.template.subject ?? '');
          setPreheader(response.template.preheader ?? '');
          setContent(response.template.contentJson ?? emptyEmailContent());
        })
        .catch((error: Error) => showToast({ message: error.message, variant: 'error' }))
        .finally(() => setLoading(false));
    });
  }, [params, showToast]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const currentContent = contentRef.current;
      const response = await api.patch<{ template: Template }>(`/marketing/templates/${id}`, {
        name, subject, preheader,
        contentJson: currentContent,
        renderedHtml: renderEmailContentToHtml(currentContent),
        renderedText: renderEmailContentToText(currentContent)
      });
      setTemplate(response.template);
      showToast({ message: 'Plantilla guardada.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la plantilla.', variant: 'error' });
    } finally { setSaving(false); }
  }, [id, name, subject, preheader, showToast]);

  if (loading) return <p className="p-6 text-sm text-zinc-500">Cargando plantilla...</p>;

  return (
    <section className="space-y-4">
      <button type="button" onClick={() => router.push('/admin/marketing/templates')} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ChevronLeft className="h-4 w-4" />Volver a plantillas</button>
      <PageHeader title="Editar plantilla" description={template?.isSystemTemplate ? 'Plantilla del sistema — los cambios se guardan como una nueva versión.' : 'Edita el contenido visual y guardá cuando termines.'} action={<Button onClick={() => void save()} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar'}</Button>} />

      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <Input placeholder="Nombre de la plantilla" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Input placeholder="Preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} />
      </div>

      <EmailBlockEditor content={content} onChange={setContent} />
    </section>
  );
}
