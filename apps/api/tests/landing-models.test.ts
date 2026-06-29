import { describe, expect, it } from 'vitest';
import {
  LandingFaq,
  LandingGalleryItem,
  LandingPromotion,
  LandingSettings,
  LandingTestimonial,
} from '../src/modules/landing/landing.models';

describe('Landing models', () => {
  it('creates default landing settings', async () => {
    const settings = new LandingSettings({ key: 'default' });
    await expect(settings.validate()).resolves.toBeUndefined();
    expect(settings.heroTitle).toContain('Tu evento');
  });

  it('validates promotions with visibility defaults', async () => {
    const promotion = new LandingPromotion({ title: 'Promo Junio' });
    await expect(promotion.validate()).resolves.toBeUndefined();
    expect(promotion.active).toBe(true);
    expect(promotion.visibleOnHome).toBe(true);
  });

  it('requires image url for gallery items', async () => {
    await expect(new LandingGalleryItem({ title: 'Salón ambientado', imageUrl: 'https://example.com/image.jpg' }).validate()).resolves.toBeUndefined();
    await expect(new LandingGalleryItem({ title: 'Sin imagen' }).validate()).rejects.toThrow();
  });

  it('bounds testimonial rating', async () => {
    await expect(new LandingTestimonial({ quote: 'Excelente servicio', customerName: 'Cliente', rating: 5 }).validate()).resolves.toBeUndefined();
    await expect(new LandingTestimonial({ quote: 'Excelente servicio', customerName: 'Cliente', rating: 8 }).validate()).rejects.toThrow();
  });

  it('requires faq answer', async () => {
    await expect(new LandingFaq({ question: '¿Cómo reservo?', answer: 'Con una seña.' }).validate()).resolves.toBeUndefined();
    await expect(new LandingFaq({ question: '¿Cómo reservo?' }).validate()).rejects.toThrow();
  });
});
