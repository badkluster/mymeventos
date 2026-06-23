import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  customerName: string;
  salon: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: 'draft' | 'quoted' | 'reserved' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'lost';
  guestCounts: {
    adults: number;
    children: number;
    teens: number;
  };
  contactInfo: {
    phone: string;
    email: string;
    alternativeContact?: string;
  };
  totalPrice: number;
}

const EventSchema = new Schema({
  title: { type: String, required: true },
  customerName: { type: String, required: true },
  salon: { type: String, required: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['draft', 'quoted', 'reserved', 'confirmed', 'in_progress', 'completed', 'cancelled', 'lost'], default: 'draft' },
  guestCounts: {
    adults: { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    teens: { type: Number, default: 0 },
  },
  contactInfo: {
    phone: { type: String, required: true },
    email: { type: String, required: true },
    alternativeContact: { type: String },
  },
  totalPrice: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
