export function isCalendarItemOwner(item: any, userId: string): boolean {
  return Boolean(item?.createdBy && item.createdBy.toString() === userId);
}
