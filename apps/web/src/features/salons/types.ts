export type EventType = 'birthday' | 'wedding' | 'fifteen' | 'graduates' | 'corporate' | 'baptism_communion' | 'other';

export type MenuSection = { title?: string; name?: string; items: string[] };

export type SalonExtra = {
  _id?: string;
  name: string;
  description?: string;
  basePrice: number;
  active: boolean;
  applicablePackageIds?: string[];
  includedByDefault: boolean;
  publicVisible: boolean;
};

export type SalonMedia = {
  _id?: string;
  url: string;
  secureUrl?: string;
  publicId?: string;
  resourceType: 'image' | 'video' | 'raw';
  format?: string;
  title?: string;
  altText?: string;
  displayOrder: number;
  publicVisible: boolean;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
};

export type SalonManager = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  roles?: string[];
  active?: boolean;
};

export type Salon = {
  _id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  locality?: string;
  province?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  managerUserId?: string;
  manager?: SalonManager;
  active: boolean;
  internalDescription?: string;
  publicTitle?: string;
  publicDescription?: string;
  publicShortDescription?: string;
  visibleOnWebsite: boolean;
  displayOrder?: number;
  minCapacity?: number;
  maxCapacity?: number;
  recommendedCapacity?: number;
  allowedEventTypes?: EventType[];
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultDurationHours?: number;
  allowsExtraHour?: boolean;
  extraHourPrice?: number;
  operationalNotes?: string;
  defaultDepositAmount?: number;
  minimumDepositAmount?: number;
  defaultSecurityDepositAmount?: number;
  defaultLateFeePercentage?: number;
  defaultPaymentTerms?: string;
  defaultQuoteValidityDays?: number;
  defaultContractTerms?: string;
  commercialNotes?: string;
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  mediaGallery?: SalonMedia[];
  seoTitle?: string;
  seoDescription?: string;
  locationText?: string;
  mapUrl?: string;
  extraServices?: SalonExtra[];
  activePackageCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type UserOption = SalonManager & { username?: string };

export type PackageRule = {
  _id?: string;
  packageTemplateId: string;
  packageName: string;
  name?: string;
  isGlobal?: boolean;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  ruleConfigured?: boolean;
  active?: boolean;
  pricingMode?: 'per_person' | 'fixed';
  pricePerPerson?: number;
  fixedPrice?: number;
  discountPercentage?: number;
  finalPricePerPerson?: number;
  finalFixedPrice?: number;
  depositAmount?: number;
  paymentTerms?: string;
  promotionText?: string;
  giftText?: string;
  includedServices?: string[];
  menuSections?: MenuSection[];
  notes?: string;
};

export const eventTypeLabels: Record<EventType, string> = {
  birthday: 'Cumpleaños',
  wedding: 'Casamiento',
  fifteen: '15 años',
  graduates: 'Egresados',
  corporate: 'Evento empresarial',
  baptism_communion: 'Bautismo/comunión',
  other: 'Otro'
};

export const eventTypeOptions = Object.entries(eventTypeLabels) as [EventType, string][];

export const money = (value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0);

export function menuToText(sections?: MenuSection[]): string {
  return sections?.map((section) => `${section.title ?? section.name ?? 'Sección'}: ${(section.items ?? []).join(' | ')}`).join('\n') ?? '';
}

export function textToMenu(value: string): MenuSection[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [title, items = ''] = line.split(':');
    return { title: title.trim(), items: items.split('|').map((item) => item.trim()).filter(Boolean) };
  }).filter((section) => section.title && section.items.length);
}
