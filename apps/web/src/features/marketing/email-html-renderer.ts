import type { EmailBlock, EmailContent } from './email-content-types';

// Produces email-safe HTML (nested tables + inline styles, no flex/grid — most
// email clients need this) with `{{variable}}` tokens left as literal text.
// Substitution happens later: server-side per recipient at send time, or via
// the sample context for admin previews. Keep this function pure (no DOM, no
// React) so it can run identically in the editor preview and in the payload
// persisted to the backend.

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function cell(inner: string, block: EmailBlock): string {
  const bg = block.backgroundColor ? `background-color:${block.backgroundColor};` : '';
  return `<tr><td align="${block.align}" style="padding:${block.paddingY}px ${block.paddingX}px;${bg}">${inner}</td></tr>`;
}

function renderBlock(block: EmailBlock, settings: EmailContent['settings']): string {
  if (!block.enabled) return '';
  switch (block.type) {
    case 'logo':
      return cell(block.data.url ? `<a href="${escapeHtml(block.data.link || '#')}"><img src="${escapeHtml(block.data.url)}" width="${block.data.width || 160}" alt="Logo" style="display:inline-block;max-width:100%;" /></a>` : '', block);
    case 'heading':
      return cell(`<h1 style="margin:0;font-family:${settings.fontFamily};font-size:${block.data.fontSize || 26}px;color:${block.data.color || '#18181B'};font-weight:700;">${nl2br(block.data.text || '')}</h1>`, block);
    case 'text':
      return cell(`<p style="margin:0;font-family:${settings.fontFamily};font-size:${block.data.fontSize || 15}px;line-height:1.6;color:${block.data.color || '#3F3F46'};">${nl2br(block.data.text || '')}</p>`, block);
    case 'image':
      return cell(block.data.url ? `<a href="${escapeHtml(block.data.link || '#')}"><img src="${escapeHtml(block.data.url)}" alt="${escapeHtml(block.data.alt || '')}" style="display:block;max-width:100%;border:0;" /></a>` : '', block);
    case 'button':
      return cell(`<a href="${escapeHtml(block.data.url || '#')}" style="display:inline-block;padding:12px 28px;background-color:${block.data.backgroundColor || '#18181B'};color:${block.data.textColor || '#FFFFFF'};font-family:${settings.fontFamily};font-size:14px;font-weight:600;text-decoration:none;border-radius:${block.data.borderRadius ?? 8}px;">${escapeHtml(block.data.label || 'Ver más')}</a>`, block);
    case 'divider':
      return cell(`<hr style="border:none;border-top:${block.data.thickness || 1}px solid ${block.data.color || '#E4E4E7'};margin:0;" />`, block);
    case 'spacer':
      return `<tr><td style="height:${block.data.height ?? 24}px;line-height:${block.data.height ?? 24}px;font-size:0;">&nbsp;</td></tr>`;
    case 'columns':
      return cell(`<table role="presentation" width="100%"><tr>
        <td width="50%" valign="top" style="padding-right:8px;font-family:${settings.fontFamily};font-size:14px;color:#3F3F46;">${nl2br(block.data.leftText || '')}</td>
        <td width="50%" valign="top" style="padding-left:8px;font-family:${settings.fontFamily};font-size:14px;color:#3F3F46;">${nl2br(block.data.rightText || '')}</td>
      </tr></table>`, block);
    case 'promotion':
      return cell(`<table role="presentation" width="100%" style="border:1px solid #E4E4E7;border-radius:12px;">
        <tr><td style="padding:20px;font-family:${settings.fontFamily};">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#18181B;">{{promotionTitle}}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#3F3F46;">{{promotionDescription}}</p>
          ${block.data.showCode ? '<p style="margin:0 0 12px;font-size:13px;color:#71717A;">Código: <strong>{{promotionCode}}</strong> · Válido hasta {{promotionValidUntil}}</p>' : ''}
          ${block.data.showButton ? '<a href="{{buttonUrl}}" style="display:inline-block;padding:10px 22px;background-color:#18181B;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Quiero aprovecharla</a>' : ''}
        </td></tr>
      </table>`, block);
    case 'social': {
      const links = [
        block.data.instagramUrl ? `<a href="${escapeHtml(block.data.instagramUrl)}" style="margin:0 8px;color:#3F3F46;text-decoration:none;">Instagram</a>` : '',
        block.data.facebookUrl ? `<a href="${escapeHtml(block.data.facebookUrl)}" style="margin:0 8px;color:#3F3F46;text-decoration:none;">Facebook</a>` : '',
        block.data.whatsappUrl ? `<a href="${escapeHtml(block.data.whatsappUrl)}" style="margin:0 8px;color:#3F3F46;text-decoration:none;">WhatsApp</a>` : ''
      ].filter(Boolean).join('');
      return cell(`<div style="font-family:${settings.fontFamily};font-size:13px;">${links}</div>`, block);
    }
    case 'contact': {
      const lines = [
        block.data.showAddress ? '{{salonAddress}}' : '',
        block.data.showPhone ? '{{salonPhone}}' : '',
        block.data.showWhatsApp ? 'WhatsApp: {{salonWhatsApp}}' : ''
      ].filter(Boolean).join('<br />');
      return cell(`<p style="margin:0;font-family:${settings.fontFamily};font-size:12px;color:#71717A;">${lines}</p>`, block);
    }
    case 'footer':
      return cell(`<p style="margin:0;font-family:${settings.fontFamily};font-size:12px;color:#A1A1AA;">${nl2br(block.data.text || '')}</p>`, block);
    default:
      return '';
  }
}

export function renderEmailContentToHtml(content: EmailContent): string {
  const rows = content.blocks.map((block) => renderBlock(block, content.settings)).join('');
  return `<table role="presentation" width="100%" style="background-color:${content.settings.backgroundColor};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="${content.settings.maxWidth}" style="max-width:${content.settings.maxWidth}px;width:100%;background-color:${content.settings.contentBackgroundColor};border-radius:12px;overflow:hidden;">
      ${rows}
    </table>
  </td></tr>
</table>`;
}

export function renderEmailContentToText(content: EmailContent): string {
  return content.blocks
    .filter((block) => block.enabled)
    .map((block) => {
      switch (block.type) {
        case 'heading': return `${block.data.text || ''}\n`;
        case 'text': return `${block.data.text || ''}\n`;
        case 'button': return `${block.data.label || ''}: ${block.data.url || ''}\n`;
        case 'columns': return `${block.data.leftText || ''}\n${block.data.rightText || ''}\n`;
        case 'promotion': return '{{promotionTitle}}\n{{promotionDescription}}\nCódigo: {{promotionCode}}\n{{buttonUrl}}\n';
        case 'contact': return '{{salonAddress}}\n{{salonPhone}}\n';
        case 'footer': return `${block.data.text || ''}\n`;
        default: return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}
