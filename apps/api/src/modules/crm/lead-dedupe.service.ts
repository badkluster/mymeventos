import { LeadActivity } from './crm.models';
import {
  findExistingCustomer,
  findExistingLead,
  findOrCreateCustomer,
  findOrCreateLead as findOrCreateLeadCentral,
  normalizeContactData,
  normalizeEmail,
  normalizePhone
} from './contact-dedupe.service';

type LeadInput = {
  contactName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  eventType?: string;
  estimatedEventDate?: Date;
  guestCount?: number;
  salonIds?: string[];
  source?: string;
  message?: string;
  userId?: string;
};

export { findExistingCustomer, findExistingLead, findOrCreateCustomer, normalizeContactData, normalizeEmail, normalizePhone };

export async function findOrCreateLead(input: LeadInput): Promise<{ lead: any; created: boolean; possibleDuplicateLeadIds: string[]; existingCustomer?: any }> {
  const result = await findOrCreateLeadCentral(input);
  if (result.lead?._id) {
    await LeadActivity.create({
      leadId: result.lead._id,
      type: 'system',
      title: result.created ? 'Solicitud de presupuesto recibida' : 'Nueva solicitud recibida para lead existente',
      description: result.created ? 'Se creó el lead desde una solicitud de presupuesto.' : 'Se reutilizó este lead por coincidencia de contacto.',
      createdBy: input.userId
    });
  }
  return result;
}
