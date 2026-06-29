import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
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

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const roleSchema = z.nativeEnum(Role);
const permissionSchema = z.nativeEnum(Permission);
const optionalText = z.string().trim().optional().or(z.literal(''));
const notificationSchema = z.object({
  emailNotificationsEnabled: z.boolean().optional(),
  systemNotificationsEnabled: z.boolean().optional(),
  whatsappNotificationsEnabled: z.boolean().optional(),
  notifyOnNewLead: z.boolean().optional(),
  notifyOnNewQuoteRequest: z.boolean().optional(),
  notifyOnQuoteApproved: z.boolean().optional(),
  notifyOnContractApproved: z.boolean().optional(),
  notifyOnPaymentReceived: z.boolean().optional(),
  notifyOnEventReminder: z.boolean().optional(),
  notifyOnAssignedTask: z.boolean().optional()
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
  password: z.string().min(8).optional(),
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
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  notificationPreferences: notificationSchema.optional(),
  employeeProfile: employeeProfileSchema.optional(),
  attendanceConfig: attendanceConfigSchema.optional(),
  preferences: preferencesSchema.optional()
});
const createSchema = z.object({ body: baseFields.extend({ username: z.string().trim().min(3), email: z.string().trim().email(), firstName: z.string().trim().min(1), lastName: z.string().trim().min(1) }), params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: baseFields.omit({ username: true, email: true, password: true }).partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });
const rolesPatchSchema = z.object({ body: z.object({ roles: z.array(roleSchema).min(1), primaryRole: roleSchema.optional() }), params: z.object({ id: objectId }), query: z.object({}) });
const permissionsPatchSchema = z.object({ body: z.object({ permissionOverrides: z.array(permissionSchema).default([]), permissionDeniedOverrides: z.array(permissionSchema).default([]) }), params: z.object({ id: objectId }), query: z.object({}) });
const salonsPatchSchema = z.object({ body: z.object({ salonIds: z.array(objectId).default([]), primarySalonId: objectId.optional().or(z.literal('')) }), params: z.object({ id: objectId }), query: z.object({}) });
const managedSalonsPatchSchema = z.object({ body: z.object({ managedSalonIds: z.array(objectId).default([]), primaryManagedSalonId: objectId.optional().or(z.literal('')) }), params: z.object({ id: objectId }), query: z.object({}) });
const notificationPatchSchema = z.object({ body: notificationSchema, params: z.object({ id: objectId }), query: z.object({}) });
const employeePatchSchema = z.object({ body: employeeProfileSchema, params: z.object({ id: objectId }), query: z.object({}) });
const attendancePatchSchema = z.object({ body: attendanceConfigSchema, params: z.object({ id: objectId }), query: z.object({}) });
const passwordResetSchema = z.object({ body: z.object({ password: z.string().min(8).optional() }).default({}), params: z.object({ id: objectId }), query: z.object({}) });

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['username', 'email', 'fullName', 'firstName', 'lastName', 'phone', 'documentNumber'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const role = queryValue(request.query.role);
  if (role && Object.values(Role).includes(role as Role)) terms.push({ roles: role });
  const active = queryValue(request.query.active);
  if (active === 'true') terms.push({ active: true });
  if (active === 'false') terms.push({ active: false });
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
async function getUserOrFail(id: string): Promise<any> {
  const user = await User.findOne({ _id: id, deletedAt: null }).select('-passwordHash -passwordResetTokenHash').populate('salonIds', 'name slug active').populate('managedSalonIds', 'name slug active').populate('primarySalonId', 'name slug active').populate('primaryManagedSalonId', 'name slug active').lean();
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  return user;
}

router.use(requireAuth);

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
  return sendSuccess(response, { users, items: users, meta, roles: Object.values(Role), permissions: Object.values(Permission) });
}));

router.post('/', requirePermission(Permission.USERS_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const temporaryPassword = request.body.password ?? generateTemporaryPassword();
  const input = normalizeUserInput({ ...request.body, mustChangePassword: request.body.mustChangePassword ?? true });
  validatePrimarySalonFields({ ...input, salonIds: input.salonIds ?? [], managedSalonIds: input.managedSalonIds ?? [] });
  const user = await User.create({ ...input, passwordHash: await hashPassword(temporaryPassword), createdBy: request.user!.id, updatedBy: request.user!.id });
  if (input.managedSalonIds?.length) await syncUserManagedSalons(user._id.toString(), input.managedSalonIds, request.user!.id);
  await writeAuditLog(request, 'USER_CREATE', 'User', user._id.toString());
  return sendSuccess(response, { user: sanitizeUser(user), temporaryPassword: request.body.password ? undefined : temporaryPassword }, 201, getApiMessage('USER_CREATED'));
}));

router.get('/:id', requirePermission(Permission.USERS_READ), validateRequest(idParams), asyncHandler(async (request, response) => sendSuccess(response, { user: await getUserOrFail(request.params.id), roles: Object.values(Role), permissions: Object.values(Permission) })));

router.patch('/:id', requirePermission(Permission.USERS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const current: any = await User.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND');
  const input = normalizeUserInput(request.body);
  const merged = { ...current, ...input, salonIds: input.salonIds ?? current.salonIds ?? [], managedSalonIds: input.managedSalonIds ?? current.managedSalonIds ?? [] };
  if (request.body.firstName !== undefined || request.body.lastName !== undefined) input.fullName = buildUserFullName(input.firstName ?? current.firstName, input.lastName ?? current.lastName);
  validatePrimarySalonFields(merged);
  if (input.managedSalonIds) await syncUserManagedSalons(request.params.id, input.managedSalonIds, request.user!.id);
  const user: any = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...input, updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  await writeAuditLog(request, 'USER_UPDATE', 'User', request.params.id, { roleOrPermissionChanged: Boolean(request.body.roles || request.body.permissionOverrides || request.body.permissionDeniedOverrides) });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
}));

router.patch('/:id/roles', requireRole(Role.ADMIN), validateRequest(rolesPatchSchema), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { roles: request.body.roles, primaryRole: request.body.primaryRole ?? request.body.roles[0], updatedBy: request.user!.id }, { new: true, runValidators: true }).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  await writeAuditLog(request, 'USER_ROLES_UPDATE', 'User', request.params.id, { roles: request.body.roles });
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, getApiMessage('USER_UPDATED'));
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
    { $set: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, failedLoginAttempts: 0, updatedBy: request.user!.id }, $unset: { lockedUntil: 1 } },
    { new: true, runValidators: true }
  ).select('-passwordHash -passwordResetTokenHash');
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
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
