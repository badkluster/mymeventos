import { describe, expect, it } from 'vitest';
import { buildEntryAttribution, searchEngineForHost } from '@/lib/entry-attribution';

describe('entry attribution', () => {
  it('stores the landing path, external referrer host and first-touch UTMs', () => {
    expect(buildEntryAttribution({ pathname: '/fiestas-de-15-la-plata', search: '?utm_source=google&utm_medium=cpc&utm_id=123', referrer: 'https://www.google.com.ar/', host: 'www.mymsalones.com.ar' })).toEqual({
      landingPath: '/fiestas-de-15-la-plata', referrerHost: 'www.google.com.ar', utmSource: 'google', utmMedium: 'cpc', utmCampaign: undefined, utmCampaignId: '123'
    });
  });

  it('ignores internal referrers, with or without www', () => {
    expect(buildEntryAttribution({ pathname: '/', search: '', referrer: 'https://mymsalones.com.ar/x', host: 'www.mymsalones.com.ar' }).referrerHost).toBeUndefined();
    expect(buildEntryAttribution({ pathname: '/', search: '', referrer: 'not a url', host: 'www.mymsalones.com.ar' }).referrerHost).toBeUndefined();
  });

  it('recognizes search engines', () => {
    expect(searchEngineForHost('www.google.com.ar')).toBe('google');
    expect(searchEngineForHost('www.bing.com')).toBe('bing');
    expect(searchEngineForHost('l.instagram.com')).toBeNull();
    expect(searchEngineForHost(undefined)).toBeNull();
  });
});
