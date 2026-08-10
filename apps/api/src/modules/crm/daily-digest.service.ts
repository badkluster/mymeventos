import { Role } from '@mym/shared';
import { env } from '../../config/env';
import { CalendarItem, Event } from './crm.models';
import { User } from '../users/user.model';
import { sendEmail } from '../email/email.service';
import { renderBrandedEmail } from '../email/email-template.util';
import { findEventsWithPendingClosure } from '../event-closure/pending-closures';
import { argentinaDateKey, argentinaMidnight, addDaysToDateKey } from '../../utils/argentina-date';

const EVENT_TERMINAL_STATUSES = ['cancelled', 'lost'];
const DIGEST_DETAIL_LIMIT = 5;
// The digest is an aggregate report, not a per-obligation reminder, so it doesn't fit
// reminder-engine.ts's claim-next-item model — it's its own small tick, run once the local
// morning window starts. Idempotency is stored on the user, not as an in-app notification, so a
// delayed or repeated tick within the same day never re-sends the email.
const DIGEST_START_HOUR = 8;

function argentinaHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(date));
}

type DigestSummary = {
  dateKey: string;
  events: any[];
  reminders: any[];
  paymentsDueToday: any[];
  pendingClosures: any[];
};

function relatedName(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return undefined;
  const fullName = String(value.fullName ?? '').trim();
  if (fullName) return fullName;
  const composedName = [value.firstName, value.lastName].filter(Boolean).join(' ').trim();
  if (composedName) return composedName;
  const name = String(value.name ?? '').trim();
  return name || undefined;
}

function truncate(value: unknown, maxLength = 180): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function humanDateKey(dateKey: string): string {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function humanDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(date);
}

function humanTime(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(date);
}

function money(value: unknown): string | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(amount);
}

function statusLabel(status: unknown): string | undefined {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    quoted: 'Presupuestado',
    contract_draft: 'Contrato en borrador',
    deposit_pending: 'Seña pendiente',
    reserved: 'Reservado',
    confirmed: 'Confirmado'
  };
  return labels[String(status ?? '')] ?? truncate(status, 40);
}

function priorityLabel(priority: unknown): string | undefined {
  const labels: Record<string, string> = {
    low: 'baja',
    normal: 'normal',
    high: 'alta',
    critical: 'crítica'
  };
  return labels[String(priority ?? '')];
}

function typeLabel(type: unknown): string | undefined {
  const labels: Record<string, string> = {
    alert: 'Alerta',
    reminder: 'Recordatorio',
    task: 'Tarea',
    meeting: 'Reunión'
  };
  return labels[String(type ?? '')];
}

function eventTitle(event: any): string {
  return String(event?.eventName || event?.eventType || 'Evento sin nombre');
}

