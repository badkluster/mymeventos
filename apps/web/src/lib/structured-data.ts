import { brandAssets } from '@/lib/brand-assets';
import { venueCodeForSalon, venueNames, type VenueCode } from '@/lib/analytics-conversions';
import { absoluteUrl, defaultOgImage, siteUrl, type LocalSeoPage } from '@/lib/local-seo';
import { imageForPublicSalon, titleForPublicSalon, type PublicLanding, type PublicPackage, type PublicSalon } from '@/lib/public-landing';

// Stable entity ids so the organization and each salon are the same node on every page,
// instead of a new anonymous entity per URL.
export const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;

const venueSlugs: Record<VenueCode, string> = { la_plata: 'la-plata', villa_elisa: 'villa-elisa', san_carlos: 'san-carlos' };

export function venuePageUrl(code: VenueCode) {
  return absoluteUrl(`/salones/${venueSlugs[code]}`);
}

export function venueEntityId(code: VenueCode) {
  return `${venuePageUrl(code)}#venue`;
}

// Mirrors findSalonForSeoSlug: every landing that is not about San Carlos or Villa Elisa
// is served by the La Plata salon.
function venueCodeForSeoSlug(slug: string): VenueCode {
  if (slug.includes('san-carlos')) return 'san_carlos';
  if (slug.includes('villa-elisa')) return 'villa_elisa';
  return 'la_plata';
}

function postalAddress(streetAddress: string | undefined, salon: PublicSalon | undefined, fallbackLocality?: string) {
  if (!streetAddress) return undefined;
  return {
    '@type': 'PostalAddress',
    streetAddress,
    addressLocality: salon?.locality || salon?.city || fallbackLocality,
    addressRegion: salon?.province || 'Buenos Aires',
    addressCountry: 'AR'
  };
}

// The FAQ block rendered on a landing and its FAQPage markup must come from the same
// list; otherwise the markup can describe questions that are not on the page.
export function visibleFaqsFor(page: LocalSeoPage, landing?: PublicLanding | null) {
  const cmsFaqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 4).map((faq) => ({ question: faq.question!, answer: faq.answer! })) ?? [];
  return cmsFaqs.length ? cmsFaqs : page.faqs;
}

function faqPage(faqs: { question: string; answer: string }[]) {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  };
}

export function homeStructuredData(landing: PublicLanding | null) {
  const salons = landing?.salons ?? [];
  const faqs = landing?.faqs?.filter((faq) => faq.question && faq.answer).slice(0, 8).map((faq) => ({ question: faq.question!, answer: faq.answer! })) ?? [];
  const venues = salons.map((salon) => {
    const code = venueCodeForSalon(salon);
    const streetAddress = salon.address || salon.locationText;
    const address = postalAddress(streetAddress, salon);
    const telephone = salon.phone || salon.whatsapp;
    return {
      '@context': 'https://schema.org',
      '@type': 'EventVenue',
      ...(code ? { '@id': venueEntityId(code), url: venuePageUrl(code) } : {}),
      name: titleForPublicSalon(salon),
      ...(address ? { address } : {}),
      image: imageForPublicSalon(salon, defaultOgImage()),
      ...(telephone ? { telephone } : {})
    };
  });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: 'M&M Eventos',
      url: siteUrl,
      logo: landing?.settings?.logoOnLightUrl || absoluteUrl(brandAssets.logoDarkOnLight),
      description: 'Salones de eventos en La Plata con catering, DJ, ambientación y organización integral.',
      areaServed: ['La Plata', 'San Carlos', 'Villa Elisa', 'Berisso', 'Ensenada'],
      ...(landing?.settings?.contactPhone ? { contactPoint: [{ '@type': 'ContactPoint', telephone: landing.settings.contactPhone, contactType: 'customer service', areaServed: 'AR', availableLanguage: 'es' }] } : {}),
      // Venues are Places: they are linked from the organization instead of being
      // nested as `department`, which schema.org only defines for organizations.
      ...(venues.some((venue) => '@id' in venue) ? { location: venues.filter((venue) => '@id' in venue).map((venue) => ({ '@id': venue['@id'] })) } : {})
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': websiteId,
      name: 'M&M Eventos',
      url: siteUrl,
      inLanguage: 'es-AR',
      publisher: { '@id': organizationId }
    },
    ...venues,
    faqPage(faqs)
  ].filter(Boolean);
}

export function localPageStructuredData(page: LocalSeoPage, path: string, salonMode: boolean, salon?: PublicSalon, packages: PublicPackage[] = [], landing?: PublicLanding | null) {
  const url = absoluteUrl(path);
  const code = venueCodeForSalon(salon) ?? venueCodeForSeoSlug(page.slug);
  const image = imageForPublicSalon(salon, page.heroImage) || page.heroImage;
  const organizationImage = landing?.settings?.openGraphImageUrl || brandAssets.openGraphImage;
  const phone = salon?.phone || landing?.settings?.contactPhone;
  const address = postalAddress(salon?.address || page.address, salon, page.location);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'EventVenue',
      '@id': venueEntityId(code),
      name: salon ? titleForPublicSalon(salon) : venueNames[code],
      // The venue's canonical page; topic landings describe the same salon.
      url: venuePageUrl(code),
      image,
      description: salonMode && salon ? salon.publicDescription || salon.publicShortDescription || page.metaDescription : page.metaDescription,
      ...(address ? { address } : {}),
      amenityFeature: page.services.map((service) => ({ '@type': 'LocationFeatureSpecification', name: service, value: true })),
      ...(phone ? { telephone: phone } : {})
    },
    {
      // Organization rather than LocalBusiness: a LocalBusiness without its own address
      // is an incomplete local entity; the addresses belong to the venues.
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: 'M&M Eventos',
      url: siteUrl,
      image: organizationImage,
      areaServed: ['La Plata', 'San Carlos', 'Villa Elisa'],
      makesOffer: (packages.length ? packages.map((item) => item.name) : page.packages).map((name) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name } }))
    },
    faqPage(visibleFaqsFor(page, landing)),
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluteUrl('/') },
        ...(salonMode ? [{ '@type': 'ListItem', position: 2, name: 'Salones', item: absoluteUrl('/#salones') }] : []),
        { '@type': 'ListItem', position: salonMode ? 3 : 2, name: page.title, item: url }
      ]
    }
  ].filter(Boolean);
}
