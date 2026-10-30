import { describe, expect, it } from 'vitest';
import { searchEngineForReferrer, sessionTrafficSource } from '../src/utils/traffic-source';

describe('traffic source classification', () => {
  it('detects organic search engines from full referrers and bare hosts', () => {
    expect(searchEngineForReferrer('https://www.google.com.ar/')).toBe('google');
    expect(searchEngineForReferrer('www.google.com')).toBe('google');
    expect(searchEngineForReferrer('https://www.bing.com/search')).toBe('bing');
    expect(searchEngineForReferrer('https://www.instagram.com/')).toBeNull();
    expect(searchEngineForReferrer('https://notgoogle.example.com/')).toBeNull();
    expect(searchEngineForReferrer('')).toBeNull();
  });

  it('keeps UTMs first, then organic search, then the previous referral/direct split', () => {
    expect(sessionTrafficSource({ utmSource: 'meta', utmMedium: 'paid', referrer: 'https://www.google.com/' })).toEqual({ source: 'meta', medium: 'paid' });
    expect(sessionTrafficSource({ referrer: 'https://www.google.com/' })).toEqual({ source: 'google', medium: 'organic' });
    expect(sessionTrafficSource({ referrer: 'https://l.instagram.com/' })).toEqual({ source: 'referral', medium: undefined });
    expect(sessionTrafficSource({ utmSource: '', referrer: '' })).toEqual({ source: 'direct', medium: undefined });
  });
});
