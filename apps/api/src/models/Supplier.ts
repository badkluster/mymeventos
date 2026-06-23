import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  category: string;
  contactPersonName: string;
  contactPersonRole: string;
  email: string;
  phone: string;
  companyPhone: string;
  address: string;
  notes?: string;
  active: boolean;
}

const SupplierSchema = new Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  contactPersonName: { type: String, required: true },
  contactPersonRole: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  companyPhone: { type: String, required: true },
  address: { type: String, required: true },
  notes: { type: String },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);
