import { Role } from '@mym/shared';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { Notification } from '../notifications/notification.model';
import { sendEmail } from '../email/email.service';
import { env } from '../../config/env';
import { escapeHtml, logoEmailAttachments, EMAIL_LOGO_CID } from '../email/email-template.util';

type NotifyInput = {
  quoteRequest: any;
  salonNames?: string[];
};

export async function resolveQuoteRequestRecipients(salonIds: string[]): Promise<any[]> {
  const salons: any[] = salonIds.length ? await Salon.find({ _id: { $in: salonIds }, active: true, deletedAt: null }).select('_id name managerUserId').lean() : [];
  const managerIds = salons.map((salon) => salon.managerUserId?.toString()).filter(Boolean);
  const recipients = await User.find({
    active: true,
    deletedAt: null,
    $or: [
      { roles: { $in: [Role.ADMIN, Role.MANAGER] } },
      ...(managerIds.length ? [{ _id: { $in: managerIds } }] : [])
    ]
  }).select('_id email firstName notificationPreferences').lean();
  return [...new Map(recipients.map((user: any) => [user._id.toString(), user])).values()];
}

function emailTemplate(input: { request: any; salons: string; date: string; actionUrl: string }): string {
  const { request, salons, date, actionUrl } = input;
  const webUrl = env.CORS_ORIGIN.replace(/\/$/, '');
  const logoCid = EMAIL_LOGO_CID;
  const detailUrl = `${webUrl}${actionUrl}`;
  const rows = [
    ['Cliente', request.contactName],
    ['Teléfono', request.phone || 'No informado'],
    ['Email', request.email || 'No informado'],
    ['Tipo de evento', request.eventType || 'No informado'],
    ['Fecha tentativa', date],
    ['Cantidad de personas', request.guestCount || 'No informada'],
    ['Salón de interés', salons],
    ['Mensaje', request.message || 'Sin mensaje'],
  ];

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Nueva solicitud de presupuesto</title>
  </head>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;overflow:hidden;border-radius:22px;background:#ffffff;border:1px solid #e4e4e7;box-shadow:0 18px 45px rgba(24,24,27,.08);">
            <tr>
              <td style="background:#09090b;padding:24px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <img src="cid:${logoCid}" alt="M&M Eventos" width="132" height="56" style="display:block;width:132px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;background:#ffffff;">
                    </td>
                    <td align="right" style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d4d4d8;">Backoffice</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#71717a;">Nueva consulta web</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;color:#09090b;">Solicitud de presupuesto recibida</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#52525b;">Se registró una nueva consulta desde la landing. Ya quedó creada en el backoffice para seguimiento comercial.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  ${rows.map(([label, value]) => `<tr>
                    <td style="width:190px;padding:13px 16px;background:#f4f4f5;border-top-left-radius:12px;border-bottom-left-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#71717a;">${escapeHtml(label)}</td>
                    <td style="padding:13px 16px;background:#fafafa;border-top-right-radius:12px;border-bottom-right-radius:12px;font-size:15px;line-height:1.45;color:#18181b;">${escapeHtml(value)}</td>
                  </tr>`).join('')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 30px;">
                <a href="${detailUrl}" style="display:inline-block;border-radius:12px;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 18px;">Abrir solicitud en backoffice</a>
                <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#71717a;">Si el botón no funciona, ingresá al panel y buscá la solicitud por el nombre o teléfono del cliente.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function createQuoteRequestNotifications(input: NotifyInput): Promise<void> {
  const request = input.quoteRequest;
  const salonIds = (request.interestedSalonIds ?? []).map((id: { toString(): string }) => id.toString());
  const recipients = await resolveQuoteRequestRecipients(salonIds);
  if (!recipients.length) return;

  const salons = input.salonNames?.length ? input.salonNames.join(', ') : 'Sin salón definido';
  // `estimatedEventDate` es una fecha civil normalizada a medianoche UTC (`civilDateInput`) —
  // sin `timeZone: 'UTC'` explícito, el huso local del proceso corre esa medianoche al día anterior.
  const date = request.estimatedEventDate ? new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(request.estimatedEventDate)) : 'Sin fecha tentativa';
  const message = `${request.contactName} (${request.phone || request.email || 'sin contacto'}) solicitó presupuesto para ${request.eventType || 'un evento'} el ${date}. Salón/es: ${salons}.`;
  const actionUrl = `/admin/quotes/requests/${request._id}`;
  const html = emailTemplate({ request, salons, date, actionUrl });
  const attachments = logoEmailAttachments();

  await Notification.insertMany(recipients.map((user: any) => ({
    userId: user._id,
    type: 'quote_request_created',
    title: 'Nueva solicitud de presupuesto',
    message,
    actionUrl,
    metadata: { quoteRequestId: request._id, leadId: request.leadId, salonIds, relatedEntityType: 'quote_request', relatedEntityId: request._id }
  })));

  await Promise.allSettled([...new Set(recipients.map((user: any) => user.email).filter(Boolean))]
    .map((email) => sendEmail({
      to: email,
      subject: 'Nueva solicitud de presupuesto - M&M Eventos',
      text: [
        'Se registró una nueva consulta desde la web.',
        '',
        `Nombre: ${request.contactName}`,
        `Teléfono: ${request.phone || 'No informado'}`,
        `Email: ${request.email || 'No informado'}`,
        `Tipo de evento: ${request.eventType || 'No informado'}`,
        `Fecha tentativa: ${date}`,
        `Cantidad de personas: ${request.guestCount || 'No informada'}`,
        `Salón/es de interés: ${salons}`,
        `Mensaje: ${request.message || 'Sin mensaje'}`,
        '',
        `Link interno: ${actionUrl}`
      ].join('\n'),
      html,
      attachments
    })));
}
