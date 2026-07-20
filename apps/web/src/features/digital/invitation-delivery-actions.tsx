'use client';

import { useState } from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import type { DigitalInvitation } from './types';

export function InvitationDeliveryActions({ invitation, compact = false }: { invitation: DigitalInvitation; compact?: boolean }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'email' | 'whatsapp'>();
  const [recipientName, setRecipientName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/invitacion/${invitation.publicToken ?? ''}`;
  const copyLink = async () => { await navigator.clipboard.writeText(url); showToast({ message: 'URL única copiada.', variant: 'success' }); };
  const sendEmail = async () => {
    if (!email) return;
    setSending(true);
    try { await api.post(`/invitations/${invitation._id}/send-email`, { email, recipientName, publicUrl: url }); showToast({ message: 'Invitación enviada por correo.', variant: 'success' }); setMode(undefined); }
    catch (error) { showToast({ message: error instanceof Error ? error.message : 'No se pudo enviar el correo.', variant: 'error' }); }
    finally { setSending(false); }
  };
  const openWhatsApp = () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) { showToast({ message: 'Indicá un número de WhatsApp válido, con código de país.', variant: 'error' }); return; }
    const greeting = recipientName.trim() ? `Hola ${recipientName.trim()}, ` : 'Hola, ';
    const message = `${greeting}te compartimos la invitación a ${invitation.title ?? 'nuestro evento'}. Podés verla y confirmar tu asistencia aquí: ${url}`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    setMode(undefined);
  };
  return <><div className={`flex flex-wrap gap-2 ${compact ? '' : 'rounded-2xl border border-zinc-200 bg-white p-4'}`}><Button variant="secondary" onClick={() => void copyLink()}><Copy className="mr-2 h-4 w-4" />Copiar URL</Button><Button variant="secondary" disabled={invitation.status !== 'published'} title={invitation.status !== 'published' ? 'Publicá la invitación antes de enviarla.' : undefined} onClick={() => setMode('email')}><Mail className="mr-2 h-4 w-4" />Correo</Button><Button variant="secondary" disabled={invitation.status !== 'published'} title={invitation.status !== 'published' ? 'Publicá la invitación antes de enviarla.' : undefined} onClick={() => setMode('whatsapp')}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button></div>
    <Modal open={mode === 'email'} onClose={() => setMode(undefined)} title="Enviar invitación por correo" description="Se envía desde el servicio de correo configurado en el servidor."><div className="grid gap-4 p-6"><label className="text-sm font-medium text-zinc-700">Nombre de la persona destinataria<Input className="mt-1.5" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Ej.: Sofía Pérez" /></label><label className="text-sm font-medium text-zinc-700">Correo electrónico destinatario<Input className="mt-1.5" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sofia@ejemplo.com" /></label><label className="text-sm font-medium text-zinc-700">URL única de la invitación<Input className="mt-1.5" readOnly value={url} /></label><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode(undefined)}>Cancelar</Button><Button disabled={!email || sending} onClick={() => void sendEmail()}>{sending ? 'Enviando…' : 'Enviar correo'}</Button></div></div></Modal>
    <Modal open={mode === 'whatsapp'} onClose={() => setMode(undefined)} title="Enviar invitación por WhatsApp" description="Se abrirá WhatsApp con el mensaje y la URL única ya preparados."><div className="grid gap-4 p-6"><label className="text-sm font-medium text-zinc-700">Nombre de la persona destinataria<Input className="mt-1.5" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Ej.: Sofía Pérez" /></label><label className="text-sm font-medium text-zinc-700">Número de WhatsApp con código de país<Input className="mt-1.5" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ej.: 5492215551234" /></label><label className="text-sm font-medium text-zinc-700">URL única de la invitación<Input className="mt-1.5" readOnly value={url} /></label><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode(undefined)}>Cancelar</Button><Button disabled={!phone} onClick={openWhatsApp}>Abrir WhatsApp</Button></div></div></Modal></>;
}
