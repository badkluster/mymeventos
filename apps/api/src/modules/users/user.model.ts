import { Schema, model, models, type InferSchemaType } from 'mongoose';
import { Permission, Role } from '@mym/shared';
const userSchema = new Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true }, email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true }, passwordHash: { type: String, required: true, select: false },
  firstName: { type: String, required: true, trim: true }, lastName: { type: String, required: true, trim: true }, phone: String, avatarUrl: String,
  roles: { type: [{ type: String, enum: Object.values(Role) }], default: [Role.STAFF] }, permissionOverrides: { type: [{ type: String, enum: Object.values(Permission) }], default: [] }, salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  active: { type: Boolean, default: true, index: true }, lastLoginAt: Date, failedLoginAttempts: { type: Number, default: 0 }, lockedUntil: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
userSchema.index({ email: 1, deletedAt: 1 }); userSchema.index({ username: 1, deletedAt: 1 });
export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = models.User || model('User', userSchema);
