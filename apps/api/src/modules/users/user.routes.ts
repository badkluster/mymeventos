import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role, StaffEmploymentStatus, StaffSubrole } from '@mym/shared';
import { User } from './user.model';
import { requireAuth, requirePermission, requireRole } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { hashPassword } from '../../utils/password';
import { writeAuditLog } from '../audit/audit.service';
import { ApiError } from '../../middlewares/errorHandler';
import { getApiMessage } from '../../utils/messages';
import { generateTemporaryPassword, normalizeUserInput, sanitizeUser, syncUserManagedSalons, validatePrimarySalonFields } from './user.service';
import { buildUserFullName } from './user.model';
import { EventStaffAssignment } from '../crm/crm.models';
import { MobileDevice } from '../mobile/mobileDevice.model';
import { RefreshToken } from '../auth/refreshToken.model';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const roleSchema = z.nativeEnum(Role);
const permissionSchema = z.nativeEnum(Permission);
const optionalText = z.string().trim().optional().or(z.literal(''));
const notificationSchema = z.object({
  emailNotificationsEnabled: z.boolean().optional(),
  systemNotificationsEnabled: z.boolean().optional(),
  notifyOnNewLead: z.boolean().optional(),
  notifyOnNewQuoteRequest: z.boolean().optional(),
  notifyOnQuoteApproved: z.boolean().optional(),
  notifyOnContractApproved: z.boolean().optional(),
  notifyOnPaymentReceived: z.boolean().optional(),
  paymentReminder: z.boolean().optional(),
  notifyOnEventReminder: z.boolean().optional(),
  notifyOnAssignedTask: z.boolean().optional()
}).partial();
export const staffProfileSchema = z.object({
  staffCode: optionalText,
  staffSubroles: z.array(z.nativeEnum(StaffSubrole)).optional(),
  documentType: optionalText,
  documentNumber: optionalText,
  birthDate: z.coerce.date().optional(),
  address: optionalText,
  emergencyContactName: optionalText,
  emergencyContactPhone: optionalText,
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  employmentStatus: z.nativeEnum(StaffEmploymentStatus).optional(),
  notes: optionalText
}).partial();
export const workScheduleSchema = z.object({
  type: z.enum(['FIXED', 'FLEXIBLE', 'EVENT_BASED']).optional(),
  weeklyAvailability: z.array(z.object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    enabled: z.boolean().optional(),
    startTime: optionalText,
    endTime: optionalText
  }).refine((item) => !item.enabled || !item.startTime || !item.endTime || item.endTime > item.startTime, 'El horario de fin debe ser posterior al inicio.')).optional(),
  notes: optionalText
}).partial();
const employeeProfileSchema = z.object({
  employeeCode: optionalText,
  position: optionalText,
  department: optionalText,
  hireDate: z.coerce.date().optional(),
  terminationDate: z.coerce.date().optional(),
  employmentStatus: z.enum(['active', 'inactive', 'suspended', 'terminated']).optional(),
  emergencyContactName: optionalText,
  emergencyContactPhone: optionalText,
  notes: optionalText
}).partial();
const attendanceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  canUseMobileApp: z.boolean().optional(),
  requiresGeolocation: z.boolean().optional(),
  requiresWifiOrIpValidation: z.boolean().optional(),
  allowedIpAddresses: z.array(z.string().trim()).optional(),
  allowedGeoLocations: z.array(z.object({ salonId: objectId.optional(), label: optionalText, latitude: z.coerce.number(), longitude: z.coerce.number(), radiusMeters: z.coerce.number().positive().optional() })).optional(),
  allowManualAdjustment: z.boolean().optional(),
  defaultWorkLocationSalonId: objectId.optional(),
  notes: optionalText
}).partial();
const preferencesSchema = z.object({ theme: optionalText, language: optionalText, defaultAdminRoute: optionalText, tablePageSize: z.coerce.number().int().positive().optional(), compactMode: z.boolean().optional() }).partial();
const baseFields = z.object({
  username: z.string().trim().min(3).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(256).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: optionalText,
  documentType: optionalText,
  documentNumber: optionalText,
  avatarUrl: z.string().url().optional().or(z.literal('')),
  roles: z.array(roleSchema).min(1).optional(),
  permissionOverrides: z.array(permissionSchema).optional(),
  permissionDeniedOverrides: z.array(permissionSchema).optional(),
  primaryRole: roleSchema.optional(),
  accessLevel: optionalText,
  salonIds: z.array(objectId).optional(),
  primarySalonId: objectId.optional().or(z.literal('')),
  managedSalonIds: z.array(objectId).optional(),
  primaryManagedSalonId: objectId.optional().or(z.literal('')),
  canReceiveLeadNotifications: z.boolean().optional(),
  canReceiveQuoteRequestNotifications: z.boolean().optional(),
  canAccessBackoffice: z.boolean().optional(),
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  notificationPreferences: notificationSchema.optional(),
  employeeProfile: employeeProfileSchema.optional(),
  staffProfile: staffProfileSchema.optional(),
  workSchedule: workScheduleSchema.optional(),
  attendanceConfig: attendanceConfigSchema.optional(),
  preferences: preferencesSchema.optional()
});
const createSchema = z.object({ body: baseFields.extend({ username: z.string().trim().min(3), email: z.string().trim().email(), password: z.string().min(8).max(256), firstName: z.string().trim().min(1), lastName: z.string().trim().min(1) }), params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: baseFields.omit({ username: true, password: true }).partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });
const rolesPatchSchema = z.object({ body: z.object({ roles: z.array(roleSchema).min(1), primaryRole: roleSchema.optional() }), params: z.object({ id: objectId }), query: z.object({}) });
const permissionsPatchSchema = z.object({ body: z.object({ permissionOverrides: z.array(permissionSchema).default([]), permissionDeniedOverrides: z.array(permissionSchema).default([]) }), params: z.object({ id: objectId }), query: z.object({}) });
const salonsPatchSchema = z.object({ body: z.object({ salonIds: z.array(objectId).default([]), primarySalonId: objectId.optional().or(z.literal('')) }), params: z.object({ id: objectId }), query: z.object({}) });
const managedSalonsPatchSchema = z.object({ body: z.object({ managedSalonIds: z.array(objectId).default([]), primaryManagedSalonId: objectId.optional().or(z.literal('')) }), params: z.object({ id: objectId }), query: z.object({}) });
const notificationPatchSchema = z.object({ body: notificationSchema, params: z.object({ id: objectId }), query: z.object({}) });
const employeePatchSchema = z.object({ body: employeeProfileSchema, params: z.object({ id: objectId }), query: z.object({}) });
const attendancePatchSchema = z.object({ body: attendanceConfigSchema, params: z.object({ id: objectId }), query: z.object({}) });
const staffProfilePatchSchema = z.object({ body: staffProfileSchema, params: z.object({ id: objectId }), query: z.object({}) });
const workSchedulePatchSchema = z.object({ body: workScheduleSchema, params: z.object({ id: objectId }), query: z.object({}) });
const passwordResetSchema = z.object({ body: z.object({ password: z.string().min(8).max(256).optional() }).default({}), params: z.object({ id: objectId }), query: z.object({}) });
const deviceParams = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, deviceId: objectId }), query: z.object({}) });

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN) && request.user!.salonIds.length) terms.push({ salonIds: { $in: request.user!.salonIds } });
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['username', 'email', 'fullName', 'firstName', 'lastName', 'phone', 'documentNumber'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const role = queryValue(request.query.role);
  if (role && Object.values(Role).includes(role as Role)) terms.push({ roles: role });
  const active = queryValue(request.query.active);
  if (active === 'true') terms.push({ active: true });
  if (active === 'false') terms.push({ active: false });
  const canAccessBackoffice = queryValue(request.query.canAccessBackoffice);
  if (canAccessBackoffice === 'true') terms.push({ canAccessBackoffice: true });
  if (canAccessBackoffice === 'false') terms.push({ canAccessBackoffice: false });
  const attendanceEnabled = queryValue(request.query.attendanceEnabled);
  if (attendanceEnabled === 'true') terms.push({ 'attendanceConfig.enabled': true });
  if (attendanceEnabled === 'false') terms.push({ 'attendanceConfig.enabled': { $ne: true } });
  const salonId = queryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonIds: salonId });
  const managedSalonId = queryValue(request.query.managedSalonId);
  if (managedSalonId && objectId.safeParse(managedSalonId).success) terms.push({ managedSalonIds: managedSalonId });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function userQuery(query: Record<string, unknown>) {
  return User.find(query)
    .select('-passwordHash -passwordResetTokenHash')
    .populate('salonIds', 'name slug active')
    .populate('managedSalonIds', 'name slug active')
    .populate('primarySalonId', 'name slug active')
    .populate('primaryManagedSalonId', 'name slug active');
}
const hiddenPermissionPrefixes = ['catalog.', 'consumption-rules.', 'inventory.'];
const availablePermissions = Object.values(Permission).filter((permission) => !hiddenPermissionPrefixes.some((prefix) => permission.startsWith(prefix)));
async function getUserOrFail(id: string): Promise<any> {
  const user = await User.findOne({ _id: id, deletedAt: null }).select('-passwordHash -passwordResetTokenHash').populate('salonIds', 'name slug active').populate('managedSalonIds', 'name slug active').populate('primarySalonId', 'name slug active').populate('primaryManagedSalonId', 'name slug active').lean();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  return sanitizeUser(user);
}

