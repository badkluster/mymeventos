/// <reference path="../../../../api/src/types/express.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import app from '../../../../api/src/app';
import { connectDatabase } from '../../../../api/src/db/connection';

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await connectDatabase();
  return app(request, response);
}
