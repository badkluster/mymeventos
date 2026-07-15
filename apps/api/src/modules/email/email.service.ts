import nodemailer from 'nodemailer';
import { env } from '../../config/env';
type EmailInput = { to: string; subject: string; text: string; html?: string; attachments?: nodemailer.SendMailOptions['attachments'] };
let transporter: nodemailer.Transporter | undefined;
function getTransporter(): nodemailer.Transporter | undefined { if (!env.EMAIL_NOTIFICATIONS_ENABLED || !env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) return undefined; if (!transporter) transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }); return transporter; }
export async function sendEmail(input: EmailInput): Promise<boolean> { const client = getTransporter(); if (!client) { console.info('Email skipped: SMTP is disabled or not configured.'); return false; } await client.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, ...input }); return true; }
