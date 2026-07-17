import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { DigitalInvitation, InvitationGuest, InvitationTemplate } from './invitation.models';
import { createPublicToken, resolvePublicInvitationAccess, upsertRsvp } from './invitation.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const token = z.string().min(32).max(128);
const optionalText = z.string().trim().max(4000).optional();
const wrap = (body: z.ZodTypeAny, params: z.ZodTypeAny = z.object({})) => z.object({ body, params, query: z.object({}).passthrough() });
const invitationFields = z.object({
  title: z.string().trim().min(1).max(180), honoreeName: optionalText, eventDate: z.coerce.date().optional(), address: optionalText,
  mapsUrl: z.string().url().optional().or(z.literal('')), coverImageUrl: z.string().url().optional().or(z.literal('')), gallery: z.array(z.string().url()).max(30).optional(),
  introduction: optionalText, dressCode: optionalText, additionalInfo: optionalText, rsvpDeadline: z.coerce.date().optional(), expiresAt: z.coerce.date().optional(),
  templateId: objectId.optional(), template: z.string().trim().max(80).optional(), theme: z.object({ primaryColor: z.string().max(30).optional(), secondaryColor: z.string().max(30).optional(), backgroundColor: z.string().max(30).optional() }).optional(),
  allowCompanions: z.boolean().optional(), maxCompanions: z.coerce.number().int().min(0).max(100).optional(), allowMinors: z.boolean().optional(), allowResponseChanges: z.boolean().optional(), confirmationMessage: optionalText
});
const guestInput = z.object({ firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().max(120).optional(), phone: z.string().trim().max(50).optional(), email: z.string().trim().email().optional().or(z.literal('')), assignedSeats: z.coerce.number().int().min(1).max(100), notes: optionalText, dietaryRestrictions: optionalText, deliveryChannel: z.enum(['manual', 'email', 'whatsapp', 'other']).optional(), sentAt: z.coerce.date().optional() });
const templateInput = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(120), description: z.string().trim().max(500).optional(), previewImageUrl: z.string().url().optional().or(z.literal('')), theme: z.object({ primaryColor: z.string().max(30).optional(), secondaryColor: z.string().max(30).optional(), backgroundColor: z.string().max(30).optional() }).optional() });
const isAdmin = (request: Request) => request.user?.roles?.includes(Role.ADMIN) ?? false;
const ownerFilter = (request: Request) => isAdmin(request) ? {} : { ownerId: request.user!.id };
async function getInvitationForAdmin(request: Request, id: string) {
  const invitation: any = await DigitalInvitation.findOne({ _id: id, deletedAt: null, ...ownerFilter(request) });
  if (!invitation) throw new ApiError(404, 'INVITATION_NOT_FOUND');
  return invitation;
}
function serializeGuest(guest: any) { const item = guest.toObject ? guest.toObject() : guest; const { publicToken, ...safe } = item; return safe; }

