import { Schema, model, models } from 'mongoose';

const base = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
};

const leadSchema = new Schema({
  firstName: String, lastName: String, fullName: { type: String, index: true }, phone: { type: String, index: true },
  normalizedPhone: { type: String, index: true },
  email: { type: String, index: true }, alternativePhone: String, eventType: String, eventDate: Date, guestCount: Number,
  normalizedEmail: { type: String, index: true },
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
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  type: { type: String, enum: ['note', 'call', 'whatsapp', 'email', 'status_change', 'assignment', 'quote_created', 'quote_sent', 'lost', 'converted', 'event_created', 'customer_created', 'system'] },
  title: String, description: String, metadata: Schema.Types.Mixed, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

const quoteRequestSchema = new Schema({
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  source: { type: String, enum: ['website', 'admin', 'whatsapp', 'office', 'phone', 'quick_quote', 'other'], default: 'admin', index: true },
  status: { type: String, enum: ['new', 'in_review', 'converted', 'discarded', 'duplicated'], default: 'new', index: true },
  contactName: { type: String, required: true, trim: true },
  firstName: String,
  lastName: String,
  phone: String,
  normalizedPhone: { type: String, index: true },
  email: String,
  normalizedEmail: { type: String, index: true },
  eventType: String,
  estimatedEventDate: Date,
  guestCount: Number,
  interestedSalonIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Salon' }], default: [], index: true },
  interestedPackageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', index: true },
  interestedPackageName: String,
  message: String,
  originalPayload: Schema.Types.Mixed,
  assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  takenByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  convertedQuoteIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Quote' }], default: [] },
  duplicateOfRequestId: { type: Schema.Types.ObjectId, ref: 'QuoteRequest' },
  possibleDuplicateLeadIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Lead' }], default: [] },
  possibleDuplicateCustomerIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Customer' }], default: [] },
  internalNotes: String,
  ...base
}, { timestamps: true });

const customerSchema = new Schema({
  firstName: String, lastName: String, fullName: { type: String, index: true }, phone: { type: String, index: true }, normalizedPhone: { type: String, index: true }, email: { type: String, index: true }, normalizedEmail: { type: String, index: true },
  documentNumber: String, address: String, occupation: String,
  alternativeContacts: [Schema.Types.Mixed], notes: String, sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, sourceLeadIds: [{ type: Schema.Types.ObjectId, ref: 'Lead' }],
  createdFromLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, createdFromQuoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
  salonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }], ...base
}, { timestamps: true });

const contactSchema = new Schema({ customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true }, name: String, relationship: String, phone: String, email: String, notes: String }, { timestamps: true });

const menuSectionSchema = new Schema({ title: { type: String, required: true }, items: { type: [String], default: [] } }, { _id: false });

const packageTemplateSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  active: { type: Boolean, default: true, index: true },
  isGlobal: { type: Boolean, default: true },
  salonIds: [{ type: Schema.Types.ObjectId, ref: 'Salon', index: true }],
  durationHours: Number, startTime: String, endTime: String,
  pricingMode: { type: String, enum: ['per_person', 'fixed'], default: 'per_person', index: true },
  pricePerPerson: Number, discountPercentage: { type: Number, default: 0 }, finalPricePerPerson: Number,
  fixedPrice: Number, finalFixedPrice: Number,
  depositAmount: { type: Number, default: 0 }, paymentTerms: String, promotionText: String, giftText: String,
  menuSections: { type: [menuSectionSchema], default: [] }, includedServices: { type: [String], default: [] }, notes: String,
  publicTitle: String,
  publicDescription: String,
  publicHighlights: { type: [String], default: [] },
  badgeLabel: String,
  visibleOnWebsite: { type: Boolean, default: true, index: true },
  displayOrder: { type: Number, default: 0, index: true },
  featured: { type: Boolean, default: false, index: true },
  ...base
}, { timestamps: true });

