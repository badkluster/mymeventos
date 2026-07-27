import { Types } from 'mongoose';
import { env } from '../../config/env';
import { Salon } from '../salons/salon.model';
import { MarketingAudience, MarketingCampaign, MarketingRecipient, MarketingSendLog, MarketingTemplate, Promotion } from './marketing.models';
import { getOrCreateMarketingSettings } from './marketing-settings.service';
import { resolveAudienceContacts, type SalonScope } from './marketing-audience.service';
import { getMarketingEmailProvider } from './marketing-email.provider';
import { renderMarketingVariables, type MarketingVariableContext } from './marketing-variables.service';
import { sampleVariableContext } from './marketing-sample-context';

const CAMPAIGN_LOCK_MS = 2 * 60_000;
const RECIPIENT_LOCK_MS = 2 * 60_000;
const MAX_RECIPIENT_ATTEMPTS = 3;

export async function buildSenderIdentity(campaign: any) {
  const settings = await getOrCreateMarketingSettings();
  return {
    fromEmail: env.MARKETING_FROM_EMAIL || settings.senderEmail || 'no-reply@mymeventos.com.ar',
    fromName: campaign.senderName || settings.senderName || settings.companyName || 'M&M Eventos',
    replyTo: campaign.replyTo || settings.replyToEmail || env.MARKETING_REPLY_TO || undefined,
    settings
  };
}

async function companyAndSalonContext(salonId?: string | Types.ObjectId | null, settings?: any) {
  const marketingSettings = settings ?? (await getOrCreateMarketingSettings());
  const salon = salonId ? await Salon.findOne({ _id: salonId }).lean() : null;
  return {
    companyName: marketingSettings.companyName,
    companyLogoUrl: marketingSettings.logoUrl ?? '',
    salonName: (salon as any)?.name ?? marketingSettings.companyName,
    salonAddress: (salon as any)?.address ?? '',
    salonPhone: (salon as any)?.phone ?? '',
    salonWhatsApp: (salon as any)?.whatsapp ?? ''
  };
}

// Freezes template/promotion/audience/sender into the campaign so later edits to
// those entities never change a campaign that has already started sending.
export async function freezeCampaignSnapshots(campaignId: string) {
  const campaign = await MarketingCampaign.findOne({ _id: campaignId });
  if (!campaign) throw new Error('Campaign not found');

  const [template, promotion, audience, sender] = await Promise.all([
    campaign.templateId ? MarketingTemplate.findOne({ _id: campaign.templateId }).lean() : null,
    campaign.promotionId ? Promotion.findOne({ _id: campaign.promotionId }).lean() : null,
    campaign.audienceId ? MarketingAudience.findOne({ _id: campaign.audienceId }).lean() : null,
    buildSenderIdentity(campaign)
  ]);

  campaign.templateSnapshot = template ?? undefined;
  campaign.promotionSnapshot = promotion ?? undefined;
  campaign.audienceSnapshot = audience ?? undefined;
  campaign.senderSnapshot = { fromEmail: sender.fromEmail, fromName: sender.fromName, replyTo: sender.replyTo };
  if (!campaign.subject && (template as any)?.subject) campaign.subject = (template as any).subject;
  if (!campaign.preheader && (template as any)?.preheader) campaign.preheader = (template as any).preheader;
  if (!campaign.contentJson && (template as any)?.contentJson) campaign.contentJson = (template as any).contentJson;
  if (!campaign.renderedHtml && (template as any)?.renderedHtml) campaign.renderedHtml = (template as any).renderedHtml;
  if (!campaign.renderedText && (template as any)?.renderedText) campaign.renderedText = (template as any).renderedText;
  await campaign.save();
  return campaign;
}

function scopeFromCampaign(campaign: any): SalonScope {
  // Recipient preparation runs from the batch processor (no authenticated user in
  // scope), so it always resolves against the campaign's own salonId restriction
  // rather than a request-bound user — the salon scope check already happened
  // when the campaign/audience were created by an authenticated, permission-checked route.
  return { isAdmin: !campaign.salonId, salonIds: campaign.salonId ? [String(campaign.salonId)] : [] };
}

