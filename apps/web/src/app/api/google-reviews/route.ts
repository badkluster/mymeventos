import { getGooglePlaceReviews } from '@/lib/google-place-reviews';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate'
};

export async function GET() {
  try {
    const reviews = await getGooglePlaceReviews();
    return Response.json(reviews, { status: 200, headers: noStoreHeaders });
  } catch (error) {
    console.error('[api/google-reviews] Failed to retrieve Google Maps reviews', error);
    return Response.json(
      { featured: [], bySalon: [] },
      { status: 200, headers: noStoreHeaders }
    );
  }
}
