import { connectDatabase, disconnectDatabase } from '../db/connection';
import { dropLegacyInvitationEventIdIndex } from '../modules/invitations/invitation.models';

async function run(): Promise<void> {
  await connectDatabase();
  await dropLegacyInvitationEventIdIndex();
}

run()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