const venuePackageRuleSchema = new Schema({
  packageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', required: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  // A global template can be presented under a different commercial name at each salon.
  name: { type: String, trim: true },
  durationHours: Number, startTime: String, endTime: String,
  active: { type: Boolean, default: true },
  pricingMode: { type: String, enum: ['per_person', 'fixed'] },
  pricePerPerson: Number, discountPercentage: Number, finalPricePerPerson: Number, depositAmount: Number,
  fixedPrice: Number, finalFixedPrice: Number,
  paymentTerms: String, promotionText: String, giftText: String, notes: String,
  menuSections: { type: [menuSectionSchema], default: undefined }, includedServices: { type: [String], default: undefined },
  ...base
}, { timestamps: true });
venuePackageRuleSchema.index({ packageTemplateId: 1, salonId: 1 }, { unique: true });

const quoteSchema = new Schema({
  quoteNumber: { type: String, required: true, unique: true, index: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  source: { type: String, enum: ['new_person', 'lead', 'customer', 'quote_request', 'manual', 'other'], default: 'manual', index: true },
  quoteMode: { type: String, enum: ['PACKAGE', 'CUSTOM', 'HYBRID'], default: 'PACKAGE', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  packageTemplateId: { type: Schema.Types.ObjectId, ref: 'PackageTemplate', index: true },
  status: { type: String, enum: ['draft', 'sent', 'follow_up', 'accepted', 'rejected', 'expired', 'converted'], default: 'draft', index: true },
  contactName: String, phone: String, email: String, eventType: String, eventDate: Date, guestCount: Number,
  honoreeName: String, vegetarianCount: Number, veganCount: Number, celiacCount: Number, lactoseIntolerantCount: Number, tableLinenColor: String,
  packageName: String, durationHours: Number, startTime: String, endTime: String,
  pricingMode: { type: String, enum: ['per_person', 'fixed'], default: 'per_person', index: true },
  pricePerPerson: Number, discountPercentage: { type: Number, default: 0 }, finalPricePerPerson: Number,
  fixedPrice: Number, finalFixedPrice: Number,
  totalAmount: Number, depositAmount: { type: Number, default: 0 }, balanceAmount: Number,
  paymentTerms: String, promotionText: String, giftText: String,
  menuSections: { type: [menuSectionSchema], default: [] }, includedServices: { type: [String], default: [] }, notes: String,
  validUntil: Date, sentAt: Date, acceptedAt: Date, rejectedAt: Date,
  totalGuests: Number,
  adultsCount: Number,
  minorsCount: Number,
  childrenCount: Number,
  teenagersCount: Number,
  adultsWithAlcoholCount: Number,
  includesAlcohol: Boolean,
  lineItems: { type: [Schema.Types.Mixed], default: [] },
  customCalculationSnapshot: Schema.Types.Mixed,
  pdfUrl: String, pdfSecureUrl: String, pdfPublicId: String, pdfGeneratedAt: Date,
  templateSnapshot: Schema.Types.Mixed,
  contactSnapshot: Schema.Types.Mixed,
  packageSnapshot: Schema.Types.Mixed,
  convertedCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  convertedEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
  ...base
}, { timestamps: true });
quoteSchema.pre('validate', function validateQuoteAssociation(next) {
  if (!this.leadId && !this.customerId) return next(new Error('Quote must have leadId or customerId.'));
  return next();
});

const revisionSchema = new Schema({
  quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', index: true }, version: Number, snapshot: Schema.Types.Mixed,
  changeReason: String, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

const eventSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, leadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, quoteId: { type: Schema.Types.ObjectId, ref: 'Quote' }, sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, sourceQuoteId: { type: Schema.Types.ObjectId, ref: 'Quote' }, createdFromQuoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true }, eventType: String, eventName: String, eventDate: Date,
  honoreeName: String, vegetarianCount: Number, veganCount: Number, celiacCount: Number, lactoseIntolerantCount: Number, tableLinenColor: String,
  startTime: String, endTime: String, guestCount: Number, status: { type: String, enum: ['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed', 'cancelled', 'lost'], default: 'draft' },
  quoteMode: { type: String, enum: ['PACKAGE', 'CUSTOM', 'HYBRID'], default: 'PACKAGE', index: true },
  guestBreakdown: Schema.Types.Mixed,
  lineItemsSnapshot: { type: [Schema.Types.Mixed], default: [] },
  resourcePlanSnapshot: Schema.Types.Mixed,
  customCalculationSnapshot: Schema.Types.Mixed,
  estimatedAmount: Number, finalAmount: Number, notes: String,
  commercialSnapshot: Schema.Types.Mixed,
  menuSnapshot: Schema.Types.Mixed,
  servicesSnapshot: Schema.Types.Mixed,
  paymentSnapshot: Schema.Types.Mixed,
  paymentPlanSnapshot: Schema.Types.Mixed,
  contractReadyChecklist: Schema.Types.Mixed,
  ...base
}, { timestamps: true });

const eventStaffAssignmentSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  staffUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  roleLabel: { type: String, trim: true },
  staffSubrole: { type: String, enum: ['WAITER', 'MAITRE', 'COOK', 'KITCHEN_ASSISTANT', 'BARTENDER', 'DJ', 'DECORATION', 'CLEANING', 'SECURITY', 'COORDINATOR', 'RECEPTION', 'OTHER'] },
  shiftStart: Date,
  shiftEnd: Date,
  status: { type: String, enum: ['proposed', 'assigned', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'], default: 'assigned', index: true },
  notes: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
eventStaffAssignmentSchema.index({ eventId: 1, staffUserId: 1, shiftStart: 1, shiftEnd: 1, deletedAt: 1 });

const calendarNotificationSchema = new Schema({
  enabled: { type: Boolean, default: false },
  channels: { type: [String], enum: ['system', 'email', 'whatsapp'], default: ['system'] },
  offsetValue: { type: Number, default: 1 },
  offsetUnit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'], default: 'days' },
  sendAt: Date,
  lastSentAt: Date,
  status: { type: String, enum: ['pending', 'scheduled', 'sent', 'failed', 'cancelled'], default: 'pending' }
}, { _id: false });

const calendarItemSchema = new Schema({
  type: { type: String, enum: ['event', 'alert', 'reminder', 'note', 'task', 'payment_window'], required: true, index: true },
  title: { type: String, required: true, trim: true, index: true },
  description: String,
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, index: true },
  allDay: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'scheduled', 'done', 'cancelled'], default: 'scheduled', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal', index: true },
  visibility: { type: String, enum: ['private', 'shared'], default: 'private', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', index: true },
  assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', index: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', index: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
  source: { type: String, enum: ['manual', 'event', 'payment', 'contract', 'system'], default: 'manual', index: true },
  notification: { type: calendarNotificationSchema, default: () => ({}) },
  metadata: Schema.Types.Mixed,
  ...base
}, { timestamps: true });
calendarItemSchema.index({ startAt: 1, endAt: 1, deletedAt: 1 });
calendarItemSchema.index({ salonId: 1, startAt: 1, deletedAt: 1 });
calendarItemSchema.index({ visibility: 1, createdBy: 1, startAt: 1, deletedAt: 1 });

const securityDepositSchema = new Schema({
  amount: { type: Number, default: 0 },
  requiredAt: Date,
  returnedAt: Date,
  status: { type: String, enum: ['pending', 'received', 'returned', 'retained'], default: 'pending' },
  notes: String
}, { _id: false });

const addendumItemSchema = new Schema({
  type: { type: String, enum: ['extra_service', 'beverage', 'decoration', 'menu_upgrade', 'staff', 'hour_extension', 'other'], default: 'other' },
  name: { type: String, required: true },
  description: String,
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 }
}, { _id: false });

const contractSchema = new Schema({
  contractNumber: { type: String, required: true, unique: true, index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'requires_changes', 'cancelled', 'superseded'], default: 'pending_approval', index: true },
  contractMode: { type: String, enum: ['PACKAGE', 'CUSTOM', 'HYBRID'], default: 'PACKAGE', index: true },
  contractFamilyId: { type: Schema.Types.ObjectId, ref: 'Contract', index: true },
  versionNumber: { type: Number, default: 1, index: true },
  supersedesContractId: { type: Schema.Types.ObjectId, ref: 'Contract', index: true },
  supersededByContractId: { type: Schema.Types.ObjectId, ref: 'Contract' },
  lineItemsSnapshot: { type: [Schema.Types.Mixed], default: [] },
  customerSnapshot: Schema.Types.Mixed,
  eventSnapshot: Schema.Types.Mixed,
  commercialSnapshot: Schema.Types.Mixed,
  menuSnapshot: Schema.Types.Mixed,
  servicesSnapshot: Schema.Types.Mixed,
  paymentAgreementSnapshot: Schema.Types.Mixed,
  paymentPlanSnapshot: Schema.Types.Mixed,
  legalTermsSnapshot: Schema.Types.Mixed,
  securityDeposit: { type: securityDepositSchema, default: () => ({}) },
  securityDepositSnapshot: Schema.Types.Mixed,
  baseAmount: { type: Number, default: 0 },
  approvedAddendumsAmount: { type: Number, default: 0 },
  pendingAddendumsAmount: { type: Number, default: 0 },
  discountsAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  observations: String,
  approvedAt: Date,
  approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  pdfUrl: String, pdfSecureUrl: String, pdfPublicId: String, pdfGeneratedAt: Date,
  ...base
}, { timestamps: true });
contractSchema.index({ eventId: 1, deletedAt: 1 });

