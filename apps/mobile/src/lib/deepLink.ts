const scheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? 'mymeventos';

export function getPasswordResetTokenFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.hostname !== 'reset-password') return undefined;
    const token = parsed.searchParams.get('token')?.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}
