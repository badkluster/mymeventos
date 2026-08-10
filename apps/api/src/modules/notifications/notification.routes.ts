import { Router } from 'express';
import { z } from 'zod';
import { Notification } from './notification.model';
import { requireAuth } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { idParams } from '../common.schemas';

const router = Router();
const notificationIdSchema = z.object({ body: z.unknown().optional(), params: idParams.shape.params, query: z.object({}) });

router.use(requireAuth);

router.get('/', asyncHandler(async (request, response) => {
  const visibleNotifications = { userId: request.user!.id, deletedAt: null, type: { $ne: 'daily_digest' } };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(visibleNotifications).sort({ createdAt: -1 }).lean(),
    Notification.countDocuments({ ...visibleNotifications, readAt: null }),
  ]);
  return sendSuccess(response, { notifications, unreadCount });
}));

router.patch('/read-all', asyncHandler(async (request, response) => {
  const result = await Notification.updateMany(
    { userId: request.user!.id, readAt: null, deletedAt: null },
    { readAt: new Date(), updatedBy: request.user!.id },
  );
  return sendSuccess(response, { updated: result.modifiedCount });
}));

router.patch('/:id/read', validateRequest(notificationIdSchema), asyncHandler(async (request, response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: request.params.id, userId: request.user!.id, deletedAt: null },
    { readAt: new Date(), updatedBy: request.user!.id },
    { new: true },
  );
  return sendSuccess(response, { notification });
}));

router.delete('/:id', validateRequest(notificationIdSchema), asyncHandler(async (request, response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: request.params.id, userId: request.user!.id, deletedAt: null },
    { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id },
    { new: true },
  );
  return sendSuccess(response, { notification });
}));

export default router;
