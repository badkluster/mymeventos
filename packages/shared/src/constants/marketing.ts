// Marketing & Campaigns module — shared status/type unions.
// Mirrors the codebase's real convention (see Lead/Event/Ticket models): lowercase
// snake_case string literals defined as a single source-of-truth tuple, not a
// legacy UPPER_CASE enum like statuses.ts (which the real Mongoose models don't
// actually consume — see docs/MYM_EVENTOS_PROJECT_CONTEXT.md §10 for that
// discrepancy). Both the Mongoose schema enum and the zod schema derive from
// these tuples so there is exactly one place to add a new status.

export const MARKETING_CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'preparing',
  'sending',
  'paused',
  'completed',
  'completed_with_errors',
  'cancelled',
  'failed'
] as const;
export type MarketingCampaignStatus = (typeof MARKETING_CAMPAIGN_STATUSES)[number];

export const MarketingCampaignStatusLabels: Record<MarketingCampaignStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  preparing: 'Preparando',
  sending: 'Enviando',
  paused: 'Pausada',
  completed: 'Completada',
  completed_with_errors: 'Completada con errores',
  cancelled: 'Cancelada',
  failed: 'Fallida'
};

export const MARKETING_RECIPIENT_STATUSES = [
  'pending',
  'processing',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'failed',
  'skipped',
  'unsubscribed'
] as const;
export type MarketingRecipientStatus = (typeof MARKETING_RECIPIENT_STATUSES)[number];

export const MarketingRecipientStatusLabels: Record<MarketingRecipientStatus, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  sent: 'Enviado',
  delivered: 'Entregado',
  opened: 'Abierto',
  clicked: 'Clic',
  failed: 'Fallido',
  skipped: 'Omitido',
  unsubscribed: 'Dado de baja'
};

export const MARKETING_AUDIENCE_SOURCES = ['lead', 'customer', 'manual'] as const;
export type MarketingAudienceSource = (typeof MARKETING_AUDIENCE_SOURCES)[number];

export const PROMOTION_DISCOUNT_TYPES = ['percentage', 'fixed_amount', 'custom_benefit'] as const;
export type PromotionDiscountType = (typeof PROMOTION_DISCOUNT_TYPES)[number];

export const PromotionDiscountTypeLabels: Record<PromotionDiscountType, string> = {
  percentage: 'Porcentaje',
  fixed_amount: 'Monto fijo',
  custom_benefit: 'Beneficio personalizado'
};

export const MARKETING_TEMPLATE_CATEGORIES = [
  'general_promotion',
  'special_date_discount',
  'salon_availability',
  'quote_follow_up',
  'lead_recovery',
  'birthday',
  'anniversary',
  'venue_invitation',
  'past_customer_benefit',
  'last_slots_available',
  'new_package_or_service',
  'informational',
  'blank'
] as const;
export type MarketingTemplateCategory = (typeof MARKETING_TEMPLATE_CATEGORIES)[number];

export const MarketingTemplateCategoryLabels: Record<MarketingTemplateCategory, string> = {
  general_promotion: 'Promoción general',
  special_date_discount: 'Descuento por fecha especial',
  salon_availability: 'Salón disponible',
  quote_follow_up: 'Seguimiento de presupuesto',
  lead_recovery: 'Recuperación de lead',
  birthday: 'Cumpleaños',
  anniversary: 'Aniversario',
  venue_invitation: 'Invitación a conocer el salón',
  past_customer_benefit: 'Beneficio para antiguos clientes',
  last_slots_available: 'Últimos lugares disponibles',
  new_package_or_service: 'Nueva propuesta o paquete',
  informational: 'Campaña informativa',
  blank: 'Plantilla en blanco'
};

export const MARKETING_SEND_LOG_STATUSES = ['queued', 'sent', 'delivered', 'bounced', 'failed'] as const;
export type MarketingSendLogStatus = (typeof MARKETING_SEND_LOG_STATUSES)[number];

export const MARKETING_UNSUBSCRIBE_REASONS = [
  'too_many_emails',
  'not_interested',
  'unrecognized_subscription',
  'other'
] as const;
export type MarketingUnsubscribeReason = (typeof MARKETING_UNSUBSCRIBE_REASONS)[number];

export const MarketingUnsubscribeReasonLabels: Record<MarketingUnsubscribeReason, string> = {
  too_many_emails: 'Recibo demasiados correos',
  not_interested: 'Ya no me interesa',
  unrecognized_subscription: 'No reconozco esta suscripción',
  other: 'Otro'
};

export const MARKETING_DYNAMIC_VARIABLES = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'salonName',
  'salonAddress',
  'salonPhone',
  'salonWhatsApp',
  'campaignName',
  'promotionTitle',
  'promotionDescription',
  'promotionCode',
  'promotionValidUntil',
  'discountValue',
  'buttonUrl',
  'unsubscribeUrl',
  'companyName',
  'companyLogoUrl'
] as const;
export type MarketingDynamicVariable = (typeof MARKETING_DYNAMIC_VARIABLES)[number];
