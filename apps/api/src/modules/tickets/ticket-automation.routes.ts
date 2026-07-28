import { timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendError, sendSuccess } from '../../utils/api';
import { processTicketAutomationTick } from './ticket.service';

const router = Router();

function equal(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request: Request) {
  const secret = env.TICKET_AUTOMATION_CRON_SECRET;
  if (!secret) return false;
  const bearer = (request.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return equal(bearer, secret) || equal(request.get('x-cron-secret') ?? '', secret);
}

async function processTicks(input: unknown) {
  const ticks = Math.min(5, Math.max(1, Number(input) || 1));
  const results = [];
  for (let index = 0; index < ticks; index += 1) {
    const result = await processTicketAutomationTick();
    results.push(result);
    if (!result.lifecycleRetried && !result.ticketEmailsRetried && !result.remindersQueued) break;
  }
  return results;
}

for (const method of ['get', 'post'] as const) {
  router[method]('/process', asyncHandler(async (request, response) => {
    if (!authorized(request)) return sendError(response, 403, 'TICKET_AUTOMATION_CRON_FORBIDDEN', 'No autorizado.');
    return sendSuccess(response, { ticks: await processTicks(method === 'get' ? request.query.maxTicks : request.body?.maxTicks) });
  }));
}

export default router;
