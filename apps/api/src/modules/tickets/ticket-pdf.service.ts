import { createHash, createHmac } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { uploadBuffer } from '../uploads/cloudinary.service';
import { DigitalTicket, TicketOrder, TicketPublication } from './ticket.models';
import { env } from '../../config/env';

const collect = (document: PDFKit.PDFDocument) => new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; document.on('data', (chunk) => chunks.push(Buffer.from(chunk))); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); document.end(); });
const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const TICKET_PDF_VERSION = 3;
const ticketPage = { width: 792, height: 306 };

const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const isDark = (color: string) => luminance(color) < .22;
const shorten = (value: unknown, limit: number, fallback: string) => {
  const text = String(value ?? '').trim() || fallback;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};
const eventDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : undefined;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(date).replace(',', ' ·')
    : 'Fecha a confirmar';
};

function drawPerforation(doc: PDFKit.PDFDocument, color: string) {
  for (let y = 12; y < ticketPage.height - 8; y += 14) doc.circle(118, y, 2.5).fill(color);
}

function drawFallbackArtwork(doc: PDFKit.PDFDocument, surface: string, accent: string, brand: string) {
  doc.rect(118, 0, ticketPage.width - 118, ticketPage.height).fill(surface);
  doc.save().fillColor(accent).fillOpacity(.2).circle(462, -58, 190).fill().fillColor(brand).fillOpacity(.3).circle(716, 290, 170).fill().restore();
  doc.save().lineWidth(1).strokeColor(accent).strokeOpacity(.48).circle(586, 38, 118).stroke().circle(586, 38, 90).stroke().restore();
}

export function ticketPdfCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (!url.includes('res.cloudinary.com/') || !url.includes('/upload/')) return url;
  const normalized = url.replace(/f_auto(?=,|\/|\?|$)/g, 'f_jpg');
  return normalized.includes('/upload/f_jpg') ? normalized : normalized.replace('/upload/', '/upload/f_jpg,q_auto/');
}

async function coverBuffer(url?: string): Promise<Buffer | undefined> {
  const pdfUrl = ticketPdfCoverUrl(url);
  if (!pdfUrl) return undefined;
  try {
    const response = await fetch(pdfUrl, { signal: AbortSignal.timeout(8_000) });
    const contentType = response.headers.get('content-type') ?? '';
    // PDFKit accepts JPEG and PNG only. Cloudinary may otherwise negotiate WebP or AVIF.
    if (!response.ok || !['image/jpeg', 'image/png'].includes(contentType.split(';')[0].toLowerCase())) return undefined;
    const image = Buffer.from(await response.arrayBuffer());
    return image.length && image.length <= 8 * 1024 * 1024 ? image : undefined;
  } catch {
    // A ticket must remain printable even if its optional cover cannot be loaded.
    return undefined;
  }
}

