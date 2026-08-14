import { Schema, model, models } from 'mongoose';

export type SupportRequestType = 'support' | 'account_deletion';
export type SupportRequestSource = 'privacy_page' | 'terms_page' | 'mobile_login' | 'backoffice_login';

const supportRequestSchema = new Schema({
  requestType: { type: String, enum: ['support', 'account_deletion'], required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160, index: true },
  accountReference: { type: String, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  source: { type: String, enum: ['privacy_page', 'terms_page', 'mobile_login', 'backoffice_login'], required: true },
  deletionConfirmed: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'in_progress', 'resolved', 'rejected'], default: 'pending', index: true },
  resolvedAt: { type: Date },
  resolutionNotes: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true });

supportRequestSchema.index({ createdAt: -1 });
supportRequestSchema.index({ requestType: 1, status: 1, createdAt: -1 });

export const SupportRequest = models.SupportRequest || model('SupportRequest', supportRequestSchema);
