import { basename } from 'path';
import { readFile } from 'fs/promises';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { getOrCreateMarketingSettings } from '../marketing/marketing-settings.service';

export type EmailAttachment = {
  filename?: string;
  content?: Buffer | Uint8Array | string;
  path?: string;
  contentType?: string;
  cid?: string;
};

export type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type TransactionalEmailProvider = 'resend' | 'smtp' | 'disabled';

type ResendAttachment = {
  filename: string;
  content?: string;
  path?: string;
  content_type?: string;
  content_id?: string;
};

let transporter: nodemailer.Transporter | undefined;

function getSmtpTransporter(): nodemailer.Transporter | undefined {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) return undefined;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return transporter;
}

export function transactionalEmailProviderName(): TransactionalEmailProvider {
  if (!env.EMAIL_NOTIFICATIONS_ENABLED) return 'disabled';
  if (env.RESEND_API_KEY) return 'resend';
  return getSmtpTransporter() ? 'smtp' : 'disabled';
}

function cleanDisplayName(value: string): string {
  return value.replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

function senderDomain(email: string): string {
  return email.trim().split('@')[1]?.toLowerCase() ?? '';
}

async function resolveResendSender(): Promise<{ from: string; replyTo?: string }> {
  let settings: Awaited<ReturnType<typeof getOrCreateMarketingSettings>> | undefined;
  try {
    settings = await getOrCreateMarketingSettings();
  } catch (error) {
    console.warn('Transactional email: could not load MarketingSettings; using environment fallback.', error);
  }

  const fromEmail = String(settings?.senderEmail || env.MARKETING_FROM_EMAIL || '').trim();
  if (!fromEmail) {
    throw new Error('Resend transaccional no tiene remitente configurado. Definí Marketing > Configuración > Email del remitente o MARKETING_FROM_EMAIL.');
  }

  const domain = senderDomain(fromEmail);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    throw new Error('Resend transaccional no puede usar Gmail como remitente. Configurá un email del dominio verificado en Resend y dejá Gmail como Reply-To.');
  }

  const fromName = cleanDisplayName(String(settings?.senderName || env.MARKETING_FROM_NAME || 'M&M Eventos'));
  const replyTo = String(
    settings?.replyToEmail ||
    env.MARKETING_REPLY_TO ||
    env.SUPPORT_EMAIL ||
    env.SMTP_USER ||
    ''
  ).trim();

  return {
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    replyTo: replyTo || undefined
  };
}

function inferFilename(attachment: EmailAttachment, index: number): string {
  if (attachment.filename?.trim()) return attachment.filename.trim();
  if (attachment.path?.trim()) return basename(attachment.path.trim()) || `attachment-${index + 1}`;
  return `attachment-${index + 1}`;
}

async function toResendAttachment(attachment: EmailAttachment, index: number): Promise<ResendAttachment> {
  const filename = inferFilename(attachment, index);
  const contentType = attachment.contentType?.trim() || undefined;
  const contentId = attachment.cid?.trim() || undefined;
  const path = attachment.path?.trim();

  if (path && /^https?:\/\//i.test(path)) {
    return {
      filename,
      path,
      content_type: contentType,
      content_id: contentId
    };
  }

  let content: Buffer | undefined;
  if (Buffer.isBuffer(attachment.content)) {
    content = attachment.content;
  } else if (attachment.content instanceof Uint8Array) {
    content = Buffer.from(attachment.content);
  } else if (typeof attachment.content === 'string') {
    content = Buffer.from(attachment.content, 'utf8');
  } else if (path) {
    content = await readFile(path);
  }

  if (!content) throw new Error(`No se pudo resolver el adjunto "${filename}" para Resend.`);

  return {
    filename,
    content: content.toString('base64'),
    content_type: contentType,
    content_id: contentId
  };
}

function resendErrorMessage(status: number, responseBody: string): string {
  let detail = responseBody.trim();
  try {
    const parsed = JSON.parse(responseBody) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) detail = parsed.message.trim();
  } catch {
    // Preserve the provider body when it is not JSON.
  }
  return `Resend ${status}: ${(detail || 'Error sin detalle.').slice(0, 500)}`;
}

async function sendWithResend(input: EmailInput): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const sender = await resolveResendSender();
  const attachments = input.attachments?.length
    ? await Promise.all(input.attachments.map(toResendAttachment))
    : undefined;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: sender.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || sender.replyTo,
      attachments
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(resendErrorMessage(response.status, body));
  }

  const body = (await response.json().catch(() => ({}))) as { id?: string };
  if (!body.id) throw new Error('Resend aceptó la solicitud pero no devolvió un id de mensaje.');
  return true;
}

async function sendWithSmtp(input: EmailInput): Promise<boolean> {
  const client = getSmtpTransporter();
  if (!client) {
    console.info('Email skipped: SMTP is not configured.');
    return false;
  }
  await client.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    attachments: input.attachments
  });
  return true;
}

/**
 * Transactional email entry point.
 *
 * Production prefers the already-configured Resend account whenever RESEND_API_KEY
 * exists. SMTP is kept only as a compatibility fallback for environments that have
 * not migrated yet. This prevents Gmail sending limits from affecting receipts,
 * reminders, tickets and other automated messages.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  if (!env.EMAIL_NOTIFICATIONS_ENABLED) {
    console.info('Email skipped: EMAIL_NOTIFICATIONS_ENABLED=false.');
    return false;
  }
  return env.RESEND_API_KEY ? sendWithResend(input) : sendWithSmtp(input);
}
