import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { uploadBuffer } from '../uploads/cloudinary.service';

const page = { width: 595.28, height: 841.89, left: 46, right: 549, bottom: 782 };
const color = { ink: '#101827', gold: '#b8965a', goldSoft: '#f5eedf', ivory: '#fcfbf8', card: '#f4f6f8', line: '#dfe3e8', muted: '#667085', white: '#ffffff' };

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
function date(value?: Date | string): string { if (!value) return 'A confirmar'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'A confirmar' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(parsed); }
function value(input?: unknown, fallback = 'A definir'): string { return typeof input === 'string' && input.trim() ? input.trim() : fallback; }
function pdfBuffer(document: PDFKit.PDFDocument): Promise<Buffer> { return new Promise((resolve, reject) => { const chunks: Buffer[] = []; document.on('data', (chunk) => chunks.push(Buffer.from(chunk))); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); document.end(); }); }

function logo(document: PDFKit.PDFDocument, x: number, y: number, width = 86): void {
  const candidates = [path.resolve(process.cwd(), '../web/public/brand/mym-logo-light-on-dark.jpg'), path.resolve(process.cwd(), 'apps/web/public/brand/mym-logo-light-on-dark.jpg')];
  const asset = candidates.find(fs.existsSync);
  if (asset) document.image(asset, x, y, { width });
  else document.font('Helvetica-Bold').fontSize(17).fillColor(color.white).text('M&M EVENTOS', x, y + 10);
}
function footer(document: PDFKit.PDFDocument, current: number, total: number): void {
  document.save().moveTo(page.left, page.bottom - 20).lineTo(page.right, page.bottom - 20).strokeColor(color.line).lineWidth(.6).stroke()
    .font('Helvetica').fontSize(7.5).fillColor(color.muted).text('M&M Eventos · Propuesta sujeta a disponibilidad y acreditación de la seña.', page.left, page.bottom - 10, { width: 365 })
    .text(`Página ${current} de ${total}`, 440, page.bottom - 10, { width: 109, align: 'right' }).restore();
}
function miniHeader(document: PDFKit.PDFDocument, quote: any): void {
  document.rect(0, 0, page.width, 66).fill(color.ink); logo(document, page.left, 10, 48);
  document.font('Helvetica').fontSize(8).fillColor('#d8c4a0').text('PROPUESTA COMERCIAL', 325, 18, { width: 224, align: 'right', characterSpacing: 1 });
  document.font('Helvetica-Bold').fontSize(11).fillColor(color.white).text(quote.quoteNumber, 325, 33, { width: 224, align: 'right' });
}
function ensure(document: PDFKit.PDFDocument, quote: any, height: number): void { if (document.y + height <= page.bottom - 27) return; document.addPage(); miniHeader(document, quote); document.y = 91; }
function section(document: PDFKit.PDFDocument, quote: any, title: string, hint?: string): void {
  ensure(document, quote, 42); const y = document.y;
  document.font('Helvetica-Bold').fontSize(12).fillColor(color.ink).text(title, page.left, y);
  if (hint) document.font('Helvetica').fontSize(8.5).fillColor(color.muted).text(hint, 280, y + 2, { width: 269, align: 'right' });
  document.moveTo(page.left, y + 22).lineTo(page.right, y + 22).strokeColor(color.gold).lineWidth(1).stroke(); document.y = y + 32;
}
function labeled(document: PDFKit.PDFDocument, label: string, content: string, x: number, y: number, width: number): void {
  document.font('Helvetica-Bold').fontSize(7.5).fillColor(color.muted).text(label.toUpperCase(), x, y, { width, characterSpacing: .35 });
  document.font('Helvetica').fontSize(9.4).fillColor(color.ink).text(content, x, y + 11, { width, height: 24, ellipsis: true });
}
function card(document: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, fill = color.card): void { document.roundedRect(x, y, width, height, 9).fill(fill); }
function listCard(document: PDFKit.PDFDocument, quote: any, title: string, items: string[], x: number, width: number): number {
  const cleaned = items.filter((item) => value(item, '') !== ''); if (!cleaned.length) return 0;
  const contentHeight = cleaned.reduce((total, item) => total + Math.max(15, document.heightOfString(item, { width: width - 35 }) + 4), 0);
  const height = Math.max(53, 31 + contentHeight); ensure(document, quote, height + 8); const y = document.y;
  card(document, x, y, width, height, color.ivory); document.roundedRect(x, y, 4, height, 2).fill(color.gold);
  document.font('Helvetica-Bold').fontSize(9.5).fillColor(color.ink).text(title, x + 15, y + 12, { width: width - 28 });
  let cursor = y + 29;
  for (const item of cleaned) { document.circle(x + 18, cursor + 4, 1.6).fill(color.gold); document.font('Helvetica').fontSize(8.7).fillColor('#344054').text(item, x + 27, cursor, { width: width - 37 }); cursor += Math.max(15, document.heightOfString(item, { width: width - 37 }) + 4); }
  return height;
}
function titleFor(quote: any): string { const honoree = value(quote.honoreeName, ''); if (honoree) return `Propuesta para ${quote.eventType ? `el ${String(quote.eventType).toLowerCase()} de ` : ''}${honoree}`; return `Propuesta para tu ${quote.eventType ? String(quote.eventType).toLowerCase() : 'evento'}`; }

