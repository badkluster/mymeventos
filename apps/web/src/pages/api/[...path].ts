import type {} from '../../../../api/src/types/express';

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  const path = Array.isArray(request.query.path) ? request.query.path.join('/') : request.query.path;

  // Keep liveness independent from MongoDB so infrastructure checks can distinguish a
  // healthy function runtime from a temporarily unavailable database.
  if (path === 'health' || path === 'health/live') {
    return response.status(200).json({
      status: 'ok',
      service: 'mymeventos-backend',
      region: process.env.VERCEL_REGION ?? null,
    });
  }

  try {
    const [{ default: app }, database] = await Promise.all([
      import('../../../../api/src/app'),
      import('../../../../api/src/db/connection'),
    ]);

    if (path === 'health/ready') {
      const databasePingMs = await database.pingDatabase();
      response.setHeader('Server-Timing', `db;dur=${databasePingMs}`);
      return response.status(200).json({ status: 'ready', service: 'mymeventos-backend', databasePingMs });
    }

    const connection = await database.connectDatabase();
    response.setHeader('Server-Timing', `dbconnect;dur=${connection.elapsedMs}`);
    response.setHeader('X-MYM-DB-Reused', connection.reused ? '1' : '0');
    return app(request, response);
  } catch (error) {
    const { isDatabaseUnavailableError } = await import('../../../../api/src/db/connection');
    const databaseUnavailable = isDatabaseUnavailableError(error);
    console.error('[api/[...path]] request failed', {
      method: request.method,
      url: request.url,
      databaseUnavailable,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(databaseUnavailable ? 503 : 500).json({
      success: false,
      error: {
        code: databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'API_RUNTIME_ERROR',
        message: databaseUnavailable ? 'La base de datos no está disponible temporalmente.' : 'No se pudo inicializar la API.',
      },
    });
  }
}
