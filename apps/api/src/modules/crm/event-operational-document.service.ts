import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export type OperationalDocumentType = 'timeline' | 'logistics' | 'guest_list' | 'tableware';

const page = { width: 595.28, height: 841.89, left: 42, right: 553, bottom: 790 };
const color = { ink: '#101827', gold: '#b8965a', cream: '#fbf8f1', card: '#f4f6f8', muted: '#667085', line: '#dfe3e8', white: '#ffffff' };
const timelineStatuses: Record<string, string> = { pending: 'Pendiente', ready: 'Preparado', done: 'Hecho', cancelled: 'Cancelado' };
const dietaryPreferenceLabels: Record<string, string> = { vegetarian: 'Vegetariano/a', vegan: 'Vegano/a', celiac: 'Celíaco/a', lactose_free: 'Sin lactosa' };
const guestAgeGroupLabels: Record<string, string> = { child_1_4: '1 a 4 años · sin cargo', child_5_9: '5 a 9 años · media tarifa', minor_10_17: '10 a 17 años · menor' };
const tableAudienceLabels: Record<string, string> = { children: 'Chicos', family: 'Familia', open: 'Libre' };
const tableAudienceLegendLabels: Record<string, string> = { children: 'Chicos', family: 'Familiares', open: 'Libres' };
const logisticSections: Array<[string, string]> = [
  ['Armado del salón', 'eventSetupNotes'],
  ['Cocina', 'kitchenNotes'],
  ['Barra y bebidas', 'barNotes'],
  ['Ambientación, mantelería y vajilla', 'decorationNotes'],
  ['Ingreso y accesos', 'accessNotes'],
  ['Cierre y puntos críticos', 'riskNotes']
];

function text(value: unknown, fallback = 'A confirmar'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function date(value?: Date | string): string {
  if (!value) return 'A confirmar';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'A confirmar' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(parsed);
}

function documentTitle(type: OperationalDocumentType): string {
  return type === 'timeline' ? 'Cronograma operativo' : type === 'guest_list' ? 'Control de mesas y puerta' : type === 'tableware' ? 'Reserva de vajilla' : 'Logística y coordinación interna';
}

function fileStem(event: any, type: OperationalDocumentType): string {
  const source = String(event.eventName || event.eventType || 'evento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'evento';
  const prefix = type === 'timeline' ? 'cronograma' : type === 'guest_list' ? 'control-ingreso-mesas' : type === 'tableware' ? 'reserva-vajilla' : 'logistica';
  return `${prefix}-${source}`;
}

function collect(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.end();
  });
}

function logo(document: PDFKit.PDFDocument, x: number, y: number): void {
  const candidates = [path.resolve(process.cwd(), '../web/public/brand/mym-logo-light-on-dark.jpg'), path.resolve(process.cwd(), 'apps/web/public/brand/mym-logo-light-on-dark.jpg')];
  const asset = candidates.find(fs.existsSync);
  if (asset) document.image(asset, x, y, { width: 60 });
  else document.font('Helvetica-Bold').fontSize(14).fillColor(color.white).text('M&M\nEVENTOS', x, y + 6);
}

function header(document: PDFKit.PDFDocument, event: any, type: OperationalDocumentType): void {
  if (type === 'guest_list') {
    const customer = typeof event.customerId === 'object' ? event.customerId?.fullName : undefined;
    const salon = typeof event.salonId === 'object' ? event.salonId?.name : undefined;
    document.rect(0, 0, page.width, 88).fill(color.white);
    document.font('Helvetica-Bold').fontSize(16).fillColor(color.ink).text('CONTROL DE MESAS', page.left, 23, { width: page.right - page.left, align: 'center', characterSpacing: .4 });
    document.font('Helvetica').fontSize(8.8).fillColor(color.muted).text([text(customer, ''), date(event.eventDate), text(salon, ''), 'Puerta y control'].filter(Boolean).join(' · '), page.left, 49, { width: page.right - page.left, align: 'center' });
    document.moveTo(page.left, 73).lineTo(page.right, 73).strokeColor(color.gold).lineWidth(1).stroke();
    return;
  }
  document.rect(0, 0, page.width, 80).fill(color.ink);
  logo(document, page.left, 10);
  document.font('Helvetica').fontSize(8).fillColor('#ddc99f').text(documentTitle(type).toUpperCase(), 260, 23, { width: 293, align: 'right', characterSpacing: .8 });
  document.font('Helvetica-Bold').fontSize(12).fillColor(color.white).text(text(event.eventName || event.eventType, 'Evento'), 230, 39, { width: 323, align: 'right', ellipsis: true });
}

