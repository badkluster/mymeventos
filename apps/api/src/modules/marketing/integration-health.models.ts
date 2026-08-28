import { Schema, model, models } from 'mongoose';

const integrationHealthSchema = new Schema({
  provider: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['connected', 'degraded', 'error'], default: 'connected', index: true },
  lastSuccessAt: Date,
  lastFailureAt: Date,
  consecutiveFailures: { type: Number, default: 0 },
  lastErrorCode: String,
  lastErrorMessage: String,
  lastStatusCode: Number,
  lastContext: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const IntegrationHealth = models.IntegrationHealth || model('IntegrationHealth', integrationHealthSchema);
