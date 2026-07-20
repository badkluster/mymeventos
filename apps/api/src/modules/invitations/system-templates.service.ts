import { InvitationTemplate } from './invitation.models';
import { basicFeatures, premiumFeatures, type InvitationTemplateFeatures, type InvitationTemplateTier } from './invitation-features.service';
import { defaultInvitationContent } from './invitation-content.service';

export type InvitationTemplateCategory = 'wedding' | 'fifteen' | 'birthday' | 'kids' | 'baby_shower' | 'baptism' | 'communion' | 'anniversary' | 'corporate' | 'general';

type SystemTemplate = {
  name: string;
  slug: string;
  description: string;
  category: InvitationTemplateCategory;
  tags: string[];
  tier?: InvitationTemplateTier;
  allowedFeatures?: InvitationTemplateFeatures;
  theme: { primaryColor: string; secondaryColor: string; backgroundColor: string; surfaceColor?: string; textColor: string; mutedTextColor?: string; accentColor: string; headingFont: string; bodyFont: string; headingWeight?: number; bodyWeight?: number; borderRadius?: number; buttonStyle?: 'solid' | 'outline' | 'soft' | 'pill'; cardStyle: 'flat' | 'bordered' | 'elevated' | 'glass' };
};

const luminance = (hex: string) => {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return 1;
  const channels = [0, 2, 4].map((position) => Number.parseInt(value.slice(position, position + 2), 16) / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};

function completeTheme(theme: SystemTemplate['theme']) {
  const dark = luminance(theme.backgroundColor) < .18;
  return {
    ...theme,
    surfaceColor: theme.surfaceColor ?? (dark ? theme.secondaryColor : '#ffffff'),
    mutedTextColor: theme.mutedTextColor ?? (dark ? '#d7c9d0' : '#6f625d'),
    headingWeight: theme.headingWeight ?? 600,
    bodyWeight: theme.bodyWeight ?? 400,
    borderRadius: theme.borderRadius ?? (dark ? 20 : 18),
    buttonStyle: theme.buttonStyle ?? 'solid'
  };
}

export const systemInvitationTemplates: SystemTemplate[] = [
  { name: 'Basic Elegant', slug: 'basic-elegant', description: 'Diseño claro, elegante y versátil para cumpleaños, bautismos y aniversarios.', category: 'general', tags: ['basic', 'elegante', 'versátil'], tier: 'basic', allowedFeatures: basicFeatures, theme: { primaryColor: '#9e7657', secondaryColor: '#e9dccd', backgroundColor: '#fffdf9', textColor: '#3b3029', accentColor: '#c8a98f', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'bordered' } },
  { name: 'Basic Modern', slug: 'basic-modern', description: 'Bloques de color, hero visual y una configuración simple pero impactante.', category: 'birthday', tags: ['basic', 'moderno', 'cumpleaños'], tier: 'basic', allowedFeatures: basicFeatures, theme: { primaryColor: '#6d5dfc', secondaryColor: '#1d2142', backgroundColor: '#fafaff', textColor: '#20233f', accentColor: '#a79dff', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Premium XV', slug: 'premium-xv', description: 'Una experiencia inmersiva con portada, música, galería editorial, agenda y regalos.', category: 'fifteen', tags: ['premium', 'xv', 'música', 'galería'], tier: 'premium', allowedFeatures: premiumFeatures, theme: { primaryColor: '#d6a84b', secondaryColor: '#17131b', backgroundColor: '#100d13', surfaceColor: '#241d27', textColor: '#fffaf0', mutedTextColor: '#dfd0b5', accentColor: '#f2d889', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'glass' } },
  { name: 'Premium Wedding', slug: 'premium-wedding', description: 'Portada personalizada, fotos, agenda, regalos, música y RSVP para bodas.', category: 'wedding', tags: ['premium', 'casamiento', 'música', 'regalos'], tier: 'premium', allowedFeatures: premiumFeatures, theme: { primaryColor: '#6c8064', secondaryColor: '#26342a', backgroundColor: '#fafcf8', textColor: '#263127', accentColor: '#c0cfad', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Premium Infantil', slug: 'premium-infantil', description: 'Colores configurables, agenda, galería y animaciones suaves para festejos infantiles.', category: 'kids', tags: ['premium', 'infantil', 'colorido', 'galería'], tier: 'premium', allowedFeatures: premiumFeatures, theme: { primaryColor: '#ed7ca8', secondaryColor: '#5e79df', backgroundColor: '#fff9ef', textColor: '#392b50', accentColor: '#ffd45d', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Quince Dorado', slug: 'quince-dorado', description: 'Noche elegante con negro, dorado y destellos sutiles.', category: 'fifteen', tags: ['xv', 'quince', 'elegante', 'femenino'], theme: { primaryColor: '#d6a84b', secondaryColor: '#241f2b', backgroundColor: '#100d13', surfaceColor: '#2c2531', textColor: '#fffaf0', mutedTextColor: '#dfd0b5', accentColor: '#f2d889', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'glass' } },
  { name: 'Quince Rosa', slug: 'quince-rosa', description: 'Una propuesta romántica, luminosa y contemporánea para tus XV.', category: 'fifteen', tags: ['xv', 'quince', 'rosa', 'femenino'], theme: { primaryColor: '#e68aae', secondaryColor: '#7d3e65', backgroundColor: '#fff6fa', textColor: '#4c263c', accentColor: '#ffd6e5', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Boda Clásica', slug: 'boda-clasica', description: 'Marfil, champagne y una estética atemporal.', category: 'wedding', tags: ['casamiento', 'boda', 'clásico', 'elegante'], theme: { primaryColor: '#a88349', secondaryColor: '#f1e7d3', backgroundColor: '#fffdf8', textColor: '#31291e', accentColor: '#d9bf8b', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'bordered' } },
  { name: 'Boda Botánica', slug: 'boda-botanica', description: 'Verdes profundos y detalles orgánicos para una celebración al aire libre.', category: 'wedding', tags: ['casamiento', 'boda', 'verde', 'botánico'], theme: { primaryColor: '#52735c', secondaryColor: '#d9e4d3', backgroundColor: '#f7faf5', textColor: '#23372a', accentColor: '#a6bd9e', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Cumple Moderno', slug: 'cumple-moderno', description: 'Diseño oscuro, vibrante y versátil para festejos adultos.', category: 'birthday', tags: ['cumpleaños', 'adultos', 'moderno', 'neutro'], theme: { primaryColor: '#7c5cff', secondaryColor: '#25213b', backgroundColor: '#15131e', surfaceColor: '#282342', textColor: '#f7f5ff', mutedTextColor: '#d6cff2', accentColor: '#b9a9ff', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'glass' } },
  { name: 'Cumple Bloom', slug: 'cumple-bloom', description: 'Una paleta coral y lavanda, fresca y con energía femenina.', category: 'birthday', tags: ['cumpleaños', 'femenino', 'coral', 'lavanda'], theme: { primaryColor: '#e76f86', secondaryColor: '#8d5ec4', backgroundColor: '#fff6f8', textColor: '#4f2941', accentColor: '#ffd1dc', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Cumple Urban', slug: 'cumple-urban', description: 'Azul eléctrico y grafito para un festejo masculino o urbano.', category: 'birthday', tags: ['cumpleaños', 'masculino', 'azul', 'urbano'], theme: { primaryColor: '#2486d8', secondaryColor: '#172b4d', backgroundColor: '#0f1724', surfaceColor: '#172b4d', textColor: '#edf6ff', mutedTextColor: '#c4d9ef', accentColor: '#75bcf7', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'glass' } },
  { name: 'Infantil Arcoíris', slug: 'infantil-arcoiris', description: 'Color, formas suaves y alegría para los más chicos.', category: 'kids', tags: ['infantil', 'niños', 'nenas', 'arcoíris', 'colorido'], theme: { primaryColor: '#ef6fa6', secondaryColor: '#6a86ed', backgroundColor: '#fff9ef', textColor: '#392b50', accentColor: '#ffd45d', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Infantil Aventura', slug: 'infantil-aventura', description: 'Una propuesta en azul, verde y naranja para pequeños exploradores.', category: 'kids', tags: ['infantil', 'niños', 'aventura', 'masculino'], theme: { primaryColor: '#2b8a78', secondaryColor: '#376cc8', backgroundColor: '#f2fbf7', textColor: '#193d3a', accentColor: '#f19a4b', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Baby Shower Suave', slug: 'baby-shower-suave', description: 'Tonos pastel y un estilo delicado para celebrar una llegada especial.', category: 'baby_shower', tags: ['baby shower', 'bebé', 'pastel'], theme: { primaryColor: '#94a9d8', secondaryColor: '#efb4c9', backgroundColor: '#fffafd', textColor: '#51475e', accentColor: '#d8c8f0', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'elevated' } },
  { name: 'Aniversario Minimal', slug: 'aniversario-minimal', description: 'Tipografía protagonista y elegancia minimalista.', category: 'anniversary', tags: ['aniversario', 'pareja', 'minimalista'], theme: { primaryColor: '#a46e5a', secondaryColor: '#e9d6c8', backgroundColor: '#fcfaf8', textColor: '#402f29', accentColor: '#d9ae9c', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'flat' } },
  { name: 'Corporativo Executive', slug: 'corporativo-executive', description: 'Sobrio, claro y profesional para lanzamientos y encuentros de empresa.', category: 'corporate', tags: ['corporativo', 'empresa', 'profesional'], theme: { primaryColor: '#0c4a6e', secondaryColor: '#e0f2fe', backgroundColor: '#f8fcff', textColor: '#102a43', accentColor: '#38bdf8', headingFont: 'system-ui', bodyFont: 'system-ui', cardStyle: 'bordered' } },
  { name: 'Celebración Esencial', slug: 'celebracion-esencial', description: 'Un diseño neutro, cálido y adaptable a cualquier ocasión.', category: 'general', tags: ['general', 'neutro', 'otro'], theme: { primaryColor: '#8a6d5a', secondaryColor: '#eee4da', backgroundColor: '#fffdfb', textColor: '#3f342d', accentColor: '#c6a98b', headingFont: 'Georgia', bodyFont: 'system-ui', cardStyle: 'bordered' } }
];

export async function ensureSystemInvitationTemplates(): Promise<void> {
  await Promise.all(systemInvitationTemplates.map((template) => {
    const tier = template.tier ?? (template.category === 'fifteen' || template.category === 'wedding' ? 'premium' : 'basic');
    return InvitationTemplate.updateOne(
    { isSystem: true, slug: template.slug },
    { $set: { ...template, theme: completeTheme(template.theme), tier, allowedFeatures: template.allowedFeatures ?? (tier === 'premium' ? premiumFeatures : basicFeatures), defaultContent: defaultInvitationContent(tier), isSystem: true, isGlobal: true, ownerId: null, deletedAt: null }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  }));
}