function footer(document: PDFKit.PDFDocument, type: OperationalDocumentType, current: number, total: number): void {
  document.save().moveTo(page.left, page.bottom - 17).lineTo(page.right, page.bottom - 17).strokeColor(color.line).lineWidth(.6).stroke()
    .font('Helvetica').fontSize(7.4).fillColor(color.muted).text(`M&M Eventos · ${documentTitle(type)}`, page.left, page.bottom - 9, { width: 330 })
    .text(`Página ${current} de ${total}`, 450, page.bottom - 9, { width: 103, align: 'right' }).restore();
}

function ensure(document: PDFKit.PDFDocument, event: any, type: OperationalDocumentType, height: number): void {
  if (document.y + height <= page.bottom - 30) return;
  document.addPage();
  header(document, event, type);
  document.y = 103;
}

function section(document: PDFKit.PDFDocument, event: any, type: OperationalDocumentType, title: string, hint?: string): void {
  ensure(document, event, type, 38);
  const y = document.y;
  document.font('Helvetica-Bold').fontSize(11.5).fillColor(color.ink).text(title, page.left, y);
  if (hint) document.font('Helvetica').fontSize(8).fillColor(color.muted).text(hint, 270, y + 2, { width: 283, align: 'right' });
  document.moveTo(page.left, y + 20).lineTo(page.right, y + 20).strokeColor(color.gold).lineWidth(1).stroke();
  document.y = y + 30;
}

function eventDetails(document: PDFKit.PDFDocument, event: any, type: OperationalDocumentType): void {
  const customer = event.customerId;
  const salon = event.salonId;
  const customerName = typeof customer === 'object' ? customer?.fullName : undefined;
  const salonName = typeof salon === 'object' ? salon?.name : undefined;
  const details: Array<[string, string]> = [
    ['Fecha', date(event.eventDate)],
    ['Horario', event.startTime || event.endTime ? `${event.startTime || 'A definir'} a ${event.endTime || 'A definir'}` : 'A confirmar'],
    ['Cliente', text(customerName)],
    ['Salón', text(salonName)],
    ['Tipo de evento', text(event.eventType)],
    ['Invitados', event.guestCount ? `${event.guestCount} personas` : 'A confirmar']
  ];
  const y = document.y;
  document.roundedRect(page.left, y, page.right - page.left, 93, 8).fill(color.card);
  details.forEach(([label, value], index) => {
    const x = page.left + 15 + (index % 2) * 250;
    const row = Math.floor(index / 2);
    document.font('Helvetica-Bold').fontSize(7).fillColor(color.muted).text(label.toUpperCase(), x, y + 13 + row * 25, { width: 220, characterSpacing: .3 });
    document.font('Helvetica').fontSize(9).fillColor(color.ink).text(value, x, y + 23 + row * 25, { width: 220, height: 13, ellipsis: true });
  });
  document.y = y + 108;
  section(document, event, type, documentTitle(type));
}

