import { addDaysToDateKey, argentinaMidnight, dueDateKey } from '../../utils/argentina-date';

export const PUBLIC_GUEST_LIST_CLOSE_DAYS_BEFORE_EVENT = 15;

export type PublicGuestListAccess = {
  editable: boolean;
  deadline?: Date;
  deadlineDate?: string;
};

/**
 * The guest-list deadline is the start of the Argentina civil day that is 15
 * days before the event. The public route is the sole enforcement point; the
 * backoffice keeps its normal event-editing permissions after this cutoff.
 */
export function publicGuestListAccess(eventDate: unknown, now = new Date()): PublicGuestListAccess {
  const eventDateKey = dueDateKey(eventDate);
  if (!eventDateKey) return { editable: false };
  const deadlineDate = addDaysToDateKey(eventDateKey, -PUBLIC_GUEST_LIST_CLOSE_DAYS_BEFORE_EVENT);
  const deadline = argentinaMidnight(deadlineDate);
  return { editable: now.getTime() < deadline.getTime(), deadline, deadlineDate };
}

export function publicGuestListAccessPayload(access: PublicGuestListAccess) {
  return { editable: access.editable, deadline: access.deadline?.toISOString(), deadlineDate: access.deadlineDate };
}
