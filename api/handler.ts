import app from '../apps/api/src/app';
import { connectDatabase, isDatabaseUnavailableError, pingDatabase } from '../apps/api/src/db/connection';

const dep0169TraceKey = Symbol.for('mymeventos.dep0169TraceInstalled');
const processWithTraceFlag = process as typeof process & { [dep0169TraceKey]?: boolean };
if (!processWithTraceFlag[dep0169TraceKey]) {
  processWithTraceFlag[dep0169TraceKey] = true;
  process.on('warning', (warning) => {
    const warningWithCode = warning as Error & { code?: string };
    if (warningWithCode.code === 'DEP0169') {
      console.error('[DEP0169_TRACE]', warningWithCode.stack ?? warningWithCode.message);
    }
  });
}

function pathnameOf(request: any): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return request.url ?? '/';
  }
}

function runtimeMeta() {
  return {
    service: 'mymeventos-backend',
    region: process.env.VERCEL_REGION ?? null,
    deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}

export default async function handler(request: any, response: any) {
  const startedAt = Date.now();
  const pathname = pathnameOf(request);
  const requestId = request.headers?.['x-vercel-id'] ?? request.headers?.['x-request-id'] ?? null;

  // Liveness must never depend on Atlas. It answers whether the Vercel/Node runtime is alive.
  if (pathname === '/health' || pathname === '/api/health' || pathname === '/health/live' || pathname === '/api/health/live') {
    return response.status(200).json({ status: 'ok', ...runtimeMeta() });
  }

  // Readiness is intentionally DB-backed and gives us an explicit way to distinguish
  // "the function is alive" from "the application can currently talk to Atlas".
  if (pathname === '/health/ready' || pathname === '/api/health/ready') {
    try {
      const databasePingMs = await pingDatabase();
      response.setHeader('Server-Timing', `db;dur=${databasePingMs}`);
      return response.status(200).json({ status: 'ready', databasePingMs, ...runtimeMeta() });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      console.error(JSON.stringify({
        event: 'database_readiness_failed',
        pathname,
        requestId,
        elapsedMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      return response.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible temporalmente.' },
        ...runtimeMeta(),
      });
    }
  }

  try {
    const database = await connectDatabase();
    response.setHeader('Server-Timing', `dbconnect;dur=${database.elapsedMs}`);
    response.setHeader('X-MYM-DB-Reused', database.reused ? '1' : '0');

    if (database.elapsedMs >= 1_000) {
      console.warn(JSON.stringify({
        event: 'slow_database_connection',
        pathname,
        requestId,
        elapsedMs: database.elapsedMs,
        reused: database.reused,
        waitedForExistingConnection: database.waitedForExistingConnection,
        readyState: database.readyState,
      }));
    }

    return app(request, response);
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const unavailable = isDatabaseUnavailableError(error);
    console.error(JSON.stringify({
      event: 'api_bootstrap_failed',
      pathname,
      requestId,
      elapsedMs,
      databaseUnavailable: unavailable,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return response.status(unavailable ? 503 : 500).json({
      success: false,
      error: {
        code: unavailable ? 'DATABASE_UNAVAILABLE' : 'API_RUNTIME_ERROR',
        message: unavailable ? 'La base de datos no está disponible temporalmente.' : 'No se pudo inicializar la API.',
      },
    });
  }
}
