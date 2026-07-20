import { ApiError } from '../../middlewares/errorHandler';

export type InvitationTemplateTier = 'basic' | 'premium';
export type InvitationTemplateFeatures = {
  maxGalleryImages: number;
  maxSections: number;
  allowCustomColors: boolean;
  allowCustomFonts: boolean;
  allowCustomBackgrounds: boolean;
  allowSectionBackgrounds: boolean;
  allowMusic: boolean;
  allowVideoHero: boolean;
  allowAnimations: boolean;
  allowAdvancedAnimations: boolean;
  allowCountdown: boolean;
  allowSchedule: boolean;
  allowGiftSection: boolean;
  allowMap: boolean;
  allowPersonalizedRecipients: boolean;
  allowAdvancedGallery: boolean;
  allowCustomDividers: boolean;
  allowMultipleLocations: boolean;
};

export const basicFeatures: InvitationTemplateFeatures = {
  maxGalleryImages: 4, maxSections: 10, allowCustomColors: true, allowCustomFonts: true, allowCustomBackgrounds: true, allowSectionBackgrounds: false,
  allowMusic: false, allowVideoHero: false, allowAnimations: true, allowAdvancedAnimations: false, allowCountdown: true, allowSchedule: false,
  allowGiftSection: false, allowMap: true, allowPersonalizedRecipients: false, allowAdvancedGallery: false, allowCustomDividers: false, allowMultipleLocations: false
};
export const premiumFeatures: InvitationTemplateFeatures = {
  maxGalleryImages: 20, maxSections: 18, allowCustomColors: true, allowCustomFonts: true, allowCustomBackgrounds: true, allowSectionBackgrounds: true,
  allowMusic: true, allowVideoHero: true, allowAnimations: true, allowAdvancedAnimations: true, allowCountdown: true, allowSchedule: true,
  allowGiftSection: true, allowMap: true, allowPersonalizedRecipients: true, allowAdvancedGallery: true, allowCustomDividers: true, allowMultipleLocations: true
};

export function featuresForTier(tier: InvitationTemplateTier): InvitationTemplateFeatures { return tier === 'premium' ? premiumFeatures : basicFeatures; }

export function validateInvitationFeature(features: InvitationTemplateFeatures, feature: keyof InvitationTemplateFeatures, message?: string): void {
  if (!features[feature]) throw new ApiError(422, 'INVITATION_TEMPLATE_FEATURE_NOT_AVAILABLE', message ?? 'Esta función no está disponible en la plantilla elegida.');
}

export function validateInvitationContent(content: { sections?: Array<{ type?: string; background?: { type?: string }; animation?: { type?: string }; data?: { items?: unknown[] } }> } | undefined, features: InvitationTemplateFeatures): void {
  const sections = content?.sections ?? [];
  if (sections.length > features.maxSections) throw new ApiError(422, 'INVITATION_SECTION_LIMIT_EXCEEDED', `La plantilla permite hasta ${features.maxSections} secciones.`);
  for (const section of sections) {
    if (section.type === 'opening') validateInvitationFeature(features, 'allowPersonalizedRecipients', 'La portada personalizada es exclusiva de plantillas premium.');
    if (section.type === 'music') validateInvitationFeature(features, 'allowMusic');
    if (section.type === 'schedule') validateInvitationFeature(features, 'allowSchedule');
    if (section.type === 'gift_registry') validateInvitationFeature(features, 'allowGiftSection');
    if (section.type === 'map') validateInvitationFeature(features, 'allowMap');
    if (section.background?.type === 'video') validateInvitationFeature(features, 'allowVideoHero', 'Los videos de fondo son exclusivos de plantillas premium.');
    if (section.background?.type && !['transparent', 'solid', 'gradient'].includes(section.background.type)) validateInvitationFeature(features, 'allowSectionBackgrounds', 'Los fondos por sección son exclusivos de esta plantilla premium.');
    if (section.animation?.type && !['none', 'fade', 'slide_up'].includes(section.animation.type)) validateInvitationFeature(features, 'allowAdvancedAnimations');
    if (section.type === 'gallery' && (section.data?.items?.length ?? 0) > features.maxGalleryImages) throw new ApiError(422, 'INVITATION_GALLERY_LIMIT_EXCEEDED', `La plantilla permite hasta ${features.maxGalleryImages} imágenes.`);
  }
}

export function validateInvitationCustomization(input: { theme?: unknown; generalBackground?: { type?: string } | undefined; content?: { sections?: Array<{ background?: { type?: string } }> } | undefined }, features: InvitationTemplateFeatures): void {
  if (input.theme && !features.allowCustomColors) validateInvitationFeature(features, 'allowCustomColors', 'Esta plantilla no permite personalizar la paleta.');
  if (input.theme && !features.allowCustomFonts && typeof input.theme === 'object' && input.theme !== null && ('headingFont' in input.theme || 'bodyFont' in input.theme)) validateInvitationFeature(features, 'allowCustomFonts', 'Esta plantilla no permite personalizar las tipografías.');
  if (input.generalBackground?.type && !['transparent', 'solid', 'gradient'].includes(input.generalBackground.type)) validateInvitationFeature(features, 'allowCustomBackgrounds', 'Esta plantilla no permite fondos personalizados.');
  if (!features.allowSectionBackgrounds && input.content?.sections?.some((section) => section.background?.type && !['transparent', 'solid', 'gradient'].includes(section.background.type))) validateInvitationFeature(features, 'allowSectionBackgrounds', 'Esta plantilla no permite imágenes o videos como fondo de sección.');
}