const router = Router();
router.use(requireAuth);
router.get('/templates', requirePermission(Permission.INVITATIONS_READ), asyncHandler(async (req, res) => {
  const templates = await InvitationTemplate.find({ deletedAt: null, $or: [{ isSystem: true }, { ownerId: req.user!.id }] }).sort({ isSystem: -1, name: 1 }).lean();
  return sendSuccess(res, { templates });
}));
router.post('/templates', requirePermission(Permission.INVITATIONS_CREATE), validateRequest(wrap(templateInput)), asyncHandler(async (req, res) => {
  const template = await InvitationTemplate.create({ ...req.body, ownerId: req.user!.id, createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'INVITATION_TEMPLATE_CREATE', 'InvitationTemplate', template._id.toString());
  return sendSuccess(res, { template: template.toObject() }, 201);
}));
router.get('/', requirePermission(Permission.INVITATIONS_READ), asyncHandler(async (req, res) => {
  const invitations = await DigitalInvitation.find({ deletedAt: null, ...ownerFilter(req) }).sort({ updatedAt: -1 }).lean();
  return sendSuccess(res, { invitations });
}));
router.post('/', requirePermission(Permission.INVITATIONS_CREATE), validateRequest(wrap(invitationFields)), asyncHandler(async (req, res) => {
  if (req.body.templateId) { const template = await InvitationTemplate.findOne({ _id: req.body.templateId, deletedAt: null, $or: [{ isSystem: true }, { ownerId: req.user!.id }] }).lean(); if (!template) throw new ApiError(422, 'INVITATION_TEMPLATE_NOT_FOUND'); }
  const invitation = await DigitalInvitation.create({ ...req.body, ownerId: req.user!.id, publicToken: createPublicToken(), createdBy: req.user!.id, updatedBy: req.user!.id });
  await writeAuditLog(req, 'DIGITAL_INVITATION_CREATE', 'DigitalInvitation', invitation._id.toString());
  return sendSuccess(res, { invitation: invitation.toObject() }, 201);
}));
router.get('/:id', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => sendSuccess(res, { invitation: (await getInvitationForAdmin(req, req.params.id)).toObject() })));
router.patch('/:id', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(invitationFields.partial().refine((value) => Object.keys(value).length > 0), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, req.body, { updatedBy: req.user!.id }); await invitation.save(); await writeAuditLog(req, 'DIGITAL_INVITATION_UPDATE', 'DigitalInvitation', invitation._id.toString()); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/publish', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { status: 'published', publishedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); await writeAuditLog(req, 'DIGITAL_INVITATION_PUBLISH', 'DigitalInvitation', invitation._id.toString()); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/unpublish', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { status: 'unpublished', unpublishedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.post('/:id/regenerate-token', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.object({}), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { publicToken: createPublicToken(), publicTokenCreatedAt: new Date(), updatedBy: req.user!.id }); await invitation.save(); return sendSuccess(res, { invitation: invitation.toObject() }); }));
router.delete('/:id', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => { const invitation = await getInvitationForAdmin(req, req.params.id); Object.assign(invitation, { deletedAt: new Date(), deletedBy: req.user!.id, updatedBy: req.user!.id }); await invitation.save(); return sendSuccess(res, { deleted: true }); }));
router.get('/:id/guests', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); return sendSuccess(res, { guests: (await InvitationGuest.find({ invitationId: req.params.id, deletedAt: null }).sort({ lastName: 1, firstName: 1 }).lean()).map(serializeGuest) }); }));
router.get('/:id/guests/:guestId/link', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId, guestId: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const guest: any = await InvitationGuest.findOne({ _id: req.params.guestId, invitationId: req.params.id, deletedAt: null }).lean(); if (!guest) throw new ApiError(404, 'INVITATION_GUEST_NOT_FOUND'); return sendSuccess(res, { token: guest.publicToken }); }));
router.post('/:id/guests', requirePermission(Permission.INVITATIONS_CREATE), validateRequest(wrap(guestInput, z.object({ id: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const guest = await InvitationGuest.create({ ...req.body, invitationId: req.params.id, publicToken: createPublicToken(), status: req.body.sentAt ? 'sent' : 'pending', createdBy: req.user!.id, updatedBy: req.user!.id }); return sendSuccess(res, { guest: serializeGuest(guest) }, 201); }));
router.patch('/:id/guests/:guestId', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(guestInput.partial().refine((value) => Object.keys(value).length > 0), z.object({ id: objectId, guestId: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const guest: any = await InvitationGuest.findOne({ _id: req.params.guestId, invitationId: req.params.id, deletedAt: null }); if (!guest) throw new ApiError(404, 'INVITATION_GUEST_NOT_FOUND'); Object.assign(guest, req.body, { updatedBy: req.user!.id }); await guest.save(); return sendSuccess(res, { guest: serializeGuest(guest) }); }));
router.delete('/:id/guests/:guestId', requirePermission(Permission.INVITATIONS_UPDATE), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId, guestId: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const guest: any = await InvitationGuest.findOne({ _id: req.params.guestId, invitationId: req.params.id, deletedAt: null }); if (!guest) throw new ApiError(404, 'INVITATION_GUEST_NOT_FOUND'); Object.assign(guest, { deletedAt: new Date(), deletedBy: req.user!.id, updatedBy: req.user!.id }); await guest.save(); return sendSuccess(res, { deleted: true }); }));
router.get('/:id/metrics', requirePermission(Permission.INVITATIONS_READ), validateRequest(wrap(z.unknown().optional(), z.object({ id: objectId }))), asyncHandler(async (req, res) => { await getInvitationForAdmin(req, req.params.id); const rows = await InvitationGuest.aggregate([{ $match: { invitationId: new Types.ObjectId(req.params.id), deletedAt: null } }, { $group: { _id: '$status', guests: { $sum: 1 }, assignedSeats: { $sum: '$assignedSeats' }, confirmedAdults: { $sum: '$adults' }, confirmedMinors: { $sum: '$minors' } } }]); return sendSuccess(res, { totalGuests: rows.reduce((sum: number, row: any) => sum + row.guests, 0), assignedSeats: rows.reduce((sum: number, row: any) => sum + row.assignedSeats, 0), confirmedAttendees: rows.reduce((sum: number, row: any) => sum + row.confirmedAdults + row.confirmedMinors, 0), byStatus: Object.fromEntries(rows.map((row: any) => [row._id, row])) }); }));

export const publicInvitationRoutes = Router();
publicInvitationRoutes.get('/:token', validateRequest(wrap(z.unknown().optional(), z.object({ token }))), asyncHandler(async (req, res) => { const { invitation, guest } = await resolvePublicInvitationAccess(req.params.token); if (guest && !guest.viewedAt) await InvitationGuest.findOneAndUpdate({ _id: guest._id, status: { $in: ['pending', 'sent'] } }, { status: 'viewed', viewedAt: new Date() }); return sendSuccess(res, { invitation: { title: invitation.title, honoreeName: invitation.honoreeName, eventDate: invitation.eventDate, address: invitation.address, mapsUrl: invitation.mapsUrl, coverImageUrl: invitation.coverImageUrl, gallery: invitation.gallery, introduction: invitation.introduction, dressCode: invitation.dressCode, additionalInfo: invitation.additionalInfo, rsvpDeadline: invitation.rsvpDeadline, template: invitation.template, theme: invitation.theme, confirmationMessage: invitation.confirmationMessage, allowMinors: invitation.allowMinors }, ...(guest ? { guest: serializeGuest(guest) } : {}) }); }));
const publicRsvpSchema = z.object({ guestToken: token.optional(), attendance: z.enum(['confirmed', 'declined']).optional(), response: z.enum(['confirmed', 'declined']).optional(), adults: z.coerce.number().int().min(0).max(100).optional(), minors: z.coerce.number().int().min(0).max(100).optional(), companions: z.coerce.number().int().min(0).max(100).optional(), dietaryRestrictions: optionalText, guestMessage: optionalText }).superRefine((body, ctx) => { if (!body.attendance && !body.response) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attendance'], message: 'Debe indicar la respuesta de asistencia.' }); });
publicInvitationRoutes.post('/:token/rsvp', validateRequest(wrap(publicRsvpSchema, z.object({ token }))), asyncHandler(async (req, res) => { const { invitation, guest: tokenGuest } = await resolvePublicInvitationAccess(req.params.token); const guestToken = tokenGuest?.publicToken ?? req.body.guestToken; if (!guestToken) throw new ApiError(422, 'INVITATION_GUEST_TOKEN_REQUIRED', 'Debe utilizar un enlace personalizado para confirmar asistencia.'); const guest = await upsertRsvp(invitation, guestToken, { ...req.body, attendance: req.body.attendance ?? req.body.response }); return sendSuccess(res, { guest: serializeGuest(guest), confirmationMessage: invitation.confirmationMessage }); }));

export default router;
