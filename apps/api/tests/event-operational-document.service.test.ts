import { describe, expect, it } from 'vitest';
import { generateOperationalPdf, generateOperationalWord } from '../src/modules/crm/event-operational-document.service';

function html(buffer: Buffer): string {
  return buffer.toString('utf8');
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
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

  it('only renders areas that actually have content, each with its own numbered heading', () => {
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

    // Sin logística, vajilla/stock, productos, proveedores ni staff cargados, esas áreas no deben aparecer.
    expect(body).not.toContain('3. Logística y coordinación');
    expect(body).not.toContain('4. Vajilla y stock');
    expect(body).not.toContain('5. Productos e insumos');
    expect(body).not.toContain('6. Proveedores');
    expect(body).not.toContain('7. Staff asignado y roles');
  });

  it('renders all seven areas with their real data when everything is loaded, without duplicating the "Invitados y mesas" heading', () => {
    const body = html(generateOperationalWord(fullEvent, 'full').buffer);

    expect(body).toContain('1. Momentos del evento');
    expect(body).toContain('Recepción de invitados');
    expect(body).toContain('2. Invitados y mesas');
    expect(body).toContain('Ana Pérez');
    expect(body).toContain('3. Logística y coordinación');
    expect(body).toContain('Llegar a las 18hs');
    expect(body).toContain('4. Vajilla y stock');
    expect(body).toContain('Plato playo');
    expect(body).toContain('Copa de champagne extra');
    expect(body).toContain('Mantel blanco cajón');
    expect(body).toContain('5. Productos e insumos');
    expect(body).toContain('Salados');
    expect(body).toContain('Dulces');
    expect(body).toContain('Empanadas de carne');
    expect(body).toContain('6. Proveedores');
    expect(body).toContain('DJ Martín');
    expect(body).toContain('7. Staff asignado y roles');
    expect(body).toContain('Lucía Gómez');
    expect(body).toContain('Metre');
    expect(body).toContain('Confirmado');

    expect(countOccurrences(body, 'class="area"')).toBe(7);
    // El área 2 ya trae su propio título numerado ("2. Invitados y mesas"); el heading interno de
    // guestListWordHtml debe quedar suprimido para no repetirlo pegado.
    expect(countOccurrences(body, 'Invitados y mesas')).toBe(1);
  });

  it('produces a valid, non-trivial PDF buffer for the full report and a bigger one when there is more content', async () => {
    const empty = await generateOperationalPdf(minimalEvent, 'full');
    const full = await generateOperationalPdf(fullEvent, 'full');

    expect(empty.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(full.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(full.fileName).toBe('cronograma-integral-cumpleanos-de-camila.pdf');
    expect(full.buffer.length).toBeGreaterThan(empty.buffer.length);
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
});
