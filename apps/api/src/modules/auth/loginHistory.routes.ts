import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@mym/shared';
import { requireAuth } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { addDaysToDateKey, argentinaDateKey, argentinaMidnight } from '../../utils/argentina-date';
import { LoginHistory } from './loginHistory.model';

const router = Router();
router.use(requireAuth, (request, _response, next) => {
  if (!request.user?.roles.includes(Role.ADMIN)) return next(new ApiError(403, 'FORBIDDEN'));
  return next();
});

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
  const commonFilter: Record<string, unknown> = {};

  if (query.channel) commonFilter.channel = query.channel;
  if (query.platform) commonFilter.platform = query.platform;
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    commonFilter.$or = [
      { username: regex },
      { fullName: regex },
      { email: regex },
      { ipAddress: regex },
      { deviceModel: regex },
      { deviceName: regex },
    ];
  }

  const dateFilter = query.from || query.to
    ? { createdAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } }
    : {};
  const filter = { ...commonFilter, ...dateFilter };
  const skip = (query.page - 1) * query.limit;

  const todayKey = argentinaDateKey(new Date());
  const todayStart = argentinaMidnight(todayKey);
  const tomorrowStart = argentinaMidnight(addDaysToDateKey(todayKey, 1));
  const todayFilter = {
    $and: [
      commonFilter,
      { createdAt: { $gte: todayStart, $lt: tomorrowStart } },
      ...(query.from || query.to ? [dateFilter] : []),
    ],
  };

  const [items, totalItems, todayCount, uniqueUsers] = await Promise.all([
    LoginHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    LoginHistory.countDocuments(filter),
    LoginHistory.countDocuments(todayFilter),
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
