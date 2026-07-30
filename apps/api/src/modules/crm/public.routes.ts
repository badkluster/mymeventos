import { Router } from 'express';
import { z } from 'zod';
import { Event, PackageTemplate, VenuePackageRule } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { LandingEventType, LandingFaq, LandingGalleryItem, LandingPromotion, LandingServiceBlock, LandingSettings, LandingStoryStep, LandingTestimonial } from '../landing/landing.models';
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
    packageTemplateId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    attributionId: z.string().trim().max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
    utmSource: z.string().trim().max(120).optional(),
    utmMedium: z.string().trim().max(120).optional(),
    utmCampaign: z.string().trim().max(120).optional(),
    message: z.string().max(700).optional().refine((value) => countWords(value) <= messageMaxWords, `El mensaje no puede superar ${messageMaxWords} palabras.`)
  }),
  params: z.object({}),
  query: z.object({})
});
const guestListToken = z.string().regex(/^[A-Za-z0-9_-]{32,}$/);
const publicGuestTableSchema = z.object({ id: z.string().trim().max(120).optional(), name: z.string().trim().min(1).max(120), capacity: z.coerce.number().int().positive().max(100).optional(), audience: z.enum(['children', 'family', 'open']).optional(), notes: z.string().trim().max(500).optional() });
const publicGuestSchema = z.object({ id: z.string().trim().max(120).optional(), fullName: z.string().trim().min(1).max(160), tableId: z.string().trim().max(120).optional(), meal: z.string().trim().max(100).optional(), ageGroup: z.enum(['adult', 'child_1_4', 'child_5_9', 'minor_10_17']).optional(), dietaryPreference: z.enum(['vegetarian', 'vegan', 'celiac', 'lactose_free', 'none']).optional(), notes: z.string().trim().max(600).optional(), confirmed: z.boolean().optional() });
const publicGuestListSchema = z.object({ tables: z.array(publicGuestTableSchema).max(80).default([]), guests: z.array(publicGuestSchema).max(1000).default([]), notes: z.string().trim().max(2500).optional() });
const publicGuestListGetSchema = z.object({ body: z.unknown().optional(), params: z.object({ token: guestListToken }), query: z.object({}) });
const publicGuestListUpdateSchema = z.object({ body: z.object({ guestList: publicGuestListSchema }), params: z.object({ token: guestListToken }), query: z.object({}) });

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
    readLeanList(VenuePackageRule.find({ deletedAt: null, salonId: { $in: salonIds } })),
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
          name: rule?.name ?? template.publicTitle ?? template.name,
          description: template.publicDescription ?? source.notes,
          publicHighlights: template.publicHighlights ?? [],
          badgeLabel: template.badgeLabel,
          featured: template.featured,
          durationHours: source.durationHours,
          startTime: source.startTime,
          endTime: source.endTime,
          pricingMode: source.pricingMode ?? 'per_person',
          pricePerPerson,
          fixedPrice: Number(source.fixedPrice ?? 0),
          discountPercentage,
          finalPricePerPerson,
          finalFixedPrice: Number(source.finalFixedPrice ?? Math.round(Number(source.fixedPrice ?? 0) * (1 - discountPercentage / 100))),
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
  const [settings, salons, promotions, gallery, testimonials, faqs, serviceBlocks, eventTypes, storySteps] = await Promise.all([
    LandingSettings.findOne({ key: 'default', active: true, deletedAt: null }).lean(),
    publicSalons(),
    LandingPromotion.find({ ...activeNowQuery(), visibleOnHome: true }).sort({ displayOrder: 1, createdAt: -1 }).limit(8).lean(),
    LandingGalleryItem.find({ active: true, deletedAt: null }).sort({ featured: -1, displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingTestimonial.find({ active: true, deletedAt: null }).sort({ featured: -1, displayOrder: 1, createdAt: -1 }).limit(6).lean(),
    LandingFaq.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingServiceBlock.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingEventType.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
    LandingStoryStep.find({ active: true, deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).limit(12).lean(),
  ]);
  const packages = salons.flatMap((salon: any) => (salon.packages ?? []).map((item: any) => ({ ...item, salonId: salon._id, salonName: salon.publicTitle || salon.name })));
  return sendSuccess(response, { settings, salons, packages, promotions, gallery, testimonials, faqs, serviceBlocks, eventTypes, storySteps });
}));

router.get('/salons', asyncHandler(async (_request, response) => {
  return sendSuccess(response, { salons: await publicSalons() });
}));

router.get('/guest-list/:token', validateRequest(publicGuestListGetSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ guestListAccessToken: request.params.token, deletedAt: null }).select('eventName eventType eventDate guestCount resourcePlanSnapshot').lean();
  if (!event) throw new ApiError(404, 'El enlace de lista de invitados no es válido o ya no está disponible.');
  const guestList = event.resourcePlanSnapshot?.guestList ?? { tables: [], guests: [], notes: '' };
  return sendSuccess(response, { event: { eventName: event.eventName, eventType: event.eventType, eventDate: event.eventDate, guestCount: event.guestCount }, guestList });
}));

router.patch('/guest-list/:token', validateRequest(publicGuestListUpdateSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ guestListAccessToken: request.params.token, deletedAt: null });
  if (!event) throw new ApiError(404, 'El enlace de lista de invitados no es válido o ya no está disponible.');
  event.resourcePlanSnapshot = { ...(event.resourcePlanSnapshot ?? {}), guestList: { ...request.body.guestList, submittedAt: new Date().toISOString() } };
  event.markModified('resourcePlanSnapshot');
  await event.save();
  return sendSuccess(response, { guestList: event.resourcePlanSnapshot.guestList, savedAt: new Date().toISOString() });
}));

router.post('/quick-quote', validateRequest(schema), asyncHandler(async (request, response) => {
  const salon = await Salon.exists({ _id: request.body.salonId, active: true, deletedAt: null });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  const selectedPackage: any = request.body.packageTemplateId ? await PackageTemplate.findOne({
    _id: request.body.packageTemplateId,
    active: true,
    deletedAt: null,
    $or: [{ isGlobal: true }, { salonIds: request.body.salonId }]
  }).select('_id name publicTitle').lean() : null;
  if (request.body.packageTemplateId && !selectedPackage) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const result = await createQuoteRequest({
    source: 'quick_quote',
    contactName: request.body.name,
    phone: request.body.phone,
    email: request.body.email,
    eventType: request.body.eventType,
    estimatedEventDate: request.body.eventDate,
    guestCount: request.body.guestCount,
    interestedSalonIds: [request.body.salonId],
    interestedPackageTemplateId: selectedPackage?._id?.toString(),
    interestedPackageName: selectedPackage?.publicTitle ?? selectedPackage?.name,
    message: request.body.message,
    originalPayload: request.body
  });
  return sendSuccess(response, { leadId: result.lead?._id, customerId: result.customer?._id, quoteRequestId: result.quoteRequest._id }, 201, 'Recibimos tu solicitud. Un asesor de M&M Eventos se contactará para enviarte el presupuesto.');
}));

export default router;
