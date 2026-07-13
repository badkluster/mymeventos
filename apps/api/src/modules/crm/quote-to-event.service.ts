import { Event, Lead, LeadActivity, Quote, QuoteRevision } from './crm.models';
import { findOrCreateCustomer } from './contact-dedupe.service';
import { buildInitialResourcePlan } from './event-resource-plan';
import { ApiError } from '../../middlewares/errorHandler';

type ConvertQuoteInput = {
  quoteId: string;
  userId: string;
  eventName?: string;
  notes?: string;
};

async function createRevision(quote: any, userId: string): Promise<void> {
  const latest: any = await QuoteRevision.findOne({ quoteId: quote._id }).sort({ version: -1 }).lean();
  await QuoteRevision.create({
    quoteId: quote._id,
    version: (latest?.version ?? 0) + 1,
    snapshot: quote.toObject ? quote.toObject() : quote,
    changeReason: 'Presupuesto convertido a evento',
    createdBy: userId
  });
}

function checklist(quote: any, customer: any): Record<string, boolean> {
  return {
    customerComplete: Boolean(customer?.fullName && (customer?.phone || customer?.email)),
    document: Boolean(customer?.documentNumber || customer?.dni),
    address: Boolean(customer?.address),
    salonDefined: Boolean(quote.salonId),
    dateDefined: Boolean(quote.eventDate),
    timeDefined: Boolean(quote.startTime && quote.endTime),
    guestCount: Boolean(quote.guestCount),
    totalPrice: Boolean(quote.totalAmount),
    deposit: Boolean(quote.depositAmount),
    paymentTerms: Boolean(quote.paymentTerms),
    menu: Boolean((quote.menuSections ?? []).length),
    includedServices: Boolean((quote.includedServices ?? []).length)
  };
}

export async function convertQuoteToEvent(input: ConvertQuoteInput): Promise<{ quote: any; lead: any; customer: any; event: any; createdEvent: boolean }> {
  const quote: any = await Quote.findOne({ _id: input.quoteId, deletedAt: null });
  if (!quote) throw new ApiError(404, 'QUOTE_NOT_FOUND');

  const lead: any = quote.leadId ? await Lead.findOne({ _id: quote.leadId, deletedAt: null }) : null;
  const { customer } = await findOrCreateCustomer({
    customerId: quote.customerId?.toString(),
    lead,
    contactName: quote.contactName || lead?.fullName,
    phone: quote.phone || lead?.phone,
    email: quote.email || lead?.email,
    salonIds: [quote.salonId?.toString()].filter(Boolean),
    quoteId: quote._id,
    message: quote.notes,
    userId: input.userId
  });

  const existingEvent: any = quote.convertedEventId
    ? await Event.findOne({ _id: quote.convertedEventId, deletedAt: null })
    : await Event.findOne({ $or: [{ sourceQuoteId: quote._id }, { quoteId: quote._id }, { createdFromQuoteId: quote._id }], deletedAt: null });

  if (existingEvent) {
    quote.customerId = customer._id;
    quote.convertedCustomerId = customer._id;
    quote.convertedEventId = existingEvent._id;
    quote.status = 'converted';
    quote.acceptedAt = quote.acceptedAt ?? new Date();
    quote.updatedBy = input.userId;
    await quote.save();
    return { quote, lead, customer, event: existingEvent, createdEvent: false };
  }

  const commercialSnapshot = {
    packageTemplateId: quote.packageTemplateId,
    packageName: quote.packageName,
    pricingMode: quote.pricingMode ?? 'per_person',
    durationHours: quote.durationHours,
    startTime: quote.startTime,
    endTime: quote.endTime,
    pricePerPerson: quote.pricePerPerson,
    discountPercentage: quote.discountPercentage,
    finalPricePerPerson: quote.finalPricePerPerson,
    fixedPrice: quote.fixedPrice,
    finalFixedPrice: quote.finalFixedPrice,
    totalAmount: quote.totalAmount,
    depositAmount: quote.depositAmount,
    balanceAmount: quote.balanceAmount,
    paymentTerms: quote.paymentTerms,
    promotionText: quote.promotionText,
    giftText: quote.giftText
  };

  const event = await Event.create({
    customerId: customer._id,
    leadId: lead?._id,
    quoteId: quote._id,
    sourceLeadId: lead?._id,
    sourceQuoteId: quote._id,
    createdFromQuoteId: quote._id,
    salonId: quote.salonId,
    eventType: quote.eventType,
    eventName: input.eventName || `${quote.eventType || 'Evento'} - ${quote.contactName || customer.fullName}`,
    eventDate: quote.eventDate,
    startTime: quote.startTime,
    endTime: quote.endTime,
    guestCount: quote.guestCount,
    honoreeName: quote.honoreeName,
    vegetarianCount: quote.vegetarianCount,
    veganCount: quote.veganCount,
    celiacCount: quote.celiacCount,
    lactoseIntolerantCount: quote.lactoseIntolerantCount,
    tableLinenColor: quote.tableLinenColor,
    quoteMode: quote.quoteMode ?? 'PACKAGE',
    guestBreakdown: {
      totalGuests: quote.totalGuests ?? quote.guestCount,
      adultsCount: quote.adultsCount,
      minorsCount: quote.minorsCount,
      childrenCount: quote.childrenCount,
      teenagersCount: quote.teenagersCount,
      adultsWithAlcoholCount: quote.adultsWithAlcoholCount,
      includesAlcohol: quote.includesAlcohol
    },
    lineItemsSnapshot: quote.lineItems ?? [],
    customCalculationSnapshot: quote.customCalculationSnapshot,
    status: 'quoted',
    estimatedAmount: quote.totalAmount,
    finalAmount: quote.totalAmount,
    notes: [input.notes, quote.notes].filter(Boolean).join('\n\n'),
    commercialSnapshot,
    menuSnapshot: quote.menuSections ?? [],
    servicesSnapshot: quote.includedServices ?? [],
    resourcePlanSnapshot: buildInitialResourcePlan({ source: 'quote_conversion', sourceQuoteId: quote._id }),
    paymentSnapshot: { depositAmount: quote.depositAmount, balanceAmount: quote.balanceAmount, paymentTerms: quote.paymentTerms, realPaymentsImplemented: false },
    contractReadyChecklist: checklist(quote, customer),
    createdBy: input.userId,
    updatedBy: input.userId
  });

  quote.customerId = customer._id;
  quote.convertedCustomerId = customer._id;
  quote.convertedEventId = event._id;
  quote.status = 'converted';
  quote.acceptedAt = quote.acceptedAt ?? new Date();
  quote.updatedBy = input.userId;
  await quote.save();
  await createRevision(quote, input.userId);

  if (lead) {
    lead.status = 'converted';
    lead.convertedCustomerId = customer._id;
    lead.convertedEventId = event._id;
    lead.convertedAt = new Date();
    lead.updatedBy = input.userId;
    await lead.save();
  }
  await LeadActivity.create({
    leadId: lead?._id,
    customerId: customer._id,
    eventId: event._id,
    type: 'converted',
    title: 'Presupuesto convertido a evento',
    description: `Se creó el evento desde el presupuesto ${quote.quoteNumber}.`,
    metadata: { quoteId: quote._id, customerId: customer._id, eventId: event._id },
    createdBy: input.userId
  });

  return { quote, lead, customer, event, createdEvent: true };
}
