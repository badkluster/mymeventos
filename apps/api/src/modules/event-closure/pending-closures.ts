import { Event } from '../crm/crm.models';
import { EventClosure } from './event-closure.model';

const EVENT_TERMINAL_STATUSES = ['cancelled', 'lost'];

/**
 * Events whose date already passed (at least `olderThanDays` ago) and whose closure isn't fully
 * administrative-closed — including events with no EventClosure document at all, since that
 * collection is only created on-demand (event-closure.routes.ts) rather than for every event.
 * Shared by the daily digest and the closure-pending reminder so both agree on what "pending"
 * means.
 */
export async function findEventsWithPendingClosure(now: Date, olderThanDays = 1): Promise<any[]> {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
  const events = await Event.find({
    deletedAt: null,
    eventDate: { $lte: cutoff },
    status: { $nin: EVENT_TERMINAL_STATUSES }
  }).select('_id eventName eventDate salonId customerId').lean();
  if (!events.length) return [];
  const closures = await EventClosure.find({
    eventId: { $in: events.map((event: any) => event._id) },
    deletedAt: null
  }).select('eventId administrative.status').lean();
  const closedEventIds = new Set(
    closures.filter((closure: any) => closure.administrative?.status === 'closed').map((closure: any) => String(closure.eventId))
  );
  return events.filter((event: any) => !closedEventIds.has(String(event._id)));
}
