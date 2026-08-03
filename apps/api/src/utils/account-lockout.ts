import { User } from '../modules/users/user.model';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60_000;

/**
 * Both the web and mobile login routes already read `lockedUntil` to reject a locked account and
 * clear it (along with failedLoginAttempts) on a successful login — but neither ever SET
 * lockedUntil after repeated failures, so the counter grew forever without any real lockout
 * consequence. This completes that half. Shared between apps/api/src/modules/auth/auth.routes.ts
 * and apps/api/src/modules/mobile/mobile-auth.routes.ts since both mutate the same User fields.
 */
export async function registerFailedLoginAttempt(userId: string): Promise<void> {
  const updated: any = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginAttempts: 1 } },
    { new: true }
  ).select('failedLoginAttempts').lean();
  if (updated && Number(updated.failedLoginAttempts ?? 0) >= MAX_FAILED_LOGIN_ATTEMPTS) {
    await User.updateOne({ _id: userId }, { $set: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) } });
  }
}