export async function generateAndUploadQuotePdf(quote: any): Promise<{ pdfSecureUrl: string; pdfUrl: string; pdfPublicId: string; pdfGeneratedAt: Date }> {
  const document = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Presupuesto ${quote.quoteNumber}`, Author: 'M&M Eventos', Subject: 'Propuesta comercial' } });
  document.rect(0, 0, page.width, 128).fill(color.ink); logo(document, page.left, 30, 88);
  document.font('Helvetica').fontSize(8.5).fillColor('#dbc9a9').text('PROPUESTA COMERCIAL', 313, 39, { width: 236, align: 'right', characterSpacing: 1.2 });
  document.font('Helvetica-Bold').fontSize(17).fillColor(color.white).text(`Presupuesto ${quote.quoteNumber}`, 220, 57, { width: 329, align: 'right' });
  document.font('Helvetica').fontSize(8.5).fillColor('#d8dde6').text(`Emitido el ${date(new Date())}`, 220, 82, { width: 329, align: 'right' });
  const introductionY = 153;
  const investmentY = 211;
  document.font('Helvetica-Bold').fontSize(18).fillColor(color.ink).text(titleFor(quote), page.left, introductionY, { width: 450 });
  document.font('Helvetica').fontSize(9.5).fillColor(color.muted).text(`${date(quote.eventDate)} · ${quote.guestCount || '—'} invitados`, page.left, introductionY + 30, { width: 450 });
  document.y = investmentY;

  card(document, page.left, document.y, page.right - page.left, 113, color.card);
  document.font('Helvetica').fontSize(8).fillColor(color.muted).text('INVERSIÓN TOTAL', page.left + 19, investmentY + 17, { characterSpacing: 1 });
  document.font('Helvetica-Bold').fontSize(25).fillColor(color.ink).text(money(quote.totalAmount), page.left + 19, investmentY + 34);
  document.font('Helvetica').fontSize(8.7).fillColor(color.muted).text(quote.pricingMode === 'fixed' ? 'Valor final del evento' : `${quote.guestCount || 0} personas · ${money(quote.finalPricePerPerson)} por persona`, 284, investmentY + 21, { width: 245, align: 'right' });
  if (quote.pricingMode !== 'fixed' && Number(quote.pricePerPerson) > Number(quote.finalPricePerPerson)) document.font('Helvetica').fontSize(8).fillColor(color.muted).text(`Antes ${money(quote.pricePerPerson)} · ${quote.discountPercentage ?? 0}% off`, 284, investmentY + 38, { width: 245, align: 'right' });
  document.font('Helvetica-Bold').fontSize(8.7).fillColor(color.gold).text(`Válido hasta ${date(quote.validUntil)}`, 284, investmentY + 66, { width: 245, align: 'right' });
  document.font('Helvetica').fontSize(8.4).fillColor(color.muted).text(`Seña ${money(quote.depositAmount)} · Saldo ${money(quote.balanceAmount)}`, page.left + 19, investmentY + 83, { width: 480 });
  document.y = investmentY + 137;

  section(document, quote, 'Datos del evento');
  const details: Array<[string, string]> = [['Cliente', value(quote.contactName)], ['Agasajado/a', value(quote.honoreeName)], ['Tipo de evento', value(quote.eventType)], ['Fecha tentativa', date(quote.eventDate)], ['Horario', quote.startTime || quote.endTime ? `${quote.startTime || 'A definir'} a ${quote.endTime || 'A definir'}` : 'A definir'], ['Invitados', quote.guestCount ? `${quote.guestCount} personas` : 'A confirmar'], ['Mantelería', value(quote.tableLinenColor)], ['Restricciones', `Veg. ${quote.vegetarianCount ?? 0} · Veganas ${quote.veganCount ?? 0} · Celíacos ${quote.celiacCount ?? 0} · Lactosa ${quote.lactoseIntolerantCount ?? 0}`]];
  const gridY = document.y; card(document, page.left, gridY, page.right - page.left, 112, color.ivory);
  details.forEach(([label, content], index) => labeled(document, label, content, page.left + 15 + (index % 2) * 246, gridY + 13 + Math.floor(index / 2) * 26, 225)); document.y = gridY + 127;

  section(document, quote, 'Propuesta seleccionada');
  const proposalY = document.y; card(document, page.left, proposalY, page.right - page.left, 58, color.goldSoft);
  labeled(document, 'Paquete', value(quote.packageName, 'Propuesta personalizada'), page.left + 15, proposalY + 12, 220); labeled(document, 'Modalidad', quote.pricingMode === 'fixed' ? 'Precio final del evento' : 'Precio por persona', 285, proposalY + 12, 135); labeled(document, 'Condiciones', value(quote.paymentTerms, 'A coordinar'), 428, proposalY + 12, 105); document.y = proposalY + 72;

  const hasSecondPage = Boolean(quote.menuSections?.some((item: any) => item.items?.length) || quote.includedServices?.length || quote.promotionText || quote.giftText || quote.notes || quote.lineItems?.length);
  if (hasSecondPage) {
    document.addPage(); miniHeader(document, quote); document.y = 91;
    const menu = (quote.menuSections ?? []).filter((item: any) => item.items?.length);
    if (menu.length) {
      section(document, quote, 'Menú incluido', 'Una experiencia pensada para disfrutar');
      for (let index = 0; index < menu.length; index += 2) { const y = document.y; const leftHeight = listCard(document, quote, value(menu[index].title ?? menu[index].name, 'Menú'), menu[index].items, page.left, 245); const right = menu[index + 1]; if (right) { document.y = y; const rightHeight = listCard(document, quote, value(right.title ?? right.name, 'Menú'), right.items, 304, 245); document.y = y + Math.max(leftHeight, rightHeight) + 9; } else document.y = y + leftHeight + 9; }
    }
    if (quote.includedServices?.length) { section(document, quote, 'Servicios incluidos'); for (let index = 0; index < quote.includedServices.length; index += 2) { ensure(document, quote, 28); const y = document.y; card(document, page.left, y, 245, 24, color.card); card(document, 304, y, 245, 24, color.card); document.font('Helvetica-Bold').fontSize(8.3).fillColor(color.gold).text('✓', page.left + 10, y + 8); document.font('Helvetica').fontSize(8.5).fillColor(color.ink).text(quote.includedServices[index], page.left + 25, y + 8, { width: 210, ellipsis: true }); if (quote.includedServices[index + 1]) { document.font('Helvetica-Bold').fillColor(color.gold).text('✓', 314, y + 8); document.font('Helvetica').fillColor(color.ink).text(quote.includedServices[index + 1], 329, y + 8, { width: 210, ellipsis: true }); } document.y = y + 31; } }
    const benefits = [['Promoción', quote.promotionText], ['Beneficio especial', quote.giftText], ['Observaciones', quote.notes]].filter((item) => value(item[1], '') !== '');
    if (benefits.length) { section(document, quote, 'Beneficios especiales'); for (const [label, content] of benefits) { const height = Math.max(43, document.heightOfString(String(content), { width: 455 }) + 28); ensure(document, quote, height + 8); const y = document.y; card(document, page.left, y, page.right - page.left, height, color.goldSoft); document.font('Helvetica-Bold').fontSize(8.5).fillColor(color.gold).text(label.toUpperCase(), page.left + 15, y + 11); document.font('Helvetica').fontSize(8.8).fillColor(color.ink).text(String(content), page.left + 15, y + 23, { width: 470 }); document.y = y + height + 8; } }
    ensure(document, quote, 62); const ctaY = document.y; document.roundedRect(page.left, ctaY, page.right - page.left, 56, 9).fill(color.ink); document.font('Helvetica-Bold').fontSize(11).fillColor(color.white).text(`Reservá la fecha con una seña de ${money(quote.depositAmount)}`, page.left + 16, ctaY + 14); document.font('Helvetica').fontSize(8).fillColor('#e1d6bf').text('La fecha queda sujeta a disponibilidad hasta la acreditación de la seña.', page.left + 16, ctaY + 32); document.y = ctaY + 68;
  }

  const pages = document.bufferedPageRange(); for (let index = 0; index < pages.count; index += 1) { document.switchToPage(index); footer(document, index + 1, pages.count); }
  const buffer = await pdfBuffer(document);
  const uploaded = await uploadBuffer(buffer, { folder: `mym-eventos/quotes/${quote._id}`, resource_type: 'raw', public_id: `presupuesto-${quote.quoteNumber}`, overwrite: true, format: 'pdf' });
  return { pdfSecureUrl: uploaded.secureUrl, pdfUrl: uploaded.url, pdfPublicId: uploaded.publicId, pdfGeneratedAt: new Date() };
}
