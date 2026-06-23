// Lead Statuses
export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST'
}

export const LeadStatusLabels: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'Nuevo',
  [LeadStatus.CONTACTED]: 'Contactado',
  [LeadStatus.QUALIFIED]: 'Calificado',
  [LeadStatus.PROPOSAL_SENT]: 'Presupuesto Enviado',
  [LeadStatus.CONVERTED]: 'Convertido',
  [LeadStatus.LOST]: 'Perdido'
};

// Event Statuses
export enum EventStatus {
  DRAFT = 'DRAFT',
  RESERVED = 'RESERVED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

// Quote Statuses
export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

// Payment Statuses
export enum PaymentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED'
}

// Payment Methods
export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MERCADO_PAGO = 'MERCADO_PAGO',
  CREDIT_CARD = 'CREDIT_CARD'
}

// Ticket Statuses
export enum TicketStatus {
  VALID = 'VALID',
  USED = 'USED',
  CANCELLED = 'CANCELLED'
}

// Invitation Statuses
export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED'
}

// Inventory Movement Types
export enum InventoryMovementType {
  ASSIGNED = 'ASSIGNED',
  RETURNED = 'RETURNED',
  BROKEN = 'BROKEN',
  MISSING = 'MISSING',
  DIRTY = 'DIRTY',
  LOST = 'LOST'
}

// Attendance Statuses
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED'
}

// Promotion Types
export enum PromotionType {
  PERCENTAGE_DISCOUNT = 'PERCENTAGE_DISCOUNT',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  GIFT = 'GIFT',
  SPECIAL_PRICE = 'SPECIAL_PRICE',
  FINANCING = 'FINANCING'
}
