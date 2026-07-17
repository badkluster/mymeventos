import { describe, expect, it } from 'vitest';
import { DigitalInvitation, InvitationTemplate } from '../src/modules/invitations/invitation.models';

describe('digital invitations independent domain', () => {
  it('does not persist relations to Event, Salon or Customer', () => {
    const paths = DigitalInvitation.schema.paths;
    expect(paths.eventId).toBeUndefined();
    expect(paths.salonId).toBeUndefined();
    expect(paths.customerId).toBeUndefined();
    expect(paths.ownerId).toBeDefined();
  });

  it('provides an independent reusable template model', () => {
    expect(InvitationTemplate.schema.paths.name).toBeDefined();
    expect(InvitationTemplate.schema.paths.slug).toBeDefined();
    expect(InvitationTemplate.schema.paths.ownerId).toBeDefined();
  });
});
