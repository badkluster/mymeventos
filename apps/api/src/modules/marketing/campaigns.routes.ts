import { Router } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission, requireAnyPermission, accessibleSalonIds, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { MarketingCampaign, MarketingRecipient } from './marketing.models';
import { resolveAudienceContacts, type SalonScope } from './marketing-audience.service';
import {
  cancelCampaign,
  freezeCampaignSnapshots,
  prepareCampaignRecipients,
  processMarketingTick,
  retryFailedRecipients,
  sendTestEmails
} from './marketing-campaign.service';
import { sanitizeEmailHtml, stripHtmlToText } from './marketing-sanitize.service';

function sanitizeCampaignBody(body: Record<string, unknown>) {
  if (typeof body.renderedHtml === 'string') {
    const html = sanitizeEmailHtml(body.renderedHtml);
    body.renderedHtml = html;
    if (!body.renderedText) body.renderedText = stripHtmlToText(html);
  }
  return body;
}

const router = Router();
router.use(requireAuth);

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const schema = (body: z.ZodTypeAny, params: z.ZodRawShape = {}) => z.object({ body, params: z.object(params), query: z.object({}).passthrough() });

const campaignBody = z.object({
  name: z.string().trim().min(2).max(180),
  internalDescription: z.string().max(2000).optional(),
  subject: z.string().max(200).optional(),
  preheader: z.string().max(200).optional(),
  senderName: z.string().max(160).optional(),
  replyTo: z.string().email().optional().or(z.literal('')),
  templateId: id.optional().or(z.literal('')),
  promotionId: id.optional().or(z.literal('')),
  audienceId: id.optional().or(z.literal('')),
  excludedRecipientEmails: z.array(z.string().email()).optional(),
  salonId: id.optional().or(z.literal('')),
  contentJson: z.unknown().optional(),
  renderedHtml: z.string().max(200_000).optional(),
  renderedText: z.string().max(50_000).optional(),
  trackingEnabled: z.boolean().optional(),
  openTrackingEnabled: z.boolean().optional(),
  clickTrackingEnabled: z.boolean().optional(),
  batchSize: z.coerce.number().int().min(1).max(500).optional(),
  tags: z.array(z.string().max(60)).optional(),
  timezone: z.string().max(60).optional()
});

const scheduleBody = z.object({ scheduledAt: z.coerce.date(), timezone: z.string().max(60).optional() });
const cancelBody = z.object({ reason: z.string().max(500).optional() });
const sendTestBody = z.object({ emails: z.array(z.string().email()).min(1).max(5) });

function scopeFor(user: NonNullable<Express.Request['user']>): SalonScope {
  return { isAdmin: user.roles.includes(Role.ADMIN), salonIds: accessibleSalonIds(user) };
}

function assertEditable(campaign: any) {
  if (!['draft', 'scheduled'].includes(campaign.status)) throw new ApiError(409, 'MARKETING_CAMPAIGN_NOT_EDITABLE');
}

