import { Schema, model, models, type Model } from 'mongoose';

export type LoginChannel = 'web' | 'mobile';
export type LoginPlatform = 'web' | 'ios' | 'android';

const loginHistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true, trim: true },
  fullName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  roles: [{ type: String, trim: true }],
  channel: { type: String, enum: ['web', 'mobile'], required: true, index: true },
  platform: { type: String, enum: ['web', 'ios', 'android'], required: true, index: true },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  requestId: { type: String, trim: true },
  installationId: { type: String, trim: true },
  deviceModel: { type: String, trim: true },
  deviceName: { type: String, trim: true },
  manufacturer: { type: String, trim: true },
  osName: { type: String, trim: true },
  osVersion: { type: String, trim: true },
  appVersion: { type: String, trim: true },
  appBuildVersion: { type: String, trim: true },
  applicationId: { type: String, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

loginHistorySchema.index({ createdAt: -1 });
loginHistorySchema.index({ userId: 1, createdAt: -1 });
loginHistorySchema.index({ channel: 1, createdAt: -1 });
loginHistorySchema.index({ platform: 1, createdAt: -1 });

export const LoginHistory: Model<any> = (models.LoginHistory as Model<any> | undefined) ?? model<any>('LoginHistory', loginHistorySchema);
