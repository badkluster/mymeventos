import { sendEmail } from '../email/email.service';

type RsvpNotificationInput = {
  invitation: { title?: string; content?: { sections?: Array<{ type?: string; data?: { notificationEmail?: unknown; notificationEnabled?: unknown } }> } };
  guest: { firstName?: string; lastName?: string; status?: string; adults?: number; minors?: number; dietaryRestrictions?: string; musicRequest?: string; guestMessage?: string };
};

export async function sendInvitationRsvpNotification({ invitation, guest }: RsvpNotificationInput): Promise<boolean> {
  const rsvp = invitation.content?.sections?.find((section) => section.type === 'rsvp');
  const recipient = typeof rsvp?.data?.notificationEmail === 'string' ? rsvp.data.notificationEmail.trim() : '';
  if (!recipient || rsvp?.data?.notificationEnabled === false) return false;

  const guestName = [guest.firstName, guest.lastName].filter(Boolean).join(' ') || 'Invitado/a';
  const response = guest.status === 'declined' ? 'No asistirá' : guest.status === 'partially_confirmed' ? 'Confirmó parcialmente' : 'Confirmó asistencia';
  const text = [
    `Nueva respuesta de asistencia · ${invitation.title ?? 'Invitación digital'}`,
    `Invitado: ${guestName}`,
    `Respuesta: ${response}`,
    guest.dietaryRestrictions ? `Restricciones alimentarias: ${guest.dietaryRestrictions}` : '',
    guest.musicRequest ? `Música que no puede faltar: ${guest.musicRequest}` : '',
    guest.guestMessage ? `Mensaje: ${guest.guestMessage}` : ''
  ].filter(Boolean).join('\n');

  return sendEmail({
    to: recipient,
    subject: `RSVP · ${invitation.title ?? 'Invitación digital'} · ${guestName}`,
    text
  });
}
