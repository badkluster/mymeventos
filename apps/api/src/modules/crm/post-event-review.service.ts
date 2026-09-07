import { CalendarItem, Customer, Event } from './crm.models';
import { Salon } from '../salons/salon.model';
import { renderBrandedEmail } from '../email/email-template.util';
import {
  idOf,
  runGenericReminderTick,
  type GenericReminderOptions,
  type GenericReminderRecipients,
  type GenericTickResult
} from './reminder-engine';

// Kept only as a fallback for existing calendar items and salons that have not configured their
// own direct Google review URL yet.
export const GOOGLE_REVIEW_URL = 'https://share.google/Zoetd8PLSfJVjAl1C';
const REVIEW_DELAY_DAYS = 2;
const REVIEW_DELAY_MS = REVIEW_DELAY_DAYS * 86_400_000;

/**
 * One-shot: creates (never updates) a CalendarItem per confirmed event once its date is at
 * least REVIEW_DELAY_DAYS in the past. Unlike financial-reminders.service.ts's obligations,
 * this content never changes after creation, so the upsert only needs `$setOnInsert` — a repeat
 * sync for the same event is a true no-op, which is what makes this idempotent across ticks.
 */
async function syncPostEventReviewRequests(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - REVIEW_DELAY_MS);
  const events: any[] = await Event.find({
    deletedAt: null,
    status: 'confirmed',
    eventDate: { $lte: cutoff }
  }).select('_id eventName eventDate customerId salonId').lean();
  if (!events.length) return 0;

  const salonIds = [...new Set(events.map((event) => idOf(event.salonId)).filter((id): id is string => Boolean(id)))];
  const salons: any[] = salonIds.length
    ? await Salon.find({ _id: { $in: salonIds }, deletedAt: null }).select('_id googleReviewUrl').lean()
    : [];
  const reviewUrlBySalonId = new Map<string, string>();
  for (const salon of salons) {
    const salonId = idOf(salon);
    const googleReviewUrl = typeof salon.googleReviewUrl === 'string' ? salon.googleReviewUrl.trim() : '';
    if (salonId && googleReviewUrl) reviewUrlBySalonId.set(salonId, googleReviewUrl);
  }

  let synced = 0;
  for (const event of events) {
    const automationKey = `post_event_review:${event._id}`;
    const sendAt = new Date(new Date(event.eventDate).getTime() + REVIEW_DELAY_MS);
    await CalendarItem.findOneAndUpdate(
      { automationKey },
      {
        $setOnInsert: {
          type: 'reminder',
          source: 'system',
          title: `Pedir reseña — ${event.eventName || 'evento'}`,
          description: 'Email automático de agradecimiento y pedido de reseña post-evento.',
          startAt: sendAt,
          allDay: false,
          status: 'scheduled',
          priority: 'normal',
          visibility: 'private',
          eventId: event._id,
          salonId: event.salonId,
          customerId: event.customerId,
          automationKey,
          metadata: {
            postEventReview: true,
            eventName: event.eventName,
            googleReviewUrl: reviewUrlBySalonId.get(idOf(event.salonId) ?? '') ?? GOOGLE_REVIEW_URL
          },
          notification: { enabled: true, channels: ['email'], sendAt, status: 'scheduled', attemptCount: 0 }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    synced += 1;
  }
  return synced;
}

async function stillApplies(item: any): Promise<boolean> {
  const eventId = idOf(item?.eventId);
  if (!eventId) return false;
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).select('_id status').lean();
  // Never sends for an event cancelled/lost after the CalendarItem was created.
  return Boolean(event) && event.status === 'confirmed';
}

async function resolveRecipients(item: any): Promise<GenericReminderRecipients> {
  const customerId = idOf(item?.customerId);
  const customer: any = customerId
    ? await Customer.findOne({ _id: customerId, deletedAt: null }).select('email').lean()
    : undefined;
  return { kind: 'external', to: customer?.email ?? '' };
}

function buildContent(item: any) {
  const eventName = item?.metadata?.eventName || 'tu evento';
  const googleReviewUrl = item?.metadata?.googleReviewUrl || GOOGLE_REVIEW_URL;
  const subject = '¿Cómo fue tu experiencia con M&M Eventos?';
  const text = [
    `¡Gracias por elegirnos para ${eventName}!`,
    'Esperamos que haya sido un día inolvidable.',
    '',
    `Nos ayudaría muchísimo que dejes tu reseña acá: ${googleReviewUrl}`,
    '',
    'Gracias por confiar en nosotros.'
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: 'Gracias por elegirnos',
    heading: '¿Cómo fue tu experiencia?',
    intro: `¡Gracias por confiar en M&M Eventos para ${eventName}! Esperamos que haya sido un día inolvidable. Tu opinión nos ayuda muchísimo a seguir mejorando.`,
    ctaLabel: 'Dejar una reseña en Google',
    ctaUrl: googleReviewUrl,
    footerNote: 'Te va a llevar menos de un minuto — muchas gracias.'
  });
  return { subject, text, html };
}

const options: GenericReminderOptions = {
  domainKey: 'postEventReview',
  notificationType: 'post_event_review',
  stillApplies,
  resolveRecipients,
  buildContent
};

export async function processPostEventReviewTick(now = new Date()): Promise<GenericTickResult> {
  return runGenericReminderTick(now, syncPostEventReviewRequests, options);
}
