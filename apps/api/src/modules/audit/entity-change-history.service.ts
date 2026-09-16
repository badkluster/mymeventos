import { AuditLog } from './auditLog.model';
import { User } from '../users/user.model';

type PopulatedUser = {
  _id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  fullName?: unknown;
  username?: unknown;
};

type EntityAuditLog = {
  _id?: unknown;
  action?: unknown;
  actorUserId?: unknown;
  createdAt?: unknown;
};

type AuditedEntity = {
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: unknown;
  updatedBy?: unknown;
};

export type ChangeHistoryActor = {
  id: string;
  name: string;
};

export type EntityChangeHistory = {
  createdAt?: string;
  updatedAt?: string;
  createdBy: ChangeHistoryActor | null;
  updatedBy: ChangeHistoryActor | null;
  items: Array<{
    id: string;
    action: string;
    createdAt: string;
    actor: ChangeHistoryActor | null;
  }>;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function dateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function changeHistoryActor(value: unknown): ChangeHistoryActor | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as PopulatedUser;
  if (!user._id) return null;

  const firstName = stringValue(user.firstName);
  const lastName = stringValue(user.lastName);
  const name = stringValue(user.fullName)
    ?? ([firstName, lastName].filter(Boolean).join(' ')
    || stringValue(user.username)
    || 'Usuario sin nombre');

  return { id: String(user._id), name };
}

export function buildEntityChangeHistory(entity: AuditedEntity, logs: EntityAuditLog[]): EntityChangeHistory {
  return {
    createdAt: dateValue(entity.createdAt),
    updatedAt: dateValue(entity.updatedAt),
    createdBy: changeHistoryActor(entity.createdBy),
    updatedBy: changeHistoryActor(entity.updatedBy),
    items: logs.flatMap((log) => {
      const action = stringValue(log.action);
      const createdAt = dateValue(log.createdAt);
      if (!log._id || !action || !createdAt) return [];
      return [{ id: String(log._id), action, createdAt, actor: changeHistoryActor(log.actorUserId) }];
    })
  };
}

export async function getEntityChangeHistory(input: {
  entityType: 'Lead' | 'Customer';
  entityId: string;
  entity: AuditedEntity;
  actions: readonly string[];
}): Promise<EntityChangeHistory> {
  const ownerIds = [input.entity.createdBy, input.entity.updatedBy]
    .filter(Boolean)
    .map(String);
  const logsQuery = AuditLog.find({
    entityType: input.entityType,
    entityId: input.entityId,
    action: { $in: input.actions }
  })
    .select('_id action actorUserId createdAt')
    .populate('actorUserId', 'firstName lastName fullName username')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const ownersQuery = ownerIds.length
    ? User.find({ _id: { $in: ownerIds } }).select('_id firstName lastName fullName username').lean()
    : Promise.resolve([]);

  const [logs, owners] = await Promise.all([logsQuery, ownersQuery]);
  const ownerById = new Map(
    (owners as PopulatedUser[])
      .filter((owner) => Boolean(owner._id))
      .map((owner) => [String(owner._id), owner])
  );
  const entityWithOwners = {
    ...input.entity,
    createdBy: input.entity.createdBy ? ownerById.get(String(input.entity.createdBy)) : undefined,
    updatedBy: input.entity.updatedBy ? ownerById.get(String(input.entity.updatedBy)) : undefined
  };

  return buildEntityChangeHistory(entityWithOwners, logs as EntityAuditLog[]);
}
