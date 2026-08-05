import { timingSafeEqual } from 'crypto';
import { Router, type Request } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendError, sendSuccess } from '../../utils/api';
import { processFinancialReminderTick } from './financial-reminders.service';
import { processEventAlertReminderTick } from './event-alert-reminders.service';
import { processDailyDigestTick } from './daily-digest.service';
import { processPostEventReviewTick } from './post-event-review.service';
import { processClientPaymentReminderTick } from './client-payment-reminders.service';
import { processCollectionFollowUpTick } from './collection-followup-reminders.service';
import { processLeadFollowUpTick } from './lead-followup-reminders.service';
import { processQuoteLifecycleTick } from './quote-lifecycle-reminders.service';
import { processProductionMissingTick } from './production-reminders.service';
import { processProductionPendingCloseTick } from './production-close-reminders.service';
import { processTablewareOverbookingTick } from './tableware-overbooking.service';
import { processClosurePendingTick } from './closure-reminders.service';
import { processOpenSessionAlertTick } from './open-session-alerts.service';
import { processPayrollPendingTick } from './payroll-pending-alerts.service';
import { processBirthdayCampaignTick } from './birthday-campaigns.service';

const router = Router();

// Every automation domain that runs on this same cron/secret/GitHub-Actions schedule registers
// its tick function here, instead of introducing a new cron per automation (per CLAUDE.md's
// explicit instruction to reuse this endpoint+secret+idempotent-ops pattern). Each domain is
// independent: one throwing doesn't block the others in the same round.
const domainTicks: Array<{ key: string; run: (now?: Date) => Promise<{ hasMore: boolean } & Record<string, unknown>> }> = [
  { key: 'financial', run: processFinancialReminderTick },
  { key: 'eventAlert', run: processEventAlertReminderTick },
  { key: 'dailyDigest', run: processDailyDigestTick },
  { key: 'postEventReview', run: processPostEventReviewTick },
  { key: 'clientPaymentReminder', run: processClientPaymentReminderTick },
  { key: 'collectionFollowUp', run: processCollectionFollowUpTick },
  { key: 'leadFollowUp', run: processLeadFollowUpTick },
  { key: 'quoteLifecycle', run: processQuoteLifecycleTick },
  { key: 'productionMissing', run: processProductionMissingTick },
  { key: 'productionPendingClose', run: processProductionPendingCloseTick },
  { key: 'tablewareOverbooking', run: processTablewareOverbookingTick },
  { key: 'closurePending', run: processClosurePendingTick },
  { key: 'openWorkSession', run: processOpenSessionAlertTick },
  { key: 'payrollPending', run: processPayrollPendingTick },
  { key: 'birthdayCampaign', run: processBirthdayCampaignTick }
];

async function runRound(): Promise<{ round: Record<string, unknown>; hasMore: boolean }> {
  const round: Record<string, unknown> = {};
  let hasMore = false;
  for (const domain of domainTicks) {
    try {
      const result = await domain.run();
      round[domain.key] = result;
      if (result.hasMore) hasMore = true;
    } catch (error) {
      round[domain.key] = { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  return { round, hasMore };
}

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
      const { round, hasMore } = await runRound();
      ticks.push(round);
      if (!hasMore) break;
    }
    return sendSuccess(response, { ticks });
  }));
}

export default router;
