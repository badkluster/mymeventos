import type { MarketingVariableContext } from './marketing-variables.service';

// Fake, clearly-labeled placeholder data for template/campaign previews and
// [PRUEBA] test sends — never real lead/customer data (§9 and §12 of the brief).
export function sampleVariableContext(overrides: Partial<MarketingVariableContext> = {}): MarketingVariableContext {
  return {
    firstName: 'Ana',
    lastName: 'Pérez',
    fullName: 'Ana Pérez',
    email: 'ana.perez@ejemplo.com',
    salonName: 'Salón San Carlos',
    salonAddress: 'Av. Siempre Viva 1234, San Carlos',
    salonPhone: '+54 9 11 1234-5678',
    salonWhatsApp: '+54 9 11 1234-5678',
    campaignName: 'Campaña de ejemplo',
    promotionTitle: '20% OFF en tu evento de fin de año',
    promotionDescription: 'Válido para eventos contratados durante noviembre y diciembre.',
    promotionCode: 'FINDEANIO20',
    promotionValidUntil: '31/12/2026',
    discountValue: '20%',
    buttonUrl: 'https://mymeventos.example.com/contacto',
    unsubscribeUrl: 'https://mymeventos.example.com/marketing/unsubscribe/preview-token',
    companyName: 'M&M Eventos',
    companyLogoUrl: '',
    ...overrides
  };
}
