import { Router } from 'express';
import { z } from 'zod';
import { Permission, ObjectIdSchema } from '@mym/shared';
import { EventStaffAssignment } from '../crm/crm.models';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';

const router = Router();

const listSchema = z.object({
  body: z.unknown().optional(), params: z.object({}),
  query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
});
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });

router.use(requireAuth, requirePermission(Permission.ATTENDANCE_SCHEDULE_SELF));

// Reads the existing EventStaffAssignment join collection (apps/api/src/modules/crm/crm.models.ts)
// as the source of truth for "turnos/asignaciones" — no parallel Shift model is introduced.
router.get('/', validateRequest(listSchema), asyncHandler(async (request, response) => {
  const from = (request.query as any).from ?? new Date(new Date().setHours(0, 0, 0, 0));
  const to = (request.query as any).to ?? new Date(from.getTime() + 30 * 24 * 3600 * 1000);
  const assignments = await EventStaffAssignment.find({
    staffUserId: request.user!.id,
    deletedAt: null,
    $or: [{ shiftStart: { $gte: from, $lte: to } }, { shiftStart: null }]
  })
    .sort({ shiftStart: 1 })
    .populate('eventId', 'eventName eventType eventDate startTime endTime status')
    .populate('salonId', 'name city')
    .lean();
  return sendSuccess(response, { assignments: assignments.filter((assignment: any) => assignment.eventId && !['cancelled', 'lost'].includes(assignment.eventId.status)) });
}));

router.get('/:id', validateRequest(idParams), asyncHandler(async (request, response) => {
  const assignment: any = await EventStaffAssignment.findOne({ _id: request.params.id, staffUserId: request.user!.id, deletedAt: null })
    .populate('eventId', 'eventName eventType eventDate startTime endTime status guestCount')
    .populate('salonId', 'name city address')
    .lean();
  if (!assignment || !assignment.eventId || ['cancelled', 'lost'].includes((assignment.eventId as any).status)) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  return sendSuccess(response, { assignment });
}));

export default router;
