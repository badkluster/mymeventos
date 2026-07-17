import { model, models, Schema } from 'mongoose';

const objectId = Schema.Types.ObjectId;
const base = {
  createdBy: { type: objectId, ref: 'User' },
  updatedBy: { type: objectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: objectId, ref: 'User' }
};

const ticketSaleSchema = new Schema({
  eventId: { type: objectId, ref: 'Event', required: true, unique: true, index: true },
  salonId: { type: objectId, ref: 'Salon', required: true, index: true },
  customerId: { type: objectId, ref: 'Customer', index: true },
  status: { type: String, enum: ['draft', 'scheduled', 'active', 'paused', 'sold_out', 'closed', 'cancelled'], default: 'draft', index: true },
  startsAt: Date, endsAt: Date,
  capacity: { type: Number, min: 0, required: true },
  reservedCount: { type: Number, min: 0, default: 0 }, soldCount: { type: Number, min: 0, default: 0 },
  maxTicketsPerOrder: { type: Number, min: 1, default: 10 }, refundPolicy: String, publicText: String,
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  imageUrl: String, location: String, relevantInfo: String,
  allowFreeTickets: { type: Boolean, default: true }, allowManualRegistration: { type: Boolean, default: true },
  paymentConfig: Schema.Types.Mixed, ...base
}, { timestamps: true });

const ticketTypeSchema = new Schema({
  saleId: { type: objectId, ref: 'TicketSale', required: true, index: true },
  name: { type: String, required: true, trim: true }, description: String,
  price: { type: Number, min: 0, required: true }, capacity: { type: Number, min: 0, required: true },
  reservedCount: { type: Number, min: 0, default: 0 }, soldCount: { type: Number, min: 0, default: 0 },
  maxPerOrder: { type: Number, min: 1, default: 10 }, startsAt: Date, endsAt: Date,
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true }, displayOrder: { type: Number, default: 0 }, ...base
}, { timestamps: true });
ticketTypeSchema.index({ saleId: 1, name: 1, deletedAt: 1 }, { unique: true });

const orderLineSchema = new Schema({ ticketTypeId: { type: objectId, ref: 'TicketType', required: true }, name: String, unitPrice: Number, quantity: Number, subtotal: Number }, { _id: false });
const ticketOrderSchema = new Schema({
  saleId: { type: objectId, ref: 'TicketSale', required: true, index: true }, eventId: { type: objectId, ref: 'Event', required: true, index: true }, salonId: { type: objectId, ref: 'Salon', required: true, index: true },
  publicId: { type: String, required: true, unique: true, index: true }, idempotencyKey: { type: String, required: true, index: true },
  buyer: { name: { type: String, required: true }, email: { type: String, required: true }, phone: String, documentNumber: String },
  lines: { type: [orderLineSchema], required: true }, totalAmount: { type: Number, min: 0, required: true }, currency: { type: String, default: 'ARS' },
  status: { type: String, enum: ['pending', 'payment_pending', 'paid', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'failed'], default: 'pending', index: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'manual_paid', 'refunded', 'failed'], default: 'pending' }, paymentMethod: String, paymentReference: String,
  expiresAt: { type: Date, index: true }, paidAt: Date, cancelledAt: Date, ...base
}, { timestamps: true });
ticketOrderSchema.index({ saleId: 1, idempotencyKey: 1 }, { unique: true });

const digitalTicketSchema = new Schema({
  saleId: { type: objectId, ref: 'TicketSale', required: true, index: true }, orderId: { type: objectId, ref: 'TicketOrder', required: true, index: true },
  eventId: { type: objectId, ref: 'Event', required: true, index: true }, ticketTypeId: { type: objectId, ref: 'TicketType', required: true, index: true },
  publicToken: { type: String, required: true, unique: true, index: true }, qrPayload: { type: String, required: true }, attendeeName: String,
  status: { type: String, enum: ['reserved', 'issued', 'valid', 'used', 'cancelled', 'refunded', 'expired', 'blocked'], default: 'reserved', index: true },
  issuedAt: Date, validatedAt: Date, validatedByUserId: { type: objectId, ref: 'User' }, accessPoint: String, ...base
}, { timestamps: true });

const accessAttemptSchema = new Schema({
  ticketId: { type: objectId, ref: 'DigitalTicket', index: true }, eventId: { type: objectId, ref: 'Event', required: true, index: true },
  operatorUserId: { type: objectId, ref: 'User', index: true }, action: { type: String, enum: ['validate', 'check_in', 'revert'], required: true },
  result: { type: String, enum: ['valid', 'used', 'invalid', 'reverted'], required: true }, accessPoint: String, idempotencyKey: String, metadata: Schema.Types.Mixed
}, { timestamps: { createdAt: true, updatedAt: false } });
accessAttemptSchema.index({ ticketId: 1, action: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const TicketSale = models.TicketSale || model('TicketSale', ticketSaleSchema);
export const TicketType = models.TicketType || model('TicketType', ticketTypeSchema);
export const TicketOrder = models.TicketOrder || model('TicketOrder', ticketOrderSchema);
export const DigitalTicket = models.DigitalTicket || model('DigitalTicket', digitalTicketSchema);
export const TicketAccessAttempt = models.TicketAccessAttempt || model('TicketAccessAttempt', accessAttemptSchema);
