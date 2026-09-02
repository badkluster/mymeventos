import type { Metadata } from 'next';
import { absoluteUrl, defaultOgImage, salonBySlug } from '@/lib/local-seo';
import { findSalonForSeoSlug, getPublicLanding, imageForPublicSalon, locationForPublicSalon, titleForPublicSalon } from '@/lib/public-landing';
import { WhatsappSelector, type WhatsappSalonOption } from './whatsapp-selector';

export const revalidate = 300;

const SLUGS = ['la-plata', 'villa-elisa', 'san-carlos'] as const;

// Confirmed directly by the business owner (2026-09-02, not found anywhere in
// the codebase/DB at the time this page was built) — used only as a fallback
// when Salon.whatsapp/Salon.phone isn't loaded for that salon yet.
const FALLBACK_WHATSAPP: Record<(typeof SLUGS)[number], string> = {
  'la-plata': '5491157519533',
  'villa-elisa': '5492215791025',
  'san-carlos': '5492216740718',
};

const title = 'Contactá M&M Eventos | Elegí tu salón';
const description = 'Elegí M&M La Plata, Villa Elisa o San Carlos y consultá directamente por WhatsApp.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/whatsapp' },
  // Ad/social routing page, not a content page — the salon SEO pages already
  // target these keywords. `follow` still lets link equity flow onward.
  robots: { index: false, follow: true },
  openGraph: {
    title,
    description,
    url: absoluteUrl('/whatsapp'),
    type: 'website',
    images: [{ url: defaultOgImage(), width: 1200, height: 630, alt: 'M&M Eventos' }]
  },
  twitter: { card: 'summary_large_image', title, description, images: [defaultOgImage()] }
};

export default async function WhatsappPage() {
  const landing = await getPublicLanding();
  const salons: WhatsappSalonOption[] = SLUGS.map((slug) => {
    const page = salonBySlug(slug);
    const salon = findSalonForSeoSlug(landing, slug);
    return {
      key: slug,
      label: salon ? titleForPublicSalon(salon) : page?.title || 'M&M Eventos',
      location: salon ? locationForPublicSalon(salon) : page?.location || '',
      image: imageForPublicSalon(salon, page?.heroImage) || page?.heroImage || '',
      phone: salon?.whatsapp || salon?.phone || FALLBACK_WHATSAPP[slug],
      salonId: salon?._id,
    };
  });

  return <WhatsappSelector salons={salons} />;
}
