import { Role } from '@mym/shared';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { Notification } from '../notifications/notification.model';
import { sendEmail } from '../email/email.service';

type NotifyInput = {
  quoteRequest: any;
  salonNames?: string[];
};

export async function resolveQuoteRequestRecipients(salonIds: string[]): Promise<any[]> {
  const salons: any[] = salonIds.length ? await Salon.find({ _id: { $in: salonIds }, active: true, deletedAt: null }).select('_id name managerUserId').lean() : [];
  const managerIds = salons.map((salon) => salon.managerUserId?.toString()).filter(Boolean);
  const managerRecipients = managerIds.length
    ? await User.find({ _id: { $in: managerIds }, active: true, deletedAt: null }).select('_id email firstName notificationPreferences').lean()
    : [];
  if (managerRecipients.length) return managerRecipients;
  return User.find({ roles: { $in: [Role.ADMIN, Role.MANAGER] }, active: true, deletedAt: null }).select('_id email firstName notificationPreferences').lean();
}

export async function createQuoteRequestNotifications(input: NotifyInput): Promise<void> {
  const request = input.quoteRequest;
  const salonIds = (request.interestedSalonIds ?? []).map((id: { toString(): string }) => id.toString());
  const recipients = await resolveQuoteRequestRecipients(salonIds);
  if (!recipients.length) return;

  const salons = input.salonNames?.length ? input.salonNames.join(', ') : 'Sin salón definido';
  const date = request.estimatedEventDate ? new Intl.DateTimeFormat('es-AR').format(new Date(request.estimatedEventDate)) : 'Sin fecha tentativa';
  const message = `${request.contactName} (${request.phone || request.email || 'sin contacto'}) solicitó presupuesto para ${request.eventType || 'un evento'} el ${date}. Salón/es: ${salons}.`;
  const actionUrl = `/admin/quotes/requests/${request._id}`;

  await Notification.insertMany(recipients.map((user: any) => ({
    userId: user._id,
    type: 'quote_request_created',
    title: 'Nueva solicitud de presupuesto',
    message,
    actionUrl,
    metadata: { quoteRequestId: request._id, leadId: request.leadId, salonIds, relatedEntityType: 'quote_request', relatedEntityId: request._id }
  })));

  await Promise.allSettled(recipients
    .filter((user: any) => user.email && user.notificationPreferences?.email !== false && user.notificationPreferences?.emailNotificationsEnabled !== false && user.notificationPreferences?.newQuoteRequest !== false && user.notificationPreferences?.notifyOnNewQuoteRequest !== false)
    .map((user: any) => sendEmail({
      to: user.email,
      subject: 'Nueva solicitud de presupuesto - M&M Eventos',
      text: [
        `Nombre: ${request.contactName}`,
        `Teléfono: ${request.phone || 'No informado'}`,
        `Email: ${request.email || 'No informado'}`,
        `Tipo de evento: ${request.eventType || 'No informado'}`,
        `Fecha tentativa: ${date}`,
        `Cantidad de personas: ${request.guestCount || 'No informada'}`,
        `Salón/es de interés: ${salons}`,
        `Mensaje: ${request.message || 'Sin mensaje'}`,
        `Link interno: ${actionUrl}`
      ].join('\n')
    })));
}
