import type { Metadata } from 'next';
import { PublicLandingWithGoogleReviews } from '@/components/public-landing-with-google-reviews';
import { absoluteUrl, defaultOgImage, serializeJsonLd, siteUrl } from '@/lib/local-seo';
import { getPublicLanding, imageForPublicSalon, titleForPublicSalon, type PublicLanding } from '@/lib/public-landing';
import { brandAssets } from '@/lib/brand-assets';

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

function structuredData(landing: PublicLanding | null) {
  const salons = landing?.salons ?? [];
  const faqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 8) ?? [];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'M&M Eventos',
      url: siteUrl,
      logo: landing?.settings?.logoOnLightUrl || absoluteUrl(brandAssets.logoDarkOnLight),
      contactPoint: landing?.settings?.contactPhone ? [{ '@type': 'ContactPoint', telephone: landing.settings.contactPhone, contactType: 'customer service', areaServed: 'AR', availableLanguage: 'es' }] : undefined
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'M&M Eventos',
      url: siteUrl,
      inLanguage: 'es-AR'
    },
    {
      '@context': 'https://schema.org',
      '@type': 'EventVenue',
      name: 'M&M Eventos',
      description: 'Salones de eventos en La Plata con catering, DJ, ambientación y organización integral.',
      url: siteUrl,
      image: imageForPublicSalon(salons[0], defaultOgImage()),
      areaServed: ['La Plata', 'San Carlos', 'Villa Elisa', 'Berisso', 'Ensenada'],
      department: salons.map((salon) => ({
        '@type': 'EventVenue',
        name: titleForPublicSalon(salon),
        ...(salon.address || salon.locationText ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: salon.address || salon.locationText,
            addressLocality: salon.locality || salon.city,
            addressRegion: salon.province || 'Buenos Aires',
            addressCountry: 'AR'
          }
        } : {}),
        image: imageForPublicSalon(salon, defaultOgImage()),
        ...(salon.phone || salon.whatsapp ? { telephone: salon.phone || salon.whatsapp } : {})
      }))
    },
    faqs.length ? {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer }
      }))
    } : null
  ].filter(Boolean);
}

export default async function HomePage() {
  const landing = await getPublicLanding();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData(landing)) }} />
    <PublicLandingWithGoogleReviews initialLanding={landing} />
  </>;
}
