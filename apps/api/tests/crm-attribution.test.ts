import { describe, expect, it } from 'vitest';
import { attributionForRequest } from '../src/modules/marketing/crm-attribution.routes';

describe('CRM attribution for public quote requests', () => {
  it('classifies a request whose session came from a search engine as organic', () => {
    const identity = attributionForRequest({ source: 'quick_quote', originalPayload: { landingPath: '/fiestas-de-15-la-plata', referrerHost: 'www.google.com.ar' } }, null);
    expect(identity).toEqual({ source: 'google', medium: 'organic', campaign: null, method: 'referrer', attributed: true });
  });

  it('keeps UTMs and analytics sessions ahead of the referrer fallback', () => {
    expect(attributionForRequest({ source: 'quick_quote', originalPayload: { utmSource: 'meta', utmMedium: 'paid', referrerHost: 'www.google.com' } }, null).method).toBe('utm');
    expect(attributionForRequest({ source: 'quick_quote', originalPayload: { referrerHost: 'www.google.com' } }, { source: 'instagram' }).method).toBe('session');
  });

  it('leaves non-search referrers unattributed as before', () => {
    expect(attributionForRequest({ source: 'quick_quote', originalPayload: { referrerHost: 'l.instagram.com' } }, null)).toMatchObject({ source: 'direct', method: 'unknown', attributed: false });
  });
});