// Idempotent: safe to call more than once for the same campaign. Existing
// recipients are left untouched; only newly-matched contacts are inserted.
export async function prepareCampaignRecipients(campaignId: string): Promise<{ inserted: number; totalRecipients: number }> {
  const campaign = await MarketingCampaign.findOne({ _id: campaignId });
  if (!campaign) throw new Error('Campaign not found');

  let sourceTypes: string[] = ['lead', 'customer'];
  let filters: any;
  let manualRecipients: any[] | undefined;
  let excludedMembers: any[] | undefined;
  if (campaign.audienceSnapshot) {
    sourceTypes = (campaign.audienceSnapshot as any).sourceTypes ?? sourceTypes;
    filters = (campaign.audienceSnapshot as any).filters;
    manualRecipients = (campaign.audienceSnapshot as any).manualRecipients;
    excludedMembers = (campaign.audienceSnapshot as any).excludedMembers;
  }

  const resolution = await resolveAudienceContacts({
    sourceTypes,
    filters,
    manualRecipients,
    excludedMembers,
    extraExcludedEmails: campaign.excludedRecipientEmails,
    scope: scopeFromCampaign(campaign)
  });

  const existingEmails = new Set(
    (await MarketingRecipient.find({ campaignId: campaign._id }).select('normalizedEmail').lean()).map((doc: any) => doc.normalizedEmail)
  );

  const toInsert = resolution.contacts
    .filter((contact) => !existingEmails.has(contact.email.trim().toLowerCase()))
    .map((contact) => ({
      campaignId: campaign._id,
      sourceType: contact.sourceType,
      sourceId: contact.sourceId,
      email: contact.email,
      normalizedEmail: contact.email.trim().toLowerCase(),
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      salonId: contact.salonId,
      status: 'pending' as const
    }));

  if (toInsert.length) {
    // ordered:false + dedupe-by-unique-index tolerates a concurrent tick having
    // inserted the same contact between our read and write.
    await MarketingRecipient.insertMany(toInsert, { ordered: false }).catch((error: any) => {
      if (error?.code !== 11000) throw error;
    });
  }

  const totalRecipients = await MarketingRecipient.countDocuments({ campaignId: campaign._id });
  campaign.totalRecipients = totalRecipients;
  campaign.estimatedRecipients = Math.max(campaign.estimatedRecipients ?? 0, totalRecipients);
  await campaign.save();
  return { inserted: toInsert.length, totalRecipients };
}

function buildRecipientContext(campaign: any, recipient: any, base: MarketingVariableContext): MarketingVariableContext {
  const promotion = campaign.promotionSnapshot as any;
  return {
    ...base,
    firstName: recipient.firstName || base.firstName,
    lastName: recipient.lastName || base.lastName,
    fullName: recipient.fullName || base.fullName,
    email: recipient.email,
    campaignName: campaign.name,
    promotionTitle: promotion?.publicTitle || promotion?.name || base.promotionTitle,
    promotionDescription: promotion?.publicDescription || base.promotionDescription,
    promotionCode: promotion?.code || base.promotionCode,
    promotionValidUntil: promotion?.validUntil ? new Date(promotion.validUntil).toLocaleDateString('es-AR') : base.promotionValidUntil,
    discountValue: promotion ? (promotion.discountType === 'percentage' ? `${promotion.discountValue}%` : String(promotion.discountValue ?? '')) : base.discountValue,
    buttonUrl: promotion?.buttonUrl || base.buttonUrl
  };
}

