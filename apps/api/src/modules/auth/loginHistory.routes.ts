import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { LoginHistory } from './loginHistory.model';

const router = Router();
router.use(requireAuth, requirePermission(Permission.LOGIN_HISTORY_READ));

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
  channel: z.enum(['web', 'mobile']).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', asyncHandler(async (request, response) => {
  const query = querySchema.parse(request.query);
  const filter: Record<string, unknown> = {};

  if (query.channel) filter.channel = query.channel;
  if (query.platform) filter.platform = query.platform;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [
      { username: regex },
      { fullName: regex },
      { email: regex },
      { ipAddress: regex },
      { deviceModel: regex },
      { deviceName: regex },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [items, totalItems, todayCount, uniqueUsers] = await Promise.all([
    LoginHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    LoginHistory.countDocuments(filter),
    LoginHistory.countDocuments({ createdAt: { $gte: startOfToday } }),
    LoginHistory.distinct('userId', filter),
  ]);

  return sendSuccess(response, {
    items,
    summary: {
      total: totalItems,
      today: todayCount,
      uniqueUsers: uniqueUsers.length,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / query.limit)),
    },
  });
}));

export default router;
