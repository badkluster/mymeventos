import { LeadActivity, QuoteRequest } from './crm.models';
import { Salon } from '../salons/salon.model';
import { findOrCreateLead, normalizeEmail, normalizePhone } from './lead-dedupe.service';
import { createQuoteRequestNotifications } from './quote-request-notifications.service';

export type QuoteRequestInput = {
  source: 'website' | 'admin' | 'whatsapp' | 'office' | 'phone' | 'quick_quote' | 'other';
  contactName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  eventType?: string;
  estimatedEventDate?: Date;
  guestCount?: number;
  interestedSalonIds?: string[];
  interestedPackageTemplateId?: string;
  interestedPackageName?: string;
  message?: string;
  assignedToUserId?: string;
  internalNotes?: string;
  originalPayload?: unknown;
  userId?: string;
};

function uniqueIds(ids: string[] = []): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function createQuoteRequest(input: QuoteRequestInput): Promise<{ lead: any; customer: any; quoteRequest: any; leadCreated: boolean }> {
  const salonIds = uniqueIds(input.interestedSalonIds);
  const salons: any[] = salonIds.length ? await Salon.find({ _id: { $in: salonIds }, active: true, deletedAt: null }).select('_id name').lean() : [];
  const { lead, created, possibleDuplicateLeadIds, existingCustomer } = await findOrCreateLead({
    contactName: input.contactName,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    eventType: input.eventType,
    estimatedEventDate: input.estimatedEventDate,
    guestCount: input.guestCount,
    salonIds,
    source: input.source,
    message: input.message,
    userId: input.userId
  });

  const quoteRequest = await QuoteRequest.create({
    leadId: lead?._id,
    customerId: existingCustomer?._id,
    source: input.source,
    status: 'new',
    contactName: input.contactName,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    normalizedPhone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    normalizedEmail: normalizeEmail(input.email),
    eventType: input.eventType,
    estimatedEventDate: input.estimatedEventDate,
    guestCount: input.guestCount,
    interestedSalonIds: salonIds,
    interestedPackageTemplateId: input.interestedPackageTemplateId,
    interestedPackageName: input.interestedPackageName,
    message: input.message,
    originalPayload: input.originalPayload,
    assignedToUserId: input.assignedToUserId,
    possibleDuplicateLeadIds,
    internalNotes: input.internalNotes,
    createdBy: input.userId,
    updatedBy: input.userId
  });

  await LeadActivity.create({
    leadId: lead?._id,
    customerId: existingCustomer?._id,
    type: 'system',
    title: 'Solicitud de presupuesto registrada',
    description: `Se registró la solicitud ${quoteRequest._id}.`,
    metadata: { quoteRequestId: quoteRequest._id, source: input.source },
    createdBy: input.userId
  });
  await createQuoteRequestNotifications({ quoteRequest, salonNames: salons.map((salon) => salon.name) });
  return { lead, customer: existingCustomer, quoteRequest, leadCreated: created };
}
