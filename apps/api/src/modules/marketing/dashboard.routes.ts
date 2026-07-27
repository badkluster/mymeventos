import { Router } from 'express';
import { Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission, accessibleSalonIds } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { Lead, Customer } from '../crm/crm.models';
import { MarketingCampaign, MarketingSendLog, MarketingTemplate } from './marketing.models';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission(Permission.CAMPAIGNS_READ), asyncHandler(async (request, response) => {
  const isAdmin = request.user!.roles.includes(Role.ADMIN);
  const salonScope = isAdmin ? null : accessibleSalonIds(request.user!);
  const campaignScopeMatch: Record<string, unknown> = { deletedAt: null };
  if (salonScope) campaignScopeMatch.$or = [{ salonId: null }, { salonId: { $in: salonScope } }];

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    activeCampaigns,
    scheduledCampaigns,
    sentThisMonth,
    aggregateThisMonth,
    failedRecent,
    recentCampaigns,
    upcomingCampaigns,
    recentErrors,
    templateUsage,
    reachableLeads,
    reachableCustomers
  ] = await Promise.all([
    MarketingCampaign.countDocuments({ ...campaignScopeMatch, status: { $in: ['preparing', 'sending'] } }),
    MarketingCampaign.countDocuments({ ...campaignScopeMatch, status: 'scheduled' }),
    MarketingCampaign.countDocuments({ ...campaignScopeMatch, status: { $in: ['completed', 'completed_with_errors'] }, completedAt: { $gte: startOfMonth } }),
    MarketingCampaign.aggregate([
      { $match: { ...campaignScopeMatch, completedAt: { $gte: startOfMonth } } },
      { $group: { _id: null, sent: { $sum: '$sentCount' }, delivered: { $sum: '$deliveredCount' }, failed: { $sum: '$failedCount' }, opened: { $sum: '$openedCount' }, clicked: { $sum: '$clickedCount' } } }
    ]),
    MarketingCampaign.countDocuments({ ...campaignScopeMatch, status: 'completed_with_errors' }),
    MarketingCampaign.find(campaignScopeMatch).sort({ createdAt: -1 }).limit(5).select('name status sentCount totalRecipients createdAt completedAt').lean(),
    MarketingCampaign.find({ ...campaignScopeMatch, status: 'scheduled' }).sort({ scheduledAt: 1 }).limit(5).select('name scheduledAt totalRecipients estimatedRecipients').lean(),
    MarketingSendLog.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(5).select('campaignId errorMessage createdAt').lean(),
    MarketingCampaign.aggregate([
      { $match: { ...campaignScopeMatch, templateId: { $ne: null } } },
      { $group: { _id: '$templateId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]),
    Lead.countDocuments({ deletedAt: null, email: { $regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, ...(salonScope ? { $or: [{ salonId: { $in: salonScope } }, { salonIds: { $in: salonScope } }] } : {}) }),
    Customer.countDocuments({ deletedAt: null, email: { $regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, ...(salonScope ? { salonIds: { $in: salonScope } } : {}) })
  ]);

  const templateIds = templateUsage.map((row: any) => row._id).filter(Boolean);
  const templates = templateIds.length ? await MarketingTemplate.find({ _id: { $in: templateIds } }).select('name').lean() : [];
  const templateNameById = new Map(templates.map((template: any) => [String(template._id), template.name]));
  const totals = aggregateThisMonth[0] ?? { sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0 };
  const providerSupportsTracking = process.env.MARKETING_EMAIL_PROVIDER === 'resend';

  return sendSuccess(response, {
    activeCampaigns,
    scheduledCampaigns,
    sentThisMonth,
    emailsSentThisMonth: totals.sent,
    deliveryRate: totals.sent > 0 ? totals.delivered / totals.sent : null,
    openRate: providerSupportsTracking && totals.delivered > 0 ? totals.opened / totals.delivered : null,
    clickRate: providerSupportsTracking && totals.delivered > 0 ? totals.clicked / totals.delivered : null,
    failedEmails: totals.failed,
    campaignsWithErrors: failedRecent,
    reachableLeads,
    reachableCustomers,
    recentCampaigns,
    upcomingCampaigns,
    recentErrors,
    mostUsedTemplates: templateUsage.map((row: any) => ({ templateId: row._id, name: templateNameById.get(String(row._id)) ?? 'Plantilla eliminada', uses: row.count }))
  });
}));

export default router;
