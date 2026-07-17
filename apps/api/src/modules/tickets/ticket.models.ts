import { model, models, Schema } from 'mongoose';

const objectId = Schema.Types.ObjectId;
const audit = { createdBy: { type: objectId, ref: 'User' }, updatedBy: { type: objectId, ref: 'User' }, deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: objectId, ref: 'User' } };

const publicationSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 }, description: String, category: String,
  coverImage: String, gallery: [String], startsAt: { type: Date, required: true }, endsAt: Date,
  venueName: String, address: String, city: String, province: String, mapsUrl: String, accessInfo: String, restrictions: String, minimumAge: Number,
  termsAndConditions: String, cancellationPolicy: String, refundPolicy: String,
  salesOpenAt: Date, salesCloseAt: Date, capacity: { type: Number, min: 0, required: true }, reservedCount: { type: Number, min: 0, default: 0 }, soldCount: { type: Number, min: 0, default: 0 }, maxTicketsPerOrder: { type: Number, min: 1, default: 10 },
  status: { type: String, enum: ['draft', 'scheduled', 'active', 'paused', 'sold_out', 'closed', 'cancelled', 'archived'], default: 'draft', index: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true }, allowFreeTickets: { type: Boolean, default: true },
  paymentConfig: { enabled: { type: Boolean, default: false }, provider: { type: String, enum: ['mercado_pago', 'manual', 'none'], default: 'none' }, reservationMinutes: { type: Number, min: 1, max: 120, default: 20 }, feePayer: { type: String, enum: ['organizer', 'buyer'], default: 'organizer' } },
  qrConfig: { allowReentry: { type: Boolean, default: false }, maxAccesses: { type: Number, min: 1, default: 1 }, validFrom: Date, validUntil: Date, allowRevert: { type: Boolean, default: true } }, publishedAt: Date, ...audit
}, { timestamps: true });

const ticketTypeSchema = new Schema({ publicationId: { type: objectId, ref: 'TicketPublication', required: true, index: true }, name: { type: String, required: true, trim: true }, description: String, price: { type: Number, min: 0, required: true }, currency: { type: String, default: 'ARS' }, capacity: { type: Number, min: 0, required: true }, reservedCount: { type: Number, min: 0, default: 0 }, soldCount: { type: Number, min: 0, default: 0 }, maxPerOrder: { type: Number, min: 1, default: 10 }, salesOpenAt: Date, salesCloseAt: Date, status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true }, displayOrder: { type: Number, default: 0 }, isFree: Boolean, isCourtesy: Boolean, attendeeFields: [String], ...audit }, { timestamps: true });
ticketTypeSchema.index({ publicationId: 1, name: 1, deletedAt: 1 }, { unique: true });

const lineSchema = new Schema({ ticketTypeId: { type: objectId, ref: 'TicketType', required: true }, name: String, unitPrice: Number, quantity: Number, subtotal: Number }, { _id: false });
const orderSchema = new Schema({ publicationId: { type: objectId, ref: 'TicketPublication', required: true, index: true }, publicId: { type: String, required: true, unique: true, index: true }, idempotencyKey: { type: String, required: true }, buyer: { name: { type: String, required: true }, email: { type: String, required: true }, phone: String, documentNumber: String }, lines: { type: [lineSchema], required: true }, subtotal: { type: Number, min: 0, required: true }, discounts: { type: Number, min: 0, default: 0 }, fee: { type: Number, min: 0, default: 0 }, totalAmount: { type: Number, min: 0, required: true }, currency: { type: String, default: 'ARS' }, status: { type: String, enum: ['pending', 'payment_pending', 'paid', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'failed'], default: 'pending', index: true }, paymentStatus: { type: String, enum: ['pending', 'paid', 'manual_paid', 'refunded', 'failed'], default: 'pending' }, paymentMethod: String, paymentReference: String, providerPaymentId: String, expiresAt: { type: Date, index: true }, paidAt: Date, cancelledAt: Date, channel: { type: String, default: 'public' }, ...audit }, { timestamps: true });
orderSchema.index({ publicationId: 1, idempotencyKey: 1 }, { unique: true });

const ticketSchema = new Schema({ publicationId: { type: objectId, ref: 'TicketPublication', required: true, index: true }, orderId: { type: objectId, ref: 'TicketOrder', required: true, index: true }, ticketTypeId: { type: objectId, ref: 'TicketType', required: true, index: true }, publicToken: { type: String, required: true, unique: true, index: true }, qrPayload: { type: String, required: true }, attendeeName: String, attendeeEmail: String, attendeeDocument: String, status: { type: String, enum: ['reserved', 'issued', 'valid', 'used', 'cancelled', 'refunded', 'expired', 'blocked'], default: 'reserved', index: true }, issuedAt: Date, validatedAt: Date, accessCount: { type: Number, default: 0 }, validatedByUserId: { type: objectId, ref: 'User' }, accessPoint: String, ...audit }, { timestamps: true });
const accessSchema = new Schema({ ticketId: { type: objectId, ref: 'DigitalTicket', index: true }, publicationId: { type: objectId, ref: 'TicketPublication', required: true, index: true }, operatorUserId: { type: objectId, ref: 'User', index: true }, action: { type: String, enum: ['validate', 'check_in', 'revert'], required: true }, result: { type: String, enum: ['valid', 'used', 'invalid', 'reverted'], required: true }, accessPoint: String, idempotencyKey: String, metadata: Schema.Types.Mixed }, { timestamps: { createdAt: true, updatedAt: false } });
accessSchema.index({ ticketId: 1, action: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const TicketPublication = models.TicketPublication || model('TicketPublication', publicationSchema);
export const TicketType = models.TicketType || model('TicketType', ticketTypeSchema);
export const TicketOrder = models.TicketOrder || model('TicketOrder', orderSchema);
export const DigitalTicket = models.DigitalTicket || model('DigitalTicket', ticketSchema);
export const TicketAccessAttempt = models.TicketAccessAttempt || model('TicketAccessAttempt', accessSchema);
