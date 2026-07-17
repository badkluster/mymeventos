import { randomBytes } from 'crypto';
import { ApiError } from '../../middlewares/errorHandler';
import { DigitalInvitation, InvitationGuest } from './invitation.models';

export const createPublicToken = () => randomBytes(32).toString('base64url');

export function invitationIsPublic(invitation: any, now = new Date()): boolean {
  return invitation?.status === 'published' && !invitation.deletedAt && (!invitation.expiresAt || new Date(invitation.expiresAt) > now);
}

export async function getPublicInvitation(token: string) {
  const invitation: any = await DigitalInvitation.findOne({ publicToken: token, deletedAt: null }).lean();
  if (!invitation) throw new ApiError(404, 'INVITATION_NOT_FOUND', 'La invitación no existe.');
  if (!invitationIsPublic(invitation)) throw new ApiError(404, 'INVITATION_UNAVAILABLE', 'La invitación no está disponible.');
  return invitation;
}

/** Resolves either the general invitation token or a privacy-preserving guest token. */
export async function resolvePublicInvitationAccess(token: string) {
  const guest: any = await InvitationGuest.findOne({ publicToken: token, deletedAt: null }).lean();
  if (guest) {
    const parent: any = await DigitalInvitation.findOne({ _id: guest.invitationId, deletedAt: null }).lean();
    if (!parent || !invitationIsPublic(parent)) throw new ApiError(404, 'INVITATION_UNAVAILABLE', 'La invitación no está disponible.');
    return { invitation: parent, guest };
  }
  return { invitation: await getPublicInvitation(token), guest: null };
}

export function validateRsvp(invitation: any, guest: any, input: { attendance: 'confirmed' | 'declined'; adults?: number; minors?: number; companions?: number }) {
  if (invitation.rsvpDeadline && new Date(invitation.rsvpDeadline) < new Date()) throw new ApiError(422, 'RSVP_CLOSED', 'El plazo para confirmar asistencia ya finalizó.');
  if (input.attendance === 'declined') return { status: 'declined', adults: 0, minors: 0, companions: 0 };
  const adults = Number(input.adults ?? 1);
  const minors = Number(input.minors ?? 0);
  const companions = Number(input.companions ?? Math.max(0, adults + minors - 1));
  const total = adults + minors;
  if (total < 1 || total > guest.assignedSeats) throw new ApiError(422, 'RSVP_SEATS_EXCEEDED', 'La cantidad de asistentes supera los lugares asignados.');
  if (!invitation.allowCompanions && companions > 0) throw new ApiError(422, 'RSVP_COMPANIONS_NOT_ALLOWED', 'Esta invitación no permite acompañantes.');
  if (companions > invitation.maxCompanions) throw new ApiError(422, 'RSVP_COMPANIONS_EXCEEDED', 'La cantidad de acompañantes supera el máximo permitido.');
  if (!invitation.allowMinors && minors > 0) throw new ApiError(422, 'RSVP_MINORS_NOT_ALLOWED', 'Esta invitación no permite menores.');
  return { status: total < guest.assignedSeats ? 'partially_confirmed' : 'confirmed', adults, minors, companions };
}

export async function upsertRsvp(invitation: any, guestToken: string, input: { attendance: 'confirmed' | 'declined'; adults?: number; minors?: number; companions?: number; dietaryRestrictions?: string; guestMessage?: string }) {
  const guest: any = await InvitationGuest.findOne({ invitationId: invitation._id, publicToken: guestToken, deletedAt: null });
  if (!guest) throw new ApiError(404, 'INVITATION_GUEST_NOT_FOUND', 'El invitado no existe.');
  if (guest.status !== 'pending' && guest.status !== 'sent' && guest.status !== 'viewed' && !invitation.allowResponseChanges) throw new ApiError(409, 'RSVP_ALREADY_RECORDED', 'La respuesta ya fue registrada y no puede modificarse.');
  const response = validateRsvp(invitation, guest, input);
  Object.assign(guest, response, {
    dietaryRestrictions: input.dietaryRestrictions,
    guestMessage: input.guestMessage,
    respondedAt: new Date()
  });
  await guest.save();
  return guest.toObject();
}
