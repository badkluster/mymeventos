import { Types } from 'mongoose';
import { Customer, Event, Lead, Quote } from '../crm/crm.models';

// A conservative cap on how many candidate documents we ever pull server-side
// before applying event-aggregate filters or building a sample. Real audience
// resolution for sending never returns this list to the browser — only a
// count and a small sample — so this is a safety valve, not a UX limit.
const MAX_CANDIDATES = 20_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

// Filter-driven salonIds come from a loosely-typed request body — drop anything
// that isn't a real ObjectId instead of letting Mongoose/BSON throw and turn a
// bad filter into a 500.
function validObjectIds(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && OBJECT_ID_REGEX.test(id)) : [];
}

export type SalonScope = { isAdmin: boolean; salonIds: string[] };

export type AudienceContact = {
  sourceType: 'lead' | 'customer' | 'manual';
  sourceId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  salonId?: string;
};

export type LeadAudienceFilters = {
  statuses?: string[];
  salonIds?: string[];
  createdFrom?: string;
  createdTo?: string;
  source?: string[];
  eventType?: string;
  eventDateFrom?: string;
  eventDateTo?: string;
  guestCountMin?: number;
  guestCountMax?: number;
  hasQuote?: boolean;
  quoteSent?: boolean;
  converted?: boolean;
  tags?: string[];
  assignedUserId?: string;
  validEmailOnly?: boolean;
};

export type CustomerAudienceFilters = {
  salonIds?: string[];
  createdFrom?: string;
  createdTo?: string;
  hasPastEvents?: boolean;
  hasFutureEvents?: boolean;
  eventType?: string;
  lastEventDateFrom?: string;
  lastEventDateTo?: string;
  minEventsCount?: number;
  recentWithinDays?: number;
  historicOlderThanDays?: number;
  tags?: string[];
  validEmailOnly?: boolean;
};

export type MarketingAudienceFilters = {
  lead?: LeadAudienceFilters;
  customer?: CustomerAudienceFilters;
};

export type ManualAudienceMember = {
  email: string;
  firstName?: string;
  lastName?: string;
  sourceType?: 'lead' | 'customer' | 'manual';
  sourceId?: string;
};

export type AudienceExclusion = { sourceType: string; sourceId: string };

function dateRange(from?: string, to?: string) {
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
}

function numberRange(min?: number, max?: number) {
  const range: Record<string, number> = {};
  if (min != null) range.$gte = min;
  if (max != null) range.$lte = max;
  return Object.keys(range).length ? range : undefined;
}

function salonScopeCondition(scope: SalonScope, fields: string[]) {
  if (scope.isAdmin) return null;
  const salonIds = validObjectIds(scope.salonIds);
  return { $or: fields.map((field) => ({ [field]: { $in: salonIds } })) };
}

async function leadQuoteIdSet(hasQuote?: boolean, quoteSent?: boolean): Promise<Set<string> | null> {
  if (hasQuote === undefined && quoteSent === undefined) return null;
  const query: Record<string, unknown> = { deletedAt: null, leadId: { $ne: null } };
  if (quoteSent) query.status = { $in: ['sent', 'follow_up', 'accepted', 'rejected', 'expired', 'converted'] };
  const ids = await Quote.distinct('leadId', query);
  return new Set(ids.map((id) => String(id)));
}

async function buildLeadQuery(filters: LeadAudienceFilters, scope: SalonScope) {
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  const salonCondition = salonScopeCondition(scope, ['salonId', 'salonIds']);
  if (salonCondition) and.push(salonCondition);
  const requestedLeadSalonIds = validObjectIds(filters.salonIds);
  if (requestedLeadSalonIds.length) and.push({ $or: [{ salonId: { $in: requestedLeadSalonIds } }, { salonIds: { $in: requestedLeadSalonIds } }] });
  if (filters.statuses?.length) and.push({ status: { $in: filters.statuses } });
  if (filters.source?.length) and.push({ source: { $in: filters.source } });
  if (filters.eventType) and.push({ eventType: { $regex: filters.eventType, $options: 'i' } });
  const createdRange = dateRange(filters.createdFrom, filters.createdTo);
  if (createdRange) and.push({ createdAt: createdRange });
  const eventDateRange = dateRange(filters.eventDateFrom, filters.eventDateTo);
  if (eventDateRange) and.push({ eventDate: eventDateRange });
  const guestRange = numberRange(filters.guestCountMin, filters.guestCountMax);
  if (guestRange) and.push({ guestCount: guestRange });
  if (filters.tags?.length) and.push({ tags: { $in: filters.tags } });
  if (filters.assignedUserId) and.push({ assignedUserId: filters.assignedUserId });
  if (filters.converted === true) and.push({ status: 'converted' });
  if (filters.converted === false) and.push({ status: { $ne: 'converted' } });
  if (filters.validEmailOnly !== false) and.push({ email: EMAIL_REGEX });

  const quoteIds = await leadQuoteIdSet(filters.hasQuote, filters.quoteSent);
  if (quoteIds) {
    const matchingIds = [...quoteIds].map((id) => new Types.ObjectId(id));
    and.push(filters.hasQuote === false ? { _id: { $nin: matchingIds } } : { _id: { $in: matchingIds } });
  }

  return { $and: and };
}

