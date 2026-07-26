import { connectDatabase, disconnectDatabase } from '../db/connection';
import { MarketingTemplate, MarketingSettings } from '../modules/marketing/marketing.models';

// Minimal, local mirror of apps/web's email block shape/renderer — kept in sync
// by hand since the two apps don't share a UI package. Only the block types
// actually used by the seed templates below are implemented.
type Block = { id: string; type: string; enabled: boolean; paddingY: number; paddingX: number; align: string; data: Record<string, any> };
const settings = { backgroundColor: '#F4F4F5', contentBackgroundColor: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif', maxWidth: 600 };

function block(type: string, data: Record<string, any>, overrides: Partial<Block> = {}): Block {
  return { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, enabled: true, paddingY: type === 'divider' || type === 'spacer' ? 0 : 16, paddingX: 24, align: type === 'button' || type === 'logo' ? 'center' : 'left', data, ...overrides };
}
function contactBlock() { return block('contact', { showAddress: true, showPhone: true, showWhatsApp: true }); }
function footerBlock(text: string) { return block('footer', { text, showUnsubscribe: true }); }
function logoBlock() { return block('logo', { url: '{{companyLogoUrl}}', width: 160, link: '{{buttonUrl}}' }); }

function renderBlocksToHtml(blocks: Block[]): string {
  const escape = (v: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nl2br = (v: string) => escape(v).replace(/\n/g, '<br />');
  const row = (inner: string, b: Block) => `<tr><td align="${b.align}" style="padding:${b.paddingY}px ${b.paddingX}px;">${inner}</td></tr>`;
  const rows = blocks.map((b) => {
    switch (b.type) {
      case 'logo': return row(`<img src="${escape(b.data.url)}" width="${b.data.width}" alt="Logo" style="display:inline-block;max-width:100%;" />`, b);
      case 'heading': return row(`<h1 style="margin:0;font-size:${b.data.fontSize || 26}px;color:${b.data.color || '#18181B'};font-family:${settings.fontFamily};">${nl2br(b.data.text)}</h1>`, b);
      case 'text': return row(`<p style="margin:0;font-size:${b.data.fontSize || 15}px;line-height:1.6;color:${b.data.color || '#3F3F46'};font-family:${settings.fontFamily};">${nl2br(b.data.text)}</p>`, b);
      case 'image': return row(`<img src="${escape(b.data.url)}" alt="${escape(b.data.alt ?? '')}" style="display:block;max-width:100%;border:0;" />`, b);
      case 'button': return row(`<a href="${escape(b.data.url)}" style="display:inline-block;padding:12px 28px;background-color:${b.data.backgroundColor || '#18181B'};color:${b.data.textColor || '#FFFFFF'};font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;font-family:${settings.fontFamily};">${escape(b.data.label)}</a>`, b);
      case 'divider': return row(`<hr style="border:none;border-top:1px solid #E4E4E7;margin:0;" />`, b);
      case 'spacer': return `<tr><td style="height:${b.data.height ?? 24}px;font-size:0;">&nbsp;</td></tr>`;
      case 'promotion': return row(`<table role="presentation" width="100%" style="border:1px solid #E4E4E7;border-radius:12px;"><tr><td style="padding:20px;font-family:${settings.fontFamily};"><p style="margin:0 0 8px;font-size:20px;font-weight:700;">{{promotionTitle}}</p><p style="margin:0 0 12px;font-size:14px;color:#3F3F46;">{{promotionDescription}}</p><p style="margin:0 0 12px;font-size:13px;color:#71717A;">Código: <strong>{{promotionCode}}</strong> · Válido hasta {{promotionValidUntil}}</p><a href="{{buttonUrl}}" style="display:inline-block;padding:10px 22px;background-color:#18181B;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">Quiero aprovecharla</a></td></tr></table>`, b);
      case 'contact': return row(`<p style="margin:0;font-size:12px;color:#71717A;font-family:${settings.fontFamily};">{{salonAddress}}<br />{{salonPhone}}<br />WhatsApp: {{salonWhatsApp}}</p>`, b);
      case 'footer': return row(`<p style="margin:0 0 6px;font-size:12px;color:#A1A1AA;font-family:${settings.fontFamily};">${nl2br(b.data.text)}</p><p style="margin:0;font-size:12px;"><a href="{{unsubscribeUrl}}" style="color:#A1A1AA;">Dejar de recibir estas comunicaciones</a></p>`, b);
      default: return '';
    }
  }).join('');
  return `<table role="presentation" width="100%" style="background-color:${settings.backgroundColor};padding:24px 0;"><tr><td align="center"><table role="presentation" width="${settings.maxWidth}" style="max-width:${settings.maxWidth}px;width:100%;background-color:${settings.contentBackgroundColor};border-radius:12px;overflow:hidden;">${rows}</table></td></tr></table>`;
}
function renderBlocksToText(blocks: Block[]): string {
  return blocks.filter((b) => b.enabled).map((b) => {
    if (b.type === 'heading' || b.type === 'text') return `${b.data.text}\n`;
    if (b.type === 'button') return `${b.data.label}: ${b.data.url}\n`;
    if (b.type === 'promotion') return '{{promotionTitle}}\n{{promotionDescription}}\nCódigo: {{promotionCode}}\n{{buttonUrl}}\n';
    if (b.type === 'contact') return '{{salonAddress}}\n{{salonPhone}}\n';
    if (b.type === 'footer') return `${b.data.text}\nDejar de recibir estas comunicaciones: {{unsubscribeUrl}}\n`;
    return '';
  }).filter(Boolean).join('\n');
}

type SeedTemplate = { category: string; name: string; subject: string; preheader: string; blocks: Block[] };

const templates: SeedTemplate[] = [
  {
    category: 'general_promotion', name: 'Promoción general', subject: '🎉 Una propuesta especial de M&M Eventos para tu celebración',
    preheader: 'Descuentos y beneficios pensados para tu próximo evento.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Tu evento soñado, con un beneficio especial', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, en {{companyName}} preparamos una propuesta pensada para vos. Descubrí el beneficio que tenemos para tu próxima celebración.' }),
      block('promotion', { showCode: true, showButton: true }),
      block('button', { label: 'Quiero mi presupuesto', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'special_date_discount', name: 'Descuento por fecha especial', subject: 'Beneficio especial para fechas seleccionadas 🎊',
    preheader: 'Aprovechá un descuento exclusivo reservando en las fechas disponibles.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Un beneficio pensado para fechas especiales', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, si estás pensando en organizar tu evento, tenemos una propuesta con condiciones especiales por tiempo limitado.' }),
      block('promotion', { showCode: true, showButton: true }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'salon_availability', name: 'Salón disponible', subject: 'Todavía tenemos disponibilidad para tu fecha',
    preheader: 'Consultá disponibilidad de salón antes de que se agoten los cupos.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Tenemos lugar disponible para tu evento', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, en {{salonName}} todavía quedan fechas disponibles. Contanos cuándo estás pensando tu evento y te ayudamos a reservarla.' }),
      block('button', { label: 'Consultar disponibilidad', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'quote_follow_up', name: 'Seguimiento de presupuesto', subject: '¿Pudiste revisar nuestra propuesta, {{firstName}}?',
    preheader: 'Seguimos a disposición para resolver cualquier duda sobre tu presupuesto.',
    blocks: [
      logoBlock(),
      block('heading', { text: '¿Pudiste revisar nuestra propuesta?', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, hace unos días te enviamos una propuesta para tu evento. Queremos saber si tenés dudas o si necesitás que ajustemos algo.' }),
      block('button', { label: 'Quiero retomar el contacto', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'lead_recovery', name: 'Recuperación de lead', subject: 'Seguimos acá para ayudarte a organizar tu evento',
    preheader: 'No dejes pasar la oportunidad de contarnos sobre tu evento.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Todavía podemos ayudarte a organizar tu evento', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, notamos que no llegamos a coordinar los detalles de tu evento. Si todavía te interesa, estamos para ayudarte.' }),
      block('button', { label: 'Quiero que me contacten', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'birthday', name: 'Cumpleaños', subject: '¡Feliz cumpleaños, {{firstName}}! 🎂',
    preheader: 'Tenemos un beneficio especial para celebrar tu cumpleaños con nosotros.',
    blocks: [
      logoBlock(),
      block('heading', { text: '¡Feliz cumpleaños, {{firstName}}!', fontSize: 28 }),
      block('text', { text: 'Desde {{companyName}} te deseamos un muy feliz cumpleaños. Como regalo, preparamos un beneficio especial para vos.' }),
      block('promotion', { showCode: true, showButton: true }),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'anniversary', name: 'Aniversario', subject: 'Un aniversario para celebrar 🥂',
    preheader: 'Celebrá tu aniversario con un beneficio pensado para vos.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Un aniversario para celebrar', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, queremos acompañarte en esta fecha especial con un beneficio pensado para celebrar en {{salonName}}.' }),
      block('button', { label: 'Ver el beneficio', url: '{{buttonUrl}}' }),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'venue_invitation', name: 'Invitación a conocer el salón', subject: 'Te invitamos a conocer {{salonName}}',
    preheader: 'Coordiná una visita guiada antes de decidir dónde celebrar tu evento.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Te invitamos a conocer nuestro salón', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, antes de decidir dónde celebrar tu evento, te invitamos a recorrer {{salonName}} y conocer todo lo que tenemos para ofrecerte.' }),
      block('button', { label: 'Agendar una visita', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'past_customer_benefit', name: 'Beneficio para antiguos clientes', subject: 'Gracias por confiar en nosotros, {{firstName}}',
    preheader: 'Un beneficio exclusivo para quienes ya celebraron con nosotros.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Gracias por confiar en nosotros', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, como agradecimiento por haber celebrado tu evento con {{companyName}}, preparamos un beneficio exclusivo para tu próxima celebración.' }),
      block('promotion', { showCode: true, showButton: true }),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'last_slots_available', name: 'Últimos lugares disponibles', subject: 'Últimas fechas disponibles este mes',
    preheader: 'Quedan pocas fechas disponibles, consultá antes de que se agoten.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Últimas fechas disponibles', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, en {{salonName}} nos quedan muy pocas fechas libres. Si estás organizando tu evento, te recomendamos consultar disponibilidad cuanto antes.' }),
      block('button', { label: 'Consultar fechas disponibles', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'new_package_or_service', name: 'Nuevo paquete o servicio', subject: 'Conocé nuestra nueva propuesta de paquetes',
    preheader: 'Nuevos servicios pensados para hacer tu evento inolvidable.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Conocé nuestra nueva propuesta', fontSize: 26 }),
      block('text', { text: 'Hola {{firstName}}, sumamos una nueva propuesta de paquetes y servicios en {{salonName}} para que tu evento sea inolvidable.' }),
      block('button', { label: 'Ver la propuesta', url: '{{buttonUrl}}' }),
      contactBlock(),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'informational', name: 'Campaña informativa', subject: 'Novedades de {{companyName}}',
    preheader: 'Contamos las últimas novedades de M&M Eventos.',
    blocks: [
      logoBlock(),
      block('heading', { text: 'Novedades de {{companyName}}', fontSize: 24 }),
      block('text', { text: 'Hola {{firstName}}, te compartimos las últimas novedades de {{companyName}}.' }),
      footerBlock('{{companyName}} — {{salonAddress}}')
    ]
  },
  {
    category: 'blank', name: 'Plantilla en blanco', subject: 'Asunto de tu campaña',
    preheader: '', blocks: [logoBlock(), block('text', { text: 'Escribí acá el contenido de tu campaña.' }), footerBlock('{{companyName}} — {{salonAddress}}')]
  }
];

async function seedTemplate(input: SeedTemplate) {
  const contentJson = { blocks: input.blocks, settings };
  await MarketingTemplate.findOneAndUpdate(
    { isSystemTemplate: true, category: input.category },
    {
      $set: {
        name: input.name, category: input.category, subject: input.subject, preheader: input.preheader,
        contentJson, renderedHtml: renderBlocksToHtml(input.blocks), renderedText: renderBlocksToText(input.blocks),
        isSystemTemplate: true, isActive: true
      },
      $inc: { version: 1 }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function seed() {
  await connectDatabase();
  await MarketingSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', companyName: 'M&M Eventos', senderName: 'M&M Eventos', primaryColor: '#111827', secondaryColor: '#F59E0B', buttonColor: '#111827', backgroundColor: '#F4F4F5', fontFamily: 'Arial, Helvetica, sans-serif' } },
    { upsert: true }
  );
  await Promise.all(templates.map(seedTemplate));
  console.info(`Plantillas de marketing preparadas: ${templates.length} plantillas del sistema + configuración institucional por defecto.`);
}

seed().then(disconnectDatabase).catch(async (error) => {
  console.error('Seed de plantillas de marketing falló:', error);
  await disconnectDatabase();
  process.exitCode = 1;
});
