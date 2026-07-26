'use client';

import { useEffect, useState } from 'react';
import { MARKETING_UNSUBSCRIBE_REASONS, MarketingUnsubscribeReasonLabels } from '@mym/shared';
import { Button } from '@/components/ui/primitives';
import { api, ApiClientError } from '@/lib/api';

export default function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void params.then(({ token: routeToken }) => {
      setToken(routeToken);
      void api.get<{ maskedEmail: string }>(`/public/marketing/unsubscribe/${routeToken}`)
        .then((response) => setMaskedEmail(response.maskedEmail))
        .catch((cause: Error) => setError(cause instanceof ApiClientError ? cause.message : 'El enlace no es válido o ya fue utilizado.'))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function confirm() {
    setSubmitting(true);
    try {
      await api.post(`/public/marketing/unsubscribe/${token}`, reason ? { reason } : {});
      setConfirmed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo procesar la baja.');
    } finally { setSubmitting(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-950">Dejar de recibir promociones</h1>
        {loading ? <p className="mt-4 text-sm text-zinc-500">Verificando enlace...</p> : null}
        {!loading && error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && !confirmed ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-600">Vas a dejar de recibir campañas comerciales de M&amp;M Eventos en <strong>{maskedEmail}</strong>.</p>
            <label className="block text-sm font-medium text-zinc-700">
              ¿Por qué querés darte de baja? (opcional)
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                <option value="">Preferí no decirlo</option>
                {MARKETING_UNSUBSCRIBE_REASONS.map((value) => <option key={value} value={value}>{MarketingUnsubscribeReasonLabels[value]}</option>)}
              </select>
            </label>
            <Button onClick={() => void confirm()} disabled={submitting} className="w-full justify-center">{submitting ? 'Procesando...' : 'Confirmar baja'}</Button>
          </div>
        ) : null}
        {confirmed ? <p className="mt-4 text-sm text-emerald-700">Listo, tu email fue dado de baja de nuestras comunicaciones comerciales. Podés cerrar esta ventana.</p> : null}
      </div>
    </main>
  );
}
