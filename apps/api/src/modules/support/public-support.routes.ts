import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { sendEmail } from '../email/email.service';
import { SupportRequest } from './support-request.model';

const router = Router();

const supportRequestSchema = z.object({
  body: z.object({
    requestType: z.enum(['support', 'account_deletion']),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    accountReference: z.string().trim().max(160).optional().or(z.literal('')),
    message: z.string().trim().min(10).max(2000),
    source: z.enum(['privacy_page', 'terms_page', 'mobile_login', 'backoffice_login']).default('privacy_page'),
    deletionConfirmed: z.boolean().optional().default(false),
  }).superRefine((body, context) => {
    if (body.requestType === 'account_deletion' && body.deletionConfirmed !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deletionConfirmed'],
        message: 'Debés confirmar que solicitás la eliminación de la cuenta y sus datos asociados.',
      });
    }
  }),
  params: z.object({}),
  query: z.object({}),
});

function requestLabel(requestType: 'support' | 'account_deletion') {
  return requestType === 'account_deletion' ? 'Eliminación de cuenta' : 'Soporte';
}

router.post('/requests', validateRequest(supportRequestSchema), asyncHandler(async (request, response) => {
  const created = await SupportRequest.create({
    requestType: request.body.requestType,
    name: request.body.name,
    email: request.body.email,
    accountReference: request.body.accountReference || undefined,
    message: request.body.message,
    source: request.body.source,
    deletionConfirmed: request.body.deletionConfirmed,
  });

  const label = requestLabel(request.body.requestType);
  const supportDestination = env.SUPPORT_EMAIL || env.SMTP_USER;
  const accountReference = request.body.accountReference ? `\nCuenta/usuario: ${request.body.accountReference}` : '';
  const adminMessage = [
    `Nueva solicitud de ${label.toLowerCase()} en M&M Eventos.`,
    `Solicitud: ${created._id}`,
    `Nombre: ${request.body.name}`,
    `Email: ${request.body.email}${accountReference}`,
    `Origen: ${request.body.source}`,
    '',
    request.body.message,
  ].join('\n');

  const notifications: Promise<boolean>[] = [];
  if (supportDestination) {
    notifications.push(sendEmail({
      to: supportDestination,
      subject: `[M&M Eventos] ${label} · ${request.body.email}`,
      text: adminMessage,
    }));
  }
  notifications.push(sendEmail({
    to: request.body.email,
    subject: `Recibimos tu solicitud de ${label.toLowerCase()} · M&M Eventos`,
    text: request.body.requestType === 'account_deletion'
      ? `Hola ${request.body.name}. Recibimos tu solicitud de eliminación de cuenta. Referencia: ${created._id}. El equipo verificará la identidad y procesará la eliminación de la cuenta y de los datos asociados que no deban conservarse por una obligación legal o administrativa aplicable.`
      : `Hola ${request.body.name}. Recibimos tu solicitud de soporte. Referencia: ${created._id}. El equipo de M&M Eventos revisará tu consulta y se pondrá en contacto con vos por este correo.`,
  }));

  const notificationResults = await Promise.allSettled(notifications);
  if (notificationResults.some((result) => result.status === 'rejected')) {
    console.error(JSON.stringify({
      event: 'support_request_email_failed',
      supportRequestId: created._id.toString(),
    }));
  }

  return sendSuccess(response, {
    requestId: created._id,
    requestType: created.requestType,
  }, 201, request.body.requestType === 'account_deletion'
    ? 'Recibimos tu solicitud de eliminación de cuenta.'
    : 'Recibimos tu solicitud de soporte.');
}));

export default router;
