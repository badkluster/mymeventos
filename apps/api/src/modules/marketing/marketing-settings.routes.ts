import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { getOrCreateMarketingSettings } from './marketing-settings.service';

const router = Router();
router.use(requireAuth);

const schema = (body: z.ZodTypeAny) => z.object({ body, params: z.object({}), query: z.object({}) });

const settingsBody = z.object({
  companyName: z.string().trim().min(1).max(160).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  logoAlternativeUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().max(30).optional(),
  secondaryColor: z.string().max(30).optional(),
  buttonColor: z.string().max(30).optional(),
  backgroundColor: z.string().max(30).optional(),
  fontFamily: z.string().max(200).optional(),
  senderName: z.string().max(160).optional(),
  senderEmail: z.string().email().optional().or(z.literal('')),
  replyToEmail: z.string().email().optional().or(z.literal('')),
  legalFooterText: z.string().max(2000).optional(),
  defaultImageUrl: z.string().url().optional().or(z.literal(''))
});

router.get('/', requirePermission(Permission.MARKETING_SETTINGS_READ), asyncHandler(async (_request, response) => {
  const settings = await getOrCreateMarketingSettings();
  return sendSuccess(response, { settings });
}));

router.patch('/', requirePermission(Permission.MARKETING_SETTINGS_UPDATE), validateRequest(schema(settingsBody)), asyncHandler(async (request, response) => {
  const settings = await getOrCreateMarketingSettings();
  Object.assign(settings, request.body, { updatedBy: request.user!.id });
  await settings.save();
  await writeAuditLog(request, 'MARKETING_SETTINGS_UPDATE', 'MarketingSettings', String(settings._id), request.body);
  return sendSuccess(response, { settings });
}));

export default router;
