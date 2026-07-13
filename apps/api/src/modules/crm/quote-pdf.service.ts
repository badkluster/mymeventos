import path from 'path';
import PDFDocument from 'pdfkit';
import { uploadBuffer } from '../uploads/cloudinary.service';

function money(value?: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);
}

function date(value?: Date | string): string {
  if (!value) return 'A confirmar';
  return new Intl.DateTimeFormat('es-AR').format(new Date(value));
}

function pdfBuffer(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.end();
  });
}

function addSection(document: PDFKit.PDFDocument, title: string): void {
  document.moveDown(1.2).fontSize(13).fillColor('#111827').font('Helvetica-Bold').text(title);
  document.moveTo(50, document.y + 4).lineTo(545, document.y + 4).strokeColor('#e5e7eb').stroke();
  document.moveDown(0.8).fillColor('#374151').font('Helvetica');
}

export async function generateAndUploadQuotePdf(quote: any): Promise<{ pdfSecureUrl: string; pdfUrl: string; pdfPublicId: string; pdfGeneratedAt: Date }> {
  const document = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Presupuesto ${quote.quoteNumber}`, Author: 'M&M Eventos' } });
  const logoPath = path.resolve(process.cwd(), '../web/public/brand/mym-logo-dark-on-light.jpg');
  try { document.image(logoPath, 50, 40, { width: 110 }); } catch { document.fontSize(20).font('Helvetica-Bold').text('M&M Eventos', 50, 50); }
  document.fontSize(10).fillColor('#6b7280').text('Salón de Eventos', 430, 52, { align: 'right' });
  document.fontSize(18).fillColor('#111827').font('Helvetica-Bold').text('Presupuesto', 50, 135);
  document.fontSize(10).fillColor('#6b7280').font('Helvetica').text(`N° ${quote.quoteNumber}`, 50, 160).text(`Fecha: ${date(new Date())}`, 50, 176);

  document.roundedRect(330, 130, 215, 72, 12).fill('#111827');
  document.fillColor('#ffffff').fontSize(10).text('Total estimado', 350, 150);
  document.fontSize(22).font('Helvetica-Bold').text(money(quote.totalAmount), 350, 168);

  addSection(document, 'Datos del cliente y evento');
  document.fontSize(10).fillColor('#374151')
    .text(`Cliente: ${quote.contactName || 'Sin contacto'}`)
    .text(`Teléfono: ${quote.phone || 'No informado'}`)
    .text(`Email: ${quote.email || 'No informado'}`)
    .text(`Tipo de evento: ${quote.eventType || 'No informado'}`)
    .text(`Agasajado/a: ${quote.honoreeName || 'No informado'}`)
    .text(`Fecha tentativa: ${date(quote.eventDate)}`)
    .text(`Personas: ${quote.guestCount || 0}`)
    .text(`Horario: ${quote.startTime || '—'} a ${quote.endTime || '—'}`)
    .text(`Restricciones alimentarias: vegetarianos ${quote.vegetarianCount ?? 0}, veganos ${quote.veganCount ?? 0}, celíacos ${quote.celiacCount ?? 0}, intolerancia a lactosa ${quote.lactoseIntolerantCount ?? 0}`)
    .text(`Mantelería: ${quote.tableLinenColor || 'A definir'}`);

  addSection(document, 'Propuesta comercial');
  document.text(`Paquete: ${quote.packageName || 'Personalizado'}`);
  if (quote.pricingMode === 'fixed') {
    document.text(`Modalidad: precio total del evento`)
      .text(`Precio total base: ${money(quote.fixedPrice)}`)
      .text(`Descuento: ${quote.discountPercentage ?? 0}%`)
      .text(`Precio total final: ${money(quote.finalFixedPrice ?? quote.totalAmount)}`);
  } else {
    document.text(`Modalidad: precio por persona`)
      .text(`Valor por persona: ${money(quote.pricePerPerson)}`)
      .text(`Descuento: ${quote.discountPercentage ?? 0}%`)
      .text(`Valor final por persona: ${money(quote.finalPricePerPerson)}`);
  }
  document.text(`Seña: ${money(quote.depositAmount)}`)
    .text(`Saldo: ${money(quote.balanceAmount)}`);

  if (quote.promotionText || quote.giftText || quote.paymentTerms) {
    addSection(document, 'Beneficios y condiciones');
    if (quote.promotionText) document.text(`Promoción: ${quote.promotionText}`);
    if (quote.giftText) document.text(`Regalo: ${quote.giftText}`);
    if (quote.paymentTerms) document.text(`Condiciones de pago: ${quote.paymentTerms}`);
  }

  if (quote.menuSections?.length) {
    addSection(document, 'Menú');
    for (const section of quote.menuSections) {
      document.font('Helvetica-Bold').text(section.title ?? section.name ?? 'Sección');
      document.font('Helvetica').text((section.items ?? []).join(' · '));
      document.moveDown(0.5);
    }
  }

  if (quote.includedServices?.length) {
    addSection(document, 'Servicios incluidos');
    for (const service of quote.includedServices) document.text(`• ${service}`);
  }

  if (quote.notes) {
    addSection(document, 'Observaciones');
    document.text(quote.notes);
  }

  document.fontSize(9).fillColor('#6b7280').text('Este presupuesto es informativo y queda sujeto a disponibilidad de fecha, condiciones comerciales vigentes y confirmación mediante seña.', 50, 760, { width: 495, align: 'center' });
  const buffer = await pdfBuffer(document);
  const uploaded = await uploadBuffer(buffer, {
    folder: `mym-eventos/quotes/${quote._id}`,
    resource_type: 'raw',
    public_id: `presupuesto-${quote.quoteNumber}`,
    overwrite: true,
    format: 'pdf'
  });
  return { pdfSecureUrl: uploaded.secureUrl, pdfUrl: uploaded.url, pdfPublicId: uploaded.publicId, pdfGeneratedAt: new Date() };
}
