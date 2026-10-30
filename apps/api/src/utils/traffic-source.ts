// Organic search detection from a referrer. Search engines send only their host (no
// query), which is enough to tell organic visits apart from generic referrals.
const searchEngines: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)search\.yahoo\.com$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
];

export function hostFromReferrer(referrer?: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    // Already a bare host (e.g. the referrerHost sent with a public quick quote).
    return /^[a-z0-9.-]+$/i.test(referrer) ? referrer.toLowerCase() : null;
  }
}

export function searchEngineForReferrer(referrer?: string | null): string | null {
  const host = hostFromReferrer(referrer);
  if (!host) return null;
  return searchEngines.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

// UTMs always win. Without them, a search engine referrer is organic search; any other
// referrer keeps the previous 'referral' classification.
export function sessionTrafficSource(input: { utmSource?: string; utmMedium?: string; referrer?: string }) {
  if (input.utmSource) return { source: input.utmSource, medium: input.utmMedium || undefined };
  const engine = searchEngineForReferrer(input.referrer);
  if (engine) return { source: engine, medium: input.utmMedium || 'organic' };
  return { source: input.referrer ? 'referral' : 'direct', medium: input.utmMedium || undefined };
}
