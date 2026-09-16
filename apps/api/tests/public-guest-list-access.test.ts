import { describe, expect, it } from 'vitest';
import { publicGuestListAccess } from '../src/modules/crm/public-guest-list-access';
import { guestListSchema } from '../src/modules/crm/guest-list.schema';

describe('public guest-list access deadline', () => {
  it('closes public editing at the start of the Argentina day 15 days before the event', () => {
    const eventDate = '2026-09-20T00:00:00.000Z';

    const beforeCutoff = publicGuestListAccess(eventDate, new Date('2026-09-05T02:59:59.000Z'));
    const atCutoff = publicGuestListAccess(eventDate, new Date('2026-09-05T03:00:00.000Z'));

    expect(beforeCutoff).toMatchObject({ editable: true, deadlineDate: '2026-09-05' });
    expect(atCutoff).toMatchObject({ editable: false, deadlineDate: '2026-09-05' });
  });

  it('does not allow public edits when the event has no valid date', () => {
    expect(publicGuestListAccess(undefined)).toEqual({ editable: false });
  });
});

describe('guest-list payload limits', () => {
  it('accepts the 100 default tables generated for a 1000-person event', () => {
    const tables = Array.from({ length: 100 }, (_, index) => ({ id: `mesa-${index + 1}`, name: `Mesa ${index + 1}`, capacity: 10 }));
    expect(guestListSchema.safeParse({ tables, guests: [] }).success).toBe(true);
    expect(guestListSchema.safeParse({ tables: [...tables, { name: 'Mesa 101' }], guests: [] }).success).toBe(false);
  });
});
