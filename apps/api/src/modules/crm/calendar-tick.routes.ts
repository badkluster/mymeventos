import { timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendError, sendSuccess } from '../../utils/api';
import { processFinancialReminderTick } from './financial-reminders.service';

const router = Router();

function equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const bearer = (request.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return equal(bearer, env.CRON_SECRET) || equal(request.get('x-cron-secret') ?? '', env.CRON_SECRET);
}

function tickCount(value: unknown): number {
  return Math.min(3, Math.max(1, Math.floor(Number(value) || 1)));
}

for (const method of ['get', 'post'] as const) {
  router[method]('/calendar-tick', asyncHandler(async (request, response) => {
    if (!authorized(request)) return sendError(response, 403, 'INTERNAL_CALENDAR_TICK_FORBIDDEN', 'No autorizado.');
    const requestedTicks = method === 'get' ? request.query.maxTicks : request.body?.maxTicks;
    const ticks = [];
    for (let index = 0; index < tickCount(requestedTicks); index += 1) {
      const tick = await processFinancialReminderTick();
      ticks.push(tick);
      if (!tick.hasMore) break;
    }
    return sendSuccess(response, { ticks });
  }));
}

export default router;
