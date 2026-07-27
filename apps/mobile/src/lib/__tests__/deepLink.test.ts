import { getPasswordResetTokenFromUrl } from '../deepLink';

describe('password reset deep links', () => {
  it('accepts the configured reset-password URL and extracts its token', () => {
    expect(getPasswordResetTokenFromUrl('mymeventos://reset-password?token=reset-token-123')).toBe('reset-token-123');
  });

  it('rejects unrelated routes, schemes, and malformed URLs', () => {
    expect(getPasswordResetTokenFromUrl('mymeventos://profile?token=reset-token-123')).toBeUndefined();
    expect(getPasswordResetTokenFromUrl('https://reset-password?token=reset-token-123')).toBeUndefined();
    expect(getPasswordResetTokenFromUrl('not a URL')).toBeUndefined();
  });
});