router.use(requireAuth);

// Lightweight directory (name/role only, no permissions/attendance/audit data) for
// pickers that need to link to a user — e.g. "Encargado del salón", calendar linking,
// staff assignment on an event, production, and payroll employee selectors — without
// requiring USERS_READ, which also unlocks the full Usuarios menu. Supports the same
// `role`/`active` filters as `/` since pickers narrow by those (e.g. STAFF + active).
router.get('/options', asyncHandler(async (request, response) => {
  const limit = Math.min(200, Math.max(1, Number(queryValue(request.query.limit)) || 100));
  const search = queryValue(request.query.search);
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (search) terms.push({ $or: ['fullName', 'firstName', 'lastName', 'username', 'email'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const role = queryValue(request.query.role);
  if (role && Object.values(Role).includes(role as Role)) terms.push({ roles: role });
  const active = queryValue(request.query.active);
  if (active === 'true') terms.push({ active: true });
  if (active === 'false') terms.push({ active: false });
  const query = terms.length === 1 ? terms[0] : { $and: terms };
  const items = await User.find(query)
    .select('firstName lastName fullName email username phone roles active')
    .sort({ fullName: 1 })
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, users: items });
}));

router.get('/', requirePermission(Permission.USERS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const sortBy = ['createdAt', 'lastLoginAt', 'fullName', 'email', 'username'].includes(queryValue(request.query.sort) ?? '') ? queryValue(request.query.sort)! : 'createdAt';
  const query = buildQuery(request);
  const [totalItems, users] = await Promise.all([
    User.countDocuments(query),
    userQuery(query).sort({ [sortBy]: sortBy === 'fullName' || sortBy === 'email' || sortBy === 'username' ? 1 : -1 }).skip((page - 1) * limit).limit(limit).lean()
  ]);
  const meta = { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 };
  const sanitizedUsers = users.map(sanitizeUser);
  return sendSuccess(response, { users: sanitizedUsers, items: sanitizedUsers, meta, roles: Object.values(Role), permissions: availablePermissions });
}));

