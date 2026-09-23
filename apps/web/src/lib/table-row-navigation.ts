/**
 * Prevents a clickable table row from also handling interactions with controls
 * embedded in that row, such as action buttons and detail links.
 */
export function isInteractiveTableRowTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="button"]'));
}
