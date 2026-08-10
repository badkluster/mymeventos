'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, settingKeyLabels } from '@/lib/display-labels';
import { Button, PageHeader, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

type Setting = { _id?: string; key: string; value: unknown; description?: string; updatedAt?: string };
type SettingForm = Setting & { rawValue: string };

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';

function stringify(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
}

function parseValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<SettingForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ settings?: Setting[] } | Setting[]>('/settings');
      const settings = Array.isArray(response) ? response : response.settings ?? [];
      setItems(settings.map((setting) => ({ ...setting, rawValue: stringify(setting.value) })));
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar la configuración.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // La pantalla debe reflejar la configuración persistida.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const updateRawValue = (key: string, rawValue: string) => setItems((current) => current.map((item) => item.key === key ? { ...item, rawValue } : item));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { settings: items.map(({ key, rawValue, description }) => ({ key, value: parseValue(rawValue), description })) });
      await load();
      showToast({ message: 'Configuración guardada correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo guardar la configuración.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-6">
    <PageHeader title="Configuración" description="Parámetros persistidos del sistema." action={items.length ? <Button disabled={saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar cambios'}</Button> : null} />
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Parámetro', 'Valor', 'Descripción', 'Actualizado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-100">{items.map((setting) => <tr key={setting.key} className="align-top">
            <td className="px-5 py-4 text-sm font-semibold text-zinc-900">{displayLabel(settingKeyLabels, setting.key)}</td>
            <td className="w-[42rem] px-5 py-4"><Textarea aria-label={`Valor de ${displayLabel(settingKeyLabels, setting.key)}`} value={setting.rawValue} onChange={(event) => updateRawValue(setting.key, event.target.value)} className="min-h-28 font-mono text-xs" /></td>
            <td className="px-5 py-4 text-zinc-700">{setting.description || 'Sin descripción'}</td>
            <td className="px-5 py-4 text-zinc-700">{formatDate(setting.updatedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando configuración...</div>}
      {!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><Settings className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay configuración cargada</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los parámetros aparecerán cuando existan registros en la configuración del sistema.</p></div>}
    </div>
  </section>;
}
