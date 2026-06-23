import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryItem extends Document {
  name: string;
  category: 'tableware' | 'glassware' | 'cutlery' | 'linen' | 'furniture' | 'decoration' | 'beverages' | 'kitchen_supplies' | 'cleaning' | 'other';
  totalQuantity: number;
  unit: string;
  replacementValue: number;
  notes?: string;
  active: boolean;
}

const InventoryItemSchema = new Schema({
  name: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['tableware', 'glassware', 'cutlery', 'linen', 'furniture', 'decoration', 'beverages', 'kitchen_supplies', 'cleaning', 'other'],
    required: true 
  },
  totalQuantity: { type: Number, required: true, default: 0 },
  unit: { type: String, required: true },
  replacementValue: { type: Number, required: true, default: 0 },
  notes: { type: String },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.models.InventoryItem || mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);
