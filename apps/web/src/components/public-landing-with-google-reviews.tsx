'use client';

import { useEffect, useMemo, useState } from 'react';
import { PublicLandingClient } from '@/components/public-landing-client';
import type { GooglePlaceReview, GooglePlaceReviewsResult } from '@/lib/google-place-reviews';
import type { PublicLanding } from '@/lib/public-landing';

type LandingWithGoogleReviews = PublicLanding & {
  googleReviews?: GooglePlaceReview[];
  salonGoogleReviews?: GooglePlaceReview[];
};

function normalizeGoogleReviews(payload?: Partial<GooglePlaceReviewsResult> | null): GooglePlaceReviewsResult {
  return {
    featured: Array.isArray(payload?.featured) ? payload.featured : [],
    bySalon: Array.isArray(payload?.bySalon) ? payload.bySalon : []
  };
}

export function PublicLandingWithGoogleReviews({ initialLanding }: { initialLanding: PublicLanding | null }) {
  const [googleReviews, setGoogleReviews] = useState<GooglePlaceReviewsResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/google-reviews', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Google reviews endpoint returned HTTP ${response.status}`);
        return response.json() as Promise<Partial<GooglePlaceReviewsResult>>;
      })
      .then((payload) => setGoogleReviews(normalizeGoogleReviews(payload)))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[google-place-reviews] Client refresh failed; keeping manual testimonials.', error);
      });

    return () => controller.abort();
  }, []);

  const landingWithReviews = useMemo<LandingWithGoogleReviews | null>(() => {
    if (!initialLanding || !googleReviews?.featured.length) return initialLanding;
    return {
      ...initialLanding,
      googleReviews: googleReviews.featured,
      salonGoogleReviews: googleReviews.bySalon
    };
  }, [googleReviews, initialLanding]);

  const reviewKey = googleReviews?.featured.length
    ? `google-${googleReviews.featured.map((review) => review.id).join('-')}`
    : 'fallback';

  return <PublicLandingClient key={reviewKey} initialLanding={landingWithReviews} />;
}
