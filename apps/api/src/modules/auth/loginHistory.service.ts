import type { Request } from 'express';
import { LoginHistory, type LoginChannel, type LoginPlatform } from './loginHistory.model';

type LoginDeviceMetadata = {
  installationId?: string;
  deviceModel?: string;
  deviceName?: string;
  manufacturer?: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  appBuildVersion?: string;
  applicationId?: string;
};

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || undefined;
}

function requestIp(request: Request): string | undefined {
  return firstHeaderValue(request.headers['x-forwarded-for'])
    ?? firstHeaderValue(request.headers['x-real-ip'])
    ?? request.ip
    ?? undefined;
}

function clipped(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

export async function recordSuccessfulLogin(
  request: Request,
  user: any,
  options: { channel: LoginChannel; platform: LoginPlatform; device?: LoginDeviceMetadata }
): Promise<void> {
  try {
    await LoginHistory.create({
      userId: user._id,
      username: clipped(user.username, 120) ?? user._id.toString(),
      fullName: clipped(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '), 220),
      email: clipped(user.email ?? user.normalizedEmail, 220),
      roles: Array.isArray(user.roles) ? user.roles.map(String) : [],
      channel: options.channel,
      platform: options.platform,
      ipAddress: clipped(requestIp(request), 128),
      userAgent: clipped(request.get('user-agent'), 1_000),
      requestId: clipped(request.get('x-vercel-id') ?? request.get('x-request-id'), 220),
      installationId: clipped(options.device?.installationId, 220),
      deviceModel: clipped(options.device?.deviceModel, 220),
      deviceName: clipped(options.device?.deviceName, 220),
      manufacturer: clipped(options.device?.manufacturer, 120),
      osName: clipped(options.device?.osName, 120),
      osVersion: clipped(options.device?.osVersion, 120),
      appVersion: clipped(options.device?.appVersion, 80),
      appBuildVersion: clipped(options.device?.appBuildVersion, 80),
      applicationId: clipped(options.device?.applicationId, 220),
    });
  } catch (error) {
    // Authentication must not fail only because the secondary history write failed.
    console.error(JSON.stringify({
      event: 'login_history_write_failed',
      userId: user?._id?.toString?.() ?? null,
      channel: options.channel,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
  }
}
