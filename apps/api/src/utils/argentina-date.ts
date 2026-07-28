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

export function addDaysToDateKey(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Midnight in Argentina expressed as an instant. Argentina currently has no DST. */
export function argentinaMidnight(value: string): Date {
  return new Date(`${value}T03:00:00.000Z`);
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
