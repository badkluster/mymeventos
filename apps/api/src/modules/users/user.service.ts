import { Role } from '@mym/shared';
import { Salon } from '../salons/salon.model';
import { User, buildUserFullName, normalizeUserEmail, normalizeUserPhone } from './user.model';
import { ApiError } from '../../middlewares/errorHandler';

export function normalizeUserInput(input: Record<string, any>): Record<string, any> {
  const output = { ...input };
  if (output.username) output.username = String(output.username).trim().toLowerCase();
  if (output.email) {
    output.email = normalizeUserEmail(output.email);
    output.normalizedEmail = output.email;
  }
  if (output.phone !== undefined) output.normalizedPhone = normalizeUserPhone(output.phone);
  if (output.firstName !== undefined || output.lastName !== undefined) output.fullName = buildUserFullName(output.firstName, output.lastName);
  if (output.roles?.length && !output.primaryRole) output.primaryRole = output.roles[0];
  return output;
}

export function sanitizeUser(user: any): Record<string, any> {
  const raw = user?.toObject ? user.toObject() : { ...user };
  delete raw.passwordHash;
  delete raw.passwordResetTokenHash;
  return raw;
}

export function generateTemporaryPassword(): string {
  return `Mym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}!`;
}

export function validatePrimarySalonFields(input: Record<string, any>): void {
  const salonIds = (input.salonIds ?? []).map((id: { toString(): string }) => id.toString());
  const managedSalonIds = (input.managedSalonIds ?? []).map((id: { toString(): string }) => id.toString());
  if (input.primarySalonId && !salonIds.includes(input.primarySalonId.toString())) throw new ApiError(422, 'USER_PRIMARY_SALON_INVALID');
  if (input.primaryManagedSalonId && !managedSalonIds.includes(input.primaryManagedSalonId.toString())) throw new ApiError(422, 'USER_PRIMARY_MANAGED_SALON_INVALID');
}

export async function syncUserManagedSalons(userId: string, managedSalonIds: string[], actorId?: string): Promise<void> {
  const user: any = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
  const desired = new Set<string>(managedSalonIds.map(String));
  const current = new Set<string>((user.managedSalonIds ?? []).map((id: { toString(): string }) => id.toString()));
  const add = [...desired].filter((salonId) => !current.has(salonId));
  const remove = [...current].filter((salonId) => !desired.has(salonId));
  if (add.length) await Salon.updateMany({ _id: { $in: add }, deletedAt: null }, { managerUserId: user._id, updatedBy: actorId });
  if (remove.length) await Salon.updateMany({ _id: { $in: remove }, managerUserId: user._id, deletedAt: null }, { $unset: { managerUserId: 1 }, updatedBy: actorId });
}

export async function syncSalonManager(salonId: string, managerUserId?: string, actorId?: string, previousManagerIdInput?: string): Promise<void> {
  const salon: any = await Salon.findOne({ _id: salonId, deletedAt: null });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  const previousManagerId = previousManagerIdInput ?? salon.managerUserId?.toString();
  if (managerUserId) {
  const manager: any = await User.findOne({ _id: managerUserId, active: true, deletedAt: null }).lean();
    if (!manager) throw new ApiError(422, 'SALON_MANAGER_NOT_FOUND');
    const allowed = (manager.roles ?? []).some((role: Role) => [Role.ADMIN, Role.MANAGER, Role.SALON_MANAGER].includes(role));
    if (!allowed) throw new ApiError(422, 'SALON_MANAGER_ROLE_INVALID');
    await User.findOneAndUpdate(
      { _id: managerUserId, deletedAt: null },
      {
        $addToSet: { salonIds: salonId, managedSalonIds: salonId },
        $set: {
          ...(manager.primarySalonId ? {} : { primarySalonId: salonId }),
          ...(manager.primaryManagedSalonId ? {} : { primaryManagedSalonId: salonId }),
          updatedBy: actorId
        }
      }
    );
  }
  if (previousManagerId && previousManagerId !== managerUserId) {
    const managesOtherSalon = await Salon.exists({ _id: { $ne: salonId }, managerUserId: previousManagerId, deletedAt: null });
    const unset: Record<string, unknown> = {};
    const previous: any = await User.findOne({ _id: previousManagerId, deletedAt: null }).lean();
    if (previous?.primaryManagedSalonId?.toString() === salonId) unset.primaryManagedSalonId = 1;
    await User.findOneAndUpdate(
      { _id: previousManagerId, deletedAt: null },
      { $pull: { managedSalonIds: salonId }, ...(Object.keys(unset).length ? { $unset: unset } : {}), $set: { updatedBy: actorId } }
    );
    if (!managesOtherSalon) {
      await User.findOneAndUpdate({ _id: previousManagerId, deletedAt: null }, { $set: { updatedBy: actorId } });
    }
  }
}
