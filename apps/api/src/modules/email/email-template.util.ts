import { existsSync } from 'fs';
import path from 'path';

// Extracted from quote-request-notifications.service.ts (the only prior HTML email in the
// codebase) so every new automation email shares the same logo resolution and escaping instead
// of re-implementing it per module.

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function resolveEmailLogoPath(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'apps/web/public/brand/mym-logo-dark-on-light.jpg'),
    path.resolve(process.cwd(), '../web/public/brand/mym-logo-dark-on-light.jpg'),
    path.resolve(__dirname, '../../../../web/public/brand/mym-logo-dark-on-light.jpg'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export const EMAIL_LOGO_CID = 'mym-logo-dark-on-light';

export function logoEmailAttachments(): Array<{ filename: string; path: string; cid: string }> | undefined {
  const logoPath = resolveEmailLogoPath();
  return logoPath ? [{ filename: 'mym-logo-dark-on-light.jpg', path: logoPath, cid: EMAIL_LOGO_CID }] : undefined;
}

export type BrandedEmailInput = {
  eyebrow: string;
  heading: string;
  intro: string;
  rows?: Array<[string, string]>;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  headerLabel?: string;
};

// General-purpose branded card template (header with logo, heading/intro, optional label/value
// rows, optional CTA button) for automations that need a nicer email than the plain-text ones
// financial-reminders.service.ts sends. Mirrors the layout of the quote-request notification
// email, generalized so callers don't hand-roll HTML tables.
export function renderBrandedEmail(input: BrandedEmailInput): string {
  const { eyebrow, heading, intro, rows = [], ctaLabel, ctaUrl, footerNote, headerLabel = 'M&M Eventos' } = input;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(heading)}</title>
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
                      <img src="cid:${EMAIL_LOGO_CID}" alt="M&M Eventos" width="132" height="56" style="display:block;width:132px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;background:#ffffff;">
                    </td>
                    <td align="right" style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d4d4d8;">${escapeHtml(headerLabel)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#71717a;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;color:#09090b;">${escapeHtml(heading)}</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#52525b;">${escapeHtml(intro)}</p>
              </td>
            </tr>
            ${rows.length ? `<tr>
              <td style="padding:18px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  ${rows.map(([label, value]) => `<tr>
                    <td style="width:190px;padding:13px 16px;background:#f4f4f5;border-top-left-radius:12px;border-bottom-left-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#71717a;">${escapeHtml(label)}</td>
                    <td style="padding:13px 16px;background:#fafafa;border-top-right-radius:12px;border-bottom-right-radius:12px;font-size:15px;line-height:1.45;color:#18181b;">${escapeHtml(value)}</td>
                  </tr>`).join('')}
                </table>
              </td>
            </tr>` : ''}
            ${ctaUrl && ctaLabel ? `<tr>
              <td style="padding:18px 28px 30px;">
                <a href="${ctaUrl}" style="display:inline-block;border-radius:12px;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 18px;">${escapeHtml(ctaLabel)}</a>
                ${footerNote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#71717a;">${escapeHtml(footerNote)}</p>` : ''}
              </td>
            </tr>` : footerNote ? `<tr><td style="padding:0 28px 30px;"><p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">${escapeHtml(footerNote)}</p></td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
