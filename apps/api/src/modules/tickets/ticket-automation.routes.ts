import { timingSafeEqual } from 'crypto';
import { Router, type Request, type Response } from 'express';
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

async function processRequest(input: unknown, response: Response) {
  const startedAt = Date.now();
  const ticks = await processTicks(input);
  const elapsedMs = Date.now() - startedAt;
  const expiredReservations = ticks.reduce((total, tick) => total + tick.expiredReservations, 0);
  const lifecycleRetried = ticks.reduce((total, tick) => total + tick.lifecycleRetried, 0);
  const ticketEmailsRetried = ticks.reduce((total, tick) => total + tick.ticketEmailsRetried, 0);
  const remindersQueued = ticks.reduce((total, tick) => total + tick.remindersQueued, 0);
  if (elapsedMs >= 750 || expiredReservations || lifecycleRetried || ticketEmailsRetried || remindersQueued) {
    console.warn(JSON.stringify({
      event: 'ticket_automation_timing',
      route: '/api/tickets/process',
      elapsedMs,
      requestedMaxTicks: Math.min(5, Math.max(1, Number(input) || 1)),
      processedTicks: ticks.length,
      expiredReservations,
      lifecycleRetried,
      ticketEmailsRetried,
      remindersQueued,
    }));
  }
  return sendSuccess(response, { ticks });
}

for (const method of ['get', 'post'] as const) {
  router[method]('/process', asyncHandler(async (request, response) => {
    if (!authorized(request)) return sendError(response, 403, 'TICKET_AUTOMATION_CRON_FORBIDDEN', 'No autorizado.');
    return processRequest(method === 'get' ? request.query.maxTicks : request.body?.maxTicks, response);
  }));
}

export default router;