function removeLegacyUnsubscribeContent(content: string): string {
  return content
    .replace(/<p\b[^>]*>\s*<a\b[^>]*href=(["'])\{\{unsubscribeUrl\}\}\1[^>]*>[\s\S]*?<\/a>\s*<\/p>/gi, '')
    .replace(/\s*Dejar de recibir estas comunicaciones:\s*\{\{unsubscribeUrl\}\}/gi, '');
}

export async function renderRecipientEmail(campaign: any, recipient: any) {
  const settingsAndCompany = await companyAndSalonContext(campaign.salonId, undefined);
  const context = buildRecipientContext(campaign, recipient, settingsAndCompany as MarketingVariableContext);
  const subject = renderMarketingVariables(campaign.subject ?? '', context).rendered;
  const sourceHtml = removeLegacyUnsubscribeContent(campaign.renderedHtml ?? '');
  const sourceText = removeLegacyUnsubscribeContent(campaign.renderedText ?? htmlToText(sourceHtml));
  const html = renderMarketingVariables(sourceHtml, context, { escapeValues: false }).rendered;
  const text = renderMarketingVariables(sourceText, context, { escapeValues: false }).rendered;
  return { subject, html, text };
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function sendTestEmails(input: { campaignId: string; testEmails: string[]; userId: string }) {
  const campaign = await MarketingCampaign.findOne({ _id: input.campaignId }).lean();
  if (!campaign) throw new Error('Campaign not found');
  if (input.testEmails.length > 5) throw new Error('MARKETING_TEST_EMAIL_LIMIT');

  const sender = await buildSenderIdentity(campaign);
  const companyAndSalon = await companyAndSalonContext((campaign as any).salonId, sender.settings);
  const context: MarketingVariableContext = { ...sampleVariableContext(), ...companyAndSalon };
  const subject = `[PRUEBA] ${renderMarketingVariables((campaign as any).subject ?? '', context).rendered}`;
  const sourceHtml = removeLegacyUnsubscribeContent((campaign as any).renderedHtml ?? '');
  const sourceText = removeLegacyUnsubscribeContent((campaign as any).renderedText ?? htmlToText(sourceHtml));
  const html = renderMarketingVariables(sourceHtml, context, { escapeValues: false }).rendered;
  const text = renderMarketingVariables(sourceText, context, { escapeValues: false }).rendered;

  const provider = getMarketingEmailProvider();
  const results = await provider.sendBatch(
    input.testEmails.map((to) => ({
      to,
      subject,
      html,
      text,
      from: `${sender.fromName} <${sender.fromEmail}>`,
      replyTo: sender.replyTo,
      tags: [{ name: 'kind', value: 'test' }, { name: 'campaignId', value: String((campaign as any)._id) }]
    }))
  );
  return results;
}

// --- Batch processing (Vercel Cron → POST /api/marketing/process) --------

async function claimNextCampaign() {
  const now = new Date();
  return MarketingCampaign.findOneAndUpdate(
    {
      $or: [
        { status: 'scheduled', scheduledAt: { $lte: now } },
        { status: { $in: ['preparing', 'sending'] }, $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }], nextAttemptAt: { $lte: now } }
      ]
    },
    { $set: { lockedAt: now, lockExpiresAt: new Date(now.getTime() + CAMPAIGN_LOCK_MS), lockedBy: 'marketing-cron' }, $inc: { attemptCount: 1 } },
    { new: true, sort: { scheduledAt: 1 } }
  );
}

async function releaseCampaignLock(campaignId: Types.ObjectId, patch: Record<string, unknown> = {}) {
  await MarketingCampaign.updateOne({ _id: campaignId }, { $set: { lockedAt: null, lockExpiresAt: null, lockedBy: null, ...patch } });
}

async function claimRecipientBatch(campaignId: Types.ObjectId, batchSize: number) {
  const now = new Date();
  const candidates = await MarketingRecipient.find({
    campaignId,
    status: { $in: ['pending', 'failed'] },
    attemptCount: { $lt: MAX_RECIPIENT_ATTEMPTS },
    $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }]
  })
    .limit(batchSize)
    .select('_id')
    .lean();

  const claimed: any[] = [];
  for (const candidate of candidates) {
    const recipient = await MarketingRecipient.findOneAndUpdate(
      { _id: candidate._id, status: { $in: ['pending', 'failed'] }, $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }] },
      { $set: { status: 'processing', lockedAt: now, lockExpiresAt: new Date(now.getTime() + RECIPIENT_LOCK_MS), lastAttemptAt: now }, $inc: { attemptCount: 1 } },
      { new: true }
    );
    if (recipient) claimed.push(recipient);
  }
  return claimed;
}

async function sendRecipientBatch(campaign: any, recipients: any[]) {
  const sender = await buildSenderIdentity(campaign);
  const provider = getMarketingEmailProvider();
  const rendered = await Promise.all(recipients.map(async (recipient) => ({ recipient, ...(await renderRecipientEmail(campaign, recipient)) })));

  const results = await provider.sendBatch(
    rendered.map((item) => ({
      to: item.recipient.email,
      subject: item.subject,
      html: item.html,
      text: item.text,
      from: `${sender.fromName} <${sender.fromEmail}>`,
      replyTo: sender.replyTo,
      tags: [{ name: 'campaignId', value: String(campaign._id) }, { name: 'recipientId', value: String(item.recipient._id) }]
    }))
  );

  let sentCount = 0;
  let failedCount = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];
    const result = results[index];
    const now = new Date();
    if (result?.success) {
      sentCount += 1;
      await MarketingRecipient.updateOne(
        { _id: recipient._id },
        { $set: { status: 'sent', sentAt: now, providerMessageId: result.providerMessageId, lockedAt: null, lockExpiresAt: null } }
      );
      await MarketingSendLog.create({ campaignId: campaign._id, recipientId: recipient._id, provider: provider.name, providerMessageId: result.providerMessageId, attempt: recipient.attemptCount, status: 'sent' });
    } else {
      failedCount += 1;
      const permanentlyFailed = recipient.attemptCount >= MAX_RECIPIENT_ATTEMPTS;
      await MarketingRecipient.updateOne(
        { _id: recipient._id },
        { $set: { status: 'failed', failedAt: now, failureReason: result?.errorMessage, lockedAt: null, lockExpiresAt: permanentlyFailed ? null : null } }
      );
      await MarketingSendLog.create({ campaignId: campaign._id, recipientId: recipient._id, provider: provider.name, attempt: recipient.attemptCount, status: 'failed', errorMessage: result?.errorMessage });
    }
  }

  if (sentCount || failedCount) {
    await MarketingCampaign.updateOne({ _id: campaign._id }, { $inc: { sentCount, failedCount } });
  }
  return { sentCount, failedCount };
}

