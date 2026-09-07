import 'server-only';

export type GooglePlaceReview = {
  id: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorProfileUrl?: string;
  rating: number;
  text: string;
  salonName: string;
  googleMapsUri: string;
  publishedAt?: string;
};

type GooglePlace = { salonName: string; placeId: string };
type GooglePlaceDetailsResponse = {
  reviews?: Array<{
    name?: string;
    rating?: number;
    text?: { text?: string };
    authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
    googleMapsUri?: string;
    publishTime?: string;
  }>;
};

const googlePlaces: GooglePlace[] = [
  { salonName: 'M&M La Plata', placeId: 'ChIJtccWFinnopUROEKcfAJ6arw' },
  { salonName: 'M&M Eventos San Carlos', placeId: 'ChIJpatAfCzpopURZtt8P-l3-Ss' },
  { salonName: 'M&M Eventos Villa Elisa', placeId: 'ChIJ65pMr0HfopURwLXdlrTTk1s' }
];
const GOOGLE_REVIEWS_FIELD_MASK = 'id,displayName,rating,userRatingCount,reviews';
const GOOGLE_REVIEWS_TIMEOUT_MS = 4_500;
const DEFAULT_REVALIDATE_SECONDS = 43_200;
const DEFAULT_REVIEW_LIMIT = 6;

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function isFallbackForced(): boolean {
  return process.env.GOOGLE_REVIEWS_FORCE_FALLBACK?.trim().toLowerCase() === 'true';
}

function logGoogleReviewsError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message : error ? String(error) : '';
  console.error(`[google-place-reviews] ${message}${detail ? `: ${detail}` : ''}`);
}

async function fetchPlaceDetails(place: GooglePlace, apiKey: string, revalidate: number): Promise<GooglePlaceReview[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_REVIEWS_TIMEOUT_MS);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${place.placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_REVIEWS_FIELD_MASK
      },
      signal: controller.signal,
      next: { revalidate }
    });
    if (!response.ok) throw new Error(`Place Details respondió HTTP ${response.status}`);

    const payload = await response.json() as GooglePlaceDetailsResponse;
    return (payload.reviews ?? []).flatMap((review, index): GooglePlaceReview[] => {
      const text = review.text?.text?.trim() ?? '';
      const rating = Number(review.rating ?? 0);
      if (!text || rating < 4 || rating > 5 || !review.googleMapsUri) return [];
      return [{
        id: review.name || `${place.placeId}-${index}`,
        authorName: review.authorAttribution?.displayName?.trim() || 'Usuario de Google',
        authorPhotoUrl: review.authorAttribution?.photoUri,
        authorProfileUrl: review.authorAttribution?.uri,
        rating,
        text,
        salonName: place.salonName,
        googleMapsUri: review.googleMapsUri,
        publishedAt: review.publishTime
      }];
    });
  } finally {
    clearTimeout(timeout);
  }
}

function compareReviews(left: GooglePlaceReview, right: GooglePlaceReview): number {
  if (right.rating !== left.rating) return right.rating - left.rating;
  if (right.text.length !== left.text.length) return right.text.length - left.text.length;
  return (Date.parse(right.publishedAt ?? '') || 0) - (Date.parse(left.publishedAt ?? '') || 0);
}

export function selectBestGoogleReviews(reviews: GooglePlaceReview[], limit = DEFAULT_REVIEW_LIMIT): GooglePlaceReview[] {
  const ranked = [...reviews].sort(compareReviews);
  const selected: GooglePlaceReview[] = [];
  const selectedIds = new Set<string>();

  // First preserve the best available review from each salon; then fill the remaining spots
  // with the globally strongest reviews. This avoids a single location monopolizing the gallery.
  for (const place of googlePlaces) {
    const review = ranked.find((item) => item.salonName === place.salonName);
    if (!review || selected.length >= limit) continue;
    selected.push(review);
    selectedIds.add(review.id);
  }
  for (const review of ranked) {
    if (selected.length >= limit) break;
    if (selectedIds.has(review.id)) continue;
    selected.push(review);
    selectedIds.add(review.id);
  }
  return selected;
}

/**
 * Retrieves a small, curated pool of public Google Maps reviews exclusively on the server.
 * An empty result is intentional: callers must keep using their manual testimonials as a
 * silent fallback when the integration is disabled, times out, or returns no suitable reviews.
 */
export async function getGooglePlaceReviews(): Promise<GooglePlaceReview[]> {
  if (isFallbackForced()) {
    console.info('[google-place-reviews] Fallback manual forzado por GOOGLE_REVIEWS_FORCE_FALLBACK.');
    return [];
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    logGoogleReviewsError('No se configuró GOOGLE_PLACES_API_KEY; se usarán testimonios manuales');
    return [];
  }

  const revalidate = positiveInteger(process.env.GOOGLE_REVIEWS_REVALIDATE_SECONDS, DEFAULT_REVALIDATE_SECONDS, 21_600, 86_400);
  const limit = positiveInteger(process.env.GOOGLE_REVIEWS_MAX_ITEMS, DEFAULT_REVIEW_LIMIT, 6, 9);
  const results = await Promise.allSettled(googlePlaces.map((place) => fetchPlaceDetails(place, apiKey, revalidate)));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length) {
    failures.forEach((result) => logGoogleReviewsError('No se pudo obtener una ubicación de Google Maps', result.reason));
    return [];
  }

  const reviews = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!reviews.length) {
    logGoogleReviewsError('Google Maps no devolvió reseñas con texto y 4 o 5 estrellas; se usarán testimonios manuales');
    return [];
  }
  return selectBestGoogleReviews(reviews, limit);
}