router.post('/', requirePermission(Permission.USERS_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const roles = request.body.roles?.length ? request.body.roles : [Role.STAFF];
  const canAccessBackoffice = request.body.canAccessBackoffice ?? roles.some((role: Role) => [Role.ADMIN, Role.MANAGER, Role.SALON_MANAGER].includes(role));
  // A new Staff account must always be able to use the mobile app with the
  // password supplied at creation. Stricter attendance controls remain opt-in.
  const attendanceConfig = roles.includes(Role.STAFF)
    ? { ...request.body.attendanceConfig, enabled: true, canUseMobileApp: true }
    : request.body.attendanceConfig;
  const input = normalizeUserInput({ ...request.body, roles, attendanceConfig, canAccessBackoffice, mustChangePassword: canAccessBackoffice ? request.body.mustChangePassword ?? true : false });
  validatePrimarySalonFields({ ...input, salonIds: input.salonIds ?? [], managedSalonIds: input.managedSalonIds ?? [] });
  if (await User.exists({ username: input.username })) throw new ApiError(409, 'USERNAME_ALREADY_EXISTS');
  if (await User.exists({ normalizedEmail: input.normalizedEmail })) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  const { password, ...userInput } = input;
  const user = await User.create({ ...userInput, passwordHash: await hashPassword(password), createdBy: request.user!.id, updatedBy: request.user!.id });
  if (input.managedSalonIds?.length) await syncUserManagedSalons(user._id.toString(), input.managedSalonIds, request.user!.id);
  await writeAuditLog(request, 'USER_CREATE', 'User', user._id.toString());
  return sendSuccess(response, { user: sanitizeUser(user) }, 201, getApiMessage('USER_CREATED'));
}));

