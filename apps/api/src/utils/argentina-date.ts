export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Returns the civil day in Argentina. Financial due dates are date-only values,
 * so all reminder comparisons deliberately happen on these keys rather than on
 * elapsed 24-hour windows in the server's time zone.
 */
export function argentinaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

/**
 * Normalizes an HTML calendar-date value before it is coerced to a Date. Event dates
 * have no time component, so preserving the YYYY-MM-DD part avoids a browser offset
 * silently moving the event to the following day.
 */
export function civilDateInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match && isDateKey(match[1]) ? `${match[1]}T00:00:00.000Z` : value;
}

const NAIVE_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

/**
 * Normalizes a naive "YYYY-MM-DDTHH:MM" value (e.g. from an HTML datetime-local input) as
 * Argentina wall-clock time before it is coerced to a Date. Without an explicit offset, the
 * Date constructor parses these as local time of whatever machine runs the code — the user's
 * browser for client-side code, but the server's own time zone (UTC in production) here — so
 * the same value resolves to a different instant depending on where it gets parsed.
 */
export function civilDateTimeInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return NAIVE_DATETIME_PATTERN.test(value) ? `${value}-03:00` : value;
}

export function addDaysToDateKey(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Midnight in Argentina expressed as an instant. Argentina currently has no DST. */
export function argentinaMidnight(value: string): Date {
  return new Date(`${value}T03:00:00.000Z`);
}

/** Parses a naive datetime-local value as Argentina wall-clock time — see civilDateTimeInput. */
export function argentinaDateTime(value: string): Date {
  return new Date(civilDateTimeInput(value) as string);
}

export function daysBetweenDateKeys(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

/** Extracts the intended calendar date from either an HTML date value or a Date. */
export function dueDateKey(value: unknown): string | undefined {
  if (typeof value === 'string' && isDateKey(value.slice(0, 10))) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}
