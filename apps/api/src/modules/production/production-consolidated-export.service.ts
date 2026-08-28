import PDFDocument from 'pdfkit';

type EventBreakdown = {
  planId: string; eventId?: string; eventName?: string; eventType?: string; customerName?: string; eventDate: string | Date;
  plannedQuantity: number; completedQuantity: number;
};
type ConsolidatedItem = {
  productName: string; supplierName?: string; unit: string; plannedQuantity: number; completedQuantity: number; eventCount: number;
  availableQuantity: number; missingQuantity: number; toBuyQuantity: number; toProduceQuantity: number; pendingItems: number;
  byEvent?: EventBreakdown[];
};
type ConsolidatedSection = { type: string; name: string; events?: EventBreakdown[]; items: ConsolidatedItem[] };

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const escapeXml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const summaryHeaders = ['Total', 'Completado', 'Disponible', 'Faltante', 'A comprar', 'A producir', 'Pendientes'];

type SpreadsheetCell = { value: unknown; style?: string; type?: 'String' | 'Number'; mergeAcross?: number };

function cell({ value, style = 'sText', type = 'String', mergeAcross }: SpreadsheetCell) {
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function row(cells: SpreadsheetCell[], height?: number) {
  return `<Row${height ? ` ss:Height="${height}"` : ''}>${cells.map(cell).join('')}</Row>`;
}

const textCell = (value: unknown, style = 'sText'): SpreadsheetCell => ({ value, style });
const numericCell = (value: number, style = 'sNumber'): SpreadsheetCell => ({ value, style, type: 'Number' });

const excelStyles = `<Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/></Style>
  <Style ss:ID="sTitle"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172554" ss:Pattern="Solid"/></Style>
  <Style ss:ID="sSubtitle"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#475569"/><Interior ss:Color="#EAF0F8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="sSection"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#1E3A5F"/><Interior ss:Color="#DCE8F5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="sMetricLabel"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="8" ss:Bold="1" ss:Color="#475569"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E1EC"/></Borders></Style>
  <Style ss:ID="sMetricNumber"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E1EC"/></Borders></Style>
  <Style ss:ID="sMetricInteger"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E1EC"/></Borders></Style>
  <Style ss:ID="sMetricPercent"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/><NumberFormat ss:Format="0.0%"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E1EC"/></Borders></Style>
  <Style ss:ID="sHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#172554"/></Borders></Style>
  <Style ss:ID="sText"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="sEventNumber"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E3A5F"/><Interior ss:Color="#F8FBFF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCE8F5"/></Borders></Style>
  <Style ss:ID="sEmpty"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#94A3B8"/><Interior ss:Color="#F8FBFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DCE8F5"/></Borders></Style>
  <Style ss:ID="sNumber"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="sInteger"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="sAttention"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FEF2F2" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/></Borders></Style>
  <Style ss:ID="sAction"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#92400E"/><Interior ss:Color="#FFFBEB" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/></Borders></Style>
  <Style ss:ID="sPending"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#6B21A8"/><Interior ss:Color="#FAF5FF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E9D5FF"/></Borders></Style>
  <Style ss:ID="sTotalLabel"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#DCE8F5" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#93B4D5"/></Borders></Style>
  <Style ss:ID="sTotalNumber"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#DCE8F5" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#93B4D5"/></Borders></Style>
  <Style ss:ID="sTotalInteger"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#DCE8F5" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#93B4D5"/></Borders></Style>
</Styles>`;

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

function eventDateLabel(event: EventBreakdown) {
  const date = new Date(event.eventDate);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(date);
}

function eventLabel(event: EventBreakdown) {
  const name = event.customerName || event.eventName || event.eventType || 'Evento';
  const date = eventDateLabel(event);
  return date ? `${name}\n${date}` : name;
}

function sortedEvents(events: EventBreakdown[]) {
  return [...events].sort((left, right) => new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime());
}

function worksheet(name: string, items: ConsolidatedItem[], events: EventBreakdown[], title: string, period: string, generatedAt: string) {
  const totals = items.reduce((sum, item) => ({
    planned: sum.planned + item.plannedQuantity,
    completed: sum.completed + item.completedQuantity,
    available: sum.available + item.availableQuantity,
    missing: sum.missing + item.missingQuantity,
    toBuy: sum.toBuy + item.toBuyQuantity,
    toProduce: sum.toProduce + item.toProduceQuantity,
    pending: sum.pending + item.pendingItems,
  }), { planned: 0, completed: 0, available: 0, missing: 0, toBuy: 0, toProduce: 0, pending: 0 });
  const progress = totals.planned > 0 ? totals.completed / totals.planned : 0;
  const productsWithActions = items.filter((item) => item.missingQuantity > 0 || item.toBuyQuantity > 0 || item.toProduceQuantity > 0 || item.pendingItems > 0).length;
  const headers = ['Producto', 'Proveedor', 'Unidad', 'Eventos', ...events.map(eventLabel), ...summaryHeaders];
  const columnCount = headers.length;
  const eventTotals = new Map(events.map((event) => [event.planId, 0]));
  items.forEach((item) => (item.byEvent ?? []).forEach((event) => eventTotals.set(event.planId, (eventTotals.get(event.planId) ?? 0) + event.plannedQuantity)));
  const firstDataRow = 9;
  const lastDataRow = firstDataRow + items.length - 1;
  const totalRow = firstDataRow + items.length;
  const data = [
    row([{ value: title, style: 'sTitle', mergeAcross: columnCount - 1 }], 32),
    row([{ value: `${name} · Período: ${period} · Generado: ${generatedAt}`, style: 'sSubtitle', mergeAcross: columnCount - 1 }], 21),
    row([{ value: 'Resumen operativo', style: 'sSection', mergeAcross: columnCount - 1 }], 20),
    row([
      textCell('Productos', 'sMetricLabel'), numericCell(items.length, 'sMetricInteger'),
      textCell('Planificado', 'sMetricLabel'), numericCell(totals.planned, 'sMetricNumber'),
      textCell('Completado', 'sMetricLabel'), numericCell(totals.completed, 'sMetricNumber'),
      textCell('Faltante', 'sMetricLabel'), numericCell(totals.missing, 'sMetricNumber'),
      textCell('A comprar', 'sMetricLabel'), numericCell(totals.toBuy, 'sMetricNumber'),
    ], 21),
    row([
      textCell('A producir', 'sMetricLabel'), numericCell(totals.toProduce, 'sMetricNumber'),
      textCell('Pendientes', 'sMetricLabel'), numericCell(totals.pending, 'sMetricInteger'),
      textCell('Avance', 'sMetricLabel'), numericCell(progress, 'sMetricPercent'),
      textCell('Con acción', 'sMetricLabel'), numericCell(productsWithActions, 'sMetricInteger'),
    ], 21),
    row([{ value: 'Cada columna de cliente / evento replica las cantidades planificadas que se ven en Producción consolidada.', style: 'sSubtitle', mergeAcross: columnCount - 1 }], 19),
    row([], 8),
    row(headers.map((header) => textCell(header, 'sHeader')), 28),
    ...items.map((item) => {
      const byPlanId = new Map((item.byEvent ?? []).map((event) => [event.planId, event]));
      return row([
        textCell(item.productName),
        textCell(item.supplierName || 'Sin proveedor asignado'),
        textCell(item.unit),
        numericCell(item.eventCount, 'sInteger'),
        ...events.map((event) => {
          const detail = byPlanId.get(event.planId);
          return detail ? numericCell(detail.plannedQuantity, 'sEventNumber') : textCell('—', 'sEmpty');
        }),
        numericCell(item.plannedQuantity),
        numericCell(item.completedQuantity),
        numericCell(item.availableQuantity),
        numericCell(item.missingQuantity, item.missingQuantity > 0 ? 'sAttention' : 'sNumber'),
        numericCell(item.toBuyQuantity, item.toBuyQuantity > 0 ? 'sAction' : 'sNumber'),
        numericCell(item.toProduceQuantity, item.toProduceQuantity > 0 ? 'sAction' : 'sNumber'),
        numericCell(item.pendingItems, item.pendingItems > 0 ? 'sPending' : 'sInteger'),
      ], 20);
    }),
    row([
      textCell('Total', 'sTotalLabel'), textCell('', 'sTotalLabel'), textCell('', 'sTotalLabel'), numericCell(items.reduce((sum, item) => sum + item.eventCount, 0), 'sTotalInteger'),
      ...events.map((event) => numericCell(eventTotals.get(event.planId) ?? 0, 'sTotalNumber')),
      numericCell(totals.planned, 'sTotalNumber'), numericCell(totals.completed, 'sTotalNumber'), numericCell(totals.available, 'sTotalNumber'),
      numericCell(totals.missing, 'sTotalNumber'), numericCell(totals.toBuy, 'sTotalNumber'), numericCell(totals.toProduce, 'sTotalNumber'), numericCell(totals.pending, 'sTotalInteger'),
    ], 22),
  ];
  const filter = items.length ? `<AutoFilter x:Range="R8C1:R${lastDataRow}C${columnCount}"/>` : '';
  const columns = ['<Column ss:Width="205"/>', '<Column ss:Width="150"/>', '<Column ss:Width="72"/>', '<Column ss:Width="62"/>', ...events.map(() => '<Column ss:Width="102"/>'), ...summaryHeaders.map((_, index) => `<Column ss:Width="${index === 0 ? 88 : index === 6 ? 76 : 84}"/>`)];
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table ss:ExpandedColumnCount="${columnCount}" ss:ExpandedRowCount="${totalRow}">${columns.join('')}${data.join('')}</Table>${filter}<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ActivePane>2</ActivePane><PageSetup><Layout x:Orientation="Landscape"/><PageMargins x:Bottom="0.4" x:Left="0.25" x:Right="0.25" x:Top="0.45"/></PageSetup><FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight><ValidPrinterInfo/></Print><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

export function consolidatedProductionExcel(sections: ConsolidatedSection[], title: string, period = 'Período seleccionado') {
  const used = new Set<string>();
  const totalItems = sections.flatMap((section) => section.items);
  const totalEvents = sortedEvents([...new Map(sections.flatMap((section) => (section.events ?? []).map((event) => [event.planId, event]))).values()]);
  const generatedAt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const sheets = [worksheet(sheetName('Total consolidado', used), totalItems, totalEvents, title, period, generatedAt), ...sections.map((section) => worksheet(sheetName(section.name, used), section.items, sortedEvents(section.events ?? []), title, period, generatedAt))];
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${escapeXml(title)}</Title><Author>M&amp;M Eventos</Author><Company>M&amp;M Eventos</Company></DocumentProperties>${excelStyles}${sheets.join('')}</Workbook>`;
}

function collect(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

type ProductionTotals = { planned: number; completed: number; available: number; missing: number; toBuy: number; toProduce: number; pending: number };

const productionColumns = [
  { label: 'PRODUCTO', x: 42, width: 145, align: 'left' as const },
  { label: 'PROVEEDOR', x: 187, width: 105, align: 'left' as const },
  { label: 'UNIDAD', x: 292, width: 48, align: 'left' as const },
  { label: 'EVENTOS', x: 340, width: 46, align: 'right' as const },
  { label: 'PLANIF.', x: 386, width: 58, align: 'right' as const },
  { label: 'HECHO', x: 444, width: 58, align: 'right' as const },
  { label: 'DISP.', x: 502, width: 58, align: 'right' as const },
  { label: 'FALTANTE', x: 560, width: 64, align: 'right' as const },
  { label: 'COMPRAR', x: 624, width: 62, align: 'right' as const },
  { label: 'PRODUCIR', x: 686, width: 62, align: 'right' as const },
  { label: 'PEND.', x: 748, width: 52, align: 'right' as const },
];

function productionTotals(items: ConsolidatedItem[]): ProductionTotals {
  return items.reduce((sum, item) => ({
    planned: sum.planned + item.plannedQuantity,
    completed: sum.completed + item.completedQuantity,
    available: sum.available + item.availableQuantity,
    missing: sum.missing + item.missingQuantity,
    toBuy: sum.toBuy + item.toBuyQuantity,
    toProduce: sum.toProduce + item.toProduceQuantity,
    pending: sum.pending + item.pendingItems,
  }), { planned: 0, completed: 0, available: 0, missing: 0, toBuy: 0, toProduce: 0, pending: 0 });
}

function drawHeader(document: PDFKit.PDFDocument, title: string, subtitle: string) {
  const width = document.page.width;
  document.rect(0, 0, width, 88).fill('#172554');
  document.font('Helvetica-Bold').fontSize(7.5).fillColor('#BFDBFE').text('M&M EVENTOS  /  OPERACIONES', 42, 22, { characterSpacing: .8 });
  document.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text(title, 42, 36);
  document.font('Helvetica').fontSize(9).fillColor('#DBEAFE').text(subtitle, 42, 62);
  document.y = 106;
}

function drawFooter(document: PDFKit.PDFDocument, page: number) {
  const y = document.page.height - 25;
  document.moveTo(42, y - 7).lineTo(document.page.width - 42, y - 7).strokeColor('#CBD5E1').lineWidth(.5).stroke();
  document.font('Helvetica').fontSize(7).fillColor('#64748B').text('M&M Eventos · Producción consolidada', 42, y, { width: 280 });
  document.text(`Página ${page}`, document.page.width - 142, y, { width: 100, align: 'right' });
}

function drawMetricCards(document: PDFKit.PDFDocument, y: number, metrics: Array<{ label: string; value: string; accent?: boolean }>) {
  const x = 42;
  const gap = 9;
  const width = (document.page.width - 84 - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((metric, index) => {
    const cardX = x + index * (width + gap);
    const background = metric.accent ? '#FFF7ED' : '#F1F5F9';
    const labelColor = metric.accent ? '#9A3412' : '#475569';
    const valueColor = metric.accent ? '#C2410C' : '#0F172A';
    document.roundedRect(cardX, y, width, 56, 5).fill(background);
    document.font('Helvetica-Bold').fontSize(6.5).fillColor(labelColor).text(metric.label, cardX + 10, y + 10, { width: width - 20, characterSpacing: .45 });
    document.font('Helvetica-Bold').fontSize(14).fillColor(valueColor).text(metric.value, cardX + 10, y + 25, { width: width - 20, ellipsis: true });
  });
}

function drawOverviewTableHeader(document: PDFKit.PDFDocument, y: number) {
  const columns = [
    { label: 'CATEGORÍA', x: 42, width: 248, align: 'left' as const },
    { label: 'PRODUCTOS', x: 290, width: 77, align: 'right' as const },
    { label: 'PLANIF.', x: 367, width: 98, align: 'right' as const },
    { label: 'FALTANTE', x: 465, width: 100, align: 'right' as const },
    { label: 'COMPRAR', x: 565, width: 100, align: 'right' as const },
    { label: 'PRODUCIR', x: 665, width: 90, align: 'right' as const },
    { label: 'PEND.', x: 755, width: 45, align: 'right' as const },
  ];
  document.roundedRect(42, y, document.page.width - 84, 22, 4).fill('#1E3A5F');
  document.font('Helvetica-Bold').fontSize(6.6).fillColor('#FFFFFF');
  columns.forEach((column) => document.text(column.label, column.x + 6, y + 8, { width: column.width - 12, align: column.align, ellipsis: true }));
  return columns;
}

function drawOverview(document: PDFKit.PDFDocument, sections: ConsolidatedSection[]) {
  const items = sections.flatMap((section) => section.items);
  const totals = productionTotals(items);
  const progress = totals.planned > 0 ? `${number.format((totals.completed / totals.planned) * 100)}%` : '0%';
  const productsWithActions = items.filter((item) => item.missingQuantity > 0 || item.toBuyQuantity > 0 || item.toProduceQuantity > 0 || item.pendingItems > 0).length;

  document.font('Helvetica-Bold').fontSize(11).fillColor('#0F172A').text('Resumen operativo', 42, document.y);
  document.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Visión general para organizar compras, producción y controles pendientes.', 42, document.y + 3);
  const cardsY = document.y + 22;
  drawMetricCards(document, cardsY, [
    { label: 'CATEGORÍAS', value: String(sections.length) },
    { label: 'PRODUCTOS', value: String(items.length) },
    { label: 'PLANIFICADO', value: number.format(totals.planned) },
    { label: 'FALTANTE', value: number.format(totals.missing), accent: totals.missing > 0 },
    { label: 'CON ACCIÓN', value: String(productsWithActions), accent: productsWithActions > 0 },
  ]);
  document.font('Helvetica-Bold').fontSize(9).fillColor('#1E3A5F').text(`Avance general: ${progress}`, 42, cardsY + 69);
  document.font('Helvetica').fontSize(8).fillColor('#64748B').text(`A comprar: ${number.format(totals.toBuy)} · A producir: ${number.format(totals.toProduce)} · Ítems pendientes: ${number.format(totals.pending)}`, 42, cardsY + 84);

  const tableY = cardsY + 108;
  const columns = drawOverviewTableHeader(document, tableY);
  sections.forEach((section, index) => {
    const y = tableY + 22 + index * 23;
    const totalsBySection = productionTotals(section.items);
    if (index % 2 === 0) document.rect(42, y, document.page.width - 84, 23).fill('#F8FAFC');
    if (totalsBySection.missing > 0 || totalsBySection.toBuy > 0 || totalsBySection.toProduce > 0 || totalsBySection.pending > 0) document.rect(42, y, 3, 23).fill('#F59E0B');
    const values = [section.name, section.items.length, totalsBySection.planned, totalsBySection.missing, totalsBySection.toBuy, totalsBySection.toProduce, totalsBySection.pending];
    document.font('Helvetica').fontSize(8).fillColor('#334155');
    values.forEach((value, columnIndex) => document.text(typeof value === 'number' ? number.format(value) : value, columns[columnIndex].x + 6, y + 8, { width: columns[columnIndex].width - 12, align: columns[columnIndex].align, ellipsis: true }));
  });
}

function drawSectionSummary(document: PDFKit.PDFDocument, section: ConsolidatedSection) {
  const totals = productionTotals(section.items);
  const progress = totals.planned > 0 ? `${number.format((totals.completed / totals.planned) * 100)}%` : '0%';
  const sectionY = document.y;
  document.roundedRect(42, sectionY, document.page.width - 84, 26, 5).fill('#EAF0F8');
  document.font('Helvetica-Bold').fontSize(10).fillColor('#1E3A5F').text(section.name, 53, sectionY + 8, { width: 470, ellipsis: true });
  document.font('Helvetica').fontSize(8).fillColor('#475569').text(`${section.items.length} productos consolidados`, 600, sectionY + 9, { width: 189, align: 'right' });
  const cardsY = sectionY + 39;
  drawMetricCards(document, cardsY, [
    { label: 'PLANIFICADO', value: number.format(totals.planned) },
    { label: 'COMPLETADO', value: number.format(totals.completed) },
    { label: 'FALTANTE', value: number.format(totals.missing), accent: totals.missing > 0 },
    { label: 'A COMPRAR', value: number.format(totals.toBuy), accent: totals.toBuy > 0 },
    { label: 'AVANCE', value: progress },
  ]);
  document.font('Helvetica').fontSize(8).fillColor('#64748B').text(`A producir: ${number.format(totals.toProduce)} · Ítems pendientes: ${number.format(totals.pending)} · Las alertas se destacan en color.`, 42, cardsY + 65);
  document.y = cardsY + 84;
}

function tableHeader(document: PDFKit.PDFDocument) {
  const y = document.y;
  document.roundedRect(42, y, document.page.width - 84, 23, 4).fill('#1E3A5F');
  document.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF');
  productionColumns.forEach((column) => document.text(column.label, column.x + 5, y + 8, { width: column.width - 10, align: column.align, ellipsis: true }));
  document.y = y + 29;
}

function drawProductionRow(document: PDFKit.PDFDocument, item: ConsolidatedItem, index: number) {
  const y = document.y;
  if (index % 2 === 0) document.rect(42, y - 3, document.page.width - 84, 21).fill('#F8FAFC');
  const actionColumns = [
    { index: 7, value: item.missingQuantity, background: '#FEE2E2', color: '#991B1B' },
    { index: 8, value: item.toBuyQuantity, background: '#FEF3C7', color: '#92400E' },
    { index: 9, value: item.toProduceQuantity, background: '#FEF3C7', color: '#92400E' },
    { index: 10, value: item.pendingItems, background: '#F3E8FF', color: '#6B21A8' },
  ];
  actionColumns.filter((column) => column.value > 0).forEach((column) => document.roundedRect(productionColumns[column.index].x + 2, y - 2, productionColumns[column.index].width - 4, 17, 3).fill(column.background));
  const values = [item.productName, item.supplierName || 'Sin proveedor asignado', item.unit, item.eventCount, item.plannedQuantity, item.completedQuantity, item.availableQuantity, item.missingQuantity, item.toBuyQuantity, item.toProduceQuantity, item.pendingItems];
  values.forEach((value, columnIndex) => {
    const action = actionColumns.find((column) => column.index === columnIndex && column.value > 0);
    document.font(columnIndex === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.4).fillColor(action?.color ?? '#334155').text(typeof value === 'number' ? number.format(value) : value, productionColumns[columnIndex].x + 5, y + 3, { width: productionColumns[columnIndex].width - 10, align: productionColumns[columnIndex].align, ellipsis: true });
  });
  document.moveTo(42, y + 18).lineTo(document.page.width - 42, y + 18).strokeColor('#E2E8F0').lineWidth(.35).stroke();
  document.y = y + 21;
}

function eventGroups(events: EventBreakdown[], size = 5): EventBreakdown[][] {
  const groups: EventBreakdown[][] = [];
  for (let index = 0; index < events.length; index += size) groups.push(events.slice(index, index + size));
  return groups;
}

function drawEventDetailHeader(document: PDFKit.PDFDocument, section: ConsolidatedSection, events: EventBreakdown[], groupIndex: number, groupCount: number) {
  const contextY = document.y;
  document.roundedRect(42, contextY, document.page.width - 84, 28, 5).fill('#EAF0F8');
  document.font('Helvetica-Bold').fontSize(9.5).fillColor('#1E3A5F').text('Detalle por cliente / evento', 53, contextY + 10);
  document.font('Helvetica').fontSize(7.5).fillColor('#475569').text(`${section.name} · Eventos ${groupIndex + 1}–${groupIndex + events.length} de ${groupCount}`, 380, contextY + 10, { width: 409, align: 'right', ellipsis: true });

  const productWidth = 175;
  const unitWidth = 55;
  const totalWidth = 68;
  const eventWidth = (document.page.width - 84 - productWidth - unitWidth - totalWidth) / events.length;
  const columns = {
    product: { x: 42, width: productWidth },
    unit: { x: 42 + productWidth, width: unitWidth },
    events: events.map((event, index) => ({ event, x: 42 + productWidth + unitWidth + index * eventWidth, width: eventWidth })),
    total: { x: document.page.width - 42 - totalWidth, width: totalWidth },
  };
  const y = contextY + 40;
  document.roundedRect(42, y, document.page.width - 84, 34, 4).fill('#1E3A5F');
  document.font('Helvetica-Bold').fontSize(6.4).fillColor('#FFFFFF').text('PRODUCTO', columns.product.x + 5, y + 13, { width: columns.product.width - 10 });
  document.text('UNIDAD', columns.unit.x + 5, y + 13, { width: columns.unit.width - 10 });
  columns.events.forEach((column) => document.text(eventLabel(column.event), column.x + 4, y + 6, { width: column.width - 8, align: 'center', ellipsis: true }));
  document.text('TOTAL', columns.total.x + 4, y + 13, { width: columns.total.width - 8, align: 'right' });
  document.y = y + 41;
  return columns;
}

function drawEventDetailRow(document: PDFKit.PDFDocument, item: ConsolidatedItem, index: number, columns: ReturnType<typeof drawEventDetailHeader>) {
  const y = document.y;
  if (index % 2 === 0) document.rect(42, y - 3, document.page.width - 84, 21).fill('#F8FAFC');
  const byPlanId = new Map((item.byEvent ?? []).map((event) => [event.planId, event]));
  document.font('Helvetica-Bold').fontSize(7.4).fillColor('#334155').text(item.productName, columns.product.x + 5, y + 3, { width: columns.product.width - 10, ellipsis: true });
  document.font('Helvetica').fontSize(7.1).fillColor('#64748B').text(item.unit, columns.unit.x + 5, y + 3, { width: columns.unit.width - 10, ellipsis: true });
  columns.events.forEach((column) => {
    const event = byPlanId.get(column.event.planId);
    document.font('Helvetica').fontSize(7.3).fillColor(event ? '#1E3A5F' : '#94A3B8').text(event ? number.format(event.plannedQuantity) : '—', column.x + 4, y + 3, { width: column.width - 8, align: 'right' });
  });
  document.font('Helvetica-Bold').fontSize(7.3).fillColor('#0F172A').text(number.format(item.plannedQuantity), columns.total.x + 4, y + 3, { width: columns.total.width - 8, align: 'right' });
  document.moveTo(42, y + 18).lineTo(document.page.width - 42, y + 18).strokeColor('#E2E8F0').lineWidth(.35).stroke();
  document.y = y + 21;
}

export async function consolidatedProductionPdf(sections: ConsolidatedSection[], title: string, period: string) {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: title, Author: 'M&M Eventos' } });
  const result = collect(document);
  const bottom = document.page.height - 42;
  let page = 1;

  drawHeader(document, title, `${period} · Informe consolidado`);
  drawOverview(document, sections);
  drawFooter(document, page);

  sections.forEach((section) => {
    document.addPage();
    page += 1;
    drawHeader(document, title, `${period} · Detalle por categoría`);
    drawSectionSummary(document, section);
    tableHeader(document);
    section.items.forEach((item, index) => {
      if (document.y + 22 > bottom) {
        drawFooter(document, page);
        document.addPage();
        page += 1;
        drawHeader(document, title, `${period} · ${section.name} (continuación)`);
        const continuationY = document.y;
        document.roundedRect(42, continuationY, document.page.width - 84, 24, 5).fill('#EAF0F8');
        document.font('Helvetica-Bold').fontSize(9).fillColor('#1E3A5F').text(section.name, 53, continuationY + 8, { width: 600, ellipsis: true });
        document.y = continuationY + 35;
        tableHeader(document);
      }
      drawProductionRow(document, item, index);
    });
    if (!section.items.length) {
      document.font('Helvetica').fontSize(9).fillColor('#64748B').text('No hay ítems de producción para esta categoría en el período seleccionado.', 42, document.y + 12);
    }
    drawFooter(document, page);

    const groups = eventGroups(sortedEvents(section.events ?? []));
    groups.forEach((events, groupIndex) => {
      let itemIndex = 0;
      do {
        document.addPage();
        page += 1;
        drawHeader(document, title, `${period} · ${section.name} · Detalle por cliente / evento${itemIndex ? ' (continuación)' : ''}`);
        const columns = drawEventDetailHeader(document, section, events, groupIndex * 5, (section.events ?? []).length);
        if (!section.items.length) document.font('Helvetica').fontSize(9).fillColor('#64748B').text('No hay ítems de producción para mostrar.', 42, document.y + 12);
        while (itemIndex < section.items.length && document.y + 22 <= bottom) {
          drawEventDetailRow(document, section.items[itemIndex], itemIndex, columns);
          itemIndex += 1;
        }
        drawFooter(document, page);
      } while (itemIndex < section.items.length);
    });
  });
  document.end();
  return result;
}
