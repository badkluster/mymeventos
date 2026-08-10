import PDFDocument from 'pdfkit';

type ConsolidatedItem = {
  productName: string; unit: string; plannedQuantity: number; completedQuantity: number; eventCount: number;
  availableQuantity: number; missingQuantity: number; toBuyQuantity: number; toProduceQuantity: number; pendingItems: number;
};
type ConsolidatedSection = { type: string; name: string; items: ConsolidatedItem[] };

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const escapeXml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (value: unknown) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
const row = (values: unknown[]) => `<Row>${values.map(cell).join('')}</Row>`;
const headers = ['Producto', 'Unidad', 'Eventos', 'Planificado', 'Completado', 'Disponible', 'Faltante', 'A comprar', 'A producir', 'Pendientes'];

function sheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Producción';
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, Math.max(1, 31 - String(index).length - 1))} ${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function worksheet(name: string, items: ConsolidatedItem[]) {
  const totals = items.reduce((sum, item) => ({ planned: sum.planned + item.plannedQuantity, completed: sum.completed + item.completedQuantity, missing: sum.missing + item.missingQuantity }), { planned: 0, completed: 0, missing: 0 });
  const data = [
    row(headers),
    ...items.map((item) => row([item.productName, item.unit, item.eventCount, number.format(item.plannedQuantity), number.format(item.completedQuantity), number.format(item.availableQuantity), number.format(item.missingQuantity), number.format(item.toBuyQuantity), number.format(item.toProduceQuantity), item.pendingItems])),
    row(['Total', '', '', number.format(totals.planned), number.format(totals.completed), '', number.format(totals.missing), '', '', '']),
  ];
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${data.join('')}</Table></Worksheet>`;
}

export function consolidatedProductionExcel(sections: ConsolidatedSection[], title: string) {
  const used = new Set<string>();
  const totalItems = sections.flatMap((section) => section.items);
  const sheets = [worksheet(sheetName('Total consolidado', used), totalItems), ...sections.map((section) => worksheet(sheetName(section.name, used), section.items))];
  return `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${escapeXml(title)}</Title><Author>M&amp;M Eventos</Author></DocumentProperties>${sheets.join('')}</Workbook>`;
}

function collect(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

function drawHeader(document: PDFKit.PDFDocument, title: string, subtitle: string) {
  document.font('Helvetica-Bold').fontSize(17).fillColor('#18181b').text(title, 42, 34);
  document.font('Helvetica').fontSize(9).fillColor('#52525b').text(subtitle, 42, 57);
  document.moveTo(42, 76).lineTo(800, 76).strokeColor('#d4d4d8').stroke();
  document.y = 92;
}

function tableHeader(document: PDFKit.PDFDocument) {
  const columns = [42, 208, 266, 316, 378, 440, 502, 562, 626, 690];
  const labels = ['Producto', 'Unidad', 'Eventos', 'Plan', 'Hecho', 'Disp.', 'Falta', 'Comprar', 'Producir', 'Pend.'];
  document.font('Helvetica-Bold').fontSize(7).fillColor('#52525b');
  labels.forEach((label, index) => document.text(label, columns[index], document.y, { width: index === 0 ? 158 : 54, ellipsis: true }));
  document.moveDown(1.45);
  return columns;
}

export async function consolidatedProductionPdf(sections: ConsolidatedSection[], title: string, period: string) {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: title, Author: 'M&M Eventos' } });
  const result = collect(document);
  const bottom = 550;

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex) document.addPage();
    drawHeader(document, title, `${period} · ${section.name}`);
    document.font('Helvetica-Bold').fontSize(11).fillColor('#18181b').text(section.name, 42, document.y);
    document.moveDown(.8);
    let columns = tableHeader(document);
    section.items.forEach((item) => {
      if (document.y > bottom) {
        document.addPage();
        drawHeader(document, title, `${period} · ${section.name} (continuación)`);
        columns = tableHeader(document);
      }
      const y = document.y;
      const values = [item.productName, item.unit, item.eventCount, number.format(item.plannedQuantity), number.format(item.completedQuantity), number.format(item.availableQuantity), number.format(item.missingQuantity), number.format(item.toBuyQuantity), number.format(item.toProduceQuantity), item.pendingItems];
      document.font('Helvetica').fontSize(7.5).fillColor('#27272a');
      values.forEach((value, index) => document.text(String(value), columns[index], y, { width: index === 0 ? 158 : 54, ellipsis: true }));
      document.moveTo(42, y + 13).lineTo(800, y + 13).strokeColor('#e4e4e7').stroke();
      document.y = y + 17;
    });
    if (!section.items.length) document.font('Helvetica').fontSize(9).fillColor('#71717a').text('No hay ítems de producción para este tipo en el período seleccionado.');
  });
  document.end();
  return result;
}
