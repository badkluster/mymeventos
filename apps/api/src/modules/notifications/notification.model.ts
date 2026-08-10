import { Schema, model, models } from 'mongoose';
const notificationSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, type: { type: String, default: 'system', index: true }, title: { type: String, required: true }, message: { type: String, required: true }, actionUrl: String, automationKey: String, readAt: Date, metadata: Schema.Types.Mixed, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
// A compound sparse index would still index every notification because userId
// is required. Restrict uniqueness to generated deliveries only.
notificationSchema.index({ userId: 1, automationKey: 1 }, { unique: true, partialFilterExpression: { automationKey: { $type: 'string' } } });
// The backoffice polls this collection frequently. These indexes cover both the newest
// notifications list and the unread counter without scanning unrelated users.
notificationSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, deletedAt: 1 });
export const Notification = models.Notification || model('Notification', notificationSchema);