function eventLine(event: any): string {
  const timeRange = event?.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ''}`
    : undefined;
  const salon = relatedName(event?.salonId);
  const customer = relatedName(event?.customerId);
  const guests = Number(event?.guestCount) > 0 ? `${Number(event.guestCount)} invitados` : undefined;
  const status = statusLabel(event?.status);
  const details = [timeRange, salon ? `Salón: ${salon}` : undefined, customer ? `Cliente: ${customer}` : undefined, guests, status]
    .filter(Boolean);
  return `${eventTitle(event)}${details.length ? ` — ${details.join(' · ')}` : ''}`;
}

function reminderLine(item: any): string {
  const event = item?.eventId;
  const salon = relatedName(item?.salonId);
  const details = [
    humanTime(item?.startAt),
    typeLabel(item?.type),
    priorityLabel(item?.priority) ? `Prioridad ${priorityLabel(item.priority)}` : undefined,
    event ? `Evento: ${eventTitle(event)}` : undefined,
    salon ? `Salón: ${salon}` : undefined,
    truncate(item?.description)
  ].filter(Boolean);
  return `${item?.title || 'Pendiente sin título'}${details.length ? ` — ${details.join(' · ')}` : ''}`;
}

function paymentLine(item: any): string {
  const event = item?.eventId;
  const salon = relatedName(item?.salonId);
  const pendingAmount = money(item?.metadata?.remainingAmount);
  const details = [
    pendingAmount ? `Pendiente: ${pendingAmount}` : undefined,
    event ? `Evento: ${eventTitle(event)}` : undefined,
    salon ? `Salón: ${salon}` : undefined,
    truncate(item?.description)
  ].filter(Boolean);
  return `${item?.title || 'Pago pendiente'}${details.length ? ` — ${details.join(' · ')}` : ''}`;
}

function closureLine(event: any): string {
  const salon = relatedName(event?.salonId);
  const customer = relatedName(event?.customerId);
  const eventDate = humanDate(event?.eventDate);
  const details = [
    eventDate ? `Evento del ${eventDate}` : undefined,
    salon ? `Salón: ${salon}` : undefined,
    customer ? `Cliente: ${customer}` : undefined
  ].filter(Boolean);
  return `${eventTitle(event)}${details.length ? ` — ${details.join(' · ')}` : ''}`;
}

function detailValue(
  items: any[],
  singular: string,
  plural: string,
  emptyText: string,
  toLine: (item: any) => string
): string {
  if (!items.length) return emptyText;
  const countLabel = `${items.length} ${items.length === 1 ? singular : plural}`;
  const lines = items.slice(0, DIGEST_DETAIL_LIMIT).map((item) => `• ${toLine(item)}`);
  if (items.length > DIGEST_DETAIL_LIMIT) {
    lines.push(`+${items.length - DIGEST_DETAIL_LIMIT} más en el backoffice.`);
  }
  return [countLabel, ...lines].join('\n');
}

function narrative(summary: DigestSummary, scopeLabel: string): string {
  const parts = [
    summary.events.length
      ? `${summary.events.length === 1 ? 'Hay 1 evento programado' : `Hay ${summary.events.length} eventos programados`} para hoy`
      : 'No hay eventos programados para hoy',
    summary.reminders.length
      ? `${summary.reminders.length === 1 ? 'tenés 1 alerta o tarea' : `tenés ${summary.reminders.length} alertas o tareas`} para revisar`
      : 'no hay alertas ni tareas pendientes para hoy',
    summary.paymentsDueToday.length
      ? `${summary.paymentsDueToday.length === 1 ? '1 pago requiere' : `${summary.paymentsDueToday.length} pagos requieren`} atención por vencimiento hoy`
      : 'no hay pagos con vencimiento hoy',
    summary.pendingClosures.length
      ? `${summary.pendingClosures.length === 1 ? 'queda 1 cierre administrativo' : `quedan ${summary.pendingClosures.length} cierres administrativos`} pendiente${summary.pendingClosures.length === 1 ? '' : 's'}`
      : 'no quedan cierres administrativos pendientes'
  ];
  return `Panorama para ${scopeLabel}: ${parts.join('; ')}.`;
}

async function buildDailyDigest(now: Date, salonIds?: string[]): Promise<DigestSummary> {
  const todayKey = argentinaDateKey(now);
  const start = argentinaMidnight(todayKey);
  const end = argentinaMidnight(addDaysToDateKey(todayKey, 1));
  const salonFilter = salonIds?.length ? { salonId: { $in: salonIds } } : {};

  const [events, reminders, paymentsDueToday, allPendingClosures] = await Promise.all([
    Event.find({ deletedAt: null, status: { $nin: EVENT_TERMINAL_STATUSES }, eventDate: { $gte: start, $lt: end }, ...salonFilter })
      .select('_id eventName eventType eventDate startTime endTime guestCount status salonId customerId')
      .populate({ path: 'salonId', select: 'name' })
      .populate({ path: 'customerId', select: 'fullName firstName lastName' })
      .sort({ eventDate: 1, startTime: 1 })
      .lean(),
    CalendarItem.find({ deletedAt: null, status: { $nin: ['done', 'cancelled'] }, type: { $in: ['reminder', 'alert', 'task', 'meeting'] }, startAt: { $gte: start, $lt: end }, ...salonFilter })
      .select('_id type title description startAt priority eventId salonId')
      .populate({ path: 'eventId', select: 'eventName eventType' })
      .populate({ path: 'salonId', select: 'name' })
      .sort({ startAt: 1 })
      .lean(),
    CalendarItem.find({ deletedAt: null, 'metadata.financialReminder': true, 'metadata.dueDateKey': todayKey, 'notification.status': { $ne: 'cancelled' }, ...salonFilter })
      .select('_id title description startAt priority eventId salonId metadata')
      .populate({ path: 'eventId', select: 'eventName eventType' })
      .populate({ path: 'salonId', select: 'name' })
      .sort({ startAt: 1 })
      .lean(),
    findEventsWithPendingClosure(now, 0)
  ]);

  const scopedPendingClosures = salonIds?.length
    ? allPendingClosures.filter((event: any) => salonIds.includes(String(event.salonId)))
    : allPendingClosures;
  const pendingClosures = await Event.populate(scopedPendingClosures, [
    { path: 'salonId', select: 'name' },
    { path: 'customerId', select: 'fullName firstName lastName' }
  ]);

  return { dateKey: todayKey, events, reminders, paymentsDueToday, pendingClosures };
}

function digestContent(summary: DigestSummary, scopeLabel: string): { subject: string; text: string; html: string } {
  const subject = `Resumen del día — ${scopeLabel} (${summary.dateKey})`;
  const intro = narrative(summary, scopeLabel);
  const bulletLines = (label: string, items: any[], toLine: (item: any) => string) => [
    `${label}: ${items.length}`,
    ...items.slice(0, 15).map((item) => `  · ${toLine(item)}`),
    ...(items.length > 15 ? [`  · +${items.length - 15} más en el backoffice.`] : [])
  ];
  const text = [
    intro,
    '',
    ...bulletLines('Eventos de hoy', summary.events, eventLine),
    ...bulletLines('Alertas y tareas de hoy', summary.reminders, reminderLine),
    ...bulletLines('Pagos con vencimiento hoy', summary.paymentsDueToday, paymentLine),
    ...bulletLines('Cierres de evento pendientes', summary.pendingClosures, closureLine)
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: 'Resumen ejecutivo diario',
    heading: `Hoy · ${humanDateKey(summary.dateKey)}`,
    intro,
    rows: [
      [
        'Eventos de hoy',
        detailValue(summary.events, 'evento', 'eventos', 'Sin eventos programados.', eventLine)
      ],
      [
        'Alertas y tareas',
        detailValue(summary.reminders, 'pendiente', 'pendientes', 'Sin alertas ni tareas para hoy.', reminderLine)
      ],
      [
        'Pagos de hoy',
        detailValue(summary.paymentsDueToday, 'pago', 'pagos', 'Sin pagos con vencimiento hoy.', paymentLine)
      ],
      [
        'Cierres pendientes',
        detailValue(summary.pendingClosures, 'cierre', 'cierres', 'Sin cierres administrativos pendientes.', closureLine)
      ]
    ],
    ctaLabel: 'Abrir panel de administración',
    ctaUrl: `${env.CORS_ORIGIN.replace(/\/+$/, '')}/admin/dashboard`,
    footerNote: 'El resumen muestra hasta 5 detalles por categoría. El backoffice conserva el listado completo y actualizado.'
  });
  return { subject, text, html };
}

async function deliverDigestToUser(user: any, summary: DigestSummary, scopeLabel: string): Promise<boolean> {
  const preferences = user.notificationPreferences ?? {};
  const canReceiveEmail = Boolean(user.email) && preferences.email !== false && preferences.emailNotificationsEnabled !== false;
  if (!canReceiveEmail) return false;

  // Atomically claim this user's digest for the day. This is deliberately not a Notification:
  // the daily summary is an email-only delivery and must not appear in the notification center.
  const claim = await User.updateOne(
    { _id: user._id, dailyDigestLastSentDateKey: { $ne: summary.dateKey } },
    { $set: { dailyDigestLastSentDateKey: summary.dateKey } }
  );
  if ((claim.modifiedCount ?? 0) === 0) return false;

  const content = digestContent(summary, scopeLabel);
  await sendEmail({ to: user.email, subject: content.subject, text: content.text, html: content.html })
    .catch((error) => console.error(`Daily digest email failed for user ${user._id}:`, error));
  return true;
}

export async function processDailyDigestTick(now = new Date()): Promise<{ delivered: number; skipped: number; failed: number; hasMore: boolean }> {
  if (argentinaHour(now) < DIGEST_START_HOUR) return { delivered: 0, skipped: 0, failed: 0, hasMore: false };
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const globalSummary = await buildDailyDigest(now);
    const globalUsers = await User.find({ active: true, deletedAt: null, roles: { $in: [Role.ADMIN, Role.MANAGER] } })
      .select('_id email notificationPreferences').lean();
    for (const user of globalUsers) {
      if (await deliverDigestToUser(user, globalSummary, 'Administración')) delivered += 1; else skipped += 1;
    }

    const salonManagers = await User.find({ active: true, deletedAt: null, roles: Role.SALON_MANAGER, managedSalonIds: { $exists: true, $ne: [] } })
      .select('_id email notificationPreferences managedSalonIds').lean();
    for (const manager of salonManagers) {
      const salonIds = (manager.managedSalonIds ?? []).map((id: any) => String(id));
      const summary = await buildDailyDigest(now, salonIds);
      if (await deliverDigestToUser(manager, summary, 'tu salón')) delivered += 1; else skipped += 1;
    }
  } catch (error) {
    failed += 1;
    console.error('Daily digest tick failed:', error);
  }
  return { delivered, skipped, failed, hasMore: false };
}
