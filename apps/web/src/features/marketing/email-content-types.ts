export type EmailBlockType = 'logo' | 'heading' | 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'columns' | 'promotion' | 'social' | 'contact' | 'footer';

export type EmailBlockData = {
  url?: string;
  link?: string;
  width?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  alt?: string;
  label?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  thickness?: number;
  height?: number;
  leftText?: string;
  rightText?: string;
  showCode?: boolean;
  showButton?: boolean;
  instagramUrl?: string;
  facebookUrl?: string;
  whatsappUrl?: string;
  showAddress?: boolean;
  showPhone?: boolean;
  showWhatsApp?: boolean;
  showUnsubscribe?: boolean;
};

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  enabled: boolean;
  backgroundColor?: string;
  paddingY: number;
  paddingX: number;
  align: 'left' | 'center' | 'right';
  data: EmailBlockData;
};

export type EmailContentSettings = {
  backgroundColor: string;
  contentBackgroundColor: string;
  fontFamily: string;
  maxWidth: number;
};

export type EmailContent = { blocks: EmailBlock[]; settings: EmailContentSettings };

export const DEFAULT_EMAIL_SETTINGS: EmailContentSettings = {
  backgroundColor: '#F4F4F5',
  contentBackgroundColor: '#FFFFFF',
  fontFamily: 'Arial, Helvetica, sans-serif',
  maxWidth: 600
};

export const EMAIL_BLOCK_LABELS: Record<EmailBlockType, string> = {
  logo: 'Logo', heading: 'Título', text: 'Texto', image: 'Imagen', button: 'Botón', divider: 'Separador',
  spacer: 'Espaciado', columns: 'Columnas', promotion: 'Bloque de promoción', social: 'Redes sociales',
  contact: 'Datos de contacto', footer: 'Pie e institucional'
};

export const AVAILABLE_EMAIL_BLOCKS: EmailBlockType[] = ['heading', 'text', 'image', 'button', 'divider', 'spacer', 'columns', 'promotion', 'social', 'contact', 'logo', 'footer'];

function blockData(type: EmailBlockType): EmailBlockData {
  switch (type) {
    case 'logo': return { url: '{{companyLogoUrl}}', width: 160, link: '{{buttonUrl}}' };
    case 'heading': return { text: 'Título de la sección', fontSize: 26, color: '#18181B' };
    case 'text': return { text: 'Hola {{firstName}}, escribí acá el contenido de tu comunicación.', fontSize: 15, color: '#3F3F46' };
    case 'image': return { url: '', alt: '', link: '' };
    case 'button': return { label: 'Ver más', url: '{{buttonUrl}}', backgroundColor: '#18181B', textColor: '#FFFFFF', borderRadius: 8 };
    case 'divider': return { color: '#E4E4E7', thickness: 1 };
    case 'spacer': return { height: 24 };
    case 'columns': return { leftText: 'Primera columna', rightText: 'Segunda columna' };
    case 'promotion': return { showCode: true, showButton: true };
    case 'social': return { instagramUrl: '', facebookUrl: '', whatsappUrl: '' };
    case 'contact': return { showAddress: true, showPhone: true, showWhatsApp: true };
    case 'footer': return { text: '{{companyName}} — {{salonAddress}}', showUnsubscribe: true };
    default: return {};
  }
}

export function createEmailBlock(type: EmailBlockType): EmailBlock {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    enabled: true,
    paddingY: type === 'divider' || type === 'spacer' ? 0 : 16,
    paddingX: 24,
    align: type === 'button' || type === 'logo' ? 'center' : 'left',
    data: blockData(type)
  };
}

export function emptyEmailContent(): EmailContent {
  return {
    blocks: [
      { ...createEmailBlock('logo') },
      { ...createEmailBlock('heading'), data: { text: 'Título promocional', fontSize: 28, color: '#18181B' } },
      { ...createEmailBlock('text') },
      { ...createEmailBlock('button') },
      { ...createEmailBlock('contact') },
      { ...createEmailBlock('footer') }
    ].map((block, index) => ({ ...block, id: `${block.type}-${index}-${Math.random().toString(36).slice(2, 8)}` })),
    settings: { ...DEFAULT_EMAIL_SETTINGS }
  };
}
