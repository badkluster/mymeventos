import type { InvitationTemplateTier } from './invitation-features.service';

const section = (id: string, type: string, order: number, data: Record<string, unknown>) => ({ id, type, enabled: true, order, layout: 'contained', background: { type: 'transparent' }, textStyle: { alignment: 'center' }, spacing: { paddingTop: 56, paddingBottom: 56 }, animation: { type: 'fade', duration: 350, delay: 0 }, data });

export function defaultInvitationContent(tier: InvitationTemplateTier) {
  const basic = [
    section('hero', 'hero', 0, { title: '', subtitle: '', imageUrl: '', height: '85vh', alignment: 'center' }),
    section('welcome', 'welcome', 1, { title: 'Una celebración especial', message: 'Nos encantaría que nos acompañes.', signature: '' }),
    section('event-details', 'event_details', 2, { pretitle: 'Agendá la fecha' }),
    section('countdown', 'countdown', 3, { title: 'Falta muy poco', variant: 'blocks' }),
    section('venue', 'venue', 4, { title: 'Dónde nos encontramos' }),
    section('gallery', 'gallery', 5, { title: 'Momentos para recordar', layout: 'grid', items: [] }),
    section('dress-code', 'dress_code', 6, { title: 'Dress code', description: '' }),
    section('rsvp', 'rsvp', 7, { title: 'Confirmá tu asistencia', subtitle: 'Tu presencia es muy importante para nosotros.' }),
    section('footer', 'footer', 8, { message: '¡Te esperamos!' })
  ];
  if (tier === 'basic') return { sections: basic };
  return { sections: [
    section('opening', 'opening', 0, { overline: 'M&M Eventos', message: 'Tenemos una invitación especial para', recipientText: 'vos', eventLabel: '', eventTitle: '', buttonLabel: 'Abrir invitación' }),
    ...basic.map((item, index) => ({ ...item, order: index + 1 })),
    section('schedule', 'schedule', 10, { title: 'Momentos de la noche', items: [] }),
    section('gift-registry', 'gift_registry', 11, { title: 'Regalos', message: '', alias: '', cbu: '', bank: '', holder: '' }),
    section('music', 'music', 12, { label: 'Nuestra canción', url: '', loop: true, volume: 0.5 })
  ] };
}
