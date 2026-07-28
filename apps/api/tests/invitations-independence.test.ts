import { describe, expect, it } from 'vitest';
import { DigitalInvitation, InvitationTemplate } from '../src/modules/invitations/invitation.models';

describe('digital invitations independent domain', () => {
  it('keeps its own content while allowing one optional operational event link', () => {
    const paths = DigitalInvitation.schema.paths;
    expect(paths.eventId).toBeUndefined();
    expect(paths.linkedEventId).toBeDefined();
    expect(paths.salonId).toBeUndefined();
    expect(paths.customerId).toBeUndefined();
    expect(paths.ownerId).toBeDefined();
    expect(DigitalInvitation.schema.indexes().some(([keys, options]) => keys.linkedEventId === 1 && keys.deletedAt === 1 && options.unique)).toBe(true);
  });

  it('provides an independent reusable template model', () => {
    expect(InvitationTemplate.schema.paths.name).toBeDefined();
    expect(InvitationTemplate.schema.paths.slug).toBeDefined();
    expect(InvitationTemplate.schema.paths.ownerId).toBeDefined();
  });
});
