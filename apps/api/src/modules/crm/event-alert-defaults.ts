import { argentinaMidnight, addDaysToDateKey, dueDateKey } from '../../utils/argentina-date';

export type DefaultEventAlertItem = {
  id: string;
  title: string;
  remindAt: string;
  channel: 'system';
  status: 'pending';
};

type DefaultAlertTemplate = {
  id: string;
  offsetDays: number; // relative to eventDate; negative = before, positive = after
  title: (context: { customerName: string; eventName: string }) => string;
};

// Hardcoded on purpose, same convention as financial-reminders.service.ts's paymentRules — a
// stable, small rule set for one business process, not something salons configure per event. If
// per-salon customization is ever requested, migrate this to a Mongo collection shaped like
// ProductionRule instead.
const DEFAULT_ALERT_TEMPLATES: DefaultAlertTemplate[] = [
  { id: 'default-guest-list-review', offsetDays: -15, title: () => 'Revisar lista de invitados definitiva' },
  { id: 'default-client-meeting', offsetDays: -10, title: ({ customerName, eventName }) => `Coordinar una reunión con ${customerName} para el evento ${eventName}` },
  { id: 'default-schedule-review', offsetDays: -7, title: () => 'Revisar cronograma del evento con el salón' },
  { id: 'default-guest-count-confirm', offsetDays: -3, title: () => 'Confirmar cantidad final de invitados con producción' },
  { id: 'default-setup-confirm', offsetDays: -1, title: () => 'Confirmar llegada de proveedores y montaje' },
  { id: 'default-closure-start', offsetDays: 2, title: () => 'Iniciar cierre operativo del evento' }
];

const REMINDER_TIME_OFFSET_MS = 9 * 3_600_000; // 09:00 hora de Argentina

/**
 * Alertas por defecto que se agregan (nunca reemplazan) al resourcePlanSnapshot.alerts de un
 * evento recién creado, para que el usuario no tenga que tipear cada una a mano. Se calculan una
 * sola vez, al crear el evento — si no hay eventDate todavía, no se genera nada (no hay fecha
 * contra la cual calcular los offsets).
 */
export function buildDefaultEventAlerts(input: { eventDate: unknown; customerName: string; eventName: string }): DefaultEventAlertItem[] {
  const eventDateKey = dueDateKey(input.eventDate);
  if (!eventDateKey) return [];
  return DEFAULT_ALERT_TEMPLATES.map((template) => {
    const remindKey = addDaysToDateKey(eventDateKey, template.offsetDays);
    const remindAt = new Date(argentinaMidnight(remindKey).getTime() + REMINDER_TIME_OFFSET_MS);
    return {
      id: template.id,
      title: template.title({ customerName: input.customerName || 'el cliente', eventName: input.eventName || 'el evento' }),
      remindAt: remindAt.toISOString(),
      channel: 'system',
      status: 'pending'
    };
  });
}
