import { Router } from 'express';
import { z } from 'zod';
import { PackageTemplate, VenuePackageRule } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { LandingEventType, LandingFaq, LandingGalleryItem, LandingPromotion, LandingServiceBlock, LandingSettings, LandingTestimonial } from '../landing/landing.models';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { validateRequest } from '../../middlewares/validateRequest';
import { ApiError } from '../../middlewares/errorHandler';
import { createQuoteRequest } from './quote-request.service';

const router = Router();
const messageMaxWords = 120;
const phonePattern = /^[+()\d\s-]{6,24}$/;
const countWords = (value?: string) => (value ?? '').trim().split(/\s+/).filter(Boolean).length;
function isFutureDay(value?: Date): boolean {
  if (!value) return true;
  const candidate = new Date(value);
  candidate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return candidate > today;
}

const schema = z.object({
  body: z.object({
    name: z.string().min(2),
    phone: z.string().trim().min(6).max(24).regex(phonePattern),
    email: z.string().email().optional().or(z.literal('')),
    eventType: z.string().min(1),
    eventDate: z.coerce.date().optional().refine(isFutureDay, 'La fecha tentativa debe ser posterior a hoy.'),
    guestCount: z.coerce.number().int().min(1).max(1000),
    salonId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    message: z.string().max(700).optional().refine((value) => countWords(value) <= messageMaxWords, `El mensaje no puede superar ${messageMaxWords} palabras.`)
  }),
  params: z.object({}),
  query: z.object({})
});

async function readLeanList(query: any, sort?: Record<string, 1 | -1>): Promise<any[]> {
  if (!query) return [];
  const sorted = sort && typeof query.sort === 'function' ? query.sort(sort) : query;
  if (typeof sorted.lean === 'function') return sorted.lean();
  if (Array.isArray(sorted)) return sorted;
  return [];
}

async function publicSalons() {
  const salons = await Salon.find({ active: true, deletedAt: null, $or: [{ visibleOnWebsite: true }, { visibleOnWebsite: { $exists: false } }] })
    .select('_id name slug address city locality province phone whatsapp email instagramUrl facebookUrl tiktokUrl managerUserId publicTitle publicShortDescription publicDescription heroImageUrl galleryImageUrls mediaGallery locationText mapUrl minCapacity maxCapacity recommendedCapacity allowedEventTypes defaultStartTime defaultEndTime defaultDurationHours allowsExtraHour extraHourPrice defaultDepositAmount defaultPaymentTerms visibleOnWebsite displayOrder extraServices active')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  const salonIds = salons.map((salon: any) => salon._id);
  const managerIds = [...new Set(salons.map((salon: any) => salon.managerUserId?.toString()).filter(Boolean))];
  const [templates, rules, managers] = await Promise.all([
    readLeanList(PackageTemplate.find({ active: true, deletedAt: null, $and: [{ $or: [{ visibleOnWebsite: true }, { visibleOnWebsite: { $exists: false } }] }, { $or: [{ isGlobal: true }, { salonIds: { $in: salonIds } }] }] }), { displayOrder: 1, name: 1 }),
    readLeanList(VenuePackageRule.find({ active: true, deletedAt: null, salonId: { $in: salonIds } })),
    managerIds.length ? readLeanList(User.find({ _id: { $in: managerIds }, active: true, deletedAt: null }).select('_id firstName lastName fullName phone email')) : Promise.resolve([])
  ]);
  const rulesBySalonAndPackage = new Map(rules.map((rule: any) => [`${rule.salonId.toString()}:${rule.packageTemplateId.toString()}`, rule]));
  const managersById = new Map(managers.map((manager: any) => [manager._id.toString(), manager]));
  return salons.map((salon: any) => {
    const salonId = salon._id.toString();
    const manager = salon.managerUserId ? managersById.get(salon.managerUserId.toString()) : undefined;
    const packages = templates
      .filter((template: any) => template.isGlobal || (template.salonIds ?? []).some((id: any) => id.toString() === salonId))
      .map((template: any) => {
        const rule = rulesBySalonAndPackage.get(`${salonId}:${template._id.toString()}`);
        if (rule && rule.active === false) return null;
        const source = rule ? { ...template, ...rule } : template;
        const pricePerPerson = Number(source.pricePerPerson ?? 0);
        const discountPercentage = Number(source.discountPercentage ?? 0);
        const finalPricePerPerson = Number(source.finalPricePerPerson ?? Math.round(pricePerPerson * (1 - discountPercentage / 100)));
        return {
          _id: template._id,
          name: template.publicTitle ?? template.name,
          description: template.publicDescription ?? source.notes,
          publicHighlights: template.publicHighlights ?? [],
          badgeLabel: template.badgeLabel,
          featured: template.featured,
          durationHours: source.durationHours,
          startTime: source.startTime,
          endTime: source.endTime,
          pricePerPerson,
          discountPercentage,
          finalPricePerPerson,
          depositAmount: source.depositAmount,
          paymentTerms: source.paymentTerms,
          promotionText: source.promotionText,
          giftText: source.giftText,
          includedServices: source.includedServices ?? [],
          menuSections: source.menuSections ?? [],
          notes: source.notes,
          ruleConfigured: Boolean(rule)
        };
      })
      .filter(Boolean);
    return {
      ...salon,
      manager,
      mediaGallery: (salon.mediaGallery ?? []).filter((asset: any) => asset.publicVisible !== false).sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      extraServices: (salon.extraServices ?? []).filter((extra: any) => extra.active !== false && extra.publicVisible !== false),
      packages
    };
  });
}