export async function renderTicketPdf(tickets: any[], publication: any, order: any, cover?: Buffer): Promise<Buffer> {
  const doc = new PDFDocument({ size: [ticketPage.width, ticketPage.height], margin: 0, autoFirstPage: false, info: { Title: `Entradas · ${publication.title ?? 'M&M Eventos'}`, Author: 'M&M Eventos' } });
  for (const ticket of tickets) {
    doc.addPage();
    const configuredPrimary = isHexColor(publication.appearance?.primaryColor) ? publication.appearance.primaryColor : '#18181b';
    const accent = isHexColor(publication.appearance?.secondaryColor) ? publication.appearance.secondaryColor : '#d4a373';
    const surface = isDark(configuredPrimary) ? configuredPrimary : '#18181b';
    const accentText = isDark(accent) ? '#ffffff' : '#18181b';
    let coverApplied = false;
    if (cover) {
      try {
        doc.save().rect(118, 0, ticketPage.width - 118, ticketPage.height).clip();
        doc.image(cover, 118, 0, { cover: [ticketPage.width - 118, ticketPage.height], align: 'center', valign: 'center' });
        doc.restore();
        doc.save().fillColor('#09090b').fillOpacity(.67).rect(118, 0, ticketPage.width - 118, ticketPage.height).fill().restore();
        coverApplied = true;
      } catch {
        // Invalid image bytes must not prevent a paid ticket from being generated.
      }
    }
    if (!coverApplied) drawFallbackArtwork(doc, surface, accent, configuredPrimary);

    // El talón de la izquierda hace que el archivo se lea como una entrada incluso en una pantalla pequeña.
    doc.fillColor('#f4f4f5').rect(0, 0, 118, ticketPage.height).fill();
    doc.fillColor(accent).rect(18, 0, 9, ticketPage.height).fill();
    doc.save().rotate(-90, { origin: [72, 246] }).fillColor('#27272a').font('Helvetica-Bold').fontSize(8).text('M&M EVENTOS · ADMIT ONE', 72, 246, { width: 175, align: 'center', characterSpacing: 1.4 }).restore();
    doc.fillColor('#52525b').font('Helvetica').fontSize(7).text('ENTRADA DIGITAL', 38, 43, { width: 55, align: 'center', characterSpacing: .8 });
    drawPerforation(doc, '#f4f4f5');

    doc.fillColor(accent).rect(138, 31, 74, 21).fill();
    doc.fillColor(accentText).font('Helvetica-Bold').fontSize(7).text('ENTRADA', 138, 38, { width: 74, align: 'center', characterSpacing: 1.1 });
    const title = shorten(publication.title, 78, 'M&M Eventos');
    const titleSize = title.length > 52 ? 19 : title.length > 34 ? 23 : 28;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(titleSize).text(title, 138, 68, { width: 404, height: 64, lineGap: 2 });

    doc.fillColor('#d4d4d8').font('Helvetica-Bold').fontSize(7).text('FECHA Y HORA', 138, 145, { characterSpacing: 1 });
    doc.fillColor('#ffffff').font('Helvetica').fontSize(11).text(eventDate(publication.startsAt), 138, 157, { width: 248, ellipsis: true });
    doc.fillColor('#d4d4d8').font('Helvetica-Bold').fontSize(7).text('LUGAR', 138, 187, { characterSpacing: 1 });
    doc.fillColor('#ffffff').font('Helvetica').fontSize(11).text(shorten(publication.venueName || publication.address, 52, 'Ubicación a confirmar'), 138, 199, { width: 248, ellipsis: true });
    doc.fillColor('#d4d4d8').font('Helvetica-Bold').fontSize(7).text('TITULAR', 138, 230, { characterSpacing: 1 });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(shorten(ticket.attendeeName || order.buyer?.name, 42, 'Titular de la compra'), 138, 242, { width: 248, ellipsis: true });
    doc.fillColor('#d4d4d8').font('Helvetica').fontSize(8).text('Presentá este QR al ingresar.', 138, 274, { width: 260 });

    doc.fillColor(accent).rect(572, 31, 6, 244).fill();
    doc.roundedRect(594, 31, 170, 244, 13).fill('#ffffff');
    doc.fillColor('#52525b').font('Helvetica-Bold').fontSize(7).text('TIPO DE ENTRADA', 610, 49, { width: 138, align: 'center', characterSpacing: .9 });
    doc.fillColor('#18181b').font('Helvetica-Bold').fontSize(13).text(shorten(ticket.ticketTypeSnapshot?.name, 28, 'Entrada general'), 610, 64, { width: 138, height: 32, align: 'center' });
    const token = createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(`ticket:${ticket.ticketCode}:${ticket.qrVersion ?? 1}`).digest('base64url');
    const qr = await QRCode.toDataURL(`${process.env.CORS_ORIGIN ?? ''}/entrada/${token}`, { errorCorrectionLevel: 'H', margin: 1, width: 280 });
    doc.image(Buffer.from(qr.split(',')[1], 'base64'), 622, 102, { width: 120 });
    doc.fillColor('#18181b').font('Helvetica-Bold').fontSize(8).text(ticket.ticketCode, 606, 234, { width: 146, align: 'center', characterSpacing: .45 });
    doc.fillColor('#52525b').font('Helvetica').fontSize(7).text('VÁLIDA PARA 1 INGRESO', 606, 250, { width: 146, align: 'center', characterSpacing: .8 });
  }
  return collect(doc);
}

export async function generateOrderTicketPdfs(orderId: string) {
  const order: any = await TicketOrder.findById(orderId); if (!order || order.status !== 'paid') throw new Error('La orden no está pagada.');
  const [publicationResult, tickets] = await Promise.all([TicketPublication.findById(order.publicationId).lean(), DigitalTicket.find({ orderId, status: { $in: ['issued', 'checked_in'] }, deletedAt: null }).sort({ orderLineId: 1, unitIndex: 1 }).lean()]); const publication: any = publicationResult;
  if (!publication || !tickets.length) throw new Error('No hay entradas emitidas para documentar.');
  const cover = await coverBuffer(publication.coverImage);
  await TicketOrder.updateOne({ _id: orderId }, { $set: { documentStatus: 'generating' } });
  for (const ticket of tickets) { if (ticket.pdf?.storageKey && ticket.pdf.version >= TICKET_PDF_VERSION) continue; const buffer = await renderTicketPdf([ticket], publication, order, cover); const filename = `${safe(publication.title)}-${ticket.ticketCode}.pdf`; const uploaded = await uploadBuffer(buffer, { folder: `digital-tickets/${publication._id}/orders/${order.publicId}/tickets/${ticket.ticketCode}`, public_id: `ticket-v1`, resource_type: 'raw', format: 'pdf', overwrite: true }); await DigitalTicket.updateOne({ _id: ticket._id }, { $set: { pdf: { storageKey: uploaded.publicId, url: uploaded.secureUrl, filename, mimeType: 'application/pdf', sizeBytes: uploaded.bytes, layout: 'ticket_landscape', version: TICKET_PDF_VERSION, generatedAt: new Date(), checksum: createHash('sha256').update(buffer).digest('hex') } } }); }
  const combined = await renderTicketPdf(tickets, publication, order, cover); const filename = `Entradas-${order.publicId}.pdf`; const uploaded = await uploadBuffer(combined, { folder: `digital-tickets/${publication._id}/orders/${order.publicId}/combined`, public_id: 'order-tickets-v1', resource_type: 'raw', format: 'pdf', overwrite: true }); await TicketOrder.updateOne({ _id: orderId }, { $set: { documentStatus: 'generated', documentsGeneratedAt: new Date(), ticketsPdf: { storageKey: uploaded.publicId, url: uploaded.secureUrl, filename, mimeType: 'application/pdf', sizeBytes: uploaded.bytes, layout: 'ticket_landscape', ticketCount: tickets.length, version: TICKET_PDF_VERSION, generatedAt: new Date(), checksum: createHash('sha256').update(combined).digest('hex') } } }); return { filename, tickets: tickets.length };
}
