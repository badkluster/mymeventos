import app from '../src/app';
import { connectDatabase } from '../src/db/connection';

export default async function handler(request: any, response: any) {
  await connectDatabase();
  return app(request, response);
}