const contractAddendumSchema = new Schema({
  addendumNumber: { type: String, required: true, unique: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true, index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'], default: 'pending_approval', index: true },
  title: { type: String, required: true },
  description: String,
  items: { type: [addendumItemSchema], default: [] },
  subtotalAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  affectsBalance: { type: Boolean, default: false },
  approvedAt: Date,
  approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  ...base
}, { timestamps: true });
contractAddendumSchema.index({ contractId: 1, deletedAt: 1 });

const paymentSchema = new Schema({
  paymentNumber: { type: String, required: true, unique: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true, index: true },
  quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', index: true },
  salonId: { type: Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  type: { type: String, enum: ['deposit', 'installment', 'balance', 'addendum', 'extra', 'security_deposit', 'adjustment', 'refund', 'other'], default: 'installment', index: true },
  method: { type: String, enum: ['cash', 'bank_transfer', 'mercado_pago', 'card', 'other'] },
  status: { type: String, enum: ['pending', 'paid', 'cancelled', 'refunded'], default: 'pending', index: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, index: true },
  paidAt: Date,
  receiptNumber: String,
  receiptPdfUrl: String,
  receiptPdfSecureUrl: String,
  receiptPdfPublicId: String,
  receiptPdfGeneratedAt: Date,
  receiptEmailSentAt: Date,
  reference: String,
  notes: String,
  planInstallmentId: String,
  affectsContractBalance: { type: Boolean, default: true },
  refundedPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  ...base
}, { timestamps: true });
paymentSchema.index({ contractId: 1, status: 1, deletedAt: 1 });
paymentSchema.index({ customerId: 1, paidAt: -1, createdAt: -1 });

export const Lead = models.Lead || model('Lead', leadSchema);
export const LeadActivity = models.LeadActivity || model('LeadActivity', activitySchema);
export const QuoteRequest = models.QuoteRequest || model('QuoteRequest', quoteRequestSchema);
export const Customer = models.Customer || model('Customer', customerSchema);
export const ContactPerson = models.ContactPerson || model('ContactPerson', contactSchema);
export const PackageTemplate = models.PackageTemplate || model('PackageTemplate', packageTemplateSchema);
export const VenuePackageRule = models.VenuePackageRule || model('VenuePackageRule', venuePackageRuleSchema);
export const Quote = models.Quote || model('Quote', quoteSchema);
export const QuoteRevision = models.QuoteRevision || model('QuoteRevision', revisionSchema);
export const Event = models.Event || model('Event', eventSchema);
export const EventStaffAssignment = models.EventStaffAssignment || model('EventStaffAssignment', eventStaffAssignmentSchema);
export const CalendarItem = models.CalendarItem || model('CalendarItem', calendarItemSchema);
export const Contract = models.Contract || model('Contract', contractSchema);
export const ContractAddendum = models.ContractAddendum || model('ContractAddendum', contractAddendumSchema);
export const Payment = models.Payment || model('Payment', paymentSchema);
