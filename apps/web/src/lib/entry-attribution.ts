// First-touch context for the current browser session: the first public page the
// visitor opened, the external referrer host and the UTM parameters present at that
// moment. It lives only in sessionStorage, holds no identifier or personal data, and
// travels to the CRM only when the visitor submits the contact form voluntarily.

export type EntryAttribution = {
  landingPath: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmCampaignId?: string;
};

const storageKey = 'mym.entry.attribution';

function clean(value: string | null | undefined, max: number) {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function buildEntryAttribution(input: { pathname: string; search: string; referrer: string; host: string }): EntryAttribution {
  const query = new URLSearchParams(input.search);
  let referrerHost: string | undefined;
  try {
    const host = input.referrer ? new URL(input.referrer).hostname.toLowerCase() : '';
    const ownHost = input.host.toLowerCase().replace(/^www\./, '');
    // Internal navigation is not a traffic source.
    if (host && host.replace(/^www\./, '') !== ownHost) referrerHost = host;
  } catch {
    referrerHost = undefined;
  }
  return {
    landingPath: (input.pathname || '/').slice(0, 300),
    referrerHost,
    utmSource: clean(query.get('utm_source'), 120),
    utmMedium: clean(query.get('utm_medium'), 120),
    utmCampaign: clean(query.get('utm_campaign'), 120),
    utmCampaignId: clean(query.get('utm_id'), 64),
  };
}

export function captureEntryAttribution() {
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    const entry = buildEntryAttribution({ pathname: location.pathname, search: location.search, referrer: document.referrer, host: location.hostname });
    window.sessionStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); attribution is optional.
  }
}

// Called when the visitor declines analytics: the first page may already have been
// stored before the choice was made.
export function clearEntryAttribution() {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing stored or storage unavailable.
  }
}

export function readEntryAttribution(): EntryAttribution | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as EntryAttribution : null;
  } catch {
    return null;
  }
}

const searchEngines: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)search\.yahoo\.com$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
];

export function searchEngineForHost(host?: string): string | null {
  if (!host) return null;
  return searchEngines.find(([pattern]) => pattern.test(host.toLowerCase()))?.[1] ?? null;
}
