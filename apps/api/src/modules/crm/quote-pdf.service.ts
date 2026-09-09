import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { uploadBuffer } from '../uploads/cloudinary.service';

const page = { width: 595.28, height: 841.89, left: 46, right: 549, bottom: 782 };
const color = { ink: '#101827', gold: '#b8965a', goldSoft: '#f5eedf', ivory: '#fcfbf8', card: '#f4f6f8', line: '#dfe3e8', muted: '#667085', white: '#ffffff' };

const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
// `quote.eventDate`/`quote.validUntil` son fechas civiles normalizadas a medianoche UTC
// (`civilDateInput`) — sin `timeZone: 'UTC'` explícito, el huso local del proceso (Argentina,
// UTC-3) corre esa medianoche al día anterior.
function date(value?: Date | string): string { if (!value) return 'A confirmar'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'A confirmar' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(parsed); }
// A diferencia de `date()`, acá sí hay un instante real (momento de emisión) — se muestra en
// hora de Argentina (la del lector), no en el huso del proceso que generó el PDF.
function issuedDate(value: Date): string { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(value); }
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
function labeledHeight(document: PDFKit.PDFDocument, content: string, width: number): number {
  document.font('Helvetica').fontSize(9.4);
  return 11 + Math.max(12, document.heightOfString(content, { width, lineGap: 1.5 }));
}
function labeled(document: PDFKit.PDFDocument, label: string, content: string, x: number, y: number, width: number): number {
  document.font('Helvetica-Bold').fontSize(7.5).fillColor(color.muted).text(label.toUpperCase(), x, y, { width, characterSpacing: .35 });
  document.font('Helvetica').fontSize(9.4).fillColor(color.ink).text(content, x, y + 11, { width, lineGap: 1.5 });
  return labeledHeight(document, content, width);
}
function card(document: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, fill = color.card): void { document.roundedRect(x, y, width, height, 9).fill(fill); }
function serviceCardHeight(document: PDFKit.PDFDocument, content: string, width: number): number {
  document.font('Helvetica').fontSize(8.5);
  return Math.max(24, document.heightOfString(content, { width: width - 40, lineGap: 1 }) + 16);
}
function serviceCard(document: PDFKit.PDFDocument, content: string, x: number, y: number, width: number, height: number): void {
  card(document, x, y, width, height, color.card);
  document.font('Helvetica-Bold').fontSize(8.3).fillColor(color.gold).text('✓', x + 10, y + 8);
  document.font('Helvetica').fontSize(8.5).fillColor(color.ink).text(content, x + 25, y + 8, { width: width - 40, lineGap: 1 });
}
function contentThatFits(document: PDFKit.PDFDocument, content: string, width: number, maxHeight: number): [string, string] {
  document.font('Helvetica').fontSize(8.8);
  if (document.heightOfString(content, { width, lineGap: 1.5 }) <= maxHeight) return [content, ''];
  let lastBreak = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (/\s/.test(content[index])) lastBreak = index + 1;
    if (document.heightOfString(content.slice(0, index + 1), { width, lineGap: 1.5 }) > maxHeight) {
      const splitAt = Math.max(1, lastBreak || index);
      return [content.slice(0, splitAt).trimEnd(), content.slice(splitAt).trimStart()];
    }
  }
  return [content, ''];
}
function flowingLabeledCards(document: PDFKit.PDFDocument, quote: any, label: string, content: string, fill = color.goldSoft): void {
  let remaining = content;
  let continuation = false;
  do {
    ensure(document, quote, 43);
    const maxContentHeight = Math.max(12, page.bottom - 27 - document.y - 28);
    const [chunk, next] = contentThatFits(document, remaining, 473, maxContentHeight);
    const height = Math.max(43, document.heightOfString(chunk, { width: 473, lineGap: 1.5 }) + 28);
    const y = document.y;
    card(document, page.left, y, page.right - page.left, height, fill);
    document.font('Helvetica-Bold').fontSize(8.5).fillColor(color.gold).text(`${label}${continuation ? ' (continuación)' : ''}`.toUpperCase(), page.left + 15, y + 11);
    document.font('Helvetica').fontSize(8.8).fillColor(color.ink).text(chunk, page.left + 15, y + 23, { width: 473, lineGap: 1.5 });
    document.y = y + height + 8;
    remaining = next;
    continuation = true;
  } while (remaining);
}
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
  document.font('Helvetica').fontSize(8.5).fillColor('#d8dde6').text(`Emitido el ${issuedDate(new Date())}`, 220, 82, { width: 329, align: 'right' });
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

  const details: Array<[string, string]> = [['Cliente', value(quote.contactName)], ['Agasajado/a', value(quote.honoreeName)], ['Tipo de evento', value(quote.eventType)], ['Fecha tentativa', date(quote.eventDate)], ['Horario', quote.startTime || quote.endTime ? `${quote.startTime || 'A definir'} a ${quote.endTime || 'A definir'}` : 'A definir'], ['Invitados', quote.guestCount ? `${quote.guestCount} personas` : 'A confirmar'], ['Mantelería', value(quote.tableLinenColor)], ['Restricciones', `Veg. ${quote.vegetarianCount ?? 0} · Veganas ${quote.veganCount ?? 0} · Celíacos ${quote.celiacCount ?? 0} · Lactosa ${quote.lactoseIntolerantCount ?? 0}`]];
  const detailRows = Array.from({ length: Math.ceil(details.length / 2) }, (_, index) => details.slice(index * 2, index * 2 + 2));
  const detailRowHeights = detailRows.map((row) => Math.max(...row.map(([, content]) => labeledHeight(document, content, 225))));
  const detailsGridHeight = 23 + detailRowHeights.reduce((total, height) => total + height, 0) + Math.max(0, detailRows.length - 1) * 8;
  ensure(document, quote, 42 + detailsGridHeight + 15);
  section(document, quote, 'Datos del evento');
  const gridY = document.y; card(document, page.left, gridY, page.right - page.left, detailsGridHeight, color.ivory);
  let detailsCursor = gridY + 13;
  detailRows.forEach((row, rowIndex) => {
    row.forEach(([label, content], columnIndex) => labeled(document, label, content, page.left + 15 + columnIndex * 246, detailsCursor, 225));
    detailsCursor += detailRowHeights[rowIndex] + 8;
  });
  document.y = gridY + detailsGridHeight + 15;

  const packageContent = value(quote.packageName, 'Propuesta personalizada');
  const modalityContent = quote.pricingMode === 'fixed' ? 'Precio final del evento' : 'Precio por persona';
  const paymentTermsContent = value(quote.paymentTerms, 'A coordinar');
  const proposalTopRowHeight = Math.max(labeledHeight(document, packageContent, 230), labeledHeight(document, modalityContent, 230));
  const proposalTermsHeight = labeledHeight(document, paymentTermsContent, 473);
  const proposalCardHeight = 24 + proposalTopRowHeight + proposalTermsHeight;
  const maxCardHeight = page.bottom - 27 - 91;
  if (proposalCardHeight <= maxCardHeight) {
    ensure(document, quote, 42 + proposalCardHeight + 14);
    section(document, quote, 'Propuesta seleccionada');
    const proposalY = document.y; card(document, page.left, proposalY, page.right - page.left, proposalCardHeight, color.goldSoft);
    labeled(document, 'Paquete', packageContent, page.left + 15, proposalY + 12, 230);
    labeled(document, 'Modalidad', modalityContent, 304, proposalY + 12, 230);
    labeled(document, 'Condiciones', paymentTermsContent, page.left + 15, proposalY + 12 + proposalTopRowHeight + 8, 473);
    document.y = proposalY + proposalCardHeight + 14;
  } else {
    const proposalSummaryHeight = 20 + proposalTopRowHeight;
    ensure(document, quote, 42 + proposalSummaryHeight + 8);
    section(document, quote, 'Propuesta seleccionada');
    const proposalY = document.y; card(document, page.left, proposalY, page.right - page.left, proposalSummaryHeight, color.goldSoft);
    labeled(document, 'Paquete', packageContent, page.left + 15, proposalY + 12, 230);
    labeled(document, 'Modalidad', modalityContent, 304, proposalY + 12, 230);
    document.y = proposalY + proposalSummaryHeight + 8;
    flowingLabeledCards(document, quote, 'Condiciones', paymentTermsContent);
  }

  const observations = value(quote.observations, '');
  const legacyNotes = value(quote.notes, '');
  const showLegacyNotes = Boolean(legacyNotes && legacyNotes !== observations);
  const hasSecondPage = Boolean(quote.menuSections?.some((item: any) => item.items?.length) || quote.includedServices?.length || quote.promotionText || quote.giftText || observations || legacyNotes || quote.lineItems?.length);
  if (hasSecondPage) {
    document.addPage(); miniHeader(document, quote); document.y = 91;
    const menu = (quote.menuSections ?? []).filter((item: any) => item.items?.length);
    if (menu.length) {
      section(document, quote, 'Menú incluido', 'Una experiencia pensada para disfrutar');
      for (let index = 0; index < menu.length; index += 2) { const y = document.y; const leftHeight = listCard(document, quote, value(menu[index].title ?? menu[index].name, 'Menú'), menu[index].items, page.left, 245); const right = menu[index + 1]; if (right) { document.y = y; const rightHeight = listCard(document, quote, value(right.title ?? right.name, 'Menú'), right.items, 304, 245); document.y = y + Math.max(leftHeight, rightHeight) + 9; } else document.y = y + leftHeight + 9; }
    }
    if (quote.includedServices?.length) {
      section(document, quote, 'Servicios incluidos');
      for (let index = 0; index < quote.includedServices.length; index += 2) {
        const leftService = String(quote.includedServices[index]);
        const rightService = quote.includedServices[index + 1] ? String(quote.includedServices[index + 1]) : undefined;
        const rowHeight = Math.max(serviceCardHeight(document, leftService, 245), rightService ? serviceCardHeight(document, rightService, 245) : 0);
        ensure(document, quote, rowHeight + 7);
        const y = document.y;
        serviceCard(document, leftService, page.left, y, 245, rowHeight);
        if (rightService) serviceCard(document, rightService, 304, y, 245, rowHeight);
        document.y = y + rowHeight + 7;
      }
    }
    const benefits = [['Promoción', quote.promotionText], ['Beneficio especial', quote.giftText]].filter((item) => value(item[1], '') !== '');
    if (benefits.length) { section(document, quote, 'Beneficios especiales'); for (const [label, content] of benefits) flowingLabeledCards(document, quote, label, String(content)); }
    if (showLegacyNotes || observations) {
      section(document, quote, 'Observaciones');
      if (showLegacyNotes) flowingLabeledCards(document, quote, observations ? 'Notas de la propuesta' : 'Observaciones', legacyNotes);
      if (observations) flowingLabeledCards(document, quote, 'Observaciones', observations);
    }
    ensure(document, quote, 62); const ctaY = document.y; document.roundedRect(page.left, ctaY, page.right - page.left, 56, 9).fill(color.ink); document.font('Helvetica-Bold').fontSize(11).fillColor(color.white).text(`Reservá la fecha con una seña de ${money(quote.depositAmount)}`, page.left + 16, ctaY + 14); document.font('Helvetica').fontSize(8).fillColor('#e1d6bf').text('La fecha queda sujeta a disponibilidad hasta la acreditación de la seña.', page.left + 16, ctaY + 32); document.y = ctaY + 68;
  }

  const pages = document.bufferedPageRange(); for (let index = 0; index < pages.count; index += 1) { document.switchToPage(index); footer(document, index + 1, pages.count); }
  const buffer = await pdfBuffer(document);
  const uploaded = await uploadBuffer(buffer, { folder: `mym-eventos/quotes/${quote._id}`, resource_type: 'raw', public_id: `presupuesto-${quote.quoteNumber}`, overwrite: true, format: 'pdf' });
  return { pdfSecureUrl: uploaded.secureUrl, pdfUrl: uploaded.url, pdfPublicId: uploaded.publicId, pdfGeneratedAt: new Date() };
}