function timeline(document: PDFKit.PDFDocument, event: any): void {
  const items = Array.isArray(event.resourcePlanSnapshot?.timelineItems) ? event.resourcePlanSnapshot.timelineItems.filter((item: any) => item?.title || item?.notes) : [];
  if (!items.length) {
    document.roundedRect(page.left, document.y, page.right - page.left, 45, 8).fill(color.cream);
    document.font('Helvetica').fontSize(9).fillColor(color.muted).text('Todavía no hay momentos cargados en el cronograma.', page.left + 15, document.y + 17);
    document.y += 55;
    return;
  }
  const columns = [{ label: 'Hora', x: page.left + 12, width: 54 }, { label: 'Momento', x: page.left + 75, width: 163 }, { label: 'Área', x: page.left + 247, width: 78 }, { label: 'Responsable', x: page.left + 334, width: 93 }, { label: 'Estado', x: page.left + 436, width: 65 }];
  const drawHeader = () => {
    ensure(document, event, 'timeline', 25);
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, 22, 5).fill(color.ink);
    columns.forEach((column) => document.font('Helvetica-Bold').fontSize(6.7).fillColor(color.white).text(column.label.toUpperCase(), column.x, y + 8, { width: column.width, ellipsis: true }));
    document.y = y + 27;
  };
  drawHeader();
  items.forEach((item: any, index: number) => {
    const note = text(item.notes, '');
    const contentHeight = Math.max(30, note ? document.heightOfString(note, { width: 473, lineGap: 2 }) + 39 : 30);
    if (document.y + contentHeight > page.bottom - 30) { document.addPage(); header(document, event, 'timeline'); document.y = 103; drawHeader(); }
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, contentHeight, 5).fill(index % 2 ? color.cream : color.card);
    const values = [text(item.time, '—'), text(item.title), text(item.area), text(item.owner), timelineStatuses[item.status] ?? text(item.status, 'Pendiente')];
    columns.forEach((column, columnIndex) => document.font(columnIndex === 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.2).fillColor(color.ink).text(values[columnIndex], column.x, y + 10, { width: column.width, height: 16, ellipsis: true }));
    if (note) {
      document.font('Helvetica-Bold').fontSize(6.8).fillColor(color.muted).text('NOTAS', page.left + 75, y + 27);
      document.font('Helvetica').fontSize(8).fillColor('#344054').text(note, page.left + 75, y + 36, { width: 426, lineGap: 2 });
    }
    document.y = y + contentHeight + 5;
  });
  const generalStaffNotes = Array.isArray(event.resourcePlanSnapshot?.staffNotes) ? event.resourcePlanSnapshot.staffNotes.filter((item: any) => text(item?.notes, '') !== '') : [];
  const staffNotes = [
    ...generalStaffNotes.map((item: any) => ({ reference: text(item.title, 'Nota general para staff'), meta: 'Indicación general', note: text(item.notes, '') })),
    ...items.filter((item: any) => text(item.notes, '') !== '').map((item: any) => ({ reference: [text(item.time, 'Sin horario'), text(item.title, 'Momento sin título')].join(' · '), meta: [text(item.area, ''), text(item.owner, '')].filter(Boolean).join(' · '), note: text(item.notes, '') }))
  ];
  if (!staffNotes.length) return;
  section(document, event, 'timeline', 'Notas para staff', 'Indicaciones clave para el equipo');
  staffNotes.forEach((item: any) => {
    const note = item.note;
    const height = Math.max(54, document.heightOfString(note, { width: page.right - page.left - 32, lineGap: 3 }) + 34);
    ensure(document, event, 'timeline', height + 8);
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, height, 8).fill(color.cream);
    document.roundedRect(page.left, y, 4, height, 2).fill(color.gold);
    const reference = item.reference;
    const meta = item.meta;
    document.font('Helvetica-Bold').fontSize(9.2).fillColor(color.ink).text(reference, page.left + 16, y + 12, { width: 460, ellipsis: true });
    if (meta) document.font('Helvetica').fontSize(7.7).fillColor(color.muted).text(meta, page.left + 16, y + 24, { width: 460, ellipsis: true });
    document.font('Helvetica').fontSize(8.6).fillColor('#344054').text(note, page.left + 16, y + (meta ? 36 : 27), { width: page.right - page.left - 32, lineGap: 3 });
    document.y = y + height + 8;
  });
}

function guestList(document: PDFKit.PDFDocument, event: any): void {
  const list = event.resourcePlanSnapshot?.guestList ?? {};
  const tables = Array.isArray(list.tables) ? list.tables.filter((item: any) => text(item?.name, '') !== '') : [];
  const guests = Array.isArray(list.guests) ? list.guests.filter((item: any) => text(item?.fullName, '') !== '') : [];
  if (!tables.length && !guests.length) return;
  section(document, event, 'timeline', 'Invitados y mesas', `${guests.length} invitado${guests.length === 1 ? '' : 's'} cargado${guests.length === 1 ? '' : 's'}`);
  const entries = [
    ...tables.map((table: any) => ({ title: table.name, audience: tableAudienceLabels[table.audience] ?? '', capacity: table.capacity, guests: guests.filter((guest: any) => guest.tableId === table.id), notes: text(table.notes, '') })),
    ...(guests.some((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)) ? [{ title: 'Sin mesa asignada', capacity: undefined, guests: guests.filter((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)), notes: '' }] : [])
  ];
  entries.forEach((entry: any) => {
    const rows = entry.guests.map((guest: any) => {
      const detail = [guestAgeGroupLabels[guest.ageGroup] ?? '', text(guest.meal, ''), guest.dietaryPreference && guest.dietaryPreference !== 'none' ? guest.dietaryPreference : '', text(guest.notes, '')].filter(Boolean).join(' · ');
      return { name: text(guest.fullName), detail };
    });
    const height = Math.max(49, 31 + (entry.notes ? 14 : 0) + rows.reduce((sum: number, row: { name: string; detail: string }) => sum + Math.max(14, document.heightOfString(`${row.name}${row.detail ? ` · ${row.detail}` : ''}`, { width: page.right - page.left - 42 }) + 3), 0));
    ensure(document, event, 'timeline', height + 8);
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, height, 8).fill(color.card);
    document.roundedRect(page.left, y, 4, height, 2).fill(color.gold);
    const heading = `${entry.title}${entry.audience ? ` · ${entry.audience}` : ''}${entry.capacity ? ` · ${entry.guests.length}/${entry.capacity}` : ` · ${entry.guests.length}`}`;
    document.font('Helvetica-Bold').fontSize(9.4).fillColor(color.ink).text(heading, page.left + 16, y + 12, { width: 460, ellipsis: true });
    let cursor = y + 27;
    if (entry.notes) { document.font('Helvetica').fontSize(7.8).fillColor(color.muted).text(entry.notes, page.left + 16, cursor, { width: 460, ellipsis: true }); cursor += 13; }
    if (!rows.length) document.font('Helvetica').fontSize(8).fillColor(color.muted).text('Sin invitados asignados.', page.left + 16, cursor);
    rows.forEach((row: { name: string; detail: string }) => { document.font('Helvetica-Bold').fontSize(8.1).fillColor(color.ink).text(row.name, page.left + 16, cursor, { width: 180, ellipsis: true }); if (row.detail) document.font('Helvetica').fontSize(7.8).fillColor(color.muted).text(row.detail, page.left + 202, cursor + 1, { width: 295, ellipsis: true }); cursor += 14; });
    document.y = y + height + 8;
  });
}