async function resolveLeadContacts(filters: LeadAudienceFilters, scope: SalonScope): Promise<{ contacts: AudienceContact[]; totalMatched: number }> {
  const query = await buildLeadQuery(filters, scope);
  const totalMatched = await Lead.countDocuments(query);
  const docs = await Lead.find(query)
    .select('firstName lastName fullName email salonId')
    .limit(MAX_CANDIDATES)
    .lean();
  return {
    totalMatched,
    contacts: docs.map((doc: any) => ({
      sourceType: 'lead' as const,
      sourceId: String(doc._id),
      email: doc.email,
      firstName: doc.firstName,
      lastName: doc.lastName,
      fullName: doc.fullName,
      salonId: doc.salonId ? String(doc.salonId) : undefined
    }))
  };
}

async function buildCustomerBaseQuery(filters: CustomerAudienceFilters, scope: SalonScope) {
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  const salonCondition = salonScopeCondition(scope, ['salonIds']);
  if (salonCondition) and.push(salonCondition);
  const requestedCustomerSalonIds = validObjectIds(filters.salonIds);
  if (requestedCustomerSalonIds.length) and.push({ salonIds: { $in: requestedCustomerSalonIds } });
  const createdRange = dateRange(filters.createdFrom, filters.createdTo);
  if (createdRange) and.push({ createdAt: createdRange });
  if (filters.tags?.length) and.push({ tags: { $in: filters.tags } });
  if (filters.validEmailOnly !== false) and.push({ email: EMAIL_REGEX });
  if (filters.recentWithinDays) and.push({ createdAt: { $gte: new Date(Date.now() - filters.recentWithinDays * 86_400_000) } });
  if (filters.historicOlderThanDays) and.push({ createdAt: { $lte: new Date(Date.now() - filters.historicOlderThanDays * 86_400_000) } });
  return { $and: and };
}

function needsEventAggregate(filters: CustomerAudienceFilters): boolean {
  return (
    filters.hasPastEvents !== undefined ||
    filters.hasFutureEvents !== undefined ||
    Boolean(filters.eventType) ||
    Boolean(filters.lastEventDateFrom) ||
    Boolean(filters.lastEventDateTo) ||
    filters.minEventsCount !== undefined
  );
}

