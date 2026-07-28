import { CalendarItem } from './crm.models';

type EventAlertItem = {
  id?: string;
  title?: string;
  remindAt?: string;
  channel?: string;
  status?: string;
  notes?: string;
};

const notificationChannels = ['system', 'email'];

function calendarStatus(status?: string): 'pending' | 'scheduled' | 'done' | 'cancelled' {
  if (status === 'scheduled') return 'scheduled';
  if (status === 'sent' || status === 'done') return 'done';
  return 'pending';
}

/**
 * Las "alertas y recordatorios" del evento (resourcePlanSnapshot.alerts) se reflejan
 * como CalendarItem (type: 'reminder', source: 'event') para que aparezcan en el
 * calendario general junto con los ítems creados manualmente. El plan completo se
 * reemplaza en cada guardado, por eso se sincroniza por id de alerta: se crean/actualizan
 * los vigentes y se borran (soft delete) los que ya no están en el plan.
 */
export async function syncEventAlertCalendarItems(
  event: { _id: unknown; salonId?: unknown },
  alerts: EventAlertItem[] | undefined,
  userId: string
): Promise<void> {
  const validAlerts = (alerts ?? []).filter((alert): alert is EventAlertItem & { id: string; title: string; remindAt: string } => {
    if (!alert?.id || !alert.title?.trim() || !alert.remindAt) return false;
    return !Number.isNaN(new Date(alert.remindAt).getTime());
  });
  const seenIds = validAlerts.map((alert) => alert.id);

  for (const alert of validAlerts) {
    const channel = notificationChannels.includes(alert.channel ?? '') ? alert.channel : 'system';
    const startAt = new Date(alert.remindAt);
    await CalendarItem.findOneAndUpdate(
      { eventId: event._id, source: 'event', type: 'reminder', 'metadata.eventAlertId': alert.id, deletedAt: null },
      {
        $set: {
          type: 'reminder',
          source: 'event',
          title: alert.title.trim(),
          description: alert.notes?.trim() || undefined,
          startAt,
          allDay: false,
          status: calendarStatus(alert.status),
          priority: 'normal',
          visibility: 'shared',
          eventId: event._id,
          salonId: event.salonId ?? undefined,
          notification: { enabled: true, channels: [channel], sendAt: startAt, status: alert.status === 'sent' ? 'sent' : 'scheduled' },
          metadata: { eventAlertId: alert.id },
          updatedBy: userId,
          deletedAt: null,
          deletedBy: null
        },
        $setOnInsert: { createdBy: userId }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  await CalendarItem.updateMany(
    { eventId: event._id, source: 'event', type: 'reminder', deletedAt: null, 'metadata.eventAlertId': { $nin: seenIds } },
    { deletedAt: new Date(), deletedBy: userId, updatedBy: userId }
  );
}