function guestControlEntries(event: any) {
  const list = event.resourcePlanSnapshot?.guestList ?? {};
  const tables = Array.isArray(list.tables) ? list.tables.filter((item: any) => text(item?.name, '') !== '') : [];
  const guests = Array.isArray(list.guests) ? list.guests.filter((item: any) => text(item?.fullName, '') !== '') : [];
  return [
    ...tables.map((table: any) => ({ title: text(table.name), audience: tableAudienceLabels[table.audience] ?? 'Libre', audienceKey: table.audience || 'open', capacity: Number(table.capacity ?? 0), notes: text(table.notes, ''), guests: guests.filter((guest: any) => guest.tableId === table.id) })),
    ...(guests.some((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)) ? [{ title: 'Sin mesa asignada', audience: '', audienceKey: '', capacity: 0, notes: '', guests: guests.filter((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)) }] : [])
  ];
}

function guestControlSlots(entry: any) {
  return Math.max(entry.guests.length, entry.capacity || 10);
}

function guestControlDetail(guest: any): string {
  return [guestAgeGroupLabels[guest.ageGroup] ?? '', text(guest.meal, ''), dietaryPreferenceLabels[guest.dietaryPreference] ?? '', text(guest.notes, '')].filter(Boolean).join(' · ');
}

function guestControlLegend(entries: any[]) {
  return ['children', 'family', 'open'].map((audience) => {
    const names = entries.filter((entry) => entry.audienceKey === audience).map((entry) => entry.title);
    return { label: tableAudienceLegendLabels[audience], detail: names.length ? names.join(' · ') : 'Sin mesas' };
  });
}

