export type QuoteStatus = 'draft' | 'sent' | 'follow_up' | 'accepted' | 'rejected' | 'expired' | 'converted';

export type Quote = {
  _id: string;
  quoteNumber: string;
  leadId?: string | { _id: string; fullName?: string; firstName?: string; lastName?: string };
  customerId?: string;
  salonId: string | { _id: string; name: string };
  packageTemplateId?: string | { _id: string; name: string };
  status: QuoteStatus | string;
  contactName: string;
  phone: string;
  email?: string;
  eventType: string;
  eventDate?: string;
  /** Alias de compatibilidad para pantallas previas; la API usa eventDate. */
  estimatedEventDate?: string;
  guestCount: number;
  packageName?: string;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  pricePerPerson: number;
  discountPercentage?: number;
  finalPricePerPerson: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  paymentTerms?: string;
  promotionText?: string;
  giftText?: string;
  menuSections?: { title?: string; name?: string; items: string[] }[];
  includedServices?: string[];
  notes?: string;
  validUntil?: string;
  pdfUrl?: string;
  pdfSecureUrl?: string;
  pdfPublicId?: string;
  pdfGeneratedAt?: string;
  sentAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Salon = { _id: string; name: string };
export type LeadOption = { _id: string; fullName?: string; firstName?: string; lastName?: string; phone?: string; email?: string; eventType?: string; eventDate?: string; guestCount?: number; salonId?: string; salonIds?: string[] };
export type PackageTemplate = {
  _id: string;
  name: string;
  durationHours?: number;
  startTime?: string;
  endTime?: string;
  pricePerPerson?: number;
  discountPercentage?: number;
  finalPricePerPerson?: number;
  depositAmount?: number;
  paymentTerms?: string;
  promotionText?: string;
  giftText?: string;
  menuSections?: { title?: string; name?: string; items: string[] }[];
  includedServices?: string[];
};

export type PaginationMeta = { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };

export const getEntityId = (value?: string | { _id: string }) => typeof value === 'string' ? value : value?._id ?? '';
export const getLeadName = (lead?: Quote['leadId']) => {
  if (!lead || typeof lead === 'string') return '';
  return lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ');
};
export const getSalonName = (salon: Quote['salonId'], salons: Salon[]) => typeof salon === 'string' ? salons.find((item) => item._id === salon)?.name ?? 'Sin salón' : salon.name;
