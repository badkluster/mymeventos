import { Schema, model, models } from 'mongoose';
const auditLogSchema = new Schema({ actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, action: { type: String, required: true, index: true }, entityType: { type: String, required: true, index: true }, entityId: String, metadata: Schema.Types.Mixed, ip: String, userAgent: String }, { timestamps: { createdAt: true, updatedAt: false } });
export const AuditLog = models.AuditLog || model('AuditLog', auditLogSchema);
