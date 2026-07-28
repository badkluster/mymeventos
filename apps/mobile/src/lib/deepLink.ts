const scheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? 'mymeventos';

export type PasswordResetDeepLink = { token: string; username?: string };

export function getPasswordResetFromUrl(url: string): PasswordResetDeepLink | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.hostname !== 'reset-password') return undefined;
    const token = parsed.searchParams.get('token')?.trim();
    if (!token) return undefined;
    const username = parsed.searchParams.get('username')?.trim();
    return { token, username: username || undefined };
  } catch {
    return undefined;
  }
}

export function getPasswordResetTokenFromUrl(url: string): string | undefined {
  return getPasswordResetFromUrl(url)?.token;
}
