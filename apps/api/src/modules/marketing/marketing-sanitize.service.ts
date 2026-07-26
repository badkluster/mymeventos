import sanitizeHtml from 'sanitize-html';

// Email HTML is authored by trusted backoffice users through the block editor,
// but is still sanitized server-side before it's persisted or sent — regex-based
// hand-rolled sanitization is a known anti-pattern for HTML, so this uses the
// same battle-tested library approach as any other HTML-accepting boundary.
// `{{variable}}` tokens are left untouched (they're plain text at this point,
// substituted later by marketing-variables.service).
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: [
      'html', 'head', 'body', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
      'div', 'span', 'p', 'a', 'img', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'center', 'style'
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border', 'role'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // Strip data: URIs on images (§27: no imágenes base64 gigantes almacenadas)
    exclusiveFilter: (frame) => frame.tag === 'img' && /^data:/i.test(frame.attribs.src ?? ''),
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: /^javascript:/i.test(attribs.href ?? '') ? '#' : attribs.href } })
    }
  });
}

export function stripHtmlToText(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
