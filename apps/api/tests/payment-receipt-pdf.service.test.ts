import { inflateSync } from 'zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ uploadBuffer: vi.fn(), deleteAsset: vi.fn() }));

vi.mock('../src/modules/uploads/cloudinary.service', () => ({
  uploadBuffer: mocks.uploadBuffer,
  deleteAsset: mocks.deleteAsset
}));

import { buildPaymentReceiptPdfBuffer, generateAndUploadPaymentReceiptPdf } from '../src/modules/crm/payment-receipt-pdf.service';

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

describe('payment receipt PDF', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('identifies the provider receiving the payment', async () => {
    const pdf = await buildPaymentReceiptPdfBuffer(
      { paymentNumber: 'P-2026-00001', amount: 250000, method: 'cash', paidAt: '2026-09-30T15:00:00.000Z' },
      { eventName: 'Cumpleaños de Ana', eventDate: '2026-12-05' },
      { fullName: 'Ana Pérez' },
      { contractNumber: 'C-2026-00001', balanceAmount: 500000, paymentPlanSnapshot: [] }
    );

    const content = pdfText(pdf);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(content).toContain('PRESTADORA / RECIBE EL PAGO');
    expect(content).toContain('M&M Eventos');
    expect(content).toContain('Natalia Argüello');
    expect(content).toContain('DNI 35.394.779');
  });

  it('overwrites the current receipt instead of accumulating PDF assets', async () => {
    mocks.uploadBuffer.mockResolvedValue({
      publicId: 'mym-eventos/payments/payment-1/comprobante-PAY-2026-00001',
      url: 'http://example.test/receipt.pdf',
      secureUrl: 'https://example.test/receipt.pdf'
    });

    await generateAndUploadPaymentReceiptPdf(
      { _id: 'payment-1', paymentNumber: 'PAY-2026-00001', receiptPdfPublicId: 'mym-eventos/payments/payment-1/comprobante-PAY-2026-00001' },
      {},
      {},
      {}
    );

    expect(mocks.uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ overwrite: true, invalidate: true }));
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });

  it('removes a legacy receipt only after its replacement is uploaded', async () => {
    mocks.uploadBuffer.mockResolvedValue({
      publicId: 'mym-eventos/payments/payment-1/comprobante-PAY-2026-00001',
      url: 'http://example.test/receipt.pdf',
      secureUrl: 'https://example.test/receipt.pdf'
    });
    mocks.deleteAsset.mockResolvedValue(undefined);

    await generateAndUploadPaymentReceiptPdf(
      { _id: 'payment-1', paymentNumber: 'PAY-2026-00001', receiptPdfPublicId: 'legacy-receipt-id' },
      {},
      {},
      {}
    );

    expect(mocks.deleteAsset).toHaveBeenCalledWith('legacy-receipt-id', 'raw');
  });
});
