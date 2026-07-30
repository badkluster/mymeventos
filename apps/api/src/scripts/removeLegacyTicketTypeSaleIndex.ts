import { connectDatabase, disconnectDatabase } from '../db/connection';
import { dropLegacyTicketTypeSaleIndex } from '../modules/tickets/ticket.models';

async function run(): Promise<void> {
  await connectDatabase();
  await dropLegacyTicketTypeSaleIndex();
}

run()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
