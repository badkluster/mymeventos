import { Router } from 'express';
import { z } from 'zod';
import { MARKETING_UNSUBSCRIBE_REASONS } from '@mym/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middlewares/validateRequest';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { MarketingCampaign, MarketingRecipient, MarketingUnsubscribe } from './marketing.models';

const router = Router();

const tokenParam = z.string().min(10).max(200);
const schema = (body: z.ZodTypeAny) => z.object({ body, params: z.object({ token: tokenParam }), query: z.object({}).passthrough() });

// Never reveal the full address on a page reachable by anyone with the link —
// only enough to let the recipient recognize their own inbox.
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visibleLength = Math.min(2, user.length);
  return `${user.slice(0, visibleLength)}${'*'.repeat(Math.max(1, user.length - visibleLength))}@${domain}`;
}

router.get('/:token', validateRequest(schema(z.unknown())), asyncHandler(async (request, response) => {
  const recipient = await MarketingRecipient.findOne({ unsubscribeToken: request.params.token }).select('email').lean();
  if (!recipient) throw new ApiError(404, 'MARKETING_UNSUBSCRIBE_TOKEN_INVALID');
  return sendSuccess(response, { maskedEmail: maskEmail((recipient as any).email) });
}));

const confirmBody = z.object({
  reason: z.enum(MARKETING_UNSUBSCRIBE_REASONS).optional(),
  reasonDetail: z.string().max(500).optional()
});

router.post('/:token', validateRequest(schema(confirmBody)), asyncHandler(async (request, response) => {
  const recipient = await MarketingRecipient.findOne({ unsubscribeToken: request.params.token });
  if (!recipient) throw new ApiError(404, 'MARKETING_UNSUBSCRIBE_TOKEN_INVALID');
  const normalizedEmail = recipient.email.trim().toLowerCase();

  await MarketingUnsubscribe.findOneAndUpdate(
    { normalizedEmail },
    {
      $set: {
        email: recipient.email,
        normalizedEmail,
        sourceType: recipient.sourceType,
        sourceId: recipient.sourceId,
        reason: request.body.reason,
        reasonDetail: request.body.reasonDetail,
        campaignId: recipient.campaignId,
        isActive: true,
        unsubscribedAt: new Date()
      },
      $unset: { resubscribedAt: '' }
    },
    { upsert: true, new: true }
  );

  if (recipient.status !== 'unsubscribed') {
    await MarketingRecipient.updateOne({ _id: recipient._id }, { $set: { status: 'unsubscribed' } });
    await MarketingCampaign.updateOne({ _id: recipient.campaignId }, { $inc: { unsubscribedCount: 1 } });
  }
  return sendSuccess(response, { success: true });
}));

export default router;
