const CIVIL_DATE_PATTERN = /T00:00:00(?:\.000)?Z$/;

/**
 * Formats a calendar-date value (event date, due date, payment window, etc.) for display.
 * Records with no meaningful time-of-day are normalized backend-side to UTC midnight
 * (see apps/api/src/utils/argentina-date.ts#civilDateInput) so their intended civil day is
 * exactly what the UTC date part says — running that through any timezone conversion
 * (including the browser's local one, which `Intl.DateTimeFormat` uses by default) can roll
 * it back to the previous day. Real timestamps (createdAt, paidAt, etc.) still carry a
 * meaningful time-of-day and are localized to Argentina, the only timezone this business
 * operates in.
 */
export function formatCivilDate(value: unknown, fallback = 'Sin fecha', dateStyle: 'long' | 'medium' | 'short' = 'long'): string {
  if (typeof value !== 'string' || !value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const isCivilDate = value.length === 10 || CIVIL_DATE_PATTERN.test(value);
  return new Intl.DateTimeFormat('es-AR', { dateStyle, timeZone: isCivilDate ? 'UTC' : 'America/Argentina/Buenos_Aires' }).format(date);
}
