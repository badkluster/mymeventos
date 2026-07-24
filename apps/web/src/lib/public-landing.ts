const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');
const appBaseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mymeventos-api-ashy.vercel.app';
const apiBaseUrl = configuredApiUrl.startsWith('http') ? configuredApiUrl : new URL(configuredApiUrl, appBaseUrl).toString().replace(/\/$/, '');

export type PublicMedia = { url: string; secureUrl?: string; title?: string; altText?: string; resourceType?: string; displayOrder?: number };
export type PublicPackage = {
  _id: string;
  name: string;
  salonId?: string;
  salonName?: string;
  description?: string;
  notes?: string;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  pricingMode?: 'per_person' | 'fixed';
  pricePerPerson?: number;
  finalPricePerPerson?: number;
  fixedPrice?: number;
  finalFixedPrice?: number;
  depositAmount?: number;
  paymentTerms?: string;
  promotionText?: string;
  giftText?: string;
  includedServices?: string[];
  menuSections?: { title?: string; name?: string; items: string[] }[];
  badgeLabel?: string;
  featured?: boolean;
};
export type PublicLandingItem = { _id?: string; title?: string; subtitle?: string; description?: string; imageUrl?: string; altText?: string; category?: string; badgeText?: string; ctaLabel?: string; ctaLink?: string; quote?: string; customerName?: string; eventType?: string; rating?: number; question?: string; answer?: string; icon?: string };
export type PublicSalon = {
  _id: string;
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  locality?: string;
  province?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  publicTitle?: string;
  publicShortDescription?: string;
  publicDescription?: string;
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  mediaGallery?: PublicMedia[];
  locationText?: string;
  mapUrl?: string;
  minCapacity?: number;
  maxCapacity?: number;
  recommendedCapacity?: number;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultDurationHours?: number;
  defaultDepositAmount?: number;
  defaultPaymentTerms?: string;
  packages?: PublicPackage[];
};
export type PublicLanding = {
  settings?: { heroTitle?: string; heroSubtitle?: string; heroImageUrl?: string; heroPrimaryCtaLabel?: string; heroSecondaryCtaLabel?: string; whatsappNumber?: string; whatsappDefaultMessage?: string; contactEmail?: string; contactPhone?: string; instagramUrl?: string; facebookUrl?: string; tiktokUrl?: string; footerText?: string };
  salons: PublicSalon[];
  packages: PublicPackage[];
  promotions: PublicLandingItem[];
  gallery: PublicLandingItem[];
  testimonials: PublicLandingItem[];
  faqs: PublicLandingItem[];
  serviceBlocks: PublicLandingItem[];
  eventTypes: PublicLandingItem[];
};

type ApiEnvelope<T> = { success: boolean; data?: T };

export function cloudinaryImageUrl(url?: string, width?: number): string {
  if (!url || !url.includes('/upload/')) return url ?? '';
  const stripped = url.replace(/\/upload\/(?:w_\d+,c_limit,)?f_auto,q_auto\//, '/upload/');
  const transform = width ? `w_${width},c_limit,f_auto,q_auto` : 'f_auto,q_auto';
  return stripped.replace('/upload/', `/upload/${transform}/`);
}

export function titleForPublicSalon(salon?: PublicSalon): string {
  return salon?.publicTitle || salon?.name || 'M&M Eventos';
}

export function locationForPublicSalon(salon?: PublicSalon): string {
  return salon?.locationText || salon?.locality || salon?.city || salon?.address || 'La Plata';
}

export function imageForPublicSalon(salon?: PublicSalon, fallback = ''): string {
  return cloudinaryImageUrl(salon?.heroImageUrl || salon?.mediaGallery?.[0]?.secureUrl || salon?.mediaGallery?.[0]?.url || salon?.galleryImageUrls?.[0] || fallback);
}

export function capacityForPublicSalon(salon?: PublicSalon): string {
  if (salon?.minCapacity && salon.maxCapacity) return `${salon.minCapacity} a ${salon.maxCapacity} personas`;
  if (salon?.maxCapacity || salon?.recommendedCapacity) return `Hasta ${salon.maxCapacity || salon.recommendedCapacity} personas`;
  return 'Capacidad a confirmar';
}

function normalize(value?: string): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function findSalonForSeoSlug(landing: PublicLanding | null, slug: string): PublicSalon | undefined {
  if (!landing?.salons?.length) return undefined;
  const target = slug.includes('san-carlos') ? 'san carlos' : slug.includes('villa-elisa') ? 'villa elisa' : 'la plata';
  return landing.salons.find((salon) => {
    const values = [salon.slug?.replace(/-/g, ' '), salon.name, salon.publicTitle, salon.locality, salon.city].map(normalize);
    return values.some((value) => value === target || value.endsWith(` ${target}`));
  });
}

export function packagesForSalon(salon?: PublicSalon): PublicPackage[] {
  return (salon?.packages ?? []).filter((item) => item.name);
}

export async function getPublicLanding(): Promise<PublicLanding | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/public/landing`, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const payload = await response.json() as ApiEnvelope<PublicLanding>;
    return payload.success && payload.data ? payload.data : null;
  } catch {
    return null;
  }
}
