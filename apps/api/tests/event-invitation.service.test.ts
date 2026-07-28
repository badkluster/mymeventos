import { describe, expect, it } from 'vitest';
import { eventInvitationPrefill } from '../src/modules/invitations/event-invitation.service';

describe('event invitation prefill', () => {
  it('copies the event data into an editable invitation draft', () => {
    const prefill = eventInvitationPrefill({
      eventName: 'Los 15 de Mica', eventType: 'fifteen', eventDate: '2026-10-12T00:00:00.000Z', startTime: '21:30', honoreeName: 'Micaela',
      customerId: { fullName: 'Familia Pérez' },
      salonId: { name: 'Salón La Plata', address: 'Calle 10 123', locality: 'La Plata', city: 'La Plata', mapUrl: 'https://maps.google.com/?q=salon' }
    });
    expect(prefill).toMatchObject({ title: 'Los 15 de Mica', honoreeName: 'Micaela', eventDate: '2026-10-12T21:30', address: 'Salón La Plata, Calle 10 123, La Plata', mapsUrl: 'https://maps.google.com/?q=salon', celebrationType: 'fifteen' });
    expect(prefill.introduction).toContain('Micaela');
  });

  it('leaves unavailable details blank so the creation form asks for them', () => {
    expect(eventInvitationPrefill({ eventType: 'corporate' })).toMatchObject({ eventDate: '', address: '', mapsUrl: '', celebrationType: 'corporate' });
  });
});
