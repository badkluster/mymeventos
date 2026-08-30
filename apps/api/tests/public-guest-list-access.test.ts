import { describe, expect, it } from 'vitest';
import { publicGuestListAccess } from '../src/modules/crm/public-guest-list-access';

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
