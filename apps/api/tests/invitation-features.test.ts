import { describe, expect, it } from 'vitest';
import { basicFeatures, premiumFeatures, validateInvitationContent, validateInvitationCustomization } from '../src/modules/invitations/invitation-features.service';

const baseSection = { id: 'hero', type: 'hero', enabled: true, order: 0, background: { type: 'transparent' }, data: {} };

describe('digital invitation template restrictions', () => {
  it('allows the configured BASIC section set and rejects premium-only sections', () => {
    const content = { sections: Array.from({ length: 10 }, (_, order) => ({ ...baseSection, id: `section-${order}`, order })) };
    expect(() => validateInvitationContent(content, basicFeatures)).not.toThrow();
    expect(() => validateInvitationContent({ sections: [{ ...baseSection, type: 'music' }] }, basicFeatures)).toThrow('no está disponible');
    expect(() => validateInvitationContent({ sections: [{ ...baseSection, type: 'opening' }] }, basicFeatures)).toThrow('exclusiva de plantillas premium');
  });

  it('enforces the gallery limit in the API validation layer', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `image-${index}`, type: 'image', url: `https://res.cloudinary.com/demo/image/upload/image-${index}.jpg` }));
    expect(() => validateInvitationContent({ sections: [{ ...baseSection, type: 'gallery', data: { items } }] }, basicFeatures)).toThrow('hasta 4 imágenes');
    expect(() => validateInvitationContent({ sections: [{ ...baseSection, type: 'gallery', data: { items } }] }, premiumFeatures)).not.toThrow();
  });

  it('rejects a media background for a tier without section backgrounds', () => {
    const content = { sections: [{ ...baseSection, background: { type: 'image' } }] };
    expect(() => validateInvitationContent(content, basicFeatures)).toThrow('fondos por sección');
    expect(() => validateInvitationCustomization({ content }, basicFeatures)).toThrow('imágenes o videos como fondo de sección');
  });
});
