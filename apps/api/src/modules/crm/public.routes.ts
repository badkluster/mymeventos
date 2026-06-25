import { Router } from 'express';
import { z } from 'zod';
import { Lead, LeadActivity, PackageTemplate, VenuePackageRule } from './crm.models';
import { Salon } from '../salons/salon.model';
import { createNotifications } from '../notifications/notification.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { validateRequest } from '../../middlewares/validateRequest';
import { ApiError } from '../../middlewares/errorHandler';

const router = Router();
const schema = z.object({
  body: z.object({
    name: z.string().min(2),
    phone: z.string().min(6),
    email: z.string().email().optional().or(z.literal('')),
    eventType: z.string().min(1),
    eventDate: z.coerce.date().optional(),
    guestCount: z.coerce.number().int().positive(),
    salonId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    message: z.string().optional()
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

router.get('/salons', asyncHandler(async (_request, response) => {
  const salons = await Salon.find({ active: true, deletedAt: null, $or: [{ visibleOnWebsite: true }, { visibleOnWebsite: { $exists: false } }] })
    .select('_id name slug address city locality province phone whatsapp email publicTitle publicShortDescription publicDescription heroImageUrl galleryImageUrls mediaGallery locationText mapUrl minCapacity maxCapacity recommendedCapacity allowedEventTypes defaultStartTime defaultEndTime defaultDurationHours allowsExtraHour extraHourPrice defaultDepositAmount defaultPaymentTerms visibleOnWebsite displayOrder extraServices active')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  const salonIds = salons.map((salon: any) => salon._id);
  const [templates, rules] = await Promise.all([
    readLeanList(PackageTemplate.find({ active: true, deletedAt: null, $or: [{ isGlobal: true }, { salonIds: { $in: salonIds } }] }), { name: 1 }),
    readLeanList(VenuePackageRule.find({ active: true, deletedAt: null, salonId: { $in: salonIds } }))
  ]);
  const rulesBySalonAndPackage = new Map(rules.map((rule: any) => [`${rule.salonId.toString()}:${rule.packageTemplateId.toString()}`, rule]));
  const publicSalons = salons.map((salon: any) => {
    const salonId = salon._id.toString();
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
          name: template.name,
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
      mediaGallery: (salon.mediaGallery ?? []).filter((asset: any) => asset.publicVisible !== false).sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      extraServices: (salon.extraServices ?? []).filter((extra: any) => extra.active !== false && extra.publicVisible !== false),
      packages
    };
  });
  return sendSuccess(response, { salons: publicSalons });
}));

router.post('/quick-quote', validateRequest(schema), asyncHandler(async (request, response) => {
  const salon = await Salon.exists({ _id: request.body.salonId, active: true, deletedAt: null });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  const [firstName, ...last] = request.body.name.trim().split(/\s+/);
  const lead = await Lead.create({ ...request.body, firstName, lastName: last.join(' '), fullName: request.body.name, salonIds: [request.body.salonId], source: 'quick_quote', status: 'new' });
  await LeadActivity.create({ leadId: lead._id, type: 'system', title: 'Solicitud rápida recibida' });
  await createNotifications({ type: 'lead.created', title: 'Nueva cotización rápida', message: `${lead.fullName} solicitó información para ${lead.eventType}.`, actionUrl: `/admin/leads/${lead._id}`, metadata: { leadId: lead._id, salonId: request.body.salonId } });
  return sendSuccess(response, { leadId: lead._id }, 201, getApiMessage('QUICK_QUOTE_CREATED'));
}));

export default router;
