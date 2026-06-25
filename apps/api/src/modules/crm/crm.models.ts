import { Schema, model, models } from 'mongoose';

const base = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
};

const leadSchema = new Schema({
  firstName: String, lastName: String, fullName: { type: String, index: true }, phone: { type: String, index: true },
  email: { type: String, index: true }, alternativePhone: String, eventType: String, eventDate: Date, guestCount: Number,
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  salonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  assignedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  source: { type: String, enum: ['web_form', 'quick_quote', 'whatsapp', 'phone', 'email', 'instagram', 'facebook', 'tiktok', 'google', 'referral', 'walk_in', 'manual', 'promotion', 'ticket', 'invitation', 'other'], index: true },
  status: { type: String, enum: ['new', 'contacted', 'follow_up', 'quote_sent', 'negotiation', 'won', 'lost', 'converted'], default: 'new', index: true },
  lostReason: String, message: String, notes: String, promotionId: Schema.Types.ObjectId,
  convertedCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer' }, convertedEventId: { type: Schema.Types.ObjectId, ref: 'Event' }, convertedAt: Date,
  ...base
}, { timestamps: true });

const activitySchema = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  type: { type: String, enum: ['note', 'call', 'whatsapp', 'email', 'status_change', 'assignment', 'quote_created', 'quote_sent', 'lost', 'converted', 'system'] },
  title: String, description: String, metadata: Schema.Types.Mixed, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

const customerSchema = new Schema({
  firstName: String, lastName: String, fullName: { type: String, index: true }, phone: { type: String, index: true }, email: { type: String, index: true },
  alternativeContacts: [Schema.Types.Mixed], notes: String, sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  salonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }], ...base
}, { timestamps: true });

const contactSchema = new Schema({ customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true }, name: String, relationship: String, phone: String, email: String, notes: String }, { timestamps: true });

const menuSectionSchema = new Schema({ title: { type: String, required: true }, items: { type: [String], default: [] } }, { _id: false });

const packageTemplateSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true, index: true },
  active: { type: Boolean, default: true, index: true },
  isGlobal: { type: Boolean, default: true },
  salonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }],
  durationHours: Number, startTime: String, endTime: String,
  pricePerPerson: Number, discountPercentage: { type: Number, default: 0 }, finalPricePerPerson: Number,
  depositAmount: { type: Number, default: 0 }, paymentTerms: String, promotionText: String, giftText: String,
  menuSections: { type: [menuSectionSchema], default: [] }, includedServices: { type: [String], default: [] }, notes: String,
  ...base
}, { timestamps: true });

const venuePackageRuleSchema = new Schema({
  packageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', required: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  active: { type: Boolean, default: true },
  pricePerPerson: Number, discountPercentage: Number, finalPricePerPerson: Number, depositAmount: Number,
  paymentTerms: String, promotionText: String, giftText: String, notes: String,
  menuSections: { type: [menuSectionSchema], default: undefined }, includedServices: { type: [String], default: undefined },
  ...base
}, { timestamps: true });
venuePackageRuleSchema.index({ packageTemplateId: 1, salonId: 1 }, { unique: true });

const quoteSchema = new Schema({
  quoteNumber: { type: String, required: true, unique: true, index: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  packageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', index: true },
  status: { type: String, enum: ['draft', 'sent', 'follow_up', 'accepted', 'rejected', 'expired', 'converted'], default: 'draft', index: true },
  contactName: String, phone: String, email: String, eventType: String, eventDate: Date, guestCount: Number,
  packageName: String, durationHours: Number, startTime: String, endTime: String,
  pricePerPerson: Number, discountPercentage: { type: Number, default: 0 }, finalPricePerPerson: Number,
  totalAmount: Number, depositAmount: { type: Number, default: 0 }, balanceAmount: Number,
  paymentTerms: String, promotionText: String, giftText: String,
  menuSections: { type: [menuSectionSchema], default: [] }, includedServices: { type: [String], default: [] }, notes: String,
  validUntil: Date, sentAt: Date, acceptedAt: Date, rejectedAt: Date,
  pdfUrl: String, pdfSecureUrl: String, pdfPublicId: String, pdfGeneratedAt: Date,
  templateSnapshot: Schema.Types.Mixed,
  ...base
}, { timestamps: true });

const revisionSchema = new Schema({
  quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', index: true }, version: Number, snapshot: Schema.Types.Mixed,
  changeReason: String, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

const eventSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, sourceQuoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true }, eventType: String, eventName: String, eventDate: Date,
  startTime: String, endTime: String, guestCount: Number, status: { type: String, enum: ['draft', 'quoted', 'reserved', 'confirmed', 'cancelled', 'lost'], default: 'draft' },
  estimatedAmount: Number, finalAmount: Number, notes: String, ...base
}, { timestamps: true });

export const Lead = models.Lead || model('Lead', leadSchema);
export const LeadActivity = models.LeadActivity || model('LeadActivity', activitySchema);
export const Customer = models.Customer || model('Customer', customerSchema);
export const ContactPerson = models.ContactPerson || model('ContactPerson', contactSchema);
export const PackageTemplate = models.PackageTemplate || model('PackageTemplate', packageTemplateSchema);
export const VenuePackageRule = models.VenuePackageRule || model('VenuePackageRule', venuePackageRuleSchema);
export const Quote = models.Quote || model('Quote', quoteSchema);
export const QuoteRevision = models.QuoteRevision || model('QuoteRevision', revisionSchema);
export const Event = models.Event || model('Event', eventSchema);