export type ProcessTickResult = { processedCampaignId: string | null; sent: number; failed: number; completed: boolean };

// One bounded unit of work per invocation — safe to call from a short-lived
// serverless cron tick. Claims at most one campaign and one recipient batch.
export async function processMarketingTick(): Promise<ProcessTickResult> {
  const campaign = await claimNextCampaign();
  if (!campaign) return { processedCampaignId: null, sent: 0, failed: 0, completed: false };

  try {
    if (campaign.status === 'scheduled') {
      campaign.status = 'preparing';
      campaign.startedAt = campaign.startedAt ?? new Date();
      await campaign.save();
      await freezeCampaignSnapshots(String(campaign._id));
      await prepareCampaignRecipients(String(campaign._id));
      campaign.status = 'sending';
      await campaign.save();
    }

    if (campaign.status === 'preparing') {
      await prepareCampaignRecipients(String(campaign._id));
      campaign.status = 'sending';
      await campaign.save();
    }

    const batchSize = campaign.batchSize || env.MARKETING_BATCH_SIZE;
    const batch = await claimRecipientBatch(campaign._id, batchSize);
    let sent = 0;
    let failed = 0;
    if (batch.length) {
      const result = await sendRecipientBatch(campaign, batch);
      sent = result.sentCount;
      failed = result.failedCount;
    }

    const remaining = await MarketingRecipient.countDocuments({
      campaignId: campaign._id,
      status: { $in: ['pending', 'processing'] }
    });
    const stillRetryable = await MarketingRecipient.countDocuments({ campaignId: campaign._id, status: 'failed', attemptCount: { $lt: MAX_RECIPIENT_ATTEMPTS } });

    if (remaining === 0 && stillRetryable === 0) {
      const failedTotal = await MarketingRecipient.countDocuments({ campaignId: campaign._id, status: 'failed' });
      await releaseCampaignLock(campaign._id, {
        status: failedTotal > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        nextAttemptAt: null
      });
      return { processedCampaignId: String(campaign._id), sent, failed, completed: true };
    }

    await releaseCampaignLock(campaign._id, { nextAttemptAt: new Date() });
    return { processedCampaignId: String(campaign._id), sent, failed, completed: false };
  } catch (error) {
    await releaseCampaignLock(campaign._id, { nextAttemptAt: new Date(Date.now() + 60_000) });
    throw error;
  }
}

export async function cancelCampaign(campaignId: string, userId: string, reason?: string) {
  const campaign = await MarketingCampaign.findOne({ _id: campaignId });
  if (!campaign) throw new Error('MARKETING_CAMPAIGN_NOT_FOUND');
  if (!['draft', 'scheduled', 'preparing', 'sending', 'paused'].includes(campaign.status)) throw new Error('MARKETING_CAMPAIGN_NOT_CANCELLABLE');
  campaign.status = 'cancelled';
  campaign.cancelledAt = new Date();
  campaign.cancelledBy = userId as any;
  campaign.cancellationReason = reason;
  campaign.lockedAt = null;
  campaign.lockExpiresAt = null;
  campaign.nextAttemptAt = null;
  await campaign.save();
  await MarketingRecipient.updateMany({ campaignId: campaign._id, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'skipped', skipReason: 'campaign_cancelled', lockedAt: null, lockExpiresAt: null } });
  return campaign;
}

export async function retryFailedRecipients(campaignId: string) {
  const campaign = await MarketingCampaign.findOne({ _id: campaignId });
  if (!campaign) throw new Error('MARKETING_CAMPAIGN_NOT_FOUND');
  const result = await MarketingRecipient.updateMany(
    { campaignId: campaign._id, status: 'failed' },
    { $set: { status: 'pending', attemptCount: 0, lockedAt: null, lockExpiresAt: null } }
  );
  if (campaign.status === 'completed_with_errors') {
    campaign.status = 'sending';
    campaign.nextAttemptAt = new Date();
    await campaign.save();
  }
  return { retried: result.modifiedCount ?? 0 };
}
