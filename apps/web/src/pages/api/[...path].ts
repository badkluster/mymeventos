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
  if (path === 'health') return response.status(200).json({ status: 'ok', service: 'mymeventos-backend' });

  try {
    const [{ default: app }, { connectDatabase }] = await Promise.all([
      import('../../../../api/src/app'),
      import('../../../../api/src/db/connection'),
    ]);
    await connectDatabase();
    return app(request, response);
  } catch (error) {
    console.error('[api/[...path]] request failed', {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return response.status(500).json({
      success: false,
      error: {
        code: 'API_RUNTIME_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo inicializar la API.',
      },
    });
  }
}
