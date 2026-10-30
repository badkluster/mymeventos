import type { Metadata } from 'next';
import { PublicLandingWithGoogleReviews } from '@/components/public-landing-with-google-reviews';
import { absoluteUrl, defaultOgImage, serializeJsonLd } from '@/lib/local-seo';
import { getPublicLanding } from '@/lib/public-landing';
import { homeStructuredData } from '@/lib/structured-data';

export const revalidate = 300;

const fallbackTitle = 'M&M Eventos | Salones y Eventos en La Plata';
const fallbackDescription = 'Salones de fiestas en La Plata para cumpleaños, 15 años y casamientos, con catering, bebidas, DJ, iluminación y servicio completo.';

export async function generateMetadata(): Promise<Metadata> {
  const landing = await getPublicLanding();
  const title = fallbackTitle;
  const description = fallbackDescription;
  const image = landing?.settings?.openGraphImageUrl || defaultOgImage();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: {
      title,
      description,
      url: absoluteUrl('/'),
      type: 'website',
      images: [{ url: image, width: 1200, height: 1200, alt: 'M&M Eventos' }]
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] }
  };
}

export default async function HomePage() {
  const landing = await getPublicLanding();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeStructuredData(landing)) }} />
    <PublicLandingWithGoogleReviews initialLanding={landing} />
  </>;
}
