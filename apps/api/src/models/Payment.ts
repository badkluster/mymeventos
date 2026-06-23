import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  paymentPlanId: mongoose.Types.ObjectId;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'manual_adjustment' | 'mercado_pago_future' | 'card_gateway_future';
  status: 'pending' | 'approved' | 'rejected';
  proofUrl?: string; // For transfers
  paymentDate: Date;
  notes?: string;
}

const PaymentSchema = new Schema({
  paymentPlanId: { type: Schema.Types.ObjectId, ref: 'PaymentPlan', required: true },
  amount: { type: Number, required: true },
  method: { 
    type: String, 
    enum: ['cash', 'bank_transfer', 'manual_adjustment', 'mercado_pago_future', 'card_gateway_future'],
    required: true 
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  proofUrl: { type: String },
  paymentDate: { type: Date, default: Date.now },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);
