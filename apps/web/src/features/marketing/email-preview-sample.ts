// Client-side mirror of the backend's sample context + variable renderer,
// used only to make the editor's live preview readable. The values sent to
// the backend (contentJson/renderedHtml) always keep the literal `{{var}}`
// tokens — this substitution never touches what gets persisted.

export const EMAIL_PREVIEW_SAMPLE: Record<string, string> = {
  firstName: 'Ana', lastName: 'Pérez', fullName: 'Ana Pérez', email: 'ana.perez@ejemplo.com',
  salonName: 'Salón San Carlos', salonAddress: 'Av. Siempre Viva 1234, San Carlos', salonPhone: '+54 9 11 1234-5678', salonWhatsApp: '+54 9 11 1234-5678',
  campaignName: 'Campaña de ejemplo', promotionTitle: '20% OFF en tu evento de fin de año', promotionDescription: 'Válido para eventos contratados durante noviembre y diciembre.',
  promotionCode: 'FINDEANIO20', promotionValidUntil: '31/12/2026', discountValue: '20%', buttonUrl: '#',
  companyName: 'M&M Eventos', companyLogoUrl: ''
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*default:\s*"([^"]*)")?\s*\}\}/g;

export function renderPreviewSample(html: string, overrides: Record<string, string> = {}): string {
  const context = { ...EMAIL_PREVIEW_SAMPLE, ...overrides };
  return (html ?? '').replace(VARIABLE_PATTERN, (_match, key: string, fallback: string | undefined) => context[key] ?? fallback ?? `{{${key}}}`);
}
