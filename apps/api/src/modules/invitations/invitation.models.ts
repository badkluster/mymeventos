import { model, models, Schema } from 'mongoose';

export const invitationStatuses = ['draft', 'published', 'unpublished', 'expired', 'cancelled'] as const;
export const invitationGuestStatuses = ['pending', 'sent', 'viewed', 'confirmed', 'declined', 'partially_confirmed', 'expired', 'cancelled'] as const;

const baseFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
};

const digitalInvitationSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  title: { type: String, required: true, trim: true },
  honoreeName: { type: String, trim: true },
  eventDate: Date,
  address: { type: String, trim: true },
  mapsUrl: { type: String, trim: true },
  coverImageUrl: { type: String, trim: true },
  gallery: { type: [String], default: [] },
  introduction: { type: String, trim: true },
  dressCode: { type: String, trim: true },
  additionalInfo: { type: String, trim: true },
  rsvpDeadline: Date,
  expiresAt: Date,
  status: { type: String, enum: invitationStatuses, default: 'draft', index: true },
  template: { type: String, trim: true, default: 'classic' },
  theme: { primaryColor: String, secondaryColor: String, backgroundColor: String },
  allowCompanions: { type: Boolean, default: true },
  maxCompanions: { type: Number, min: 0, default: 0 },
  allowMinors: { type: Boolean, default: true },
  allowResponseChanges: { type: Boolean, default: true },
  confirmationMessage: { type: String, trim: true },
  publicToken: { type: String, required: true, unique: true, index: true },
  publicTokenCreatedAt: { type: Date, default: Date.now },
  publishedAt: Date,
  unpublishedAt: Date,
  ...baseFields
}, { timestamps: true });
digitalInvitationSchema.index({ salonId: 1, status: 1, deletedAt: 1 });

const invitationGuestSchema = new Schema({
  invitationId: { type: Schema.Types.ObjectId, ref: 'DigitalInvitation', required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  assignedSeats: { type: Number, min: 1, default: 1 },
  adults: { type: Number, min: 0, default: 0 },
  minors: { type: Number, min: 0, default: 0 },
  companions: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: invitationGuestStatuses, default: 'pending', index: true },
  respondedAt: Date,
  notes: { type: String, trim: true },
  dietaryRestrictions: { type: String, trim: true },
  guestMessage: { type: String, trim: true },
  deliveryChannel: { type: String, enum: ['manual', 'email', 'whatsapp', 'other'], default: 'manual' },
  sentAt: Date,
  viewedAt: Date,
  publicToken: { type: String, required: true, unique: true, index: true },
  publicTokenCreatedAt: { type: Date, default: Date.now },
  ...baseFields
}, { timestamps: true });
invitationGuestSchema.index({ invitationId: 1, deletedAt: 1, status: 1 });

export const DigitalInvitation = models.DigitalInvitation || model('DigitalInvitation', digitalInvitationSchema);
export const InvitationGuest = models.InvitationGuest || model('InvitationGuest', invitationGuestSchema);