function activeNowQuery() {
  const now = new Date();
  return { active: true, deletedAt: null, $and: [{ $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] }] };
}

router.get('/landing', asyncHandler(async (_request, response) => {
  const [settings, salons, promotions, gallery, testimonials, faqs, serviceBlocks, eventTypes] = await Promise.all([
    LandingSettings.findOne({ key: 'default', active: true, deletedAt: null }).lean(),
    publicSalons(),
    LandingPromotion.find({ ...activeNowQuery(), visibleOnHome: true }).sort({ displayOrder: 1, createdAt: -1 }).limit(8).lean(),
    LandingGalleryItem.find({ active: true, deletedAt: null }).sort({ featured: -1, displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingTestimonial.find({ active: true, deletedAt: null }).sort({ featured: -1, displayOrder: 1, createdAt: -1 }).limit(6).lean(),
    LandingFaq.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingServiceBlock.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingEventType.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
  ]);
  const packages = salons.flatMap((salon: any) => (salon.packages ?? []).map((item: any) => ({ ...item, salonId: salon._id, salonName: salon.publicTitle || salon.name }))).slice(0, 6);
  return sendSuccess(response, { settings, salons, packages, promotions, gallery, testimonials, faqs, serviceBlocks, eventTypes });
}));

router.get('/salons', asyncHandler(async (_request, response) => {
  return sendSuccess(response, { salons: await publicSalons() });
}));

router.post('/quick-quote', validateRequest(schema), asyncHandler(async (request, response) => {
  const salon = await Salon.exists({ _id: request.body.salonId, active: true, deletedAt: null });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  const result = await createQuoteRequest({
    source: 'quick_quote',
    contactName: request.body.name,
    phone: request.body.phone,
    email: request.body.email,
    eventType: request.body.eventType,
    estimatedEventDate: request.body.eventDate,
    guestCount: request.body.guestCount,
    interestedSalonIds: [request.body.salonId],
    message: request.body.message,
    originalPayload: request.body
  });
  return sendSuccess(response, { leadId: result.lead?._id, customerId: result.customer?._id, quoteRequestId: result.quoteRequest._id }, 201, 'Recibimos tu solicitud. Un asesor de M&M Eventos se contactará para enviarte el presupuesto.');
}));

export default router;
