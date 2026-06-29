import { Customer, Lead, LeadActivity } from './crm.models';

export type ContactInput = {
  contactName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  eventType?: string;
  estimatedEventDate?: Date;
  guestCount?: number;
  salonIds?: string[];
  source?: string;
  message?: string;
  leadId?: string;
  customerId?: string;
  quoteId?: string;
  userId?: string;
};

export function normalizeEmail(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function normalizePhone(value?: string): string | undefined {
  const normalized = value?.replace(/[^\d+]/g, '').trim();
  return normalized || undefined;
}

export function normalizeContactData(input: ContactInput): ContactInput & { normalizedEmail?: string; normalizedPhone?: string; fullName: string } {
  const fullName = (input.contactName || [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Cliente sin nombre').trim();
  return {
    ...input,
    contactName: fullName,
    firstName: input.firstName?.trim(),
    lastName: input.lastName?.trim(),
    phone: input.phone?.trim(),
    email: normalizeEmail(input.email),
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone),
    fullName
  };
}

function splitName(input: ContactInput): { firstName: string; lastName: string; fullName: string } {
  const fullName = normalizeContactData(input).fullName;
  const parts = fullName.split(/\s+/);
  return {
    firstName: input.firstName?.trim() || parts[0] || 'Cliente',
    lastName: input.lastName?.trim() || parts.slice(1).join(' ') || 'Sin apellido',
    fullName
  };
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findByContact(model: any, input: ContactInput): Promise<any | null> {
  const normalized = normalizeContactData(input);
  if (input.customerId && model.modelName === 'Customer') {
    const customer = await model.findOne({ _id: input.customerId, deletedAt: null });
    if (customer) return customer;
  }
  if (input.leadId && model.modelName === 'Lead') {
    const lead = await model.findOne({ _id: input.leadId, deletedAt: null });
    if (lead) return lead;
  }
  if (normalized.normalizedEmail) {
    const emailMatch = await model.findOne({
      deletedAt: null,
      $or: [
        { normalizedEmail: normalized.normalizedEmail },
        { email: { $regex: `^${escapeRegex(normalized.normalizedEmail)}$`, $options: 'i' } }
      ]
    });
    if (emailMatch) return emailMatch;
  }
  if (normalized.normalizedPhone) {
    const candidates = await model.find({ deletedAt: null, $or: [{ normalizedPhone: normalized.normalizedPhone }, { phone: { $exists: true, $ne: '' } }] });
    return candidates.find((item: any) => normalizePhone(item.normalizedPhone || item.phone) === normalized.normalizedPhone) ?? null;
  }
  return null;
}

export async function findExistingCustomer(input: ContactInput): Promise<any | null> {
  return findByContact(Customer, input);
}

export async function findExistingLead(input: ContactInput): Promise<any | null> {
  return findByContact(Lead, input);
}

export async function findOrCreateLead(input: ContactInput): Promise<{ lead: any; created: boolean; possibleDuplicateLeadIds: string[]; existingCustomer?: any }> {
  const normalized = normalizeContactData(input);
  const existingCustomer = await findExistingCustomer(input);
  if (existingCustomer) return { lead: null, created: false, possibleDuplicateLeadIds: [], existingCustomer };

  const existingLead = await findExistingLead(input);
  const salonIds = uniqueIds(input.salonIds ?? []);
  if (existingLead) {
    const update: Record<string, unknown> = {};
    if (!existingLead.phone && input.phone) update.phone = input.phone;
    if (!existingLead.normalizedPhone && normalized.normalizedPhone) update.normalizedPhone = normalized.normalizedPhone;
    if (!existingLead.email && normalized.email) update.email = normalized.email;
    if (!existingLead.normalizedEmail && normalized.normalizedEmail) update.normalizedEmail = normalized.normalizedEmail;
    if (!existingLead.eventType && input.eventType) update.eventType = input.eventType;
    if (!existingLead.eventDate && input.estimatedEventDate) update.eventDate = input.estimatedEventDate;
    if (!existingLead.guestCount && input.guestCount) update.guestCount = input.guestCount;
    if (salonIds.length) {
      update.salonIds = uniqueIds([existingLead.salonId?.toString(), ...(existingLead.salonIds ?? []).map((id: { toString(): string }) => id.toString()), ...salonIds]);
      if (!existingLead.salonId) update.salonId = salonIds[0];
    }
    if (Object.keys(update).length) await Lead.updateOne({ _id: existingLead._id }, { $set: { ...update, updatedBy: input.userId } });
    const hydrated = await Lead.findOne({ _id: existingLead._id, deletedAt: null });
    return { lead: hydrated ?? existingLead, created: false, possibleDuplicateLeadIds: [] };
  }

  const name = splitName(input);
  const lead = await Lead.create({
    ...name,
    phone: input.phone,
    normalizedPhone: normalized.normalizedPhone,
    email: normalized.email,
    normalizedEmail: normalized.normalizedEmail,
    eventType: input.eventType,
    eventDate: input.estimatedEventDate,
    guestCount: input.guestCount,
    salonId: salonIds[0],
    salonIds,
    source: input.source === 'quick_quote' ? 'quick_quote' : input.source === 'website' ? 'web_form' : input.source === 'whatsapp' ? 'whatsapp' : input.source === 'phone' ? 'phone' : 'manual',
    status: 'new',
    message: input.message,
    createdBy: input.userId,
    updatedBy: input.userId
  });
  return { lead, created: true, possibleDuplicateLeadIds: [] };
}

export async function findOrCreateCustomer(input: ContactInput & { lead?: any }): Promise<{ customer: any; created: boolean }> {
  const existing = await findExistingCustomer(input);
  const lead = input.lead;
  const salonIds = uniqueIds([...(input.salonIds ?? []), ...(lead?.salonIds ?? []).map((id: { toString(): string }) => id.toString()), lead?.salonId?.toString()]);
  if (existing) {
    const update: Record<string, unknown> = { updatedBy: input.userId };
    if (!existing.phone && (input.phone || lead?.phone)) update.phone = input.phone || lead?.phone;
    if (!existing.normalizedPhone) update.normalizedPhone = normalizePhone(input.phone || lead?.phone);
    if (!existing.email && (input.email || lead?.email)) update.email = normalizeEmail(input.email || lead?.email);
    if (!existing.normalizedEmail) update.normalizedEmail = normalizeEmail(input.email || lead?.email);
    const addToSet: Record<string, unknown> = {};
    if (lead?._id) addToSet.sourceLeadIds = lead._id;
    if (salonIds.length) addToSet.salonIds = { $each: salonIds };
    await Customer.updateOne({ _id: existing._id }, { $set: update, ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {}) });
    const hydrated = await Customer.findOne({ _id: existing._id, deletedAt: null });
    return { customer: hydrated ?? existing, created: false };
  }

  const name = splitName({ ...input, contactName: input.contactName || lead?.fullName });
  const customer = await Customer.create({
    ...name,
    phone: input.phone || lead?.phone,
    normalizedPhone: normalizePhone(input.phone || lead?.phone),
    email: normalizeEmail(input.email || lead?.email),
    normalizedEmail: normalizeEmail(input.email || lead?.email),
    sourceLeadId: lead?._id,
    sourceLeadIds: lead?._id ? [lead._id] : [],
    createdFromLeadId: lead?._id,
    createdFromQuoteId: input.quoteId,
    salonIds,
    notes: input.message,
    createdBy: input.userId,
    updatedBy: input.userId
  });
  if (lead?._id) {
    await LeadActivity.create({ leadId: lead._id, customerId: customer._id, type: 'customer_created', title: 'Cliente creado', metadata: { customerId: customer._id, quoteId: input.quoteId }, createdBy: input.userId });
  }
  return { customer, created: true };
}