router.get('/:id', requirePermission(Permission.USERS_READ), validateRequest(idParams), asyncHandler(async (request, response) => sendSuccess(response, { user: await getUserOrFail(request.params.id), roles: Object.values(Role), permissions: availablePermissions })));

router.patch('/:id', requirePermission(Permission.USERS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const current: any = await User.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND');
  const input = normalizeUserInput(request.body);
  const merged = { ...current, ...input, salonIds: input.salonIds ?? current.salonIds ?? [], managedSalonIds: input.managedSalonIds ?? current.managedSalonIds ?? [] };
  if (request.body.firstName !== undefined || request.body.lastName !== undefined) input.fullName = buildUserFullName(input.firstName ?? current.firstName, input.lastName ?? current.lastName);
  validatePrimarySalonFields(merged);
  if (input.normalizedEmail && input.normalizedEmail !== current.normalizedEmail) {
    const exists = await User.exists({ _id: { $ne: request.params.id }, normalizedEmail: input.normalizedEmail });
    if (exists) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  }
  if (input.managedSalonIds) await syncUserManagedSalons(request.params.id, input.managedSalonIds, request.user!.id);
  const user: any = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...input, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  await writeAuditLog(request, 'USER_UPDATE', 'User', request.params.id, { roleOrPermissionChanged: Boolean(request.body.roles || request.body.permissionOverrides || request.body.permissionDeniedOverrides) });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

router.patch('/:id/roles', requireRole(Role.ADMIN), validateRequest(rolesPatchSchema), asyncHandler(async (request, response) => {
  const canAccessBackoffice = request.body.roles.some((role: Role) => [Role.ADMIN, Role.MANAGER, Role.SALON_MANAGER].includes(role));
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { roles: request.body.roles, primaryRole: request.body.primaryRole ?? request.body.roles[0], canAccessBackoffice, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, 'USER_ROLES_UPDATE', 'User', request.params.id, { roles: request.body.roles });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

router.get('/:id/event-assignments', requirePermission(Permission.USERS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const current = await User.findOne({ _id: request.params.id, deletedAt: null }).select('_id').lean();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND');
  const items = await EventStaffAssignment.find({ staffUserId: request.params.id, deletedAt: null }).populate('eventId', 'eventName eventType eventDate startTime endTime status salonId').populate('salonId', 'name').sort({ shiftStart: 1, createdAt: -1 }).lean();
  return sendSuccess(response, { items });
}));

router.get('/:id/devices', requirePermission(Permission.MOBILE_DEVICES_MANAGE), validateRequest(idParams), asyncHandler(async (request, response) => {
  const current = await User.findOne({ _id: request.params.id, deletedAt: null }).select('_id').lean();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND');
  const devices = await MobileDevice.find({ userId: request.params.id }).sort({ lastUsedAt: -1 }).lean();
  return sendSuccess(response, { devices });
}));

router.delete('/:id/devices/:deviceId', requirePermission(Permission.MOBILE_DEVICES_MANAGE), validateRequest(deviceParams), asyncHandler(async (request, response) => {
  const device: any = await MobileDevice.findOneAndUpdate(
    { _id: request.params.deviceId, userId: request.params.id },
    { isActive: false, revokedAt: new Date(), revokedBy: request.user!.id },
    { new: true }
  );
  if (!device) throw new ApiError(404, 'MOBILE_DEVICE_NOT_FOUND');
  await RefreshToken.updateMany({ userId: request.params.id, installationId: device.installationId, revokedAt: null }, { revokedAt: new Date() });
  await writeAuditLog(request, 'USER_MOBILE_DEVICE_REVOKE', 'MobileDevice', device._id.toString());
  return sendSuccess(response, { revoked: true }, 200, getApiMessage('MOBILE_DEVICE_REVOKED'));
}));

router.patch('/:id/permissions', requireRole(Role.ADMIN), validateRequest(permissionsPatchSchema), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { permissionOverrides: request.body.permissionOverrides, permissionDeniedOverrides: request.body.permissionDeniedOverrides, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, 'USER_PERMISSIONS_UPDATE', 'User', request.params.id);
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

router.patch('/:id/salons', requirePermission(Permission.USERS_UPDATE), validateRequest(salonsPatchSchema), asyncHandler(async (request, response) => {
  validatePrimarySalonFields({ ...request.body, managedSalonIds: [] });
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { salonIds: request.body.salonIds, primarySalonId: request.body.primarySalonId || undefined, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, 'USER_SALONS_UPDATE', 'User', request.params.id, { salonIds: request.body.salonIds });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

router.patch('/:id/managed-salons', requirePermission(Permission.USERS_UPDATE), validateRequest(managedSalonsPatchSchema), asyncHandler(async (request, response) => {
  validatePrimarySalonFields({ salonIds: [], ...request.body });
  await syncUserManagedSalons(request.params.id, request.body.managedSalonIds, request.user!.id);
  const update: Record<string, unknown> = {
    $addToSet: { salonIds: { $each: request.body.managedSalonIds } },
    $set: { managedSalonIds: request.body.managedSalonIds, updatedBy: request.user!.id }
  };
  if (request.body.primaryManagedSalonId) (update.$set as Record<string, unknown>).primaryManagedSalonId = request.body.primaryManagedSalonId;
  else update.$unset = { primaryManagedSalonId: 1 };
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, update, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, 'USER_MANAGED_SALONS_UPDATE', 'User', request.params.id, { managedSalonIds: request.body.managedSalonIds });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

for (const [path, field, schema] of [
  ['notification-preferences', 'notificationPreferences', notificationPatchSchema],
  ['employee-profile', 'employeeProfile', employeePatchSchema],
  ['staff-profile', 'staffProfile', staffProfilePatchSchema],
  ['work-schedule', 'workSchedule', workSchedulePatchSchema],
  ['attendance-config', 'attendanceConfig', attendancePatchSchema]
] as const) {
  router.patch(`/:id/${path}`, requirePermission(Permission.USERS_UPDATE), validateRequest(schema), asyncHandler(async (request, response) => {
    const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { [field]: request.body, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    await writeAuditLog(request, `USER_${field.toUpperCase()}_UPDATE`, 'User', request.params.id);
    return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
  }));
}

router.post('/:id/reset-password', requireRole(Role.ADMIN), validateRequest(passwordResetSchema), asyncHandler(async (request, response) => {
  const temporaryPassword = request.body.password ?? generateTemporaryPassword();
  const user = await User.findOneAndUpdate(
    { _id: request.params.id, deletedAt: null },
    { $set: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, lastPasswordChangeAt: new Date(), failedLoginAttempts: 0, updatedBy: request.user!.id }, $unset: { lockedUntil: 1 } },
    { new: true, runValidators: true }
  ).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await writeAuditLog(request, 'USER_PASSWORD_RESET', 'User', request.params.id);
  return sendSuccess(response, { user: sanitizeUser(user), temporaryPassword: request.body.password ? undefined : temporaryPassword }, 200, getApiMessage('USER_PASSWORD_RESET'));
}));

router.delete('/:id', requirePermission(Permission.USERS_DELETE), validateRequest(idParams), asyncHandler(async (request, response) => {
  const current: any = await User.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND');
  if (current.managedSalonIds?.length) await syncUserManagedSalons(request.params.id, [], request.user!.id);
  const user: any = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  await writeAuditLog(request, 'USER_DELETE', 'User', request.params.id);
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('USER_DELETED'));
}));

for (const [path, active] of [['/:id/activate', true], ['/:id/deactivate', false]] as const) router.patch(path, requirePermission(Permission.USERS_UPDATE), validateRequest(idParams), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { active, updatedBy: request.user!.id }, { new: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', 'User', request.params.id);
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

export default router;
