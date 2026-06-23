import app from './app';
import { env } from './config/env';
import { connectDatabase } from './db/connection';

async function start(): Promise<void> { try { await connectDatabase(); app.listen(env.PORT, () => console.info(`API listening on port ${env.PORT}`)); } catch (error) { console.error('Unable to start API:', error); process.exit(1); } }
void start();
