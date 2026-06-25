import { Schema, model, models, type InferSchemaType } from 'mongoose';
import { Permission, Role } from '@mym/shared';

const notificationPreferencesSchema = new Schema({
  email: { type: Boolean, default: true },
  inApp: { type: Boolean, default: true },
  whatsapp: { type: Boolean, default: false },
  newLead: { type: Boolean, default: true },
  newQuoteRequest: { type: Boolean, default: true },
  quoteAccepted: { type: Boolean, default: true },
  eventReminder: { type: Boolean, default: true },
  paymentReminder: { type: Boolean, default: true }
}, { _id: false });

const attendanceConfigSchema = new Schema({
  canUseMobileApp: { type: Boolean, default: false },
  requiresGeolocation: { type: Boolean, default: true },
  requiresWifiOrIpValidation: { type: Boolean, default: false },
  allowedIpAddresses: { type: [String], default: [] }
}, { _id: false });

const userSchema = new Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },
  roles: { type: [{ type: String, enum: Object.values(Role) }], default: [Role.STAFF], index: true },
  permissionOverrides: { type: [{ type: String, enum: Object.values(Permission) }], default: [] },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  primarySalonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  managedSalonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  primaryManagedSalonId: { type: Schema.Types.ObjectId, ref: 'Salon' },
  active: { type: Boolean, default: true, index: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: Date,
  lastPasswordChangeAt: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  notificationPreferences: {
    type: notificationPreferencesSchema,
    default: () => ({ email: true, inApp: true, whatsapp: false, newLead: true, newQuoteRequest: true, quoteAccepted: true, eventReminder: true, paymentReminder: true })
  },
  employeeProfile: { type: Schema.Types.Mixed, default: undefined },
  attendanceConfig: {
    type: attendanceConfigSchema,
    default: () => ({ canUseMobileApp: false, requiresGeolocation: true, requiresWifiOrIpValidation: false, allowedIpAddresses: [] })
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

userSchema.index({ email: 1, deletedAt: 1 });
userSchema.index({ username: 1, deletedAt: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', email: 'text', phone: 'text' });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = models.User || model('User', userSchema);
