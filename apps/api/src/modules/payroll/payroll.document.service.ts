import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { uploadBuffer } from '../uploads/cloudinary.service';
import { PayrollSettlement } from './payroll.models';

const collect = (document: PDFKit.PDFDocument) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);
  document.end();
});

function money(valueMinor: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valueMinor ?? 0) / 100);
}

function date(value?: Date | string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)) : '—';
}

function employeeName(employee: any): string {
  return employee?.fullName || [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Colaborador/a';
}

function tryBrandLogo(document: PDFKit.PDFDocument): void {
  const candidate = join(process.cwd(), '..', 'web', 'public', 'brand', 'mym-logo-dark-on-light.jpg');
  if (existsSync(candidate)) document.image(readFileSync(candidate), 42, 30, { fit: [105, 55] });
  else document.fontSize(20).fillColor('#111827').text('M&M Eventos', 42, 42);
}

function header(document: PDFKit.PDFDocument, subtitle: string): void {
  tryBrandLogo(document);
  document.fontSize(16).fillColor('#111827').text('Liquidación de Sueldos', 325, 38, { width: 230, align: 'right' });
  document.fontSize(9).fillColor('#6b7280').text(subtitle, 325, 61, { width: 230, align: 'right' });
  document.moveTo(42, 98).lineTo(553, 98).strokeColor('#d1d5db').stroke();
}

function row(document: PDFKit.PDFDocument, y: number, columns: [string, string, string, string], shade = false): number {
  if (y > 735) { document.addPage(); header(document, 'Comprobante administrativo interno'); y = 120; }
  if (shade) document.rect(42, y - 4, 511, 21).fill('#f9fafb');
  document.fillColor('#1f2937').fontSize(8.5).text(columns[0], 46, y, { width: 220 });
  document.fillColor('#4b5563').text(columns[1], 268, y, { width: 68, align: 'right' });
  document.fillColor('#4b5563').text(columns[2], 340, y, { width: 90, align: 'right' });
  document.fillColor('#111827').text(columns[3], 434, y, { width: 115, align: 'right' });
  return y + 22;
}

export async function createSettlementPdf(settlement: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  header(doc, `Comprobante ${settlement.settlementCode}`);
  doc.fillColor('#111827').fontSize(11).text(employeeName(settlement.employeeId), 42, 116);
  doc.fillColor('#4b5563').fontSize(9).text(`Período: ${date(settlement.periodStart)} al ${date(settlement.periodEnd)}\nFecha de liquidación: ${date(settlement.createdAt)}\nEstado: ${settlement.paymentStatus === 'paid' ? 'Pagado' : 'Aprobado pendiente de pago'}`, 42, 134);
  doc.fillColor('#4b5563').fontSize(9).text(`Forma de pago: ${settlement.paymentMethod ?? '—'}\nReferencia: ${settlement.paymentReference ?? '—'}\nIdentificador: ${settlement.settlementCode}`, 330, 116, { width: 223, align: 'right' });
  let y = 205;
  doc.rect(42, y - 5, 511, 20).fill('#111827');
  doc.fillColor('#fff').fontSize(8).text('CONCEPTO', 46, y, { width: 220 }).text('CANT.', 268, y, { width: 68, align: 'right' }).text('VALOR UNIT.', 340, y, { width: 90, align: 'right' }).text('IMPORTE', 434, y, { width: 115, align: 'right' });
  y += 27;
  for (const [index, entry] of (settlement.items ?? []).entries()) {
    const prefix = entry.conceptType === 'deduction' ? 'Descuento · ' : '';
    y = row(doc, y, [`${prefix}${entry.conceptName}${entry.reason ? ` — ${entry.reason}` : ''}`, `${entry.quantity} ${entry.unit}`, money(entry.unitAmountMinor, settlement.currency), `${entry.conceptType === 'deduction' ? '-' : ''}${money(entry.subtotalMinor, settlement.currency)}`], index % 2 === 0);
  }
  y += 12;
  const totals = [
    ['Base', money(settlement.baseAmountMinor, settlement.currency)],
    ['Haberes', money(settlement.earningsAmountMinor, settlement.currency)],
    ['Descuentos', `-${money(settlement.deductionsAmountMinor, settlement.currency)}`],
    ['Total bruto', money(settlement.grossAmountMinor, settlement.currency)],
    ['Total neto', money(settlement.netAmountMinor, settlement.currency)]
  ];
  for (const [label, value] of totals) {
    doc.fontSize(label === 'Total neto' ? 12 : 10).fillColor(label === 'Total neto' ? '#111827' : '#4b5563').text(label, 340, y, { width: 90, align: 'right' }).text(value, 434, y, { width: 115, align: 'right' });
    y += label === 'Total neto' ? 22 : 16;
  }
  doc.moveTo(42, 750).lineTo(553, 750).strokeColor('#d1d5db').stroke();
  doc.fontSize(7.5).fillColor('#6b7280').text('Comprobante administrativo interno. No constituye recibo oficial, documento fiscal ni comprobante de aportes, impuestos o cargas sociales.', 42, 760, { width: 511, align: 'center' });
  return collect(doc);
}

export async function storeSettlementReceipt(settlementId: string): Promise<any> {
  const settlement: any = await PayrollSettlement.findById(settlementId).populate('employeeId', 'firstName lastName fullName');
  if (!settlement) throw new Error('Liquidación no encontrada.');
  if (settlement.status !== 'approved') throw new Error('El comprobante sólo puede generarse para liquidaciones aprobadas.');
  if (settlement.receipt?.secureUrl) return settlement.receipt;
  const buffer = await createSettlementPdf(settlement);
  const uploaded = await uploadBuffer(buffer, {
    folder: `payroll/settlements/${settlement._id}`,
    public_id: 'internal-receipt-v1',
    resource_type: 'raw',
    format: 'pdf',
    overwrite: true
  });
  const receipt = { url: uploaded.url, secureUrl: uploaded.secureUrl, publicId: uploaded.publicId, resourceType: 'raw', format: 'pdf', bytes: uploaded.bytes, filename: `${settlement.settlementCode}.pdf` };
  settlement.receipt = receipt;
  await settlement.save();
  return receipt;
}

export async function createRunPdf(run: any, settlements: any[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  header(doc, `Lote ${run.name}`);
  doc.fontSize(10).fillColor('#111827').text(`Período: ${date(run.periodStart)} al ${date(run.periodEnd)}`, 42, 116);
  let y = 150;
  doc.rect(42, y - 5, 511, 20).fill('#111827');
  doc.fillColor('#fff').fontSize(8).text('EMPLEADO', 46, y, { width: 220 }).text('HABERES', 270, y, { width: 90, align: 'right' }).text('DESCUENTOS', 364, y, { width: 90, align: 'right' }).text('NETO', 458, y, { width: 90, align: 'right' });
  y += 27;
  settlements.forEach((settlement, index) => {
    if (y > 735) { doc.addPage(); header(doc, `Lote ${run.name}`); y = 120; }
    if (index % 2 === 0) doc.rect(42, y - 4, 511, 21).fill('#f9fafb');
    doc.fillColor('#1f2937').fontSize(8.5).text(employeeName(settlement.employeeId), 46, y, { width: 220 });
    doc.fillColor('#111827').text(money(settlement.grossAmountMinor, settlement.currency), 270, y, { width: 90, align: 'right' }).text(money(settlement.deductionsAmountMinor, settlement.currency), 364, y, { width: 90, align: 'right' }).text(money(settlement.netAmountMinor, settlement.currency), 458, y, { width: 90, align: 'right' });
    y += 22;
  });
  return collect(doc);
}

function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function settlementsCsv(settlements: any[]): string {
  const rows = [['Empleado', 'Período desde', 'Período hasta', 'Estado', 'Pago', 'Bruto', 'Descuentos', 'Neto', 'Moneda']];
  for (const settlement of settlements) rows.push([employeeName(settlement.employeeId), date(settlement.periodStart), date(settlement.periodEnd), settlement.status, settlement.paymentStatus, (Number(settlement.grossAmountMinor) / 100).toFixed(2), (Number(settlement.deductionsAmountMinor) / 100).toFixed(2), (Number(settlement.netAmountMinor) / 100).toFixed(2), settlement.currency]);
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
}

export function settlementsExcelXml(settlements: any[]): string {
  const rows = [['Empleado', 'Período desde', 'Período hasta', 'Estado', 'Pago', 'Bruto', 'Descuentos', 'Neto', 'Moneda'], ...settlements.map((settlement) => [employeeName(settlement.employeeId), date(settlement.periodStart), date(settlement.periodEnd), settlement.status, settlement.paymentStatus, (Number(settlement.grossAmountMinor) / 100).toFixed(2), (Number(settlement.deductionsAmountMinor) / 100).toFixed(2), (Number(settlement.netAmountMinor) / 100).toFixed(2), settlement.currency])];
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Liquidaciones"><Table>${rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
}
