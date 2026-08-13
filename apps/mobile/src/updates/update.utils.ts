import {
  STORE_REMINDER_DELAY_MS,
  UPDATE_CHECK_MIN_INTERVAL_MS
} from './update.constants';

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'operación'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} excedió el tiempo de espera`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function compareSemanticVersions(left: string, right: string): number {
  const normalize = (value: string): number[] =>
    String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('+')[0]
      .split('-')[0]
      .split('.')
      .map((part) => (Number.isFinite(Number(part)) ? Number(part) : 0));

  const a = normalize(left);
  const b = normalize(right);
  const length = Math.max(a.length, b.length, 3);

  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  return compareSemanticVersions(candidate, installed) > 0;
}

export function shouldCheckOnAppStateChange(
  previousState: string,
  nextState: string
): boolean {
  return (
    (previousState === 'background' || previousState === 'inactive') &&
    nextState === 'active'
  );
}

export function shouldRunUpdateCheck(
  lastCheckAt: number,
  now = Date.now()
): boolean {
  const last = Number(lastCheckAt || 0);
  return !Number.isFinite(last) || now - last >= UPDATE_CHECK_MIN_INTERVAL_MS;
}

export function shouldRemindForStoreVersion(
  dismissedVersion: string | null,
  dismissedAt: number,
  candidateVersion: string,
  now = Date.now()
): boolean {
  if (!candidateVersion || dismissedVersion !== candidateVersion) return true;
  return now - Number(dismissedAt || 0) >= STORE_REMINDER_DELAY_MS;
}
