import app from '../apps/api/src/app';
import { connectDatabase } from '../apps/api/src/db/connection';

export default async function handler(request: any, response: any) {
  await connectDatabase();
  return app(request, response);
}
