import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { generateGuestListSinglePagePdf, generateOperationalPdf, generateOperationalWord } from '../src/modules/crm/event-operational-document.service';

function html(buffer: Buffer): string {
  return buffer.toString('utf8');
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

/** Extrae los textos codificados en hexadecimal de los streams comprimidos de PDFKit. */
function pdfContentText(buffer: Buffer): string {
  const streams = Array.from(buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g));
  const content = streams.map((stream) => {
    try { return inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1'); }
    catch { return stream[1]; }
  }).join('\n');
  const encodedText = Array.from(content.matchAll(/<([0-9A-Fa-f]+)>/g)).map((match) => Buffer.from(match[1], 'hex'));
  return Buffer.concat(encodedText).toString('latin1');
}

function pdfPageCount(buffer: Buffer): number {
  return buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

const minimalEvent: any = { _id: 'evt-empty', eventName: 'Evento vacío' };

const fullEvent: any = {
  _id: 'evt-full',
  eventName: 'Cumpleaños de Camila',
  eventType: 'Cumpleaños',
  eventDate: new Date('2026-05-29T00:00:00.000Z'),
  startTime: '21:00',
  endTime: '03:00',
  guestCount: 80,
  customerId: { fullName: 'Familia Kopke' },
  salonId: { name: 'San Carlos' },
  resourcePlanSnapshot: {
    timelineItems: [{ id: 't1', time: '21:00', title: 'Recepción de invitados', area: 'Recepción', owner: 'Staff', status: 'pending', notes: 'Recibe la cumpleañera, sin alcohol para los chicos.' }],
    staffNotes: [{ id: 'sn1', title: 'Protocolo y momentos especiales', notes: 'El metre confirma cada momento con el cliente antes de avanzar.' }],
    guestList: { tables: [{ id: 'mesa1', name: 'Mesa 1 Principal', capacity: 10, audience: 'family' }], guests: [{ fullName: 'Ana Pérez', tableId: 'mesa1', meal: 'Pollo' }] },
    logistics: { eventSetupNotes: 'Llegar a las 18hs y armar el salón con mantelería blanca.' },
    inventoryItems: [{ id: 'inv1', name: 'Mantel blanco cajón', category: 'Mantelería', quantityRequired: 1, unit: 'unidad', status: 'reserved' }],
    linenItems: [{ id: 'linen1', name: 'Mantel blanco cajón', ownQuantity: 1, rentedQuantity: 0, unit: 'unidad', notes: 'Mesa principal.' }],
    productItems: [
      { id: 'p1', name: 'Empanadas de carne', productionCategory: 'savory', quantity: 14, unit: 'u.', supplierName: 'Catering XYZ', totalCost: 14000, status: 'planned' },
      { id: 'p2', name: 'Brownie con helado', productionCategory: 'sweet', quantity: 65, unit: 'u.', status: 'planned' }
    ],
    supplierAssignments: [{ id: 's1', supplierName: 'DJ Martín', category: 'DJ', serviceType: 'Animación y sonido', status: 'confirmed', agreedAmount: 150000 }]
  },
  tablewareAllocations: [
    { itemName: 'Plato playo', category: 'Vajilla', quantity: 80, unit: 'unidad', source: 'salon_stock' },
    { itemName: 'Copa de champagne extra', category: 'Vajilla', quantity: 20, unit: 'unidad', source: 'external' }
  ],
  staffAssignments: [
    { staffUserId: { fullName: 'Lucía Gómez' }, staffSubrole: 'MAITRE', status: 'confirmed', shiftStart: new Date('2026-05-29T21:00:00.000Z'), shiftEnd: new Date('2026-05-30T03:00:00.000Z') }
  ]
};

describe('event-operational-document.service — cronograma integral (type "full")', () => {
  it('renders only the "no content" message when the event has nothing loaded', () => {
    const word = generateOperationalWord(minimalEvent, 'full');
    const body = html(word.buffer);
    expect(body).toContain('Todavía no se cargó contenido operativo para este evento.');
    expect(body).not.toContain('class="area"');
  });

  it('only renders areas that actually have content, each on its own print page with a numbered heading', async () => {
    const partialEvent: any = {
      _id: 'evt-partial',
      eventName: 'Evento parcial',
      resourcePlanSnapshot: {
        timelineItems: [{ id: 't1', time: '21:00', title: 'Recepción', area: 'Salón', owner: 'Coordinación', status: 'pending' }],
        guestList: { tables: [{ id: 'mesa1', name: 'Mesa 1', capacity: 10 }], guests: [{ fullName: 'Ana Pérez', tableId: 'mesa1' }] }
      }
    };
    const body = html(generateOperationalWord(partialEvent, 'full').buffer);

    expect(body).toContain('1. Momentos del evento');
    expect(body).toContain('2. Invitados y mesas');
    expect(body).toContain('Ana Pérez');
    expect(countOccurrences(body, 'class="area"')).toBe(2);
    expect(body).toContain('.area,.staff-notes{break-before:page;page-break-before:always}');

    const pdf = await generateOperationalPdf(partialEvent, 'full');
    // Portada, Momentos e Invitados: los tres bloques deben iniciar en hojas distintas.
    expect(pdfPageCount(pdf.buffer)).toBe(3);

    // Sin logística, vajilla, mantelería, productos, proveedores ni staff cargados, esas áreas no deben aparecer.
    expect(body).not.toContain('3. Logística y coordinación');
    expect(body).not.toContain('4. Inventario de vajilla');
    expect(body).not.toContain('5. Registro operativo de mantelería');
    expect(body).not.toContain('7. Productos e insumos');
    expect(body).not.toContain('8. Proveedores');
    expect(body).not.toContain('9. Staff asignado y roles');
  });

  it('renders all loaded areas with separate vajilla and mantelería controls, without duplicating the "Invitados y mesas" heading', () => {
    const body = html(generateOperationalWord(fullEvent, 'full').buffer);

    expect(body).toContain('1. Momentos del evento');
    expect(body).toContain('Recepción de invitados');
    expect(body).toContain('2. Invitados y mesas');
    expect(body).toContain('Ana Pérez');
    expect(body).toContain('3. Logística y coordinación');
    expect(body).toContain('Llegar a las 18hs');
    expect(body).toContain('4. Inventario de vajilla');
    expect(body).toContain('Plato playo');
    expect(body).toContain('Copa de champagne extra');
    expect(body).toContain('Stock propio del salón');
    expect(body).toContain('Alquilada / externa');
    expect(body).toContain('Inicio');
    expect(body).toContain('Fin');
    expect(body).toContain('5. Registro operativo de mantelería');
    expect(body).toContain('Mantel blanco cajón');
    expect(body).toContain('1 propio');
    expect(body).toContain('7. Productos e insumos');
    expect(body).toContain('Salados');
    expect(body).toContain('Dulces');
    expect(body).toContain('Empanadas de carne');
    expect(body).toContain('8. Proveedores');
    expect(body).toContain('DJ Martín');
    expect(body).toContain('9. Staff asignado y roles');
    expect(body).toContain('Lucía Gómez');
    expect(body).toContain('Metre');
    expect(body).toContain('Confirmado');

    expect(countOccurrences(body, 'class="area"')).toBe(8);
    // El área 2 ya trae su propio título numerado ("2. Invitados y mesas"); el heading interno de
    // guestListWordHtml debe quedar suprimido para no repetirlo pegado.
    expect(countOccurrences(body, 'Invitados y mesas')).toBe(1);
  });

  it('uses Spanish status labels even when legacy data sends English status values', () => {
    const eventWithLegacyStatuses: any = {
      ...fullEvent,
      resourcePlanSnapshot: {
        ...fullEvent.resourcePlanSnapshot,
        timelineItems: [{ ...fullEvent.resourcePlanSnapshot.timelineItems[0], status: 'Completed' }],
        inventoryItems: [{ ...fullEvent.resourcePlanSnapshot.inventoryItems[0], status: 'COMPLETED' }],
        productItems: [{ ...fullEvent.resourcePlanSnapshot.productItems[0], status: 'completed' }],
        supplierAssignments: [{ ...fullEvent.resourcePlanSnapshot.supplierAssignments[0], status: 'Completed' }]
      },
      staffAssignments: [{ ...fullEvent.staffAssignments[0], status: 'COMPLETED' }]
    };
    const body = html(generateOperationalWord(eventWithLegacyStatuses, 'full').buffer);

    expect(countOccurrences(body, 'Completado')).toBeGreaterThanOrEqual(3);
    expect(body).not.toContain('Completed');
    expect(body).toContain('.area,.staff-notes{break-before:page;page-break-before:always}');
  });

  it('produces a valid, non-trivial PDF buffer for the full report and a bigger one when there is more content', async () => {
    const empty = await generateOperationalPdf(minimalEvent, 'full');
    const full = await generateOperationalPdf(fullEvent, 'full');

    expect(empty.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(full.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(full.fileName).toBe('cronograma-integral-cumpleanos-de-camila.pdf');
    expect(full.buffer.length).toBeGreaterThan(empty.buffer.length);
  });

  it('prints complete multi-line text for long moment titles in the full schedule PDF', async () => {
    const longTitle = 'Postre / Video cronológico / Cintitas de colores / saludo especial de la familia';
    const longArea = 'Salón principal - sector de proyección y mesa dulce';
    const longOwner = 'Coordinación general junto al DJ y al responsable de catering';
    const pdf = await generateOperationalPdf({
      ...minimalEvent,
      resourcePlanSnapshot: {
        timelineItems: [{ time: '01:00', title: longTitle, area: longArea, owner: longOwner, status: 'pending' }]
      }
    }, 'full');

    const content = pdfContentText(pdf.buffer);
    expect(content).toContain(longTitle);
    expect(content).not.toContain(longArea);
    expect(content).not.toContain(longOwner);
  });

  it('shows only time, moment and notes in the timeline PDF and Word, omitting area, owner and status', async () => {
    const area = 'Área interna que no debe imprimirse';
    const owner = 'Responsable interno que no debe imprimirse';
    const pdf = await generateOperationalPdf({
      ...minimalEvent,
      resourcePlanSnapshot: {
        timelineItems: [{ time: '21:00', title: 'Ingreso de invitados', area, owner, status: 'done', notes: 'Abrir las puertas a horario.' }]
      }
    }, 'full');
    const word = html(generateOperationalWord({
      ...minimalEvent,
      resourcePlanSnapshot: {
        timelineItems: [{ time: '21:00', title: 'Ingreso de invitados', area, owner, status: 'done', notes: 'Abrir las puertas a horario.' }]
      }
    }, 'full').buffer);
    const content = pdfContentText(pdf.buffer);

    expect(content).toContain('Ingreso de invitados');
    expect(content).toContain('Abrir las puertas a horario.');
    expect(content).not.toContain(area);
    expect(content).not.toContain(owner);
    expect(content).not.toContain('ÁREA');
    expect(content).not.toContain('RESPONSABLE');
    expect(content).not.toContain('ESTADO');
    expect(word).not.toContain('<th>Área</th>');
    expect(word).not.toContain('<th>Responsable</th>');
    expect(word).not.toContain('<th>Estado</th>');
  });

  it('does not repeat notes already attached to moments in the staff notes section', async () => {
    const momentNote = 'Abrir puertas y confirmar el ingreso con la familia.';
    const event = {
      ...minimalEvent,
      resourcePlanSnapshot: {
        timelineItems: [{ time: '21:00', title: 'Recepción de invitados', notes: momentNote }]
      }
    };
    const pdf = await generateOperationalPdf(event, 'full');
    const word = html(generateOperationalWord(event, 'full').buffer);

    // Portada y la hoja propia de Momentos.
    expect(pdfPageCount(pdf.buffer)).toBe(2);
    expect(pdfContentText(pdf.buffer)).toContain(momentNote);
    expect(pdfContentText(pdf.buffer)).not.toContain('Notas para staff');
    expect(word).toContain(momentNote);
    expect(word).not.toContain('<h2>Notas para staff</h2>');
  });

  it('uses a compact two-column layout when it keeps all event moments on their dedicated page', async () => {
    const timelineItems = Array.from({ length: 15 }, (_, index) => ({
      time: `${String(18 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
      title: `Momento operativo ${index + 1} con coordinación general`,
      notes: index === 0
        ? 'Colocar cubiertos, plato de postre y copas. Preparar vasos para chicos, bebida a mesa y barra de tragos sin alcohol antes del ingreso de invitados.'
        : index === 14
          ? 'Contar mantelería y vajilla, sacar la basura, dejar todo ordenado y entregar el sobrante de comida a la familia.'
          : index % 3 === 0 ? 'Confirmar con el responsable, preparar el sector y avisar al equipo antes de avanzar.' : ''
    }));
    const pdf = await generateOperationalPdf({ ...minimalEvent, resourcePlanSnapshot: { timelineItems } }, 'full');

    expect(pdfPageCount(pdf.buffer)).toBe(2);
    expect(pdfContentText(pdf.buffer)).toContain('Momento operativo 15 con coordinación general');
  });

  it('prints vajilla and mantelería as separate compact operational control tables in the full schedule PDF', async () => {
    const pdf = await generateOperationalPdf(fullEvent, 'full');
    const content = pdfContentText(pdf.buffer);

    expect(content).toContain('Inventario de vajilla');
    expect(content).toContain('Plato playo');
    expect(content).toContain('Stock propio del salón');
    expect(content).toContain('Registro operativo de mantelería');
    expect(content).toContain('Mantel blanco cajón');
    expect(content).toContain('1 propio');
    expect(content).toContain('INICIO');
    expect(content).toContain('FIN');
  });

  it('starts staff notes on their own print page and continues only when the notes need it', async () => {
    const staffNotes = Array.from({ length: 16 }, (_, index) => ({
      title: `Indicación operativa ${index + 1}`,
      notes: 'Confirmar responsable, horario, elementos necesarios y comunicación con coordinación antes de avanzar al próximo momento.'
    }));
    const eventWithNotes = {
      ...minimalEvent,
      resourcePlanSnapshot: {
        timelineItems: [{ time: '21:00', title: 'Recepción de invitados', area: 'Salón', owner: 'Coordinación', status: 'pending' }],
        staffNotes
      }
    };
    const oneNotePdf = await generateOperationalPdf({
      ...eventWithNotes,
      resourcePlanSnapshot: { ...eventWithNotes.resourcePlanSnapshot, staffNotes: staffNotes.slice(0, 1) }
    }, 'full');
    const pdf = await generateOperationalPdf(eventWithNotes, 'full');

    // Portada, Momentos y una hoja independiente para la nota.
    expect(pdfPageCount(oneNotePdf.buffer)).toBe(3);
    // El conjunto extenso continúa luego de su propia hoja inicial.
    expect(pdfPageCount(pdf.buffer)).toBeGreaterThanOrEqual(4);
    expect(pdfContentText(pdf.buffer)).toContain('Notas para staff');
    expect(pdfContentText(pdf.buffer)).toContain('Indicación operativa 16');
  });

  it('fits 10 guest tables on their own portrait page in the full schedule', async () => {
    const tables = Array.from({ length: 10 }, (_, index) => ({ id: `mesa${index + 1}`, name: `Mesa ${index + 1}`, capacity: 10, audience: index < 3 ? 'family' : 'open' }));
    const guests = Array.from({ length: 100 }, (_, index) => ({ fullName: `Invitado ${String(index + 1).padStart(2, '0')} Apellido`, tableId: tables[Math.floor(index / 10)].id }));
    const pdf = await generateOperationalPdf({
      ...minimalEvent,
      resourcePlanSnapshot: { guestList: { tables, guests } }
    }, 'full');

    expect(pdfPageCount(pdf.buffer)).toBe(2);
    expect(pdfContentText(pdf.buffer)).toContain('MESA 10');
    expect(pdfContentText(pdf.buffer)).toContain('Invitado 100 Apellido');
  });

  it('limits the guest table detail to age group and dietary restrictions, excluding operational menu and notes', async () => {
    const meal = 'Menú interno que no debe imprimirse';
    const operationalNote = 'Observación operativa que no debe imprimirse';
    const tableNote = 'Nota de mesa interna que no debe imprimirse';
    const pdf = await generateOperationalPdf({
      ...minimalEvent,
      resourcePlanSnapshot: {
        guestList: {
          tables: [{ id: 'mesa1', name: 'Mesa familia', capacity: 2, audience: 'family', notes: tableNote }],
          guests: [{ fullName: 'Pérez, Martina', tableId: 'mesa1', ageGroup: 'minor_10_17', dietaryPreference: 'lactose_free', meal, notes: operationalNote }]
        }
      }
    }, 'full');
    const content = pdfContentText(pdf.buffer);

    expect(content).toContain('Pérez, Martina');
    expect(content).toContain('Sin lactosa');
    expect(content).toContain('10 a 17 años');
    expect(content).not.toContain(meal);
    expect(content).not.toContain(operationalNote);
    expect(content).not.toContain(tableNote);
  });
});

describe('event-operational-document.service — existing single-purpose documents keep their exact scope', () => {
  it('"timeline" still combines momentos and invitados with its own heading, unaffected by the "full" refactor', () => {
    const body = html(generateOperationalWord(fullEvent, 'timeline').buffer);
    expect(body).toContain('Recepción de invitados');
    expect(countOccurrences(body, 'Invitados y mesas')).toBe(1);
    expect(body).not.toContain('1. Momentos del evento');
  });

  it('"tableware" keeps showing only salon_stock/external allocations, not the general inventoryItems list', () => {
    const body = html(generateOperationalWord(fullEvent, 'tableware').buffer);
    expect(body).toContain('Plato playo');
    expect(body).toContain('Copa de champagne extra');
    expect(body).not.toContain('Mantel blanco cajón');
  });

  it('all pre-existing document types still generate a valid PDF and Word buffer', async () => {
    for (const type of ['timeline', 'logistics', 'guest_list', 'tableware'] as const) {
      const pdf = await generateOperationalPdf(fullEvent, type);
      expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
      const word = generateOperationalWord(fullEvent, type);
      expect(word.buffer.length).toBeGreaterThan(0);
    }
  });

  it('fits 10 full tables into exactly one landscape A4 page', async () => {
    const tables = Array.from({ length: 10 }, (_, index) => ({
      id: `mesa${index + 1}`,
      name: `Mesa ${index + 1}`,
      capacity: 10,
      audience: index === 0 ? 'children' : index < 4 ? 'family' : 'open',
      notes: index === 0 ? 'Confirmar ingreso con la persona adulta responsable.' : ''
    }));
    const guests = Array.from({ length: 100 }, (_, index) => ({
      fullName: `Invitado ${String(index + 1).padStart(2, '0')} Apellido`,
      tableId: tables[Math.floor(index / 10)].id,
      ageGroup: index < 10 ? 'minor_10_17' : undefined,
      meal: index % 9 === 0 ? 'Menú infantil' : '',
      dietaryPreference: index % 13 === 0 ? 'vegetarian' : 'none'
    }));
    const compact = await generateGuestListSinglePagePdf({
      ...fullEvent,
      guestCount: guests.length,
      resourcePlanSnapshot: { ...fullEvent.resourcePlanSnapshot, guestList: { tables, guests } }
    });
    const source = compact.buffer.toString('latin1');

    expect(compact.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(compact.fileName).toBe('control-ingreso-mesas-cumpleanos-de-camila-a4-una-hoja.pdf');
    expect(source.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    expect(source).toContain('/MediaBox [0 0 841.89 595.28]');
  });
});
