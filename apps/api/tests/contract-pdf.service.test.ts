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

describe('contract PDF considerations', () => {
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
});
