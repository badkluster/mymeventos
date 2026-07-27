import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role, StaffEmploymentStatus, StaffSubrole } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { hashPassword } from '../../utils/password';
import { ApiError } from '../../middlewares/errorHandler';
import { EventStaffAssignment } from '../crm/crm.models';
import { User } from './user.model';
import { normalizeUserInput, sanitizeUser, validatePrimarySalonFields } from './user.service';
import { payrollProfileSchema, staffProfileSchema, workScheduleSchema } from './user.routes';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const createStaffSchema = z.object({
  body: z.object({
    username: z.string().trim().min(3),
    email: z.string().trim().email().optional().or(z.literal('')),
    password: z.string().min(8).max(256),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    phone: optionalText,
    documentType: optionalText,
    documentNumber: optionalText,
    salonIds: z.array(objectId).default([]),
    primarySalonId: objectId.optional().or(z.literal('')),
    canAccessBackoffice: z.boolean().optional(),
    active: z.boolean().optional(),
    staffProfile: staffProfileSchema.optional(),
    workSchedule: workScheduleSchema.optional(),
    payrollProfile: payrollProfileSchema.optional()
  }),
  params: z.object({}),
  query: z.object({})
});
const updateStaffSchema = z.object({ body: createStaffSchema.shape.body.omit({ username: true, password: true }).partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildStaffQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ roles: Role.STAFF, deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN) && request.user!.salonIds.length) terms.push({ salonIds: { $in: request.user!.salonIds } });
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['username', 'email', 'fullName', 'firstName', 'lastName', 'phone', 'staffProfile.staffCode'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const salonId = queryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonIds: salonId });
  const active = queryValue(request.query.active);
  if (active === 'true') terms.push({ active: true });
  if (active === 'false') terms.push({ active: false });
  const employmentStatus = queryValue(request.query.employmentStatus);
  if (employmentStatus && Object.values(StaffEmploymentStatus).includes(employmentStatus as StaffEmploymentStatus)) terms.push({ 'staffProfile.employmentStatus': employmentStatus });
  const subrole = queryValue(request.query.subrole);
  if (subrole && Object.values(StaffSubrole).includes(subrole as StaffSubrole)) terms.push({ 'staffProfile.staffSubroles': subrole });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function staffQuery(query: Record<string, unknown>) {
  return User.find(query).select('-passwordHash -passwordResetTokenHash').populate('salonIds', 'name slug active').populate('primarySalonId', 'name slug active');
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.USERS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const query = buildStaffQuery(request);
  const [totalItems, staff] = await Promise.all([
    User.countDocuments(query),
    staffQuery(query).sort({ fullName: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  return sendSuccess(response, { items: staff, staff, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 }, staffSubroles: Object.values(StaffSubrole), employmentStatuses: Object.values(StaffEmploymentStatus) });
}));

router.post('/', requirePermission(Permission.USERS_CREATE), validateRequest(createStaffSchema), asyncHandler(async (request, response) => {
  const canAccessBackoffice = request.body.canAccessBackoffice ?? false;
  const input = normalizeUserInput({
    ...request.body,
    roles: [Role.STAFF],
    primaryRole: Role.STAFF,
    attendanceConfig: { enabled: true, canUseMobileApp: true },
    canAccessBackoffice,
    mustChangePassword: canAccessBackoffice
  });
  validatePrimarySalonFields({ ...input, salonIds: input.salonIds ?? [], managedSalonIds: [] });
  const { password, ...staffInput } = input;
  const user = await User.create({ ...staffInput, email: staffInput.email || undefined, passwordHash: await hashPassword(password), createdBy: request.user!.id, updatedBy: request.user!.id });
  return sendSuccess(response, { staff: sanitizeUser(user), user: sanitizeUser(user) }, 201);
}));

router.get('/:id', requirePermission(Permission.USERS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const staff = await staffQuery({ _id: request.params.id, roles: Role.STAFF, deletedAt: null }).lean().then((items) => items[0]);
  if (!staff) throw new ApiError(404, 'STAFF_NOT_FOUND');
  return sendSuccess(response, { staff, user: staff, staffSubroles: Object.values(StaffSubrole), employmentStatuses: Object.values(StaffEmploymentStatus) });
}));

router.patch('/:id', requirePermission(Permission.USERS_UPDATE), validateRequest(updateStaffSchema), asyncHandler(async (request, response) => {
  const input = normalizeUserInput(request.body);
  validatePrimarySalonFields({ ...input, salonIds: input.salonIds ?? [], managedSalonIds: [] });
  const staff = await User.findOneAndUpdate({ _id: request.params.id, roles: Role.STAFF, deletedAt: null }, { ...input, email: input.email || undefined, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!staff) throw new ApiError(404, 'STAFF_NOT_FOUND');
  return sendSuccess(response, { staff: sanitizeUser(staff), user: sanitizeUser(staff) });
}));

router.get('/:id/event-assignments', requirePermission(Permission.USERS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const staff = await User.findOne({ _id: request.params.id, roles: Role.STAFF, deletedAt: null }).lean();
  if (!staff) throw new ApiError(404, 'STAFF_NOT_FOUND');
  const items = await EventStaffAssignment.find({ staffUserId: request.params.id, deletedAt: null }).populate('eventId', 'eventName eventType eventDate startTime endTime status salonId').populate('salonId', 'name').sort({ shiftStart: 1, createdAt: -1 }).lean();
  return sendSuccess(response, { items });
}));

export default router;
