import { createHash } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';

const router = Router();

const safeId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const optionalText = z.string().trim().max(500).optional().or(z.literal(''));
const requestSchema = z.object({
  body: z.object({
    eventId: safeId,
    eventName: z.enum(['PageView', 'ViewContent', 'Contact', 'Lead']),
    eventTime: z.coerce.date(),
    eventSourceUrl: z.string().url().max(1200),
    externalId: safeId,
    fbp: optionalText,
    fbc: optionalText,
    contentName: optionalText,
    contentCategory: optionalText,
    contentIds: z.array(safeId).max(20).optional(),
    testEventCode: z.string().trim().max(80).optional().or(z.literal('')),
  }).strict(),
  params: z.object({}),
  query: z.object({}),
});

function clientIp(request: Parameters<Parameters<typeof router.post>[1]>[0]) {
  const forwarded = request.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || request.ip || '';
  return request.ip || '';
}

function hashExternalId(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

router.post('/events', validateRequest(requestSchema), asyncHandler(async (request, response) => {
  if (!env.META_CONVERSIONS_API_TOKEN || !env.META_DATASET_ID) {
    return sendSuccess(response, { sent: false, reason: 'disabled' });
  }

  const body = request.body;
  const userData: Record<string, unknown> = {
    client_ip_address: clientIp(request),
    client_user_agent: request.get('user-agent') || '',
    external_id: [hashExternalId(body.externalId)],
  };
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;

  const customData: Record<string, unknown> = {};
  if (body.contentName) customData.content_name = body.contentName;
  if (body.contentCategory) customData.content_category = body.contentCategory;
  if (body.contentIds?.length) customData.content_ids = body.contentIds;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: body.eventName,
      event_time: Math.floor(body.eventTime.getTime() / 1000),
      event_source_url: body.eventSourceUrl,
      event_id: body.eventId,
      action_source: 'website',
      user_data: userData,
      ...(Object.keys(customData).length ? { custom_data: customData } : {}),
    }],
  };
  if (body.testEventCode) payload.test_event_code = body.testEventCode;

  const endpoint = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.META_DATASET_ID}/events`);
  endpoint.searchParams.set('access_token', env.META_CONVERSIONS_API_TOKEN);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const metaResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!metaResponse.ok) {
      console.warn(JSON.stringify({ event: 'meta_capi_rejected', statusCode: metaResponse.status, eventName: body.eventName }));
      return sendSuccess(response, { sent: false, reason: 'rejected' });
    }
    return sendSuccess(response, { sent: true });
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'meta_capi_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      eventName: body.eventName,
    }));
    return sendSuccess(response, { sent: false, reason: 'unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}));

export default router;
