import type { NextApiRequest, NextApiResponse } from 'next';
import { getGooglePlaceReviews, type GooglePlaceReviewsResult } from '@/lib/google-place-reviews';

type GoogleReviewsApiResponse = GooglePlaceReviewsResult | { error: string };

export default async function handler(request: NextApiRequest, response: NextApiResponse<GoogleReviewsApiResponse>) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const reviews = await getGooglePlaceReviews();
    return response.status(200).json(reviews);
  } catch (error) {
    console.error('[api/google-reviews] Failed to retrieve Google Maps reviews', error);
    return response.status(200).json({ featured: [], bySalon: [] });
  }
}