async function resolveCustomerContacts(filters: CustomerAudienceFilters, scope: SalonScope): Promise<{ contacts: AudienceContact[]; totalMatched: number }> {
  const query = await buildCustomerBaseQuery(filters, scope);
  const candidates = await Customer.find(query)
    .select('firstName lastName fullName email salonIds')
    .limit(MAX_CANDIDATES)
    .lean();

  if (!needsEventAggregate(filters)) {
    return {
      totalMatched: await Customer.countDocuments(query),
      contacts: candidates.map(toCustomerContact)
    };
  }

  const candidateIds = candidates.map((doc: any) => doc._id);
  const now = new Date();
  const eventMatch: Record<string, unknown> = { customerId: { $in: candidateIds }, deletedAt: null };
  if (filters.eventType) eventMatch.eventType = { $regex: filters.eventType, $options: 'i' };

  const aggregates = await Event.aggregate([
    { $match: eventMatch },
    {
      $group: {
        _id: '$customerId',
        count: { $sum: 1 },
        lastEventDate: { $max: '$eventDate' },
        futureCount: { $sum: { $cond: [{ $gte: ['$eventDate', now] }, 1, 0] } },
        pastCount: { $sum: { $cond: [{ $lt: ['$eventDate', now] }, 1, 0] } }
      }
    }
  ]);
  const eventStatsByCustomer = new Map(aggregates.map((row: any) => [String(row._id), row]));

  const lastEventRange = dateRange(filters.lastEventDateFrom, filters.lastEventDateTo);
  const filtered = candidates.filter((doc: any) => {
    const stats = eventStatsByCustomer.get(String(doc._id));
    if (filters.hasPastEvents === true && !(stats?.pastCount > 0)) return false;
    if (filters.hasPastEvents === false && stats?.pastCount > 0) return false;
    if (filters.hasFutureEvents === true && !(stats?.futureCount > 0)) return false;
    if (filters.hasFutureEvents === false && stats?.futureCount > 0) return false;
    if (filters.minEventsCount !== undefined && !(stats?.count >= filters.minEventsCount)) return false;
    if (filters.eventType && !stats) return false;
    if (lastEventRange && !stats?.lastEventDate) return false;
    if (lastEventRange?.$gte && stats?.lastEventDate && new Date(stats.lastEventDate) < lastEventRange.$gte) return false;
    if (lastEventRange?.$lte && stats?.lastEventDate && new Date(stats.lastEventDate) > lastEventRange.$lte) return false;
    return true;
  });

  return { totalMatched: filtered.length, contacts: filtered.map(toCustomerContact) };
}

function toCustomerContact(doc: any): AudienceContact {
  return {
    sourceType: 'customer',
    sourceId: String(doc._id),
    email: doc.email,
    firstName: doc.firstName,
    lastName: doc.lastName,
    fullName: doc.fullName,
    salonId: doc.salonIds?.[0] ? String(doc.salonIds[0]) : undefined
  };
}

export type AudienceResolution = {
  contacts: AudienceContact[];
  totalMatched: number;
  duplicatesRemoved: number;
  invalidEmailExcluded: number;
  manuallyExcluded: number;
};

export async function resolveAudienceContacts(input: {
  sourceTypes: string[];
  filters?: MarketingAudienceFilters;
  manualRecipients?: ManualAudienceMember[];
  excludedMembers?: AudienceExclusion[];
  extraExcludedEmails?: string[];
  scope: SalonScope;
}): Promise<AudienceResolution> {
  const parts: { contacts: AudienceContact[]; totalMatched: number }[] = [];

  if (input.sourceTypes.includes('lead')) parts.push(await resolveLeadContacts(input.filters?.lead ?? {}, input.scope));
  if (input.sourceTypes.includes('customer')) parts.push(await resolveCustomerContacts(input.filters?.customer ?? {}, input.scope));
  if (input.sourceTypes.includes('manual') && input.manualRecipients?.length) {
    parts.push({
      totalMatched: input.manualRecipients.length,
      contacts: input.manualRecipients.map((member) => ({
        sourceType: 'manual' as const,
        sourceId: member.sourceId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName
      }))
    });
  }

  const totalMatchedRaw = parts.reduce((sum, part) => sum + part.totalMatched, 0);
  const allContacts = parts.flatMap((part) => part.contacts);

  const excludedKeySet = new Set(
    (input.excludedMembers ?? []).map((exclusion) => `${exclusion.sourceType}:${exclusion.sourceId}`)
  );
  const excludedEmailSet = new Set((input.extraExcludedEmails ?? []).map((email) => email.trim().toLowerCase()));

  let invalidEmailExcluded = 0;
  let manuallyExcluded = 0;
  const seenEmails = new Set<string>();
  let duplicatesRemoved = 0;
  const deduped: AudienceContact[] = [];

  for (const contact of allContacts) {
    const normalizedEmail = (contact.email ?? '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      invalidEmailExcluded += 1;
      continue;
    }
    if (contact.sourceId && excludedKeySet.has(`${contact.sourceType}:${contact.sourceId}`)) {
      manuallyExcluded += 1;
      continue;
    }
    if (excludedEmailSet.has(normalizedEmail)) {
      manuallyExcluded += 1;
      continue;
    }
    if (seenEmails.has(normalizedEmail)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenEmails.add(normalizedEmail);
    deduped.push(contact);
  }

  return {
    contacts: deduped,
    totalMatched: totalMatchedRaw,
    duplicatesRemoved,
    invalidEmailExcluded,
    manuallyExcluded
  };
}
