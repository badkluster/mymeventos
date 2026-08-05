import { describe, expect, it } from 'vitest';
import { civilDateTimeInput } from '../src/utils/argentina-date';

describe('civilDateTimeInput', () => {
  it('anchors a naive datetime-local value to Argentina time (UTC-3)', () => {
    expect(civilDateTimeInput('2026-10-12T22:00')).toBe('2026-10-12T22:00-03:00');
    expect(new Date(civilDateTimeInput('2026-10-12T22:00') as string).toISOString()).toBe('2026-10-13T01:00:00.000Z');
  });

  it('leaves values that already carry an explicit offset or Z untouched', () => {
    expect(civilDateTimeInput('2026-10-12T22:00:00.000Z')).toBe('2026-10-12T22:00:00.000Z');
    expect(civilDateTimeInput('2026-10-12T22:00:00-03:00')).toBe('2026-10-12T22:00:00-03:00');
  });

  it('leaves non-string and date-only values untouched', () => {
    expect(civilDateTimeInput(undefined)).toBeUndefined();
    expect(civilDateTimeInput('2026-10-12')).toBe('2026-10-12');
  });
});