function guestEntryControl(document: PDFKit.PDFDocument, event: any): void {
  const entries = guestControlEntries(event);
  if (!entries.length) {
    document.roundedRect(page.left, document.y, page.right - page.left, 45, 8).fill(color.cream);
    document.font('Helvetica').fontSize(9).fillColor(color.muted).text('Todavía no hay invitados o mesas cargados para generar el control de ingreso.', page.left + 15, document.y + 17);
    return;
  }
  const legend = guestControlLegend(entries);
  const legendY = document.y;
  const legendWidth = (page.right - page.left - 16) / 3;
  legend.forEach((item, index) => {
    const x = page.left + index * (legendWidth + 8);
    document.rect(x, legendY, legendWidth, 39).fill(color.cream).strokeColor('#d8ccaf').lineWidth(.6).stroke();
    document.font('Helvetica-Bold').fontSize(8).fillColor(color.ink).text(item.label, x + 9, legendY + 8, { width: legendWidth - 18 });
    document.font('Helvetica').fontSize(7.2).fillColor(color.muted).text(item.detail, x + 9, legendY + 20, { width: legendWidth - 18, ellipsis: true });
  });
  document.font('Helvetica').fontSize(7.4).fillColor(color.muted).text('Control · números visibles en cada fila', page.left, legendY + 48, { width: page.right - page.left, align: 'right' });
  document.y = legendY + 66;
  entries.forEach((entry: any) => {
    const slots = guestControlSlots(entry);
    const rows = Array.from({ length: slots }, (_, index) => {
      const guest = entry.guests[index];
      return guest ? { name: text(guest.fullName), detail: guestControlDetail(guest) } : { name: '................................................................................................', detail: '' };
    });
    let offset = 0;
    do {
      const isContinuation = offset > 0;
      const titleHeight = entry.notes && !isContinuation ? 43 : 29;
      ensure(document, event, 'guest_list', titleHeight + 20);
      const available = page.bottom - 30 - document.y;
      const rowCount = Math.max(1, Math.min(rows.length - offset, Math.floor((available - titleHeight) / 18)));
      const height = titleHeight + rowCount * 18;
      const y = document.y;
      document.rect(page.left, y, page.right - page.left, height).fill(color.white).strokeColor('#d8ccaf').lineWidth(.7).stroke();
      document.rect(page.left, y, page.right - page.left, 25).fill(color.cream);
      const heading = `${entry.title.toUpperCase()}${entry.audience ? ` · ${entry.audience}` : ''} · ${entry.guests.length} lugar${entry.guests.length === 1 ? '' : 'es'}${isContinuation ? ' · continúa' : ''}`;
      document.font('Helvetica-Bold').fontSize(9).fillColor(color.ink).text(heading, page.left + 12, y + 8, { width: 440, ellipsis: true });
      let cursor = y + 25;
      if (entry.notes && !isContinuation) { document.font('Helvetica').fontSize(7.2).fillColor(color.muted).text(entry.notes, page.left + 12, cursor + 5, { width: 475, ellipsis: true }); cursor += 18; }
      rows.slice(offset, offset + rowCount).forEach((row: { name: string; detail: string }, rowIndex: number) => {
        const rowY = cursor + rowIndex * 18;
        document.moveTo(page.left, rowY + 18).lineTo(page.right, rowY + 18).strokeColor('#e8e3d8').lineWidth(.45).stroke();
        document.font('Helvetica-Bold').fontSize(8).fillColor(color.muted).text(String(offset + rowIndex + 1), page.left + 12, rowY + 5, { width: 18, align: 'right' });
        document.font(row.detail ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(row.detail ? color.ink : color.muted).text(row.name, page.left + 42, rowY + 4, { width: 265, ellipsis: true });
        if (row.detail) document.font('Helvetica').fontSize(7.1).fillColor(color.muted).text(row.detail, page.left + 318, rowY + 5, { width: 220, ellipsis: true });
      });
      document.y = y + height + 10;
      offset += rowCount;
    } while (offset < rows.length);
  });
}

function logistics(document: PDFKit.PDFDocument, event: any): void {
  const logistics = event.resourcePlanSnapshot?.logistics ?? {};
  const sections = logisticSections.filter(([, key]) => text(logistics[key], '') !== '');
  if (!sections.length) {
    document.roundedRect(page.left, document.y, page.right - page.left, 45, 8).fill(color.cream);
    document.font('Helvetica').fontSize(9).fillColor(color.muted).text('Todavía no hay indicaciones logísticas cargadas.', page.left + 15, document.y + 17);
    return;
  }
  sections.forEach(([title, key]) => {
    const content = text(logistics[key], '');
    const height = Math.max(57, document.heightOfString(content, { width: page.right - page.left - 38, lineGap: 3 }) + 32);
    ensure(document, event, 'logistics', height + 8);
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, height, 8).fill(color.card);
    document.roundedRect(page.left, y, 4, height, 2).fill(color.gold);
    document.font('Helvetica-Bold').fontSize(9.6).fillColor(color.ink).text(title, page.left + 16, y + 13);
    document.font('Helvetica').fontSize(8.7).fillColor('#344054').text(content, page.left + 16, y + 29, { width: page.right - page.left - 32, lineGap: 3 });
    document.y = y + height + 8;
  });
}

const tablewareColumns = [
  { label: 'Artículo', x: page.left + 12, width: 168 },
  { label: 'Categoría', x: page.left + 184, width: 100 },
  { label: 'Cantidad', x: page.left + 288, width: 55 },
  { label: 'Unidad', x: page.left + 347, width: 65 },
  { label: 'Notas', x: page.left + 416, width: 95 }
];

function tablewareTable(document: PDFKit.PDFDocument, event: any, rows: any[]): void {
  const drawHeader = () => {
    ensure(document, event, 'tableware', 25);
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, 22, 5).fill(color.ink);
    tablewareColumns.forEach((column) => document.font('Helvetica-Bold').fontSize(6.7).fillColor(color.white).text(column.label.toUpperCase(), column.x, y + 8, { width: column.width, ellipsis: true }));
    document.y = y + 27;
  };
  drawHeader();
  rows.forEach((row, index) => {
    if (document.y + 22 > page.bottom - 30) { document.addPage(); header(document, event, 'tableware'); document.y = 103; drawHeader(); }
    const y = document.y;
    document.roundedRect(page.left, y, page.right - page.left, 20, 4).fill(index % 2 ? color.cream : color.card);
    const values = [text(row.itemName), text(row.category, '—'), String(row.quantity ?? '—'), text(row.unit, '—'), text(row.notes, '—')];
    tablewareColumns.forEach((column, columnIndex) => document.font(columnIndex === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(color.ink).text(values[columnIndex], column.x, y + 6, { width: column.width, height: 14, ellipsis: true }));
    document.y = y + 24;
  });
}

