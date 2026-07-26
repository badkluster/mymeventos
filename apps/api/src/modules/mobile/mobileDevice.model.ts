import { Schema, model, models } from 'mongoose';

// One document per (user, installationId) pair — an "installation" of the mobile app,
// not a login session (a session is a RefreshToken row, linked back here via
// `installationId`). Deliberately does NOT store biometric data: `biometricEnabled`
// only records that the device protects the *locally cached* session with biometrics;
// the actual biometric check happens on-device via the OS APIs and is never sent here.
const mobileDeviceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  installationId: { type: String, required: true, trim: true },
  platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
  deviceModel: String,
  osVersion: String,
  appVersion: String,
  pushToken: String,
  biometricEnabled: { type: Boolean, default: false },
  lastLoginAt: Date,
  lastUsedAt: Date,
  isTrusted: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  revokedAt: Date,
  revokedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

mobileDeviceSchema.index({ userId: 1, installationId: 1 }, { unique: true });

export const MobileDevice = models.MobileDevice || model('MobileDevice', mobileDeviceSchema);
