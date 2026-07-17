import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findInvitation: vi.fn(), findGuest: vi.fn() }));
vi.mock('../src/modules/invitations/invitation.models', () => ({
  DigitalInvitation: { findOne: mocks.findInvitation },
  InvitationGuest: { findOne: mocks.findGuest }
}));

import { createPublicToken, getPublicInvitation, resolvePublicInvitationAccess, upsertRsvp, validateRsvp } from '../src/modules/invitations/invitation.service';

const invitation = { _id: 'invitation', status: 'published', allowCompanions: true, maxCompanions: 2, allowMinors: true, allowResponseChanges: true };
const guest = { assignedSeats: 3, status: 'pending' };

describe('digital invitation RSVP', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates cryptographically sized, URL-safe public tokens', () => {
    expect(createPublicToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createPublicToken()).not.toEqual(createPublicToken());
  });

  it('distinguishes full and partial confirmations', () => {
    expect(validateRsvp(invitation, guest, { attendance: 'confirmed', adults: 3, minors: 0, companions: 2 })).toMatchObject({ status: 'confirmed', adults: 3 });
    expect(validateRsvp(invitation, guest, { attendance: 'confirmed', adults: 2, minors: 0, companions: 1 })).toMatchObject({ status: 'partially_confirmed', adults: 2 });
    expect(validateRsvp(invitation, guest, { attendance: 'declined' })).toMatchObject({ status: 'declined', adults: 0 });
  });

  it('rejects confirmations above assigned seats or companion policy', () => {
    expect(() => validateRsvp(invitation, guest, { attendance: 'confirmed', adults: 4, companions: 2 })).toThrow('lugares asignados');
    expect(() => validateRsvp({ ...invitation, allowCompanions: false }, guest, { attendance: 'confirmed', adults: 2, companions: 1 })).toThrow('no permite acompañantes');
    expect(() => validateRsvp({ ...invitation, maxCompanions: 1 }, guest, { attendance: 'confirmed', adults: 3, companions: 2 })).toThrow('máximo permitido');
    expect(() => validateRsvp({ ...invitation, allowMinors: false }, guest, { attendance: 'confirmed', adults: 1, minors: 1, companions: 1 })).toThrow('no permite menores');
  });

  it('does not expose unpublished or expired invitations publicly', async () => {
    mocks.findInvitation.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...invitation, status: 'unpublished' }) });
    await expect(getPublicInvitation('x'.repeat(43))).rejects.toThrow('no está disponible');
    mocks.findInvitation.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...invitation, expiresAt: new Date(Date.now() - 1000) }) });
    await expect(getPublicInvitation('x'.repeat(43))).rejects.toThrow('no está disponible');
  });

  it('resolves a personalized guest token without exposing that token', async () => {
    mocks.findGuest.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'guest', invitationId: 'invitation-id', publicToken: 'secret' }) });
    mocks.findInvitation.mockReturnValue({ lean: vi.fn().mockResolvedValue(invitation) });
    const result = await resolvePublicInvitationAccess('x'.repeat(43));
    expect(result).toMatchObject({ invitation: { status: 'published' }, guest: { _id: 'guest' } });
    expect(mocks.findInvitation).toHaveBeenCalledWith({ _id: 'invitation-id', deletedAt: null });
  });

  it('persists an RSVP once and prevents changes when disabled', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const document = { ...guest, _id: 'guest', toObject: () => ({ _id: 'guest', status: 'confirmed' }), save };
    mocks.findGuest.mockResolvedValue(document);
    const result = await upsertRsvp(invitation, 'x'.repeat(43), { attendance: 'confirmed', adults: 2, companions: 1 });
    expect(save).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'confirmed' });
    mocks.findGuest.mockResolvedValue({ ...guest, status: 'confirmed' });
    await expect(upsertRsvp({ ...invitation, allowResponseChanges: false }, 'x'.repeat(43), { attendance: 'confirmed', adults: 1, companions: 0 })).rejects.toThrow('ya fue registrada');
  });
});