function tableware(document: PDFKit.PDFDocument, event: any): void {
  const allocations = Array.isArray(event.tablewareAllocations) ? event.tablewareAllocations : [];
  const salonRows = allocations.filter((item: any) => item.source === 'salon_stock');
  const externalRows = allocations.filter((item: any) => item.source === 'external');
  section(document, event, 'tableware', 'Vajilla del salón', `${salonRows.length} artículo${salonRows.length === 1 ? '' : 's'}`);
  if (salonRows.length) tablewareTable(document, event, salonRows);
  else { document.roundedRect(page.left, document.y, page.right - page.left, 45, 8).fill(color.cream); document.font('Helvetica').fontSize(9).fillColor(color.muted).text('No se reservó vajilla del stock propio del salón para este evento.', page.left + 15, document.y + 17); document.y += 55; }
  section(document, event, 'tableware', 'Vajilla adicional / externa', `${externalRows.length} artículo${externalRows.length === 1 ? '' : 's'}`);
  if (externalRows.length) tablewareTable(document, event, externalRows);
  else { document.roundedRect(page.left, document.y, page.right - page.left, 45, 8).fill(color.cream); document.font('Helvetica').fontSize(9).fillColor(color.muted).text('No se cargó vajilla adicional o externa para este evento.', page.left + 15, document.y + 17); document.y += 55; }
}

export async function generateOperationalPdf(event: any, type: OperationalDocumentType): Promise<{ buffer: Buffer; fileName: string }> {
  const document = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `${documentTitle(type)} · ${text(event.eventName || event.eventType, 'Evento')}`, Author: 'M&M Eventos', Subject: documentTitle(type) } });
  header(document, event, type);
  document.y = 103;
  if (type === 'guest_list') guestEntryControl(document, event);
  else {
    eventDetails(document, event, type);
    if (type === 'timeline') { timeline(document, event); guestList(document, event); }
    else if (type === 'tableware') tableware(document, event);
    else logistics(document, event);
  }
  const pages = document.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) { document.switchToPage(index); footer(document, type, index + 1, pages.count); }
  return { buffer: await collect(document), fileName: `${fileStem(event, type)}.pdf` };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function guestListWordHtml(event: any): string {
  const list = event.resourcePlanSnapshot?.guestList ?? {};
  const tables = Array.isArray(list.tables) ? list.tables.filter((item: any) => text(item?.name, '') !== '') : [];
  const guests = Array.isArray(list.guests) ? list.guests.filter((item: any) => text(item?.fullName, '') !== '') : [];
  if (!tables.length && !guests.length) return '';
  const entries = [
    ...tables.map((table: any) => ({ title: table.name, audience: tableAudienceLabels[table.audience] ?? '', capacity: table.capacity, notes: text(table.notes, ''), guests: guests.filter((guest: any) => guest.tableId === table.id) })),
    ...(guests.some((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)) ? [{ title: 'Sin mesa asignada', capacity: undefined, notes: '', guests: guests.filter((guest: any) => !guest.tableId || !tables.some((table: any) => table.id === guest.tableId)) }] : [])
  ];
  return `<h2>Invitados y mesas</h2><p class="staff-hint">${guests.length} invitado${guests.length === 1 ? '' : 's'} cargado${guests.length === 1 ? '' : 's'} para la operación.</p>${entries.map((entry: any) => `<section class="note"><h3>${escapeHtml(`${entry.title}${entry.audience ? ` · ${entry.audience}` : ''}${entry.capacity ? ` · ${entry.guests.length}/${entry.capacity}` : ` · ${entry.guests.length}`}`)}</h3>${entry.notes ? `<small>${escapeHtml(entry.notes)}</small>` : ''}${entry.guests.length ? `<ul class="guest-items">${entry.guests.map((guest: any) => { const detail = [guestAgeGroupLabels[guest.ageGroup] ?? '', text(guest.meal, ''), dietaryPreferenceLabels[guest.dietaryPreference] ?? '', text(guest.notes, '')].filter(Boolean).join(' · '); return `<li><b>${escapeHtml(guest.fullName)}</b>${detail ? ` <span>· ${escapeHtml(detail)}</span>` : ''}</li>`; }).join('')}</ul>` : '<p>Sin invitados asignados.</p>'}</section>`).join('')}`;
}

function tablewareRowsWordHtml(rows: any[], emptyText: string): string {
  if (!rows.length) return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  return `<table><thead><tr><th>Artículo</th><th>Categoría</th><th>Cantidad</th><th>Unidad</th><th>Notas</th></tr></thead><tbody>${rows.map((row: any) => `<tr><td><b>${escapeHtml(text(row.itemName))}</b></td><td>${escapeHtml(text(row.category, '—'))}</td><td>${escapeHtml(String(row.quantity ?? '—'))}</td><td>${escapeHtml(text(row.unit, '—'))}</td><td>${escapeHtml(text(row.notes, '—'))}</td></tr>`).join('')}</tbody></table>`;
}

function tablewareWordHtml(event: any): string {
  const allocations = Array.isArray(event.tablewareAllocations) ? event.tablewareAllocations : [];
  const salonRows = allocations.filter((item: any) => item.source === 'salon_stock');
  const externalRows = allocations.filter((item: any) => item.source === 'external');
  return `<h2>Vajilla del salón</h2>${tablewareRowsWordHtml(salonRows, 'No se reservó vajilla del stock propio del salón para este evento.')}<h2>Vajilla adicional / externa</h2>${tablewareRowsWordHtml(externalRows, 'No se cargó vajilla adicional o externa para este evento.')}`;
}

