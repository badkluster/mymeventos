import { Router, type Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendError } from '../../utils/api';
import { processMarketingTick } from './marketing-campaign.service';
import { getMarketingEmailProvider } from './marketing-email.provider';
import { MarketingCampaign, MarketingRecipient, MarketingWebhookEvent } from './marketing.models';

const router = Router();

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Invoked by Vercel Cron (see vercel.json `crons` — Vercel always calls cron
// paths with GET) and callable manually with POST for local testing. Protected
// by a shared secret instead of a session cookie: Vercel Cron sends it as
// `Authorization: Bearer <CRON_SECRET>` when a `CRON_SECRET` env var is set on
// the project (its own convention); manual/non-Vercel calls may instead send
// `x-cron-secret`. Both are checked against the same MARKETING_CRON_SECRET value.
function isAuthorizedCronCall(request: Request): boolean {
  if (!env.MARKETING_CRON_SECRET) return false;
  const bearer = (request.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const customHeader = request.get('x-cron-secret') ?? '';
  return timingSafeEqualStrings(bearer, env.MARKETING_CRON_SECRET) || timingSafeEqualStrings(customHeader, env.MARKETING_CRON_SECRET);
}

async function runProcessTicks(maxTicksInput: unknown) {
  const maxTicks = Math.min(20, Math.max(1, Number(maxTicksInput) || 5));
  const ticks = [];
  for (let index = 0; index < maxTicks; index += 1) {
    const tick = await processMarketingTick();
    ticks.push(tick);
    if (!tick.processedCampaignId) break;
  }
  return ticks;
}

router.get('/process', asyncHandler(async (request, response) => {
  if (!isAuthorizedCronCall(request)) return sendError(response, 403, 'MARKETING_CRON_FORBIDDEN', 'No autorizado.');
  const ticks = await runProcessTicks(request.query.maxTicks);
  return sendSuccess(response, { ticks });
}));

router.post('/process', asyncHandler(async (request, response) => {
  if (!isAuthorizedCronCall(request)) return sendError(response, 403, 'MARKETING_CRON_FORBIDDEN', 'No autorizado.');
  const ticks = await runProcessTicks(request.body?.maxTicks);
  return sendSuccess(response, { ticks });
}));

router.post('/webhooks/:provider', asyncHandler(async (request, response) => {
  if (request.params.provider !== 'resend') return sendError(response, 404, 'NOT_FOUND', 'Proveedor no soportado.');
  const provider = getMarketingEmailProvider();
  const signatureValid = provider.name === 'resend' && provider.verifyWebhookSignature(request.headers as Record<string, string | string[] | undefined>, request.rawBody);
  const payload: any = request.body ?? {};
  const providerEventId: string | undefined = payload.id ?? payload.data?.email_id;

  const webhookEvent = await MarketingWebhookEvent.findOneAndUpdate(
    { provider: 'resend', providerEventId },
    {
      $setOnInsert: { provider: 'resend', providerEventId, type: payload.type, signatureValid, payloadSummary: { type: payload.type, to: payload.data?.to } },
      $inc: { attempts: 1 }
    },
    { upsert: true, new: true }
  );

  if (!signatureValid) {
    await MarketingWebhookEvent.updateOne({ _id: webhookEvent._id }, { $set: { processingStatus: 'failed', errorCode: 'INVALID_SIGNATURE' } });
    return sendError(response, 401, 'MARKETING_WEBHOOK_INVALID_SIGNATURE', 'Firma de webhook inválida.');
  }
  if (webhookEvent.processingStatus === 'processed') return sendSuccess(response, { received: true, deduped: true });

  await applyResendEvent(payload, webhookEvent._id);
  return sendSuccess(response, { received: true });
}));

async function applyResendEvent(payload: any, webhookEventId: any): Promise<void> {
  const type: string = payload.type ?? '';
  const messageId: string | undefined = payload.data?.email_id;
  if (!messageId) {
    await MarketingWebhookEvent.updateOne({ _id: webhookEventId }, { $set: { processingStatus: 'ignored' } });
    return;
  }

  const recipient = await MarketingRecipient.findOne({ providerMessageId: messageId });
  if (!recipient) {
    await MarketingWebhookEvent.updateOne({ _id: webhookEventId }, { $set: { processingStatus: 'ignored' } });
    return;
  }

  const now = new Date();
  const campaignIncrement: Record<string, number> = {};
  if (type === 'email.delivered') {
    await MarketingRecipient.updateOne({ _id: recipient._id, deliveredAt: null }, { $set: { status: 'delivered', deliveredAt: now } });
    campaignIncrement.deliveredCount = 1;
  } else if (type === 'email.opened') {
    await MarketingRecipient.updateOne(
      { _id: recipient._id, openedAt: null },
      { $set: { openedAt: now, status: ['sent', 'delivered'].includes(recipient.status) ? 'opened' : recipient.status } }
    );
    campaignIncrement.openedCount = 1;
  } else if (type === 'email.clicked') {
    await MarketingRecipient.updateOne({ _id: recipient._id, clickedAt: null }, { $set: { clickedAt: now, status: 'clicked' } });
    campaignIncrement.clickedCount = 1;
  } else if (type === 'email.bounced' || type === 'email.complained') {
    await MarketingRecipient.updateOne({ _id: recipient._id }, { $set: { status: 'failed', failedAt: now, failureReason: type } });
    campaignIncrement.failedCount = 1;
  }

  if (Object.keys(campaignIncrement).length) await MarketingCampaign.updateOne({ _id: recipient.campaignId }, { $inc: campaignIncrement });
  await MarketingWebhookEvent.updateOne(
    { _id: webhookEventId },
    { $set: { processingStatus: 'processed', processedAt: now, campaignId: recipient.campaignId, recipientId: recipient._id, recipientEmail: recipient.email } }
  );
}

export default router;
