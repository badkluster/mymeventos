import { inflateSync } from 'zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ uploadBuffer: vi.fn() }));

vi.mock('../src/modules/uploads/cloudinary.service', () => ({ uploadBuffer: mocks.uploadBuffer }));

import { generateAndUploadQuotePdf } from '../src/modules/crm/quote-pdf.service';

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

describe('quote PDF observations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.uploadBuffer.mockResolvedValue({ secureUrl: 'https://example.test/quote.pdf', url: 'http://example.test/quote.pdf', publicId: 'quote-pdf' });
  });

  it('renders long observations across pages without truncating their ending', async () => {
    const finalMarker = 'OBSERVACION-COMPLETA-SIN-RECORTAR';
    const observations = `${Array.from({ length: 120 }, (_, index) => `Párrafo ${index + 1}: esta observación debe conservarse íntegra en el presupuesto generado.`).join('\n\n')}\n\n${finalMarker}`;

    await generateAndUploadQuotePdf({
      _id: 'quote-id', quoteNumber: 'P-2026-00001', contactName: 'Ana Pérez', eventType: 'Cumpleaños', eventDate: '2026-12-05', guestCount: 80,
      pricingMode: 'fixed', totalAmount: 1500000, depositAmount: 300000, balanceAmount: 1200000, fixedPrice: 1500000, finalFixedPrice: 1500000,
      startTime: '21:00', endTime: '05:00', packageName: 'Noche especial', validUntil: '2026-10-01', observations
    });

    const uploadedPdf = mocks.uploadBuffer.mock.calls[0][0] as Buffer;
    expect(uploadedPdf.subarray(0, 4).toString()).toBe('%PDF');
    expect((uploadedPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(2);
    expect(pdfText(uploadedPdf)).toContain(finalMarker);
  });
});