function guestEntryControlWordHtml(event: any): string {
  const entries = guestControlEntries(event);
  if (!entries.length) return '<p class="empty">Todavía no hay invitados o mesas cargados para generar el control de ingreso.</p>';
  const legend = guestControlLegend(entries).map((item) => `<div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.detail)}</span></div>`).join('');
  return `<section class="control-legend">${legend}<div><b>Control</b><span>Números visibles en cada fila</span></div></section>${entries.map((entry: any) => { const rows = Array.from({ length: guestControlSlots(entry) }, (_, index) => { const guest = entry.guests[index]; const detail = guest ? guestControlDetail(guest) : ''; return `<tr><td class="number">${index + 1}</td><td class="guest-name">${guest ? `<b>${escapeHtml(guest.fullName)}</b>` : '................................................................................................'}</td><td class="guest-detail">${escapeHtml(detail)}</td></tr>`; }).join(''); const heading = `${entry.title.toUpperCase()}${entry.audience ? ` · ${entry.audience}` : ''} · ${entry.guests.length} lugar${entry.guests.length === 1 ? '' : 'es'}`; return `<section class="mesa-sheet"><h3>${escapeHtml(heading)}</h3>${entry.notes ? `<small>${escapeHtml(entry.notes)}</small>` : ''}<table class="mesa-list"><tbody>${rows}</tbody></table></section>`; }).join('')}`;
}

