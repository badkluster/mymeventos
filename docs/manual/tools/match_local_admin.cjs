/*
 * Read-only helper: finds whether one of the locally configured credential
 * candidates matches an active backoffice account. It never prints secrets,
 * hashes, connection strings, or the account identifier.
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const root = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(root, '.env'), override: false });
dotenv.config({ path: path.join(root, 'apps', 'api', '.env'), override: false });

async function main() {
  const candidates = [
    { source: 'RESET_ADMIN_PASSWORD', value: process.env.RESET_ADMIN_PASSWORD },
    { source: 'SEED_ADMIN_PASSWORD', value: process.env.SEED_ADMIN_PASSWORD },
  ].filter((candidate) => candidate.value);

  if (!process.env.MONGODB_URI || candidates.length === 0) {
    process.stdout.write(JSON.stringify({ matched: false }));
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const users = await mongoose.connection.collection('users').find(
    { deletedAt: null, active: { $ne: false }, canAccessBackoffice: { $ne: false } },
    { projection: { username: 1, normalizedEmail: 1, passwordHash: 1, lockedUntil: 1 } },
  ).toArray();

  for (const user of users) {
    if (!user.passwordHash) continue;
    for (const candidate of candidates) {
      if (await bcrypt.compare(candidate.value, user.passwordHash)) {
        const lockedForMs = user.lockedUntil ? Math.max(0, new Date(user.lockedUntil).getTime() - Date.now()) : 0;
        process.stdout.write(JSON.stringify({
          matched: true,
          identifier: user.username || user.normalizedEmail,
          passwordSource: candidate.source,
          lockedForMs,
        }));
        return;
      }
    }
  }

  process.stdout.write(JSON.stringify({ matched: false }));
}

main()
  .catch(() => {
    process.stdout.write(JSON.stringify({ matched: false }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
