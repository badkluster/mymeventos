import { describe, expect, it } from 'vitest';
import { ticketPdfCoverUrl } from '../src/modules/tickets/ticket-pdf.service';

describe('ticketPdfCoverUrl', () => {
  it('forces Cloudinary covers to a PDFKit-compatible JPEG rendition', () => {
    expect(ticketPdfCoverUrl('https://res.cloudinary.com/mym/image/upload/f_auto,q_auto/v1/tickets/cover.webp'))
      .toBe('https://res.cloudinary.com/mym/image/upload/f_jpg,q_auto/v1/tickets/cover.webp');
  });

  it('keeps non-Cloudinary cover URLs unchanged', () => {
    expect(ticketPdfCoverUrl('https://example.test/cover.png')).toBe('https://example.test/cover.png');
  });
});
