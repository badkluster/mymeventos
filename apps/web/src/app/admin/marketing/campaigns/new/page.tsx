'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Save } from 'lucide-react';
import { Button, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

type Salon = { _id: string; name: string };
type Audience = { _id: string; name: string; estimatedCount: number };

export default function NewCampaignPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [internalDescription, setInternalDescription] = useState('');
  const [salonId, setSalonId] = useState('');
  const [audienceId, setAudienceId] = useState('');
  const [salons, setSalons] = useState<Salon[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.get<{ salons: Salon[] }>('/salons').then((response) => setSalons(response.salons)).catch(() => undefined),
      api.get<{ items: Audience[] }>('/marketing/audiences?limit=100').then((response) => setAudiences(response.items)).catch(() => undefined)
    ]);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.post<{ campaign: { _id: string } }>('/marketing/campaigns', {
        name,
        internalDescription: internalDescription || undefined,
        salonId: salonId || undefined,
        audienceId: audienceId || undefined
      });
      showToast({ message: 'Campaña creada como borrador.', variant: 'success' });
      router.replace(`/admin/marketing/campaigns/${response.campaign._id}/edit`);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo crear la campaña.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <button type="button" onClick={() => router.push('/admin/marketing/campaigns')} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ChevronLeft className="h-4 w-4" />Volver a campañas</button>
      <PageHeader title="Nueva campaña" description="Completá los datos iniciales y guardá para crear el borrador. Hasta entonces no se creará ninguna campaña." />

      <form onSubmit={save} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-zinc-700">Nombre interno
          <Input required minLength={2} className="mt-1.5" placeholder="Ej.: Seguimiento de presupuestos de agosto" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-700">Salón
          <Select className="mt-1.5" value={salonId} onChange={(event) => setSalonId(event.target.value)}>
            <option value="">Todos los salones</option>
            {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
          </Select>
        </label>
        <label className="block text-sm font-medium text-zinc-700">Audiencia inicial
          <Select className="mt-1.5" value={audienceId} onChange={(event) => setAudienceId(event.target.value)}>
            <option value="">La seleccionaré después</option>
            {audiences.map((audience) => <option key={audience._id} value={audience._id}>{audience.name} ({audience.estimatedCount} estimados)</option>)}
          </Select>
        </label>
        <label className="block text-sm font-medium text-zinc-700">Descripción interna
          <Textarea className="mt-1.5" placeholder="Objetivo o contexto de esta campaña (opcional)" value={internalDescription} onChange={(event) => setInternalDescription(event.target.value)} />
        </label>
        <footer className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <Button type="button" variant="secondary" onClick={() => router.push('/admin/marketing/campaigns')}>Cancelar</Button>
          <Button disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar y continuar'}</Button>
        </footer>
      </form>
    </section>
  );
}
