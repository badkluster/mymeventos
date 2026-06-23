import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  category: string;
  supplierId: mongoose.Types.ObjectId;
  purchasePrice: number;
  salePrice: number;
  markupMode: 'percentage' | 'fixed';
  markupPercentage?: number;
  fixedSalePrice?: number;
  unit: string;
  notes?: string;
  active: boolean;
}

const ProductSchema = new Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  purchasePrice: { type: Number, required: true, default: 0 },
  salePrice: { type: Number, required: true, default: 0 },
  markupMode: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  markupPercentage: { type: Number, default: 0 },
  fixedSalePrice: { type: Number, default: 0 },
  unit: { type: String, required: true },
  notes: { type: String },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
