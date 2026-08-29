const CIVIL_DATE_PATTERN = /T00:00:00(?:\.000)?Z$/;

const argentinaCivilParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Returns the intended YYYY-MM-DD for a stored civil date, including legacy timed values. */
export function civilDateKey(value: unknown): string | undefined {
  if (typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(value) || CIVIL_DATE_PATTERN.test(value))) return value.slice(0, 10);
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const parts = Object.fromEntries(argentinaCivilParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Parses a YYYY-MM-DD value as a local calendar date without timezone rollback. */
export function parseCivilDateKey(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return undefined;
  return date;
}

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
