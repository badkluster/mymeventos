'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, FileStack, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Input, PageHeader, Select } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, marketingTemplateCategoryLabels } from '@/lib/display-labels';
import { emptyEmailContent } from '@/features/marketing/email-content-types';
import { renderEmailContentToHtml, renderEmailContentToText } from '@/features/marketing/email-html-renderer';

type Template = { _id: string; name: string; category: string; isSystemTemplate: boolean; isActive: boolean; updatedAt: string; thumbnailUrl?: string };

export default function MarketingTemplatesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Template[]>([]);
  const [filters, setFilters] = useState({ search: '', category: '' });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get<{ items: Template[] }>(`/marketing/templates?${query}`); setItems(response.items); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudieron cargar las plantillas.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [query, showToast]);
  useEffect(() => { void load(); }, [load]);

  async function createTemplate() {
    setCreating(true);
    try {
      const content = emptyEmailContent();
      const response = await api.post<{ template: Template }>('/marketing/templates', {
        name: 'Nueva plantilla', category: 'blank', subject: 'Asunto de ejemplo',
        contentJson: content, renderedHtml: renderEmailContentToHtml(content), renderedText: renderEmailContentToText(content)
      });
      router.push(`/admin/marketing/templates/${response.template._id}/edit`);
    } catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo crear la plantilla.', variant: 'error' }); }
    finally { setCreating(false); }
  }

  async function duplicate(template: Template) {
    try { const response = await api.post<{ template: Template }>(`/marketing/templates/${template._id}/duplicate`, {}); await load(); router.push(`/admin/marketing/templates/${response.template._id}/edit`); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo duplicar la plantilla.', variant: 'error' }); }
  }
  async function remove(template: Template) {
    try { await api.delete(`/marketing/templates/${template._id}`); await load(); showToast({ message: 'Plantilla eliminada.', variant: 'success' }); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo eliminar la plantilla.', variant: 'error' }); }
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Plantillas de email reutilizables en campañas." />
      <MarketingTabs />
      <PageHeader title="Plantillas" description="Diseños prearmados y personalizados para tus campañas." action={<Button onClick={() => void createTemplate()} disabled={creating}><Plus className="mr-2 h-4 w-4" />{creating ? 'Creando...' : 'Nueva plantilla'}</Button>} />

      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_240px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="h-11 pl-10" placeholder="Buscar plantilla..." value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))} /></div>
        <Select value={filters.category} onChange={(e) => setFilters((c) => ({ ...c, category: e.target.value }))}>
          <option value="">Todas las categorías</option>
          {Object.entries(marketingTemplateCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Cargando plantillas...</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((template) => (
            <article key={template._id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex h-32 items-center justify-center bg-zinc-100 text-zinc-300">
                {template.thumbnailUrl ? <img src={template.thumbnailUrl} alt={template.name} className="h-full w-full object-cover" /> : <FileStack className="h-10 w-10" />}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-950">{template.name}</p>
                    <p className="text-xs text-zinc-500">{displayLabel(marketingTemplateCategoryLabels, template.category)}</p>
                  </div>
                  {template.isSystemTemplate ? <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">Sistema</span> : null}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${template.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{template.isActive ? 'Activa' : 'Inactiva'}</span>
                  <div className="flex">
                    <TableActionButton icon={Pencil} label="Editar" onClick={() => router.push(`/admin/marketing/templates/${template._id}/edit`)} />
                    <TableActionButton icon={Copy} label="Duplicar" onClick={() => void duplicate(template)} />
                    {!template.isSystemTemplate ? <TableActionButton icon={Trash2} label="Eliminar" onClick={() => void remove(template)} /> : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {!items.length ? <p className="col-span-full py-16 text-center text-sm text-zinc-500">No hay plantillas todavía. <Link href="#" onClick={(e) => { e.preventDefault(); void createTemplate(); }} className="font-semibold text-zinc-900 underline">Creá la primera</Link>.</p> : null}
        </div>
      )}
    </section>
  );
}
