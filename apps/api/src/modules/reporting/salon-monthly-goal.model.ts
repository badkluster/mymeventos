import { Schema, model, models } from 'mongoose';

const goalChangeSchema = new Schema({
  previousTarget: Number,
  target: { type: Number, required: true },
  changedAt: { type: Date, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: String,
}, { _id: false });

const salonMonthlyGoalSchema = new Schema({
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  target: { type: Number, required: true, min: 1 },
  history: { type: [goalChangeSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true });

salonMonthlyGoalSchema.index({ salonId: 1, year: 1, month: 1 }, { unique: true });

export const SalonMonthlyGoal = models.SalonMonthlyGoal || model('SalonMonthlyGoal', salonMonthlyGoalSchema);