function assertSalonReadable(user: NonNullable<Express.Request['user']>, campaign: any) {
  if (!campaign.salonId) return;
  if (!canAccessSalon(user, String(campaign.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

router.get('/', requirePermission(Permission.CAMPAIGNS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) and.push({ $or: [{ salonId: null }, { salonId: { $in: accessibleSalonIds(request.user!) } }] });
  const status = typeof request.query.status === 'string' ? request.query.status : undefined;
  if (status) and.push({ status });
  const salonId = typeof request.query.salonId === 'string' ? request.query.salonId : undefined;
  if (salonId) and.push({ salonId });
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  if (search) and.push({ name: { $regex: search, $options: 'i' } });
  const query = { $and: and };
  const [items, totalItems] = await Promise.all([
    MarketingCampaign.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MarketingCampaign.countDocuments(query)
  ]);
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.get('/:id', requirePermission(Permission.CAMPAIGNS_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign: any = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  return sendSuccess(response, { campaign });
}));

router.post('/', requirePermission(Permission.CAMPAIGNS_CREATE), validateRequest(schema(campaignBody)), asyncHandler(async (request, response) => {
  if (request.body.salonId && !canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const campaign = await MarketingCampaign.create({
    ...sanitizeCampaignBody(request.body),
    templateId: request.body.templateId || undefined,
    promotionId: request.body.promotionId || undefined,
    audienceId: request.body.audienceId || undefined,
    salonId: request.body.salonId || undefined,
    createdBy: request.user!.id,
    updatedBy: request.user!.id
  });
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_CREATE', 'MarketingCampaign', String(campaign._id));
  return sendSuccess(response, { campaign }, 201);
}));

router.patch('/:id', requirePermission(Permission.CAMPAIGNS_UPDATE), validateRequest(schema(campaignBody.partial(), { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null });
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  assertEditable(campaign);
  if (request.body.salonId && !canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  Object.assign(campaign, sanitizeCampaignBody(request.body), {
    templateId: request.body.templateId === '' ? undefined : request.body.templateId ?? campaign.templateId,
    promotionId: request.body.promotionId === '' ? undefined : request.body.promotionId ?? campaign.promotionId,
    audienceId: request.body.audienceId === '' ? undefined : request.body.audienceId ?? campaign.audienceId,
    salonId: request.body.salonId === '' ? undefined : request.body.salonId ?? campaign.salonId,
    updatedBy: request.user!.id
  });
  await campaign.save();
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_UPDATE', 'MarketingCampaign', String(campaign._id), request.body);
  return sendSuccess(response, { campaign });
}));

router.delete('/:id', requirePermission(Permission.CAMPAIGNS_DELETE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null });
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  if (!['draft', 'cancelled', 'failed'].includes(campaign.status)) throw new ApiError(409, 'MARKETING_CAMPAIGN_NOT_EDITABLE');
  campaign.deletedAt = new Date();
  campaign.deletedBy = request.user!.id as any;
  await campaign.save();
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_DELETE', 'MarketingCampaign', String(campaign._id));
  return sendSuccess(response, { success: true });
}));

router.post('/:id/duplicate', requirePermission(Permission.CAMPAIGNS_CREATE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const source: any = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!source) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  const { _id, createdAt, updatedAt, ...rest } = source;
  const campaign = await MarketingCampaign.create({
    ...rest,
    name: `${source.name} (copia)`,
    status: 'draft',
    scheduledAt: undefined, startedAt: undefined, completedAt: undefined, cancelledAt: undefined, cancelledBy: undefined, cancellationReason: undefined,
    estimatedRecipients: 0, totalRecipients: 0, sentCount: 0, deliveredCount: 0, failedCount: 0, skippedCount: 0, openedCount: 0, clickedCount: 0, unsubscribedCount: 0,
    templateSnapshot: undefined, promotionSnapshot: undefined, audienceSnapshot: undefined, senderSnapshot: undefined,
    lockedAt: null, lockedBy: null, lockExpiresAt: null, nextAttemptAt: null, attemptCount: 0,
    createdBy: request.user!.id, updatedBy: request.user!.id
  });
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_DUPLICATE', 'MarketingCampaign', String(campaign._id), { sourceId: request.params.id });
  return sendSuccess(response, { campaign }, 201);
}));

router.post('/:id/estimate', requirePermission(Permission.CAMPAIGNS_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign: any = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).populate('audienceId').lean();
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  const audience = campaign.audienceId as any;
  if (!audience) return sendSuccess(response, { estimatedCount: 0, totalMatched: 0, duplicatesRemoved: 0, invalidEmailExcluded: 0, manuallyExcluded: 0 });
  const resolution = await resolveAudienceContacts({
    sourceTypes: audience.sourceTypes,
    filters: audience.filters,
    manualRecipients: audience.manualRecipients,
    excludedMembers: audience.excludedMembers,
    extraExcludedEmails: campaign.excludedRecipientEmails,
    scope: scopeFor(request.user!)
  });
  return sendSuccess(response, {
    estimatedCount: resolution.contacts.length,
    totalMatched: resolution.totalMatched,
    duplicatesRemoved: resolution.duplicatesRemoved,
    invalidEmailExcluded: resolution.invalidEmailExcluded,
    manuallyExcluded: resolution.manuallyExcluded
  });
}));

router.post('/:id/prepare', requireAnyPermission([Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_UPDATE]), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null });
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  await freezeCampaignSnapshots(String(campaign._id));
  const result = await prepareCampaignRecipients(String(campaign._id));
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_PREPARE', 'MarketingCampaign', String(campaign._id), result);
  return sendSuccess(response, result);
}));

router.post('/:id/send-test', requireAnyPermission([Permission.CAMPAIGNS_CREATE, Permission.CAMPAIGNS_UPDATE]), validateRequest(schema(sendTestBody, { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign as any);
  const results = await sendTestEmails({ campaignId: request.params.id, testEmails: request.body.emails, userId: request.user!.id });
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_SEND_TEST', 'MarketingCampaign', request.params.id, { emails: request.body.emails, results });
  return sendSuccess(response, { results });
}));

