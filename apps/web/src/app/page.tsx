import type { Metadata } from 'next';
import { PublicLandingClient } from '@/components/public-landing-client';
import { absoluteUrl, defaultOgImage, siteUrl } from '@/lib/local-seo';
import { getPublicLanding, imageForPublicSalon, titleForPublicSalon, type PublicLanding } from '@/lib/public-landing';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'M&M Eventos | Salones de eventos en La Plata con catering',
  description: 'Salones para fiestas, 15 años, casamientos, cumpleaños, egresados y eventos empresariales en La Plata. Catering, DJ, ambientación, barra y organización integral.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'M&M Eventos | Salones de eventos en La Plata con catering',
    description: 'Salones para fiestas, 15 años, casamientos, cumpleaños, egresados y eventos empresariales en La Plata.',
    url: absoluteUrl('/'),
    type: 'website',
    images: [{ url: defaultOgImage(), width: 1200, height: 1200, alt: 'M&M Eventos' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'M&M Eventos | Salones de eventos en La Plata con catering',
    description: 'Salones para fiestas, 15 años, casamientos, cumpleaños, egresados y eventos empresariales en La Plata.',
    images: [defaultOgImage()]
  }
};

function structuredData(landing: PublicLanding | null) {
  const salons = landing?.salons ?? [];
  const faqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 8) ?? [];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'M&M Eventos',
      url: siteUrl,
      logo: absoluteUrl('/brand/mym-logo-dark-on-light.jpg'),
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
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'La Plata',
        addressRegion: 'Buenos Aires',
        addressCountry: 'AR'
      },
      areaServed: ['La Plata', 'San Carlos', 'Villa Elisa', 'Berisso', 'Ensenada'],
      department: salons.map((salon) => ({
        '@type': 'EventVenue',
        name: titleForPublicSalon(salon),
        address: {
          '@type': 'PostalAddress',
          streetAddress: salon.address || salon.locationText,
          addressLocality: salon.locality || salon.city,
          addressRegion: salon.province || 'Buenos Aires',
          addressCountry: 'AR'
        },
        image: imageForPublicSalon(salon, defaultOgImage()),
        telephone: salon.phone || salon.whatsapp
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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(landing)) }} />
    <PublicLandingClient initialLanding={landing} />
  </>;
}
