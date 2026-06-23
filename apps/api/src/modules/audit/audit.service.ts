import type { Request } from 'express';
import { AuditLog } from './auditLog.model';
export async function writeAuditLog(request: Request, action: string, entityType: string, entityId?: string, metadata?: unknown): Promise<void> { await AuditLog.create({ actorUserId: request.user?.id, action, entityType, entityId, metadata, ip: request.ip, userAgent: request.get('user-agent') }); }
