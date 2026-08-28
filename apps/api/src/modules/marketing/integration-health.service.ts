import { IntegrationHealth } from './integration-health.models';

export type IntegrationProvider = 'meta_capi' | 'meta_ads' | 'google_ads' | 'instagram' | 'facebook' | 'tiktok' | 'tiktok_ads' | 'youtube' | 'google_business' | 'ga4' | 'search_console' | 'whatsapp';

type FailureInput = {
  code: string;
  message: string;
  statusCode?: number;
  context?: Record<string, unknown>;
};

function sanitizeMessage(message: string) {
  return message.replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]').slice(0, 500);
}

export async function markIntegrationSuccess(provider: IntegrationProvider, context?: Record<string, unknown>) {
  try {
    await IntegrationHealth.findOneAndUpdate(
      { provider },
      {
        $set: {
          status: 'connected',
          lastSuccessAt: new Date(),
          consecutiveFailures: 0,
          ...(context ? { lastContext: context } : {}),
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: 'integration_health_success_write_failed', provider, errorName: error instanceof Error ? error.name : 'UnknownError' }));
  }
}

export async function markIntegrationFailure(provider: IntegrationProvider, input: FailureInput) {
  try {
    const current = await IntegrationHealth.findOne({ provider }).select('consecutiveFailures').lean() as { consecutiveFailures?: number } | null;
    const consecutiveFailures = Number(current?.consecutiveFailures ?? 0) + 1;
    await IntegrationHealth.findOneAndUpdate(
      { provider },
      {
        $set: {
          status: consecutiveFailures >= 3 ? 'error' : 'degraded',
          lastFailureAt: new Date(),
          consecutiveFailures,
          lastErrorCode: input.code.slice(0, 120),
          lastErrorMessage: sanitizeMessage(input.message),
          ...(input.statusCode ? { lastStatusCode: input.statusCode } : {}),
          ...(input.context ? { lastContext: input.context } : {}),
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: 'integration_health_failure_write_failed', provider, errorName: error instanceof Error ? error.name : 'UnknownError' }));
  }
}

export async function getIntegrationHealth() {
  const rows = await IntegrationHealth.find({}).sort({ updatedAt: -1 }).lean();
  return rows.map((item: any) => ({
    provider: item.provider,
    status: item.status,
    lastSuccessAt: item.lastSuccessAt ?? null,
    lastFailureAt: item.lastFailureAt ?? null,
    consecutiveFailures: Number(item.consecutiveFailures ?? 0),
    lastErrorCode: item.lastErrorCode ?? null,
    lastErrorMessage: item.lastErrorMessage ?? null,
    lastStatusCode: item.lastStatusCode ?? null,
    lastContext: item.lastContext ?? null,
    updatedAt: item.updatedAt ?? null,
  }));
}
