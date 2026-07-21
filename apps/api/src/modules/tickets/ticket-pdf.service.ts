import { createHash, createHmac } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { uploadBuffer } from '../uploads/cloudinary.service';
import { DigitalTicket, TicketOrder, TicketPublication } from './ticket.models';
import { env } from '../../config/env';

const collect = (document: PDFKit.PDFDocument) => new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; document.on('data', (chunk) => chunks.push(Buffer.from(chunk))); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); document.end(); });
const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function render(tickets: any[], publication: any, order: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 32, autoFirstPage: false });
  for (const ticket of tickets) {
    doc.addPage();
    const dark = publication.appearance?.backgroundColor ?? '#18181b'; const accent = publication.appearance?.secondaryColor ?? '#d4a373';
    doc.rect(32, 32, 531, 310).fill(dark); doc.fillColor(accent).rect(32, 32, 531, 8).fill();
    doc.fillColor('#fff').fontSize(25).text(publication.title ?? 'M&M Eventos', 56, 65, { width: 330 });
    doc.fontSize(11).fillColor('#e4e4e7').text(`${new Date(publication.startsAt).toLocaleString('es-AR')}\n${publication.venueName ?? ''}\n${publication.address ?? ''}`, 56, 130, { width: 300 });
    doc.fillColor('#fff').fontSize(16).text(ticket.ticketTypeSnapshot?.name ?? 'Entrada', 56, 235);
    doc.fontSize(11).fillColor('#e4e4e7').text(ticket.attendeeName ?? order.buyer.name, 56, 262);
    doc.fillColor('#fff').rect(410, 75, 125, 190).fill();
    const token = createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(`ticket:${ticket.ticketCode}:${ticket.qrVersion ?? 1}`).digest('base64url');
    const qr = await QRCode.toDataURL(`${process.env.CORS_ORIGIN ?? ''}/entrada/${token}`, { errorCorrectionLevel: 'H', margin: 2, width: 280 });
    doc.image(Buffer.from(qr.split(',')[1], 'base64'), 423, 88, { width: 100 }); doc.fillColor('#18181b').fontSize(8).text(ticket.ticketCode, 417, 205, { width: 110, align: 'center' });
    doc.fillColor('#52525b').fontSize(9).text(`Orden ${order.publicId} · Presentar desde el teléfono o impresa.`, 40, 370);
  }
  return collect(doc);
}

export async function generateOrderTicketPdfs(orderId: string) {
  const order: any = await TicketOrder.findById(orderId); if (!order || order.status !== 'paid') throw new Error('La orden no está pagada.');
  const [publicationResult, tickets] = await Promise.all([TicketPublication.findById(order.publicationId).lean(), DigitalTicket.find({ orderId, status: { $in: ['issued', 'checked_in'] }, deletedAt: null }).sort({ orderLineId: 1, unitIndex: 1 }).lean()]); const publication: any = publicationResult;
  if (!publication || !tickets.length) throw new Error('No hay entradas emitidas para documentar.');
  await TicketOrder.updateOne({ _id: orderId }, { $set: { documentStatus: 'generating' } });
  for (const ticket of tickets) { if (ticket.pdf?.storageKey) continue; const buffer = await render([ticket], publication, order); const filename = `${safe(publication.title)}-${ticket.ticketCode}.pdf`; const uploaded = await uploadBuffer(buffer, { folder: `digital-tickets/${publication._id}/orders/${order.publicId}/tickets/${ticket.ticketCode}`, public_id: `ticket-v1`, resource_type: 'raw', format: 'pdf', overwrite: true }); await DigitalTicket.updateOne({ _id: ticket._id }, { $set: { pdf: { storageKey: uploaded.publicId, url: uploaded.secureUrl, filename, mimeType: 'application/pdf', sizeBytes: uploaded.bytes, layout: 'ticket', version: 1, generatedAt: new Date(), checksum: createHash('sha256').update(buffer).digest('hex') } } }); }
  const combined = await render(tickets, publication, order); const filename = `Entradas-${order.publicId}.pdf`; const uploaded = await uploadBuffer(combined, { folder: `digital-tickets/${publication._id}/orders/${order.publicId}/combined`, public_id: 'order-tickets-v1', resource_type: 'raw', format: 'pdf', overwrite: true }); await TicketOrder.updateOne({ _id: orderId }, { $set: { documentStatus: 'generated', documentsGeneratedAt: new Date(), ticketsPdf: { storageKey: uploaded.publicId, url: uploaded.secureUrl, filename, mimeType: 'application/pdf', sizeBytes: uploaded.bytes, layout: 'a4_printable', ticketCount: tickets.length, version: 1, generatedAt: new Date(), checksum: createHash('sha256').update(combined).digest('hex') } } }); return { filename, tickets: tickets.length };
}
