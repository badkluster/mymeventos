'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, PageHeader, Textarea } from '@/components/ui/primitives';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type MarketingSettings = {
  companyName?: string; logoUrl?: string; logoAlternativeUrl?: string; primaryColor?: string; secondaryColor?: string;
  buttonColor?: string; backgroundColor?: string; fontFamily?: string; senderName?: string; senderEmail?: string;
  replyToEmail?: string; legalFooterText?: string; defaultImageUrl?: string; publicUrl?: string;
};

const empty: MarketingSettings = {};

export default function MarketingSettingsPage() {
  const { showToast } = useToast();
  const [form, setForm] = useState<MarketingSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<{ settings: MarketingSettings }>('/marketing/settings')
      .then((response) => setForm(response.settings))
      .catch((error: Error) => showToast({ message: error.message, variant: 'error' }))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch<{ settings: MarketingSettings }>('/marketing/settings', form);
      setForm(response.settings);
      showToast({ message: 'Configuración de marketing actualizada.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la configuración.', variant: 'error' });
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Marketing" description="Identidad institucional reutilizada por todas las campañas de email." />
      <MarketingTabs />
      <PageHeader title="Configuración" description="Logo, colores, remitente y pie institucional para las campañas de email." />

      {loading ? <p className="text-sm text-zinc-500">Cargando configuración...</p> : (
        <form onSubmit={save} className="space-y-6">
          <fieldset className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Identidad</legend>
            <Input placeholder="Nombre comercial" value={form.companyName ?? ''} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))} />
            <Input placeholder="Sitio público (para enlaces de baja)" value={form.publicUrl ?? ''} onChange={(e) => setForm((c) => ({ ...c, publicUrl: e.target.value }))} />
            <Input placeholder="Logo principal (URL)" value={form.logoUrl ?? ''} onChange={(e) => setForm((c) => ({ ...c, logoUrl: e.target.value }))} />
            <Input placeholder="Logo alternativo (URL)" value={form.logoAlternativeUrl ?? ''} onChange={(e) => setForm((c) => ({ ...c, logoAlternativeUrl: e.target.value }))} />
            <Input placeholder="Imagen por defecto (URL)" value={form.defaultImageUrl ?? ''} onChange={(e) => setForm((c) => ({ ...c, defaultImageUrl: e.target.value }))} />
            <Input placeholder="Tipografía segura (ej. Arial, Helvetica, sans-serif)" value={form.fontFamily ?? ''} onChange={(e) => setForm((c) => ({ ...c, fontFamily: e.target.value }))} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-4">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-4">Colores</legend>
            <ColorField label="Color primario" value={form.primaryColor} onChange={(value) => setForm((c) => ({ ...c, primaryColor: value }))} />
            <ColorField label="Color secundario" value={form.secondaryColor} onChange={(value) => setForm((c) => ({ ...c, secondaryColor: value }))} />
            <ColorField label="Color de botones" value={form.buttonColor} onChange={(value) => setForm((c) => ({ ...c, buttonColor: value }))} />
            <ColorField label="Color de fondo" value={form.backgroundColor} onChange={(value) => setForm((c) => ({ ...c, backgroundColor: value }))} />
          </fieldset>

          <fieldset className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Remitente</legend>
            <Input placeholder="Nombre del remitente" value={form.senderName ?? ''} onChange={(e) => setForm((c) => ({ ...c, senderName: e.target.value }))} />
            <Input type="email" placeholder="Email del remitente" value={form.senderEmail ?? ''} onChange={(e) => setForm((c) => ({ ...c, senderEmail: e.target.value }))} />
            <Input type="email" placeholder="Email de respuesta" value={form.replyToEmail ?? ''} onChange={(e) => setForm((c) => ({ ...c, replyToEmail: e.target.value }))} />
          </fieldset>

          <fieldset className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <legend className="mb-1 text-sm font-semibold text-zinc-800">Pie institucional</legend>
            <Textarea placeholder="Texto legal del pie de email" value={form.legalFooterText ?? ''} onChange={(e) => setForm((c) => ({ ...c, legalFooterText: e.target.value }))} />
          </fieldset>

          <div className="flex justify-end"><Button disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</Button></div>
        </form>
      )}
    </section>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-medium text-zinc-700">
      {label}
      <div className="mt-1.5 flex items-center gap-2">
        <input type="color" value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#111827'} onChange={(e) => onChange(e.target.value)} className="h-10 w-10 rounded border border-zinc-200" />
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}
