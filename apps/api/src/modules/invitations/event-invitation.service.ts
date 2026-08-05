import { argentinaDateKey } from '../../utils/argentina-date';
import type { InvitationTemplateCategory } from './system-templates.service';

export type EventInvitationSource = {
  eventName?: string;
  eventType?: string;
  eventDate?: Date | string;
  startTime?: string;
  honoreeName?: string;
  customerId?: { fullName?: string } | null;
  salonId?: { name?: string; address?: string; locality?: string; city?: string; mapUrl?: string } | null;
};

export type EventInvitationPrefill = {
  title: string;
  honoreeName: string;
  eventDate: string;
  address: string;
  mapsUrl: string;
  introduction: string;
  celebrationType: InvitationTemplateCategory | 'other';
};

function localDateTime(eventDate?: Date | string, startTime?: string): string {
  if (!eventDate) return '';
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return '';
  // eventDate is a civil day with no time of its own (the actual time comes from the
  // separate startTime field), normalized as UTC midnight going forward — for those the
  // UTC calendar day is exactly right. Records saved before that normalization can carry
  // a real time-of-day baked in instead, which shifts the UTC day away from the intended
  // Argentina day; for those, the civil day is recovered in that time zone instead.
  const iso = date.toISOString();
  const day = iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : argentinaDateKey(date);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime ?? '') ? startTime : '18:00';
  return `${day}T${time}`;
}

function venueAddress(salon?: EventInvitationSource['salonId']): string {
  const values = [salon?.name, salon?.address, salon?.locality, salon?.city]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return values.filter((value, index) => values.findIndex((candidate) => candidate.toLocaleLowerCase('es-AR') === value.toLocaleLowerCase('es-AR')) === index).join(', ');
}

function celebrationType(eventType?: string): InvitationTemplateCategory | 'other' {
  const types: Record<string, InvitationTemplateCategory | 'other'> = {
    birthday: 'birthday', wedding: 'wedding', fifteen: 'fifteen', corporate: 'corporate',
    baptism_communion: 'communion', graduates: 'general', other: 'other'
  };
  return types[eventType ?? ''] ?? 'general';
}

export function eventInvitationPrefill(event: EventInvitationSource): EventInvitationPrefill {
  const honoreeName = event.honoreeName?.trim() || event.customerId?.fullName?.trim() || '';
  const title = event.eventName?.trim() || event.eventType?.trim() || (honoreeName ? `Invitación de ${honoreeName}` : 'Una celebración especial');
  const subject = honoreeName || event.eventName?.trim() || event.eventType?.trim() || 'este momento especial';
  return {
    title,
    honoreeName,
    eventDate: localDateTime(event.eventDate, event.startTime),
    address: venueAddress(event.salonId),
    mapsUrl: event.salonId?.mapUrl?.trim() ?? '',
    introduction: `Nos encantaría que nos acompañes a celebrar ${subject}.`,
    celebrationType: celebrationType(event.eventType)
  };
}
