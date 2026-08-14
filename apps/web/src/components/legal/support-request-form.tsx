'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Send, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

type RequestType = 'support' | 'account_deletion';
type RequestSource = 'privacy_page' | 'terms_page' | 'mobile_login' | 'backoffice_login';

type SupportRequestFormProps = {
  source: RequestSource;
  defaultRequestType?: RequestType;
};

type FormState = 'idle' | 'loading' | 'success' | 'error';

export function SupportRequestForm({ source, defaultRequestType = 'support' }: SupportRequestFormProps) {
  const [requestType, setRequestType] = useState<RequestType>(defaultRequestType);
  const [state, setState] = useState<FormState>('idle');
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    const syncRequestTypeFromHash = () => {
      if (window.location.hash === '#eliminar-cuenta') {
        setRequestType('account_deletion');
        setState('idle');
        setMessage('');
      }
    };

    syncRequestTypeFromHash();
    window.addEventListener('hashchange', syncRequestTypeFromHash);
    return () => window.removeEventListener('hashchange', syncRequestTypeFromHash);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setState('loading');
    setMessage('');
    setRequestId('');

    try {
      const result = await api.post<{ requestId: string; requestType: RequestType }>('/public/support/requests', {
        requestType,
        name: String(values.get('name') ?? '').trim(),
        email: String(values.get('email') ?? '').trim(),
        accountReference: String(values.get('accountReference') ?? '').trim(),
        message: String(values.get('message') ?? '').trim(),
        source,
        deletionConfirmed: requestType === 'account_deletion' ? values.get('deletionConfirmed') === 'on' : false,
      });
      setRequestId(String(result.requestId));
      setState('success');
      setMessage(requestType === 'account_deletion'
        ? 'Recibimos tu solicitud de eliminación. El equipo verificará la cuenta antes de procesarla.'
        : 'Recibimos tu consulta. El equipo de M&M Eventos la revisará y se pondrá en contacto con vos.');
      form.reset();
      setRequestType(defaultRequestType);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'No pudimos enviar la solicitud. Intentá nuevamente.');
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-white/10 bg-black/35 p-5 md:p-7">
      <div>
        <label htmlFor="support-request-type" className="text-sm font-semibold text-zinc-200">Tipo de solicitud</label>
        <select
          id="support-request-type"
          name="requestType"
          value={requestType}
          onChange={(event) => { setRequestType(event.target.value as RequestType); setState('idle'); setMessage(''); }}
          className="mt-2 w-full rounded-xl border border-white/12 bg-[#101010] px-4 py-3 text-sm text-white outline-none focus:border-[#dbe1e8]"
        >
          <option value="support">Necesito soporte</option>
          <option value="account_deletion">Solicitar eliminación de cuenta y datos</option>
        </select>
      </div>

      {requestType === 'account_deletion' ? (
        <div className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-50">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>La solicitud no desactiva la cuenta de inmediato. Primero verificaremos que seas el titular y luego eliminaremos la cuenta y los datos asociados que no deban conservarse por obligaciones legales, administrativas o de seguridad.</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Nombre y apellido
          <input required name="name" minLength={2} maxLength={120} autoComplete="name" className="rounded-xl border border-white/12 bg-[#101010] px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-[#dbe1e8]" placeholder="Tu nombre" />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Email de la cuenta
          <input required name="email" type="email" maxLength={160} autoComplete="email" className="rounded-xl border border-white/12 bg-[#101010] px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-[#dbe1e8]" placeholder="tu@email.com" />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium text-zinc-200">
        Usuario, legajo o referencia de cuenta <span className="font-normal text-zinc-500">(opcional)</span>
        <input name="accountReference" maxLength={160} className="rounded-xl border border-white/12 bg-[#101010] px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-[#dbe1e8]" placeholder="Ej.: usuario.staff" />
      </label>

      <label className="grid gap-2 text-sm font-medium text-zinc-200">
        {requestType === 'account_deletion' ? 'Información para identificar la cuenta' : '¿En qué podemos ayudarte?'}
        <textarea required name="message" minLength={10} maxLength={2000} className="min-h-32 rounded-xl border border-white/12 bg-[#101010] px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-[#dbe1e8]" placeholder={requestType === 'account_deletion' ? 'Indicá cualquier dato adicional que nos ayude a identificar correctamente tu cuenta.' : 'Describí el problema o consulta con el mayor detalle posible.'} />
      </label>

      {requestType === 'account_deletion' ? (
        <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm leading-6 text-zinc-300">
          <input required type="checkbox" name="deletionConfirmed" className="mt-1 h-4 w-4 accent-white" />
          <span>Confirmo que solicito la eliminación de mi cuenta de M&M Eventos Staff y de los datos personales asociados, sujeto a la verificación de identidad y a las retenciones que deban mantenerse legítimamente.</span>
        </label>
      ) : null}

      {message ? (
        <div className={`flex gap-3 rounded-xl border p-4 text-sm leading-6 ${state === 'success' ? 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100' : 'border-red-300/20 bg-red-300/[0.07] text-red-100'}`}>
          {state === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : null}
          <div><p>{message}</p>{requestId ? <p className="mt-1 text-xs opacity-75">Referencia: {requestId}</p> : null}</div>
        </div>
      ) : null}

      <button disabled={state === 'loading'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#dbe1e8] px-5 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60">
        {state === 'loading' ? 'Enviando...' : requestType === 'account_deletion' ? 'Enviar solicitud de eliminación' : 'Enviar solicitud de soporte'}
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}
