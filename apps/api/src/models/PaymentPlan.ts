import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentPlan extends Document {
  eventId: mongoose.Types.ObjectId;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  lateInterestRate: number; // Percentage per day or month
  dueDate: Date;
}

const PaymentPlanSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  totalAmount: { type: Number, required: true },
  depositAmount: { type: Number, required: true },
  remainingAmount: { type: Number, required: true },
  lateInterestRate: { type: Number, default: 0 },
  dueDate: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.models.PaymentPlan || mongoose.model<IPaymentPlan>('PaymentPlan', PaymentPlanSchema);
