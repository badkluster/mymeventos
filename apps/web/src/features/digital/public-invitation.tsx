'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PublicInvitationRenderer } from './public-invitation-renderer';
import type { DigitalInvitation, InvitationGuest } from './types';

type RsvpPayload = {
  response: string;
  fullName?: string;
  dietaryRestrictions: string;
  musicRequest: string;
  guestMessage: string;
};

export function PublicInvitation({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<DigitalInvitation>();
  const [guest, setGuest] = useState<InvitationGuest>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [thankYouMessage, setThankYouMessage] = useState('');

  useEffect(() => {
    void api.get<{ invitation: DigitalInvitation; guest?: InvitationGuest }>(`/public/invitations/${token}`)
      .then(({ invitation: nextInvitation, guest: nextGuest }) => {
        setInvitation(nextInvitation);
        setGuest(nextGuest);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [token]);

  const submitRsvp = async (payload: RsvpPayload) => {
    setSaving(true);
    setError('');
    try {
      const response = await api.post<{ guest?: InvitationGuest; confirmationMessage?: string }>(`/public/invitations/${token}/rsvp`, payload);
      if (response.guest) setGuest(response.guest);
      setThankYouMessage(response.confirmationMessage || '¡Gracias por confirmar tu asistencia!');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos registrar tu respuesta.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PublicState message="Cargando invitación…" />;
  if (!invitation) return <PublicState title="Esta invitación no está disponible" message={error || 'El enlace es inválido o ya no está publicado.'} />;
  if (thankYouMessage) return <PublicState title="¡Gracias!" message={thankYouMessage} />;

  return <PublicInvitationRenderer invitation={invitation} recipient={guest} mode="public" onRsvp={submitRsvp} saving={saving} error={error} />;
}

function PublicState({ title, message }: { title?: string; message: string }) {
  return <main className="grid min-h-dvh place-items-center bg-stone-50 px-6 text-center text-stone-700">
    <div>
      {title ? <h1 className="text-2xl font-semibold">{title}</h1> : null}
      <p className={title ? 'mt-3' : ''}>{message}</p>
    </div>
  </main>;
}
