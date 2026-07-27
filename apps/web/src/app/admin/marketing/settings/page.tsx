'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, PageHeader, Textarea } from '@/components/ui/primitives';
import { MarketingTabs } from '@/components/admin/marketing-tabs';
import { CloudinaryUpload, type UploadedAsset } from '@/components/cloudinary-upload';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type MarketingSettings = {
  companyName?: string; logoUrl?: string; logoAlternativeUrl?: string; primaryColor?: string; secondaryColor?: string;
  buttonColor?: string; backgroundColor?: string; fontFamily?: string; senderName?: string; senderEmail?: string;
  replyToEmail?: string; legalFooterText?: string; defaultImageUrl?: string;
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
      <PageHeader title="Configuración" description="Adjuntá los logos e imágenes institucionales, y definí los colores, remitente y pie de las campañas." />

      {loading ? <p className="text-sm text-zinc-500">Cargando configuración...</p> : (
        <form onSubmit={save} className="space-y-6">
          <fieldset className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-800 md:col-span-2">Identidad</legend>
            <Input placeholder="Nombre comercial" value={form.companyName ?? ''} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))} />
            <Input placeholder="Tipografía segura (ej. Arial, Helvetica, sans-serif)" value={form.fontFamily ?? ''} onChange={(e) => setForm((c) => ({ ...c, fontFamily: e.target.value }))} />
            <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
              <BrandImageField label="Logo principal" description="Identidad principal de los emails." value={form.logoUrl} onChange={(logoUrl) => setForm((current) => ({ ...current, logoUrl }))} />
              <BrandImageField label="Logo alternativo" description="Versión secundaria para diseños que la necesiten." value={form.logoAlternativeUrl} onChange={(logoAlternativeUrl) => setForm((current) => ({ ...current, logoAlternativeUrl }))} />
              <BrandImageField label="Imagen por defecto" description="Imagen de respaldo para los diseños de email." value={form.defaultImageUrl} onChange={(defaultImageUrl) => setForm((current) => ({ ...current, defaultImageUrl }))} />
            </div>
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

function BrandImageField({ label, description, value, onChange }: { label: string; description: string; value?: string; onChange: (value: string) => void }) {
  function useUploadedAsset(asset: UploadedAsset) {
    onChange(asset.secureUrl || asset.url);
  }

  return (
    <article className="space-y-3 rounded-xl border border-zinc-200 p-3">
      <div><p className="text-sm font-medium text-zinc-800">{label}</p><p className="mt-0.5 text-xs text-zinc-500">{description}</p></div>
      <CloudinaryUpload context="marketing" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,.heic,.heif" label={value ? 'Reemplazar archivo' : 'Adjuntar archivo'} onUploaded={useUploadedAsset} />
      {value ? (
        <>
          <div role="img" aria-label={label} className="h-24 rounded-lg border border-zinc-200 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${value})` }} />
          <Button type="button" variant="secondary" className="w-full" onClick={() => onChange('')}>Quitar de la configuración</Button>
        </>
      ) : <p className="rounded-lg bg-zinc-50 px-3 py-5 text-center text-xs text-zinc-500">Todavía no hay un archivo adjunto.</p>}
    </article>
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
