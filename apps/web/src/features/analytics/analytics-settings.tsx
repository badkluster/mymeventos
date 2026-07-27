'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast-provider';
import { AnalyticsNav } from './analytics-nav';

type Settings = { enabled: boolean; consentRequired: boolean; retentionDays: number; collectClicks: boolean; collectSectionEngagement: boolean };
type DeletionResult = { sessions: number; events: number };

export function AnalyticsSettingsWorkspace() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [visitorId, setVisitorId] = useState('');

  useEffect(() => {
    void api.get<{ settings: Settings }>('/analytics/settings').then((result) => setSettings(result.settings)).catch(() => showToast({ message: 'No se pudo cargar la configuración de privacidad.', variant: 'error' }));
  }, [showToast]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const result = await api.patch<{ settings: Settings }>('/analytics/settings', settings);
      setSettings(result.settings);
      showToast({ message: 'Configuración de privacidad guardada.', variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudo guardar.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const id = visitorId.trim();
    if (!id) return;
    if (!confirm('Esta acción elimina las sesiones y los eventos individuales de este código anónimo. ¿Querés continuar?')) return;
    try {
      const result = await api.delete<DeletionResult>(`/analytics/visitor/${encodeURIComponent(id)}`);
      setVisitorId('');
      showToast({ message: `Se eliminaron ${result.events} eventos y ${result.sessions} sesiones anónimas.`, variant: 'success' });
    } catch (cause) {
      showToast({ message: cause instanceof Error ? cause.message : 'No se pudieron eliminar los datos.', variant: 'error' });
    }
  };

  return <section className="space-y-5"><PageHeader title="Privacidad y conservación" description="Definí qué se mide y durante cuánto tiempo se conservan los datos anónimos." /><AnalyticsNav />
    {settings ? <form onSubmit={save} className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:grid-cols-2"><header className="sm:col-span-2"><h2 className="font-semibold">Qué se registra</h2><p className="mt-1 text-sm text-zinc-500">La analítica no guarda el contenido de formularios, e-mail, teléfono ni DNI. Solo registra actividad anónima de navegación.</p></header><label className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span><strong className="block text-sm">Activar analítica</strong><span className="text-xs text-zinc-500">Al desactivarla, el sitio deja de registrar nueva actividad.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4"><input type="checkbox" checked={settings.consentRequired} onChange={(event) => setSettings({ ...settings, consentRequired: event.target.checked })} /><span><strong className="block text-sm">Pedir autorización antes de medir</strong><span className="text-xs text-zinc-500">La persona debe aceptar la analítica opcional antes de que se registre su actividad.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4"><input type="checkbox" checked={settings.collectClicks} onChange={(event) => setSettings({ ...settings, collectClicks: event.target.checked })} /><span><strong className="block text-sm">Registrar clics en botones y enlaces</strong><span className="text-xs text-zinc-500">Permite ver qué acciones generan interés. No captura la pantalla ni el movimiento del mouse.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4"><input type="checkbox" checked={settings.collectSectionEngagement} onChange={(event) => setSettings({ ...settings, collectSectionEngagement: event.target.checked })} /><span><strong className="block text-sm">Medir interés por sección</strong><span className="text-xs text-zinc-500">Registra de forma agregada qué partes de la página se ven y cuánto tiempo.</span></span></label><section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2"><label className="block max-w-xs text-sm font-medium">Conservar datos individuales durante<Input type="number" min="7" max="730" value={settings.retentionDays} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} className="mt-1.5" /> <span className="mt-1 block text-xs font-normal text-zinc-500">Entre 7 y 730 días.</span></label><p className="mt-4 text-sm leading-6 text-zinc-600">Al cumplirse este plazo se eliminan automáticamente las sesiones y eventos individuales asociados a un navegador anónimo. Los totales por día y sección se mantienen para los informes históricos, pero no permiten identificar a una persona.</p><p className="mt-2 text-xs leading-5 text-zinc-500">El cambio se aplica a los datos que se registren desde ahora; no acorta ni extiende el vencimiento ya asignado a registros existentes.</p></section><footer className="flex justify-end sm:col-span-2"><Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></footer></form> : <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Cargando configuración…</p>}
    <details className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer font-semibold">Eliminación manual de datos de analítica</summary><div className="mt-4"><p className="text-sm leading-6 text-zinc-500">Es una herramienta de asistencia técnica, no una tarea habitual. Usala solo si una persona pide borrar su actividad de analítica y proporciona su código anónimo. No elimina una consulta, un cliente ni un presupuesto.</p><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600"><li>Pedile el código anónimo de su navegación. La analítica no permite buscarlo por nombre, e-mail, teléfono ni DNI porque esos datos no se registran.</li><li>Pegá el código en el campo de abajo y confirmá la eliminación.</li><li>Se borran sus sesiones y eventos individuales; los indicadores ya agrupados no se modifican porque no están vinculados con una persona.</li></ol><p className="mt-3 text-xs leading-5 text-zinc-500">Si no contás con ese código, no hace falta hacer nada: la conservación automática elimina los datos individuales al vencer el plazo configurado arriba.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Input value={visitorId} onChange={(event) => setVisitorId(event.target.value)} placeholder="Código anónimo del visitante" aria-label="Código anónimo del visitante" /><Button type="button" variant="danger" disabled={!visitorId.trim()} onClick={() => void remove()}>Eliminar datos de analítica</Button></div></div></details>
  </section>;
}
