import { describe, expect, it } from 'vitest';
import { isCalendarItemOwner } from '../src/modules/crm/calendar-item-access';

describe('calendar item ownership', () => {
  it('allows mutations only to the creator', () => {
    const item = { createdBy: { toString: () => 'user-a' } };
    expect(isCalendarItemOwner(item, 'user-a')).toBe(true);
    expect(isCalendarItemOwner(item, 'user-b')).toBe(false);
  });

  it('does not treat missing ownership as editable', () => {
    expect(isCalendarItemOwner({}, 'user-a')).toBe(false);
  });
});
