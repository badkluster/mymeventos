import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import {
  LandingEventType,
  LandingFaq,
  LandingGalleryItem,
  LandingPromotion,
  LandingServiceBlock,
  LandingSettings,
  LandingTestimonial,
} from './landing.models';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

const settingsBody = z.object({
  heroTitle: z.string().trim().min(2).optional(),
  heroSubtitle: z.string().trim().optional(),
  heroImageUrl: z.string().trim().optional().or(z.literal('')),
  heroPrimaryCtaLabel: z.string().trim().optional(),
  heroSecondaryCtaLabel: z.string().trim().optional(),
  whatsappNumber: z.string().trim().optional().or(z.literal('')),
  whatsappDefaultMessage: z.string().trim().optional(),
  contactEmail: z.string().trim().optional().or(z.literal('')),
  contactPhone: z.string().trim().optional().or(z.literal('')),
  instagramUrl: z.string().trim().optional().or(z.literal('')),
  facebookUrl: z.string().trim().optional().or(z.literal('')),
  tiktokUrl: z.string().trim().optional().or(z.literal('')),
  footerText: z.string().trim().optional(),
  seoTitle: z.string().trim().optional(),
  seoDescription: z.string().trim().optional(),
  openGraphImageUrl: z.string().trim().optional().or(z.literal('')),
  active: z.boolean().optional(),
});

const promotionBody = z.object({
  title: z.string().trim().min(2),
  subtitle: z.string().trim().optional(),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().optional().or(z.literal('')),
  badgeText: z.string().trim().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  active: z.boolean().optional(),
  visibleOnHome: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
  ctaLabel: z.string().trim().optional(),
  ctaLink: z.string().trim().optional().or(z.literal('')),
  applicableSalonIds: z.array(objectId).optional(),
  applicablePackageIds: z.array(objectId).optional(),
  highlightColor: z.string().trim().optional(),
});

const galleryBody = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().min(1),
  altText: z.string().trim().optional(),
  category: z.string().trim().optional(),
  salonId: objectId.optional().or(z.literal('')),
  eventType: z.string().trim().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
});

const testimonialBody = z.object({
  quote: z.string().trim().min(5),
  customerName: z.string().trim().min(2),
  eventType: z.string().trim().optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  imageUrl: z.string().trim().optional().or(z.literal('')),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
});

const faqBody = z.object({
  question: z.string().trim().min(5),
  answer: z.string().trim().min(5),
  category: z.string().trim().optional(),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
});

const serviceBody = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  section: z.string().trim().optional(),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
});

const eventTypeBody = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  imageUrl: z.string().trim().optional().or(z.literal('')),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().optional(),
});

const resources = {
  promotions: { model: LandingPromotion, body: promotionBody, entity: 'LandingPromotion' },
  gallery: { model: LandingGalleryItem, body: galleryBody, entity: 'LandingGalleryItem' },
  testimonials: { model: LandingTestimonial, body: testimonialBody, entity: 'LandingTestimonial' },
  faqs: { model: LandingFaq, body: faqBody, entity: 'LandingFaq' },
  services: { model: LandingServiceBlock, body: serviceBody, entity: 'LandingServiceBlock' },
  'event-types': { model: LandingEventType, body: eventTypeBody, entity: 'LandingEventType' },
} as const;

type ResourceName = keyof typeof resources;

function resourceFor(name: string) {
  const resource = resources[name as ResourceName];
  if (!resource) throw new ApiError(404, 'LANDING_RESOURCE_NOT_FOUND');
  return resource;
}

function cleanBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === '' ? undefined : value]));
}

router.use(requireAuth);
router.use(requirePermission(Permission.LANDING_READ));

router.get('/', asyncHandler(async (_request, response) => {
  const [settings, promotions, gallery, testimonials, faqs, services, eventTypes] = await Promise.all([
    LandingSettings.findOne({ key: 'default', deletedAt: null }).lean(),
    LandingPromotion.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingGalleryItem.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingTestimonial.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingFaq.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingServiceBlock.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    LandingEventType.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
  ]);
  return sendSuccess(response, { settings, promotions, gallery, testimonials, faqs, services, eventTypes });
}));

router.patch('/settings', requirePermission(Permission.LANDING_UPDATE), validateRequest(z.object({ body: settingsBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const settings = await LandingSettings.findOneAndUpdate(
    { key: 'default' },
    { ...request.body, key: 'default', updatedBy: request.user!.id, $setOnInsert: { createdBy: request.user!.id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  await writeAuditLog(request, 'LANDING_SETTINGS_UPDATE', 'LandingSettings', settings._id.toString());
  return sendSuccess(response, { settings });
}));

router.get('/:resource', asyncHandler(async (request, response) => {
  const resource = resourceFor(request.params.resource);
  const items = await resource.model.find({ deletedAt: null }).sort({ displayOrder: 1, createdAt: -1 }).lean();
  return sendSuccess(response, { items });
}));

router.post('/:resource', requirePermission(Permission.LANDING_UPDATE), asyncHandler(async (request, response, next) => {
  const resource = resourceFor(request.params.resource);
  return validateRequest(z.object({ body: resource.body, params: z.object({ resource: z.string() }), query: z.object({}) }))(request, response, next);
}), asyncHandler(async (request, response) => {
  const resource = resourceFor(request.params.resource);
  const item = await resource.model.create({ ...cleanBody(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'LANDING_ITEM_CREATE', resource.entity, item._id.toString());
  return sendSuccess(response, { item }, 201);
}));

router.patch('/:resource/:id', requirePermission(Permission.LANDING_UPDATE), asyncHandler(async (request, response, next) => {
  const resource = resourceFor(request.params.resource);
  return validateRequest(z.object({ body: resource.body.partial(), params: z.object({ resource: z.string(), id: objectId }), query: z.object({}) }))(request, response, next);
}), asyncHandler(async (request, response) => {
  const resource = resourceFor(request.params.resource);
  const item = await resource.model.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...cleanBody(request.body), updatedBy: request.user!.id }, { new: true });
  if (!item) throw new ApiError(404, 'LANDING_ITEM_NOT_FOUND');
  await writeAuditLog(request, 'LANDING_ITEM_UPDATE', resource.entity, item._id.toString());
  return sendSuccess(response, { item });
}));

router.delete('/:resource/:id', requirePermission(Permission.LANDING_UPDATE), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ resource: z.string(), id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const resource = resourceFor(request.params.resource);
  const item = await resource.model.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id }, { new: true });
  if (!item) throw new ApiError(404, 'LANDING_ITEM_NOT_FOUND');
  await writeAuditLog(request, 'LANDING_ITEM_DELETE', resource.entity, item._id.toString());
  return sendSuccess(response, { deleted: true });
}));

export default router;