router.post('/:id/schedule', requirePermission(Permission.CAMPAIGNS_SEND), validateRequest(schema(scheduleBody, { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null });
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  if (!['draft', 'scheduled'].includes(campaign.status)) throw new ApiError(409, 'MARKETING_CAMPAIGN_NOT_EDITABLE');
  if (request.body.scheduledAt.getTime() < Date.now() - 60_000) throw new ApiError(400, 'MARKETING_CAMPAIGN_SCHEDULE_IN_PAST');
  if (!campaign.subject || !campaign.renderedHtml) throw new ApiError(409, 'MARKETING_CAMPAIGN_MISSING_CONTENT');
  if (!campaign.audienceId) throw new ApiError(409, 'MARKETING_CAMPAIGN_MISSING_AUDIENCE');
  campaign.status = 'scheduled';
  campaign.scheduledAt = request.body.scheduledAt;
  if (request.body.timezone) campaign.timezone = request.body.timezone;
  campaign.nextAttemptAt = request.body.scheduledAt;
  campaign.updatedBy = request.user!.id as any;
  await campaign.save();
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_SCHEDULE', 'MarketingCampaign', String(campaign._id), { scheduledAt: campaign.scheduledAt });
  return sendSuccess(response, { campaign });
}));

router.post('/:id/send', requirePermission(Permission.CAMPAIGNS_SEND), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null });
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  if (!['draft', 'scheduled'].includes(campaign.status)) throw new ApiError(409, 'MARKETING_CAMPAIGN_NOT_SENDABLE');
  if (!campaign.subject || !campaign.renderedHtml) throw new ApiError(409, 'MARKETING_CAMPAIGN_MISSING_CONTENT');
  if (!campaign.audienceId) throw new ApiError(409, 'MARKETING_CAMPAIGN_MISSING_AUDIENCE');
  campaign.status = 'scheduled';
  campaign.scheduledAt = new Date();
  campaign.nextAttemptAt = new Date();
  campaign.updatedBy = request.user!.id as any;
  await campaign.save();
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_SEND', 'MarketingCampaign', String(campaign._id));
  // Kickstart: process one bounded batch synchronously so the user sees progress
  // immediately instead of waiting for the next Vercel Cron tick.
  const tick = await processMarketingTick().catch(() => null);
  return sendSuccess(response, { campaign, tick });
}));

router.post('/:id/cancel', requirePermission(Permission.CAMPAIGNS_CANCEL), validateRequest(schema(cancelBody, { id })), asyncHandler(async (request, response) => {
  const existing = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!existing) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, existing as any);
  const campaign = await cancelCampaign(request.params.id, request.user!.id, request.body.reason).catch((error: Error) => {
    throw new ApiError(409, error.message);
  });
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_CANCEL', 'MarketingCampaign', String(campaign._id), { reason: request.body.reason });
  return sendSuccess(response, { campaign });
}));

router.post('/:id/retry-failed', requirePermission(Permission.CAMPAIGNS_RETRY), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const existing = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!existing) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, existing as any);
  const result = await retryFailedRecipients(request.params.id).catch((error: Error) => {
    throw new ApiError(409, error.message);
  });
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_RETRY', 'MarketingCampaign', request.params.id, result);
  return sendSuccess(response, result);
}));

router.get('/:id/recipients', requirePermission(Permission.CAMPAIGNS_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign: any = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
  const and: Record<string, unknown>[] = [{ campaignId: campaign._id }];
  const status = typeof request.query.status === 'string' ? request.query.status : undefined;
  if (status) and.push({ status });
  const query = { $and: and };
  const [items, totalItems] = await Promise.all([
    MarketingRecipient.find(query).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    MarketingRecipient.countDocuments(query)
  ]);
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.get('/:id/export', requirePermission(Permission.CAMPAIGNS_EXPORT), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const campaign: any = await MarketingCampaign.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!campaign) throw new ApiError(404, 'MARKETING_CAMPAIGN_NOT_FOUND');
  assertSalonReadable(request.user!, campaign);
  const recipients = await MarketingRecipient.find({ campaignId: campaign._id }).sort({ createdAt: 1 }).limit(50_000).lean();
  const header = ['Nombre', 'Apellido', 'Email', 'Origen', 'Estado', 'Fecha de envío', 'Fecha de entrega', 'Fecha de apertura', 'Fecha de clic', 'Intentos', 'Error', 'Motivo de omisión', 'Salón'];
  const rows = recipients.map((recipient: any) => [
    recipient.firstName ?? '',
    recipient.lastName ?? '',
    recipient.email,
    recipient.sourceType,
    recipient.status,
    recipient.sentAt ? new Date(recipient.sentAt).toISOString() : '',
    recipient.deliveredAt ? new Date(recipient.deliveredAt).toISOString() : '',
    recipient.openedAt ? new Date(recipient.openedAt).toISOString() : '',
    recipient.clickedAt ? new Date(recipient.clickedAt).toISOString() : '',
    String(recipient.attemptCount ?? 0),
    recipient.failureReason ?? '',
    recipient.skipReason ?? '',
    recipient.salonId ? String(recipient.salonId) : ''
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  await writeAuditLog(request, 'MARKETING_CAMPAIGN_EXPORT', 'MarketingCampaign', String(campaign._id), { recipientCount: recipients.length });
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="campana-${campaign._id}.csv"`);
  return response.send(csv);
}));

function csvEscape(value: string): string {
  const stringValue = String(value ?? '');
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export default router;
