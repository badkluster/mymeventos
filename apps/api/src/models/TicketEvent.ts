import mongoose, { Schema, Document } from 'mongoose';

export interface ITicketEvent extends Document {
  title: string;
  description: string;
  image?: string;
  date: Date;
  time: string;
  salon: string;
  location: string;
  active: boolean;
  capacity: number;
  terms: string;
}

const TicketEventSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  salon: { type: String, required: true },
  location: { type: String, required: true },
  active: { type: Boolean, default: true },
  capacity: { type: Number, required: true },
  terms: { type: String, required: true }
}, { timestamps: true });

export default mongoose.models.TicketEvent || mongoose.model<ITicketEvent>('TicketEvent', TicketEventSchema);