export function generateOperationalWord(event: any, type: OperationalDocumentType): { buffer: Buffer; fileName: string } {
  const customer = typeof event.customerId === 'object' ? event.customerId?.fullName : undefined;
  const salon = typeof event.salonId === 'object' ? event.salonId?.name : undefined;
  const details = [['Fecha', date(event.eventDate)], ['Horario', event.startTime || event.endTime ? `${event.startTime || 'A definir'} a ${event.endTime || 'A definir'}` : 'A confirmar'], ['Cliente', text(customer)], ['Salón', text(salon)], ['Tipo de evento', text(event.eventType)], ['Invitados', event.guestCount ? `${event.guestCount} personas` : 'A confirmar']];
  const detailsHtml = details.map(([label, value]) => `<div class="detail"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join('');
  const content = type === 'timeline'
    ? (() => {
      const items = Array.isArray(event.resourcePlanSnapshot?.timelineItems) ? event.resourcePlanSnapshot.timelineItems.filter((item: any) => item?.title || item?.notes) : [];
      if (!items.length) return `<p class="empty">Todavía no hay momentos cargados en el cronograma.</p>${guestListWordHtml(event)}`;
      const table = `<table><thead><tr><th>Hora</th><th>Momento</th><th>Área</th><th>Responsable</th><th>Estado</th><th>Notas</th></tr></thead><tbody>${items.map((item: any) => `<tr><td>${escapeHtml(text(item.time, '—'))}</td><td><b>${escapeHtml(text(item.title))}</b></td><td>${escapeHtml(text(item.area, '—'))}</td><td>${escapeHtml(text(item.owner, '—'))}</td><td>${escapeHtml(timelineStatuses[item.status] ?? text(item.status, 'Pendiente'))}</td><td>${escapeHtml(text(item.notes, '—'))}</td></tr>`).join('')}</tbody></table>`;
      const generalStaffNotes = Array.isArray(event.resourcePlanSnapshot?.staffNotes) ? event.resourcePlanSnapshot.staffNotes.filter((item: any) => text(item?.notes, '') !== '') : [];
      const notes = [
        ...generalStaffNotes.map((item: any) => ({ reference: text(item.title, 'Nota general para staff'), meta: 'Indicación general', note: text(item.notes, '') })),
        ...items.filter((item: any) => text(item.notes, '') !== '').map((item: any) => ({ reference: `${text(item.time, 'Sin horario')} · ${text(item.title, 'Momento sin título')}`, meta: [text(item.area, ''), text(item.owner, '')].filter(Boolean).join(' · '), note: text(item.notes, '') }))
      ];
      const staffNotes = notes.length ? `<h2>Notas para staff</h2><p class="staff-hint">Indicaciones clave para el equipo durante el evento.</p>${notes.map((item: any) => `<section class="note"><h3>${escapeHtml(item.reference)}</h3><small>${escapeHtml(item.meta)}</small><p>${escapeHtml(item.note).replace(/\n/g, '<br>')}</p></section>`).join('')}` : '';
      return `${table}${staffNotes}${guestListWordHtml(event)}`;
    })()
    : type === 'guest_list'
      ? guestEntryControlWordHtml(event)
      : type === 'tableware'
      ? tablewareWordHtml(event)
      : (() => {
      const logistics = event.resourcePlanSnapshot?.logistics ?? {};
      const entries = logisticSections.filter(([, key]) => text(logistics[key], '') !== '');
      return entries.length ? entries.map(([title, key]) => `<section class="note"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(logistics[key]).replace(/\n/g, '<br>')}</p></section>`).join('') : '<p class="empty">Todavía no hay indicaciones logísticas cargadas.</p>';
    })();
  if (type === 'guest_list') {
    const subtitle = [text(customer, ''), date(event.eventDate), text(salon, ''), 'Puerta y control'].filter(Boolean).join(' · ');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Control de mesas</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#1f1f1f;font-size:10pt}.guest-header{text-align:center;border-bottom:2px solid #b8965a;padding:4px 0 13px;margin-bottom:15px}.guest-header .brand{color:#a68244;font-size:8pt;font-weight:bold;letter-spacing:1px}.guest-header h1{font-size:18pt;letter-spacing:.6px;margin:7px 0 5px}.guest-header p{color:#7a7368;margin:0;font-size:9.5pt}.control-legend{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d8ccaf;margin:0 0 13px}.control-legend div{padding:8px 10px;border-right:1px solid #d8ccaf;min-height:31px}.control-legend div:last-child{border-right:0}.control-legend b{display:block;font-size:8pt;color:#1f1f1f}.control-legend span{display:block;color:#7a7368;font-size:7.5pt;margin-top:3px}.mesa-sheet{border:1px solid #d8ccaf;margin:0 0 10px;break-inside:avoid}.mesa-sheet h3{background:#fbf8f1;margin:0;padding:7px 10px;border-bottom:1px solid #d8ccaf;font-size:9.5pt}.mesa-sheet small{display:block;padding:5px 10px 0;color:#7a7368}.mesa-list{border-collapse:collapse;width:100%;font-size:9pt}.mesa-list td{padding:5px 8px;border-bottom:1px solid #eee8dc;vertical-align:top}.mesa-list tr:last-child td{border-bottom:0}.mesa-list .number{width:28px;text-align:right;color:#7a7368;font-weight:bold}.mesa-list .guest-name{width:57%}.mesa-list .guest-detail{color:#7a7368;font-size:8pt}.empty{color:#7a7368;background:#fbf8f1;padding:14px}</style></head><body><header class="guest-header"><div class="brand">M&M EVENTOS</div><h1>CONTROL DE MESAS</h1><p>${escapeHtml(subtitle)}</p></header>${content}</body></html>`;
    return { buffer: Buffer.from(html, 'utf8'), fileName: `${fileStem(event, type)}.doc` };
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle(type))}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#101827;font-size:10pt}.header{background:#101827;color:white;padding:18px 22px;margin:-18mm -18mm 18px}.brand{color:#ddc99f;letter-spacing:1px;font-size:9pt}.header h1{margin:6px 0 0;font-size:20pt}.subtitle{color:#dfe3e8;margin-top:5px}.details{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f4f6f8;padding:14px 16px;border-radius:8px}.detail b{display:block;color:#667085;font-size:7.5pt;text-transform:uppercase;letter-spacing:.4px}.detail span{display:block;margin-top:3px}h2{font-size:12pt;margin:22px 0 8px;border-bottom:2px solid #b8965a;padding-bottom:6px}table{border-collapse:collapse;width:100%;font-size:8.5pt}th{background:#101827;color:white;text-align:left;padding:8px}td{vertical-align:top;padding:8px;border-bottom:1px solid #dfe3e8}tr:nth-child(even){background:#fbf8f1}.note{background:#f4f6f8;border-left:4px solid #b8965a;padding:10px 14px;margin:10px 0}.note h2,.note h3{margin:0 0 7px;border:0;padding:0;font-size:10.5pt}.note small{display:block;color:#667085;margin:-3px 0 7px}.note p{margin:0;line-height:1.45}.guest-items{margin:7px 0 0;padding-left:18px}.guest-items li{margin:3px 0}.guest-items span{color:#667085}.entry-table{break-inside:avoid}.entry-control{margin-top:8px}.entry-control .number{width:26px;font-weight:bold;text-align:center}.entry-control .check{width:46px;font-weight:bold;white-space:nowrap}.staff-hint{color:#667085;margin:-2px 0 10px}.empty{color:#667085;background:#fbf8f1;padding:14px}</style></head><body><header class="header"><div class="brand">M&M EVENTOS · DOCUMENTO OPERATIVO</div><h1>${escapeHtml(documentTitle(type))}</h1><div class="subtitle">${escapeHtml(text(event.eventName || event.eventType, 'Evento'))}</div></header><div class="details">${detailsHtml}</div><h2>${escapeHtml(documentTitle(type))}</h2>${content}</body></html>`;
  return { buffer: Buffer.from(html, 'utf8'), fileName: `${fileStem(event, type)}.doc` };
}
