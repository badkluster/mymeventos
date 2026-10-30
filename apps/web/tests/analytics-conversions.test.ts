import { describe, expect, it } from 'vitest';
import { buildGa4Payload, classifyContactHref, venueCodeForSalon, venueCodeFromPath } from '@/lib/analytics-conversions';

describe('contact click classification', () => {
  it('counts only real WhatsApp destinations as whatsapp_click', () => {
    expect(classifyContactHref('https://wa.me/5492215791025?text=Hola')).toBe('whatsapp_click');
    expect(classifyContactHref('https://api.whatsapp.com/send?phone=549221')).toBe('whatsapp_click');
    expect(classifyContactHref('https://web.whatsapp.com/')).toBe('whatsapp_click');
    // The internal salon picker is an intermediate step, not a contact.
    expect(classifyContactHref('https://www.mymsalones.com.ar/whatsapp')).toBeNull();
    expect(classifyContactHref('')).toBeNull();
  });

  it('classifies tel: links as phone_click', () => {
    expect(classifyContactHref('tel:+5492213635466')).toBe('phone_click');
    expect(classifyContactHref('https://maps.google.com/?q=x')).toBeNull();
  });
});

describe('venue resolution', () => {
  it('maps salons to the codes used by /whatsapp, checking San Carlos before La Plata', () => {
    expect(venueCodeForSalon({ name: 'M&M San Carlos', city: 'La Plata' })).toBe('san_carlos');
    expect(venueCodeForSalon({ name: 'Salón', slug: 'villa-elisa' })).toBe('villa_elisa');
    expect(venueCodeForSalon({ name: 'M&M La Plata', locality: 'La Plata' })).toBe('la_plata');
    expect(venueCodeForSalon({ name: 'Otro salón' })).toBeUndefined();
    expect(venueCodeForSalon(undefined)).toBeUndefined();
  });

  it('assigns a venue only to salon-specific pages', () => {
    expect(venueCodeFromPath('/salon-eventos-villa-elisa')).toBe('villa_elisa');
    expect(venueCodeFromPath('/salones/san-carlos/')).toBe('san_carlos');
    expect(venueCodeFromPath('/fiestas-de-15-la-plata')).toBeUndefined();
    expect(venueCodeFromPath('/')).toBeUndefined();
  });
});

describe('GA4 dataLayer payloads', () => {
  it('adds venue, channel and page to WhatsApp clicks while keeping existing params', () => {
    const payload = buildGa4Payload('whatsapp_click', { sectionId: 'whatsapp-selector', elementId: 'whatsapp-villa-elisa', entityId: 'villa_elisa' }, { pagePath: '/whatsapp', utm: { utmSource: 'google' } });
    expect(payload).toMatchObject({ event: 'whatsapp_click', salon: 'villa_elisa', utm_source: 'google', venue_id: 'villa_elisa', venue_name: 'M&M Villa Elisa', contact_channel: 'whatsapp', page_path: '/whatsapp' });
  });

  it('maps a confirmed form success to generate_lead with the lead id and venue', () => {
    const payload = buildGa4Payload('form_success', { sectionId: 'contact', elementId: 'contact-form', entityId: '65f000000000000000000001', venueId: 'san_carlos' }, { pagePath: '/' });
    expect(payload).toMatchObject({ event: 'generate_lead', lead_id: '65f000000000000000000001', venue_id: 'san_carlos', contact_channel: 'form', page_path: '/' });
  });

  it('falls back to the salon page venue and always sets every conversion key', () => {
    const payload = buildGa4Payload('phone_click', { elementId: 'element-telefono' }, { pagePath: '/salones/la-plata' })!;
    expect(payload.venue_id).toBe('la_plata');
    const unknown = buildGa4Payload('whatsapp_click', {}, { pagePath: '/fiestas-de-15-la-plata' })!;
    // Present-but-undefined keys overwrite stale values in GTM's data layer model.
    expect(Object.keys(unknown)).toEqual(expect.arrayContaining(['venue_id', 'venue_name', 'contact_channel', 'page_path']));
    expect(unknown.venue_id).toBeUndefined();
  });

  it('ignores a non-venue entity id and does not tag non-conversion events', () => {
    expect(buildGa4Payload('whatsapp_click', { entityId: 'abc' }, { pagePath: '/' })!.venue_id).toBeUndefined();
    const salonView = buildGa4Payload('salon_view', { elementId: 'M&M La Plata', entityId: 'id-1' }, { pagePath: '/' })!;
    expect(salonView).toEqual({ event: 'salon_view', section_id: undefined, element_id: 'M&M La Plata', entity_id: 'id-1', salon_id: 'id-1', salon_name: 'M&M La Plata' });
  });

  it('does not forward events GA4 does not receive', () => {
    expect(buildGa4Payload('page_view', {}, { pagePath: '/' })).toBeNull();
    expect(buildGa4Payload('click', {}, { pagePath: '/' })).toBeNull();
  });

  it('never carries contact data', () => {
    const payload = buildGa4Payload('form_success', { entityId: 'lead-1', venueId: 'la_plata' }, { pagePath: '/' })!;
    expect(Object.keys(payload).filter((key) => /email|phone|^name$|first_name|last_name/.test(key))).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain('@');
  });
});
