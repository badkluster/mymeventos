import { createHash } from 'crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { markIntegrationFailure, markIntegrationSuccess } from '../marketing/integration-health.service';

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
    email: z.string().trim().email().max(320).optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
    firstName: z.string().trim().max(100).optional().or(z.literal('')),
    lastName: z.string().trim().max(100).optional().or(z.literal('')),
    testEventCode: z.string().trim().max(80).optional().or(z.literal('')),
  }).strict(),
  params: z.object({}),
  query: z.object({}),
});

function clientIp(request: Request) {
  const forwarded = request.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || request.ip || '';
  return request.ip || '';
}

function hashMetaValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && !digits.startsWith('54')) digits = `54${digits}`;
  return digits;
}

router.post('/events', validateRequest(requestSchema), asyncHandler(async (request, response) => {
  if (!env.META_CONVERSIONS_API_TOKEN || !env.META_DATASET_ID) {
    return sendSuccess(response, { sent: false, reason: 'disabled' });
  }

  const body = request.body;
  const userData: Record<string, unknown> = {
    client_ip_address: clientIp(request),
    client_user_agent: request.get('user-agent') || '',
    external_id: [hashMetaValue(normalizeText(body.externalId))],
  };
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  if (body.email) userData.em = [hashMetaValue(body.email.trim().toLowerCase())];
  if (body.phone) {
    const phone = normalizePhone(body.phone);
    if (phone) userData.ph = [hashMetaValue(phone)];
  }
  if (body.firstName) userData.fn = [hashMetaValue(normalizeText(body.firstName))];
  if (body.lastName) userData.ln = [hashMetaValue(normalizeText(body.lastName))];
  userData.country = [hashMetaValue('ar')];

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
      const metaPayload = await metaResponse.json().catch(() => ({})) as { error?: { message?: string; code?: number; error_subcode?: number } };
      const message = String(metaPayload.error?.message || `Meta rechazó el evento con HTTP ${metaResponse.status}.`).slice(0, 500);
      await markIntegrationFailure('meta_capi', {
        code: metaPayload.error?.code ? String(metaPayload.error.code) : 'META_CAPI_REJECTED',
        message,
        statusCode: metaResponse.status,
        context: { eventName: body.eventName, errorSubcode: metaPayload.error?.error_subcode ?? null },
      });
      console.warn(JSON.stringify({ event: 'meta_capi_rejected', statusCode: metaResponse.status, eventName: body.eventName }));
      return sendSuccess(response, { sent: false, reason: 'rejected' });
    }
    await markIntegrationSuccess('meta_capi', { eventName: body.eventName });
    return sendSuccess(response, { sent: true });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    await markIntegrationFailure('meta_capi', {
      code: errorName === 'AbortError' ? 'META_CAPI_TIMEOUT' : 'META_CAPI_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'No se pudo conectar con Meta Conversions API.',
      context: { eventName: body.eventName },
    });
    console.warn(JSON.stringify({ event: 'meta_capi_failed', errorName, eventName: body.eventName }));
    return sendSuccess(response, { sent: false, reason: 'unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}));

export default router;
