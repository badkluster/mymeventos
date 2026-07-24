import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission, requireRole } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { DigitalInvitation, InvitationGuest, InvitationTemplate } from './invitation.models';
import { createPublicToken, resolvePublicInvitationAccess, upsertRsvp } from './invitation.service';
import { sendInvitationRsvpNotification } from './invitation-notifications.service';
import { sendEmail } from '../email/email.service';
import { ensureSystemInvitationTemplates } from './system-templates.service';
import { basicFeatures, featuresForTier, type InvitationTemplateFeatures, validateInvitationContent, validateInvitationCustomization } from './invitation-features.service';
import { defaultInvitationContent } from './invitation-content.service';
import { deleteAsset } from '../uploads/cloudinary.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const token = z.string().min(32).max(128);
const optionalText = z.string().trim().max(4000).optional();
const wrap = (body: z.ZodTypeAny, params: z.ZodTypeAny = z.object({}), query: z.ZodTypeAny = z.object({}).passthrough()) => z.object({ body, params, query });
const safeFont = z.enum(['Georgia', 'system-ui', 'Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Poppins', 'DM Serif Display', 'Great Vibes', 'Inter', 'Montserrat', 'Lato', 'DM Sans']);
const themeSchema = z.object({ primaryColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), secondaryColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), backgroundColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), surfaceColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), textColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), mutedTextColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), accentColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), headingFont: safeFont.optional(), bodyFont: safeFont.optional(), headingWeight: z.coerce.number().int().min(100).max(900).optional(), bodyWeight: z.coerce.number().int().min(100).max(900).optional(), borderRadius: z.coerce.number().min(0).max(48).optional(), buttonStyle: z.enum(['solid', 'outline', 'soft', 'pill']).optional(), cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']).optional(), contentMaxWidth: z.coerce.number().min(480).max(1600).optional() });
const backgroundSchema = z.object({ type: z.enum(['transparent', 'solid', 'gradient', 'image', 'video']), color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), gradient: z.object({ direction: z.string().max(40), from: z.string().regex(/^#[0-9a-fA-F]{3,8}$/), to: z.string().regex(/^#[0-9a-fA-F]{3,8}$/) }).optional(), image: z.object({ url: z.string().url(), storageKey: z.string().max(300).optional(), altText: z.string().max(240).optional(), positionX: z.coerce.number().min(0).max(100).optional(), positionY: z.coerce.number().min(0).max(100).optional(), fit: z.enum(['cover', 'contain']).optional(), repeat: z.boolean().optional(), overlayColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), overlayOpacity: z.coerce.number().min(0).max(1).optional(), blur: z.coerce.number().min(0).max(16).optional() }).optional(), video: z.object({ url: z.string().url(), storageKey: z.string().max(300).optional(), posterUrl: z.string().url().optional(), muted: z.literal(true), loop: z.boolean(), overlayColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), overlayOpacity: z.coerce.number().min(0).max(1).optional() }).optional() });
const sectionBase = { id: z.string().trim().min(1).max(80), enabled: z.boolean().default(true), order: z.coerce.number().int().min(0), variant: z.string().trim().max(40).optional(), layout: z.enum(['full', 'contained', 'split', 'overlap']).optional(), background: backgroundSchema.default({ type: 'transparent' }), textStyle: z.object({ alignment: z.enum(['left', 'center', 'right']).optional(), headingColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), textColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(), headingFont: safeFont.optional(), bodyFont: safeFont.optional(), headingSize: z.coerce.number().int().min(20).max(96).optional(), bodySize: z.coerce.number().int().min(12).max(32).optional() }).optional(), spacing: z.object({ paddingTop: z.coerce.number().min(0).max(240).optional(), paddingBottom: z.coerce.number().min(0).max(240).optional(), paddingLeft: z.coerce.number().min(0).max(120).optional(), paddingRight: z.coerce.number().min(0).max(120).optional() }).optional(), animation: z.object({ type: z.enum(['none', 'fade', 'slide_up', 'zoom', 'reveal']).optional(), duration: z.coerce.number().min(0).max(3000).optional(), delay: z.coerce.number().min(0).max(3000).optional() }).optional() };
const mediaSchema = z.object({ id: z.string().trim().min(1).max(80), type: z.enum(['image', 'video', 'audio']), url: z.string().url(), storageKey: z.string().max(300).optional(), filename: z.string().max(240).optional(), mimeType: z.string().max(120).optional(), size: z.coerce.number().int().min(0).max(25 * 1024 * 1024).optional(), width: z.coerce.number().int().min(1).optional(), height: z.coerce.number().int().min(1).optional(), altText: z.string().max(240).optional(), caption: z.string().max(500).optional(), focalPoint: z.object({ x: z.coerce.number().min(0).max(100), y: z.coerce.number().min(0).max(100) }).optional() });
const makeSectionSchema = <T extends z.ZodRawShape>(type: string, data: z.ZodObject<T>) => z.object({ ...sectionBase, type: z.literal(type), data });
const invitationSectionSchema = z.union([
  makeSectionSchema('opening', z.object({ overline: z.string().max(120).optional(), message: z.string().max(500).optional(), recipientText: z.string().max(180).optional(), eventLabel: z.string().max(120).optional(), eventTitle: z.string().max(180).optional(), buttonLabel: z.string().max(80).optional(), imageUrl: z.string().url().optional() })),
  makeSectionSchema('hero', z.object({ title: z.string().max(180).optional(), subtitle: z.string().max(500).optional(), imageUrl: z.string().url().optional().or(z.literal('')), height: z.enum(['70vh', '85vh', '100svh']).optional(), alignment: z.enum(['left', 'center', 'right']).optional(), buttonLabel: z.string().max(80).optional() })),
  makeSectionSchema('welcome', z.object({ title: z.string().max(180).optional(), message: z.string().max(4000).optional(), signature: z.string().max(180).optional(), imageUrl: z.string().url().optional().or(z.literal('')), imagePosition: z.enum(['top', 'left', 'right']).optional(), imageStyle: z.enum(['arch', 'rounded', 'circle']).optional() })),
  makeSectionSchema('hosts', z.object({ title: z.string().max(180).optional(), names: z.array(z.string().max(120)).max(10).optional() })),
  makeSectionSchema('event_details', z.object({ pretitle: z.string().max(180).optional() })),
  makeSectionSchema('countdown', z.object({ title: z.string().max(180).optional(), variant: z.enum(['minimal', 'blocks', 'elegant', 'large']).optional() })),
  makeSectionSchema('message', z.object({ title: z.string().max(180).optional(), message: z.string().max(4000).optional(), signature: z.string().max(180).optional() })),
  makeSectionSchema('custom', z.object({ eyebrow: z.string().max(180).optional(), title: z.string().max(180).optional(), body: z.string().max(4000).optional() })),
  makeSectionSchema('gallery', z.object({ title: z.string().max(180).optional(), layout: z.enum(['grid', 'carousel', 'single', 'editorial', 'masonry', 'full', 'collage', 'film']).optional(), items: z.array(mediaSchema).max(20).default([]) })),
  makeSectionSchema('schedule', z.object({ title: z.string().max(180).optional(), items: z.array(z.object({ id: z.string().min(1).max(80), time: z.string().max(20), title: z.string().max(180), description: z.string().max(500).optional(), icon: z.string().max(40).optional() })).max(20).default([]) })),
  makeSectionSchema('venue', z.object({ title: z.string().max(180).optional(), description: z.string().max(500).optional(), imageUrl: z.string().url().optional().or(z.literal('')) })),
  makeSectionSchema('map', z.object({ title: z.string().max(180).optional(), mapsUrl: z.string().url().optional().or(z.literal('')) })),
  makeSectionSchema('dress_code', z.object({ title: z.string().max(180).optional(), description: z.string().max(1000).optional(), colors: z.array(z.string().regex(/^#[0-9a-fA-F]{3,8}$/)).max(8).optional() })),
  makeSectionSchema('gift_registry', z.object({ title: z.string().max(180).optional(), message: z.string().max(1000).optional(), alias: z.string().max(120).optional(), cbu: z.string().max(120).optional(), bank: z.string().max(120).optional(), holder: z.string().max(120).optional() })),
  makeSectionSchema('music', z.object({ label: z.string().max(120).optional(), url: z.string().url().optional().or(z.literal('')), loop: z.boolean().optional(), volume: z.coerce.number().min(0).max(1).optional() })),
  makeSectionSchema('rsvp', z.object({ title: z.string().max(180).optional(), subtitle: z.string().max(500).optional(), notificationEmail: z.string().trim().email().optional().or(z.literal('')), notificationEnabled: z.boolean().optional() })),
  makeSectionSchema('contact', z.object({ title: z.string().max(180).optional(), phone: z.string().max(50).optional(), email: z.string().email().optional().or(z.literal('')), instagram: z.string().max(100).optional() })),
  makeSectionSchema('share', z.object({ title: z.string().max(180).optional(), message: z.string().max(500).optional() })),
  makeSectionSchema('footer', z.object({ message: z.string().max(500).optional() }))
]);
const contentSchema = z.object({ sections: z.array(invitationSectionSchema).max(18) });
const invitationFields = z.object({
  title: z.string().trim().min(1).max(180), honoreeName: optionalText, eventDate: z.coerce.date().optional(), address: optionalText,
  mapsUrl: z.string().url().optional().or(z.literal('')), coverImageUrl: z.string().url().optional().or(z.literal('')), gallery: z.array(z.string().url()).max(30).optional(),
  introduction: optionalText, dressCode: optionalText, additionalInfo: optionalText, rsvpDeadline: z.coerce.date().optional(), expiresAt: z.coerce.date().optional(),
  templateId: objectId.optional(), template: z.string().trim().max(80).optional(), celebrationType: z.enum(['wedding', 'fifteen', 'birthday', 'kids', 'baby_shower', 'baptism', 'communion', 'anniversary', 'corporate', 'general', 'other']).optional(), theme: themeSchema.optional(), generalBackground: backgroundSchema.optional(), content: contentSchema.optional(), media: z.array(mediaSchema).max(25).optional(),
  allowCompanions: z.boolean().optional(), maxCompanions: z.coerce.number().int().min(0).max(100).optional(), allowMinors: z.boolean().optional(), allowResponseChanges: z.boolean().optional(), confirmationMessage: optionalText
});
const invitationListQuery = z.object({ search: z.string().trim().max(160).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const invitationEmailInput = z.object({ email: z.string().trim().email(), recipientName: z.string().trim().max(160).optional(), publicUrl: z.string().url().max(600) });
const templateFeaturesSchema = z.object({ maxGalleryImages: z.coerce.number().int().min(0).max(20), maxSections: z.coerce.number().int().min(1).max(18), allowCustomColors: z.boolean(), allowCustomFonts: z.boolean(), allowCustomBackgrounds: z.boolean(), allowSectionBackgrounds: z.boolean(), allowMusic: z.boolean(), allowVideoHero: z.boolean(), allowAnimations: z.boolean(), allowAdvancedAnimations: z.boolean(), allowCountdown: z.boolean(), allowSchedule: z.boolean(), allowGiftSection: z.boolean(), allowMap: z.boolean(), allowPersonalizedRecipients: z.boolean(), allowAdvancedGallery: z.boolean(), allowCustomDividers: z.boolean(), allowMultipleLocations: z.boolean() });
const templateInput = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(120), description: z.string().trim().max(500).optional(), category: z.enum(['wedding', 'fifteen', 'birthday', 'kids', 'baby_shower', 'baptism', 'communion', 'anniversary', 'corporate', 'general']).optional(), tier: z.enum(['basic', 'premium']).default('basic'), status: z.enum(['draft', 'active', 'inactive']).optional(), tags: z.array(z.string().trim().max(40)).max(12).optional(), previewImageUrl: z.string().url().optional().or(z.literal('')), theme: themeSchema.optional(), allowedFeatures: templateFeaturesSchema.optional(), defaultContent: contentSchema.optional() });
const isAdmin = (request: Request) => request.user?.roles?.includes(Role.ADMIN) ?? false;
const ownerFilter = (request: Request) => isAdmin(request) ? {} : { ownerId: request.user!.id };
async function getInvitationForAdmin(request: Request, id: string) {
  const invitation: any = await DigitalInvitation.findOne({ _id: id, deletedAt: null, ...ownerFilter(request) });
  if (!invitation) throw new ApiError(404, 'INVITATION_NOT_FOUND');
  return invitation;
}
function serializeGuest(guest: any) { const item = guest.toObject ? guest.toObject() : guest; const { publicToken, ...safe } = item; return safe; }
function serializePublicContent(content: any) { if (!content?.sections) return content; return { ...content, sections: content.sections.map((section: any) => section.type === 'rsvp' ? { ...section, data: { ...section.data, notificationEmail: undefined, notificationEnabled: undefined } } : section) }; }
function contentWithIntroduction(content: any, introduction: unknown) { if (typeof introduction !== 'string' || !content?.sections) return content; return { ...content, sections: content.sections.map((section: any) => section.type === 'welcome' ? { ...section, data: { ...section.data, message: introduction } } : section) }; }
async function deleteInvitationMediaAssets(invitation: any) {
  const assets: Array<{ publicId: string; resourceType: 'image' | 'video' | 'raw' }> = [...new Map<string, { publicId: string; resourceType: 'image' | 'video' | 'raw' }>((invitation.media ?? []).filter((item: any) => item?.storageKey).map((item: any) => [item.storageKey, { publicId: item.storageKey, resourceType: item.type === 'video' ? 'video' as const : item.type === 'audio' ? 'raw' as const : 'image' as const }])).values()];
  if (!assets.length) return 0;
  const keys = assets.map((asset) => asset.publicId);
  const invitationsStillUsingAssets: any[] = await DigitalInvitation.find({ _id: { $ne: invitation._id }, deletedAt: null, 'media.storageKey': { $in: keys } }).select('media').lean();
  const retainedKeys = new Set(invitationsStillUsingAssets.flatMap((item) => (item.media ?? []).map((media: any) => media?.storageKey).filter(Boolean)));
  const assetsToDelete = assets.filter((asset) => !retainedKeys.has(asset.publicId));
  const results = await Promise.allSettled(assetsToDelete.map((asset) => deleteAsset(asset.publicId, asset.resourceType)));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return assetsToDelete.length;
}

const router = Router();
router.use(requireAuth);
router.get('/templates', requirePermission(Permission.INVITATIONS_READ), asyncHandler(async (req, res) => {
  await ensureSystemInvitationTemplates();
  const templates = await InvitationTemplate.find({ deletedAt: null, ...(isAdmin(req) ? {} : { status: 'active' }), $or: [{ isSystem: true }, { isGlobal: true }, { ownerId: req.user!.id }] }).sort({ isSystem: -1, name: 1 }).lean();
  return sendSuccess(res, { templates });
}));
router.post('/templates', requireRole(Role.ADMIN), validateRequest(wrap(templateInput)), asyncHandler(async (req, res) => {
  const tier = req.body.tier ?? 'basic';
  const template = await InvitationTemplate.create({ ...req.body, tier, allowedFeatures: req.body.allowedFeatures ?? featuresForTier(tier), defaultContent: req.body.defaultContent ?? defaultInvitationContent(tier), isGlobal: true, ownerId: null, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'INVITATION_TEMPLATE_CREATE', 'InvitationTemplate', template._id.toString());
  return sendSuccess(res, { template: template.toObject() }, 201);
}));
router.patch('/templates/:templateId', requireRole(Role.ADMIN), validateRequest(wrap(templateInput.partial().refine((value) => Object.keys(value).length > 0), z.object({ templateId: objectId }))), asyncHandler(async (req, res) => {
  const template: any = await InvitationTemplate.findOne({ _id: req.params.templateId, deletedAt: null });
  if (!template) throw new ApiError(404, 'INVITATION_TEMPLATE_NOT_FOUND');
  const tier = req.body.tier ?? template.tier ?? 'basic';
  Object.assign(template, req.body, { tier, allowedFeatures: req.body.allowedFeatures ?? template.allowedFeatures ?? featuresForTier(tier), defaultContent: req.body.defaultContent ?? template.defaultContent ?? defaultInvitationContent(tier), updatedBy: req.user!.id });
  await template.save();
  await writeAuditLog(req, 'INVITATION_TEMPLATE_UPDATE', 'InvitationTemplate', template._id.toString());
  return sendSuccess(res, { template: template.toObject() });
}));
router.post('/templates/:templateId/duplicate', requireRole(Role.ADMIN), validateRequest(wrap(z.object({ name: z.string().trim().min(1).max(120).optional() }), z.object({ templateId: objectId }))), asyncHandler(async (req, res) => {
  const source: any = await InvitationTemplate.findOne({ _id: req.params.templateId, deletedAt: null }).lean();
  if (!source) throw new ApiError(404, 'INVITATION_TEMPLATE_NOT_FOUND');
  const copy = await InvitationTemplate.create({ ...source, _id: undefined, __v: undefined, name: req.body.name ?? `${source.name} (copia)`, slug: `${source.slug}-copy-${Date.now()}`, isSystem: false, isGlobal: true, ownerId: null, createdAt: undefined, updatedAt: undefined, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'INVITATION_TEMPLATE_DUPLICATE', 'InvitationTemplate', copy._id.toString(), { sourceTemplateId: source._id.toString() });
  return sendSuccess(res, { template: copy.toObject() }, 201);
}));
router.get('/', requirePermission(Permission.INVITATIONS_READ), asyncHandler(async (req, res) => {
  const { search, date } = invitationListQuery.parse(req.query);
  const filters: Record<string, unknown> = { deletedAt: null, ...ownerFilter(req) };
  if (date) {
    const start = new Date(`${date}T00:00:00.000`);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    filters.eventDate = { $gte: start, $lt: end };
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(escaped, 'i');
    const guestInvitationIds = await InvitationGuest.distinct('invitationId', { deletedAt: null, $or: [{ email: match }, { firstName: match }, { lastName: match }] });
    filters.$or = [{ title: match }, { honoreeName: match }, { address: match }, { template: match }, { _id: { $in: guestInvitationIds } }];
  }
  const invitations = await DigitalInvitation.find(filters).sort({ updatedAt: -1 }).lean();
  return sendSuccess(res, { invitations });
}));
async function templateDefaults(templateId: string | undefined, userId: string) {
  if (!templateId) return { templateTier: 'basic' as const, templateFeatures: basicFeatures, content: defaultInvitationContent('basic'), theme: {}, celebrationType: 'general' };
  await ensureSystemInvitationTemplates();
  const template: any = await InvitationTemplate.findOne({ _id: templateId, deletedAt: null, $or: [{ isSystem: true }, { isGlobal: true }, { ownerId: userId }] }).lean();
  if (!template) throw new ApiError(422, 'INVITATION_TEMPLATE_NOT_FOUND');
  const tier = template.tier === 'premium' ? 'premium' : 'basic';
  return { templateId: template._id, template: template.slug, templateTier: tier, templateFeatures: (template.allowedFeatures ?? featuresForTier(tier)) as InvitationTemplateFeatures, theme: template.theme ?? {}, celebrationType: template.category ?? 'general', content: template.defaultContent ?? defaultInvitationContent(tier) };
}
router.post('/', requirePermission(Permission.INVITATIONS_CREATE), validateRequest(wrap(invitationFields)), asyncHandler(async (req, res) => {
  const defaults = await templateDefaults(req.body.templateId, req.user!.id);
  const content = contentWithIntroduction(req.body.content ?? defaults.content, req.body.introduction);
  validateInvitationContent(content, defaults.templateFeatures);
  validateInvitationCustomization({ theme: req.body.theme, generalBackground: req.body.generalBackground, content }, defaults.templateFeatures);
  const invitation = await DigitalInvitation.create({ ...defaults, ...req.body, content, theme: req.body.theme ?? defaults.theme, celebrationType: req.body.celebrationType ?? defaults.celebrationType, ownerId: req.user!.id, publicToken: createPublicToken(), createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'DIGITAL_INVITATION_CREATE', 'DigitalInvitation', invitation._id.toString());
  return sendSuccess(res, { invitation: invitation.toObject() }, 201);
}));
router.get('/:id', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => sendSuccess(res, { invitation: (await getInvitationForAdmin(req, req.params.id)).toObject() })));
router.patch('/:id', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(invitationFields.partial().refine((value) => Object.keys(value).length > 0), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); const defaults = req.body.templateId && req.body.templateId.toString() !== invitation.templateId?.toString() ? await templateDefaults(req.body.templateId, req.user!.id) : undefined; const features = defaults?.templateFeatures ?? invitation.templateFeatures ?? basicFeatures; const content = contentWithIntroduction(req.body.content ?? defaults?.content ?? invitation.content, req.body.introduction); const theme = req.body.theme ?? defaults?.theme ?? invitation.theme; const generalBackground = req.body.generalBackground ?? invitation.generalBackground; validateInvitationContent(content, features); validateInvitationCustomization({ theme: req.body.theme, generalBackground, content }, features); Object.assign(invitation, defaults ?? {}, req.body, { content, theme, generalBackground, celebrationType: req.body.celebrationType ?? defaults?.celebrationType ?? invitation.celebrationType, updatedBy: req.user!.id }); await invitation.save(); await writeAuditLog(req, 'DIGITAL_INVITATION_UPDATE', 'DigitalInvitation', invitation._id.toString()); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/publish', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); const errors: string[] = []; const sections = invitation.content?.sections ?? []; if (!invitation.title?.trim()) errors.push('Debe indicar un título público.'); if (!invitation.eventDate) errors.push('Debe indicar fecha y horario.'); if (!sections.some((item: { type?: string; enabled?: boolean }) => item.type === 'hero' && item.enabled)) errors.push('Debe activar la sección Hero.'); if (!sections.some((item: { type?: string; enabled?: boolean }) => item.type === 'event_details' && item.enabled)) errors.push('Debe activar la sección de datos principales.'); try { validateInvitationContent(invitation.content, invitation.templateFeatures ?? basicFeatures); validateInvitationCustomization({ generalBackground: invitation.generalBackground, content: invitation.content }, invitation.templateFeatures ?? basicFeatures); } catch (error) { errors.push(error instanceof Error ? error.message : 'La configuración excede los límites de la plantilla.'); } if (errors.length) throw new ApiError(422, 'INVITATION_PUBLISH_VALIDATION', errors.join(' ')); Object.assign(invitation, { status: 'published', publishedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); await writeAuditLog(req, 'DIGITAL_INVITATION_PUBLISH', 'DigitalInvitation', invitation._id.toString()); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/unpublish', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { status: 'unpublished', unpublishedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/send-email', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(invitationEmailInput, z.object({ id: objectId }))), asyncHandler(async (req, res) => {
  const invitation = await getInvitationForAdmin(req, req.params.id);
  if (invitation.status !== 'published') throw new ApiError(422, 'INVITATION_NOT_PUBLISHED', 'Publicá la invitación antes de enviarla.');
  const recipient = req.body.recipientName?.trim() || 'hola';
  const title = invitation.title || 'una invitación especial';
  const sent = await sendEmail({
    to: req.body.email,
    subject: `Invitación: ${title}`,
    text: `${recipient}, te compartimos ${title}. Podés ver todos los detalles y confirmar tu asistencia aquí: ${req.body.publicUrl}`,
    html: `<p>Hola ${recipient},</p><p>Te compartimos <strong>${title}</strong>.</p><p><a href="${req.body.publicUrl}">Ver invitación y confirmar asistencia</a></p>`
  });
  if (!sent) throw new ApiError(503, 'EMAIL_NOT_AVAILABLE', 'El servicio de correo no está configurado o se encuentra deshabilitado.');
  await writeAuditLog(req, 'DIGITAL_INVITATION_SEND_EMAIL', 'DigitalInvitation', invitation._id.toString(), { email: req.body.email });
  return sendSuccess(res, { sent: true });
}));
router.post('/:id/clone', requirePermission(Permission.INVITATIONS_CREATE), validateRequest(wrap(z.object({ title: z.string().trim().min(1).max(180).optional() }), z.object({ id: objectId }))), asyncHandler(async (req, res) => {
  const source = await getInvitationForAdmin(req, req.params.id);
  const sourceData = source.toObject();
  const clone = await DigitalInvitation.create({ ...sourceData, _id: undefined, __v: undefined, title: req.body.title ?? `Copia de ${source.title ?? 'invitación'}`, publicToken: createPublicToken(), publicTokenCreatedAt: new Date(), status: 'draft', publishedAt: undefined, unpublishedAt: undefined, deletedAt: undefined, deletedBy: undefined, createdAt: undefined, updatedAt: undefined, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'DIGITAL_INVITATION_CLONE', 'DigitalInvitation', clone._id.toString(), { sourceInvitationId: source._id.toString() });
  return sendSuccess(res, { invitation: clone.toObject() }, 201);
}));
router.post('/:id/regenerate-token', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { publicToken: createPublicToken(), publicTokenCreatedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.delete('/:id/media', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }), z.object({ mediaId: z.string().trim().min(1).max(500) }))), asyncHandler(async (req, res) => {
  const invitation: any = await getInvitationForAdmin(req, req.params.id);
  const asset = (invitation.media ?? []).find((item: any) => item?.id === req.query.mediaId);
  if (!asset) throw new ApiError(404, 'INVITATION_MEDIA_NOT_FOUND');
  if (asset.storageKey) {
    const shared = await DigitalInvitation.exists({ _id: { $ne: invitation._id }, deletedAt: null, 'media.storageKey': asset.storageKey });
    if (!shared) await deleteAsset(asset.storageKey, asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'raw' : 'image');
  }
  return sendSuccess(res, { deleted: true });
}));
router.delete('/:id', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); const deletedMediaCount = await deleteInvitationMediaAssets(invitation); Object.assign(invitation, { deletedAt: new Date(), deletedBy: req.user!.id, updatedBy: req.user!.id, media: [] }); await invitation.save(); await writeAuditLog(req, 'DIGITAL_INVITATION_DELETE', 'DigitalInvitation', invitation._id.toString(), { deletedMediaCount }); return sendSuccess(res, { deleted: true, deletedMediaCount }); }));
router.get('/:id/metrics', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const rows = await InvitationGuest.aggregate([{ $match: { invitationId: new Types.ObjectId(req.params.id), deletedAt: null } }, { $group: { _id: '$status', guests: { $sum: 1 }, assignedSeats: { $sum: '$assignedSeats' }, confirmedAdults: { $sum: '$adults' }, confirmedMinors: { $sum: '$minors' } } }]); return sendSuccess(res, { totalGuests: rows.reduce((sum: number, row: any) => sum + row.guests, 0), assignedSeats: rows.reduce((sum: number, row: any) => sum + row.assignedSeats, 0), confirmedAttendees: rows.reduce((sum: number, row: any) => sum + row.confirmedAdults + row.confirmedMinors, 0), byStatus: Object.fromEntries(rows.map((row: any) => [row._id, row])) }); }));

export const publicInvitationRoutes = Router();
publicInvitationRoutes.get('/:token', validateRequest(wrap(z.unknown().optional(), z.object({ token }))), asyncHandler(async (req, res) => { const { invitation, guest } = await resolvePublicInvitationAccess(req.params.token); if (guest && !guest.viewedAt) await InvitationGuest.findOneAndUpdate({ _id: guest._id, status: { $in: ['pending', 'sent'] } }, { status: 'viewed', viewedAt: new Date() }); return sendSuccess(res, { invitation: { title: invitation.title, honoreeName: invitation.honoreeName, eventDate: invitation.eventDate, address: invitation.address, mapsUrl: invitation.mapsUrl, coverImageUrl: invitation.coverImageUrl, gallery: invitation.gallery, introduction: invitation.introduction, dressCode: invitation.dressCode, additionalInfo: invitation.additionalInfo, rsvpDeadline: invitation.rsvpDeadline, template: invitation.template, templateTier: invitation.templateTier, theme: invitation.theme, generalBackground: invitation.generalBackground, content: serializePublicContent(invitation.content), media: invitation.media, confirmationMessage: invitation.confirmationMessage, allowMinors: invitation.allowMinors, allowCompanions: invitation.allowCompanions, maxCompanions: invitation.maxCompanions }, ...(guest ? { guest: serializeGuest(guest) } : {}) }); }));
const publicRsvpSchema = z.object({ guestToken: token.optional(), fullName: z.string().trim().min(3).max(240).optional(), attendance: z.enum(['confirmed', 'declined']).optional(), response: z.enum(['confirmed', 'declined']).optional(), dietaryRestrictions: optionalText, musicRequest: optionalText, guestMessage: optionalText }).superRefine((body, ctx) => { if (!body.attendance && !body.response) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attendance'], message: 'Debe indicar la respuesta de asistencia.' }); });
publicInvitationRoutes.post('/:token/rsvp', validateRequest(wrap(publicRsvpSchema, z.object({ token }))), asyncHandler(async (req, res) => { const { invitation, guest: tokenGuest } = await resolvePublicInvitationAccess(req.params.token); let guestToken = tokenGuest?.publicToken ?? req.body.guestToken; const createdFromGeneralLink = !guestToken; if (!guestToken) { const parts = (req.body.fullName ?? '').trim().split(/\s+/).filter(Boolean); const lastName = parts.shift(); const firstName = parts.join(' '); if (!firstName || !lastName) throw new ApiError(422, 'INVITATION_GUEST_NAME_REQUIRED', 'Indicá apellido y nombre para confirmar asistencia.'); const guest = await InvitationGuest.create({ invitationId: invitation._id, firstName, lastName, assignedSeats: 1, publicToken: createPublicToken(), status: 'pending' }); guestToken = guest.publicToken; } const guest = await upsertRsvp(invitation, guestToken, { ...req.body, attendance: req.body.attendance ?? req.body.response }); try { await sendInvitationRsvpNotification({ invitation, guest }); } catch (error) { console.error('Invitation RSVP notification failed', error); } return sendSuccess(res, { guest: serializeGuest(guest), confirmationMessage: invitation.confirmationMessage }); }));

export default router;
