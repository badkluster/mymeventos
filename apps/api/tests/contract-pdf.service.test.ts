import { inflateSync } from 'zlib';
import { describe, expect, it } from 'vitest';

import { buildContractPdfBuffer } from '../src/modules/crm/contract-pdf.service';

function pdfText(buffer: Buffer): string {
  const source = buffer.toString('latin1');
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try {
      return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      return match[1];
    }
  }).map((stream) => [...stream.matchAll(/<([0-9a-fA-F]+)>/g)].map((match) => Buffer.from(match[1], 'hex').toString('latin1')).join('')).join('\n');
}

function pdfPageTexts(buffer: Buffer): string[] {
  const source = buffer.toString('latin1');
  const pageObjects = [...source.matchAll(/\d+ 0 obj\s*<<([\s\S]*?)>>\s*endobj/g)]
    .map((match) => match[1])
    .filter((body) => /\/Type\s*\/Page\b/.test(body));
  return pageObjects.map((pageObject) => {
    const contentId = pageObject.match(/\/Contents\s+(\d+)\s+0\s+R/)?.[1];
    expect(contentId).toBeDefined();
    const stream = source.match(new RegExp(`\\b${contentId} 0 obj\\s*<<[\\s\\S]*?>>\\s*stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`))?.[1];
    expect(stream).toBeDefined();
    const content = inflateSync(Buffer.from(stream!, 'latin1')).toString('latin1');
    return [...content.matchAll(/<([0-9a-fA-F]+)>/g)].map((match) => Buffer.from(match[1], 'hex').toString('latin1')).join('');
  });
}

describe('contract PDF considerations', () => {
  it('identifies M&M Eventos and its representative in the provider section', async () => {
    const pdf = await buildContractPdfBuffer({
      contractNumber: 'C-2026-00001',
      customerSnapshot: { fullName: 'Ana Pérez' },
      eventSnapshot: {},
      commercialSnapshot: {},
      totalAmount: 0,
      balanceAmount: 0,
      legalTermsSnapshot: { clauses: [] }
    });

    const content = pdfText(pdf);
    expect(content).toContain('M&M Eventos');
    expect(content).toContain('Natalia Argüello');
    expect(content).toContain('DNI 35.394.779');
  });

  it('renders long considerations across pages without truncating their ending', async () => {
    const finalMarker = 'CONTRATO-CONSIDERACION-COMPLETA-SIN-RECORTAR';
    const considerations = `${Array.from({ length: 140 }, (_, index) => `Párrafo ${index + 1}: esta consideración debe conservarse íntegra en el contrato generado.`).join('\n\n')}\n\n${finalMarker}`;

    const pdf = await buildContractPdfBuffer({
      contractNumber: 'C-2026-00001',
      customerSnapshot: { fullName: 'Ana Pérez', phone: '1112345678' },
      eventSnapshot: { eventName: 'Cumpleaños de Ana', eventDate: '2026-12-05', guestCount: 80, startTime: '21:00', endTime: '05:00', salonName: 'Salón Central' },
      commercialSnapshot: { depositAmount: 300000, paymentTerms: 'Seña y saldo.' },
      totalAmount: 1500000,
      balanceAmount: 1200000,
      considerations,
      legalTermsSnapshot: { clauses: [] }
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(2);
    expect(pdfText(pdf)).toContain(finalMarker);
  });

  it('keeps legal headings with their text and both signatures with conformity across payment plans', async () => {
    const legalText = 'Las partes acuerdan las condiciones del evento y se comprometen a cumplirlas durante la prestación del servicio. ';
    const clauses = Array.from({ length: 18 }, (_, index) => ({
      title: index === 12 ? 'Fondo de garantía' : index === 13 ? 'Fuerza mayor' : `Cláusula de prueba ${index + 1}`,
      text: `${legalText.repeat(index === 12 || index === 13 ? 12 : index === 14 ? 20 : 3)}\n\nCIERRE-CLAUSULA-${index + 1}`
    }));
    for (const installmentCount of [0, 4, 8, 12, 16, 20]) {
      const clientName = installmentCount === 20
        ? 'Cliente de prueba con apellido extendido para verificar el espacio de las firmas'
        : 'Cliente de prueba';
      const pdf = await buildContractPdfBuffer({
        contractNumber: `C-TEST-${installmentCount}`,
        customerSnapshot: { fullName: clientName },
        eventSnapshot: {}, commercialSnapshot: {}, totalAmount: 0, balanceAmount: 0,
        paymentPlanSnapshot: Array.from({ length: installmentCount }, (_, index) => ({ label: `Cuota ${index + 1}`, amount: 1000 })),
        legalTermsSnapshot: { clauses }
      });
      const pages = pdfPageTexts(pdf);
      expect(pages.length).toBeGreaterThan(1);
      clauses.forEach((clause, index) => {
        const titlePage = pages.find((pageText) => pageText.includes(`${index + 1}. ${clause.title}`));
        expect(titlePage).toBeDefined();
        expect(titlePage!.indexOf('Laspartesacuerdan', titlePage!.indexOf(`${index + 1}. ${clause.title}`))).toBeGreaterThan(-1);
        expect(pages.join('')).toContain(`CIERRE-CLAUSULA-${index + 1}`);
      });
      const conformityPage = pages.find((pageText) => pageText.includes('Conformidad'));
      expect(conformityPage).toContain('En prueba de conformidad');
      expect(conformityPage).toContain('M&M Eventos · Prestadora');
      expect(conformityPage).toContain('Cliente de prueba');
      expect(pages.at(-1)).toBe(conformityPage);
    }
  });
});
