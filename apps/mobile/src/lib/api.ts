import { loadTokens, saveTokens, clearTokens } from './secureStorage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';

type ApiEnvelope<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

export class ApiClientError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let refreshPromise: Promise<void> | null = null;
let unauthorizedHandler: (() => void) | null = null;

// Called once by the auth store on boot so this module can force a logout when a
// refresh ultimately fails (refresh token expired/revoked), without the api module
// depending on the store directly (would create a circular import).
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<{ response: Response; payload: ApiEnvelope<T> }> {
  const tokens = await loadTokens();
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({
    success: false,
    error: { code: 'NETWORK_ERROR', message: 'No se pudo completar la solicitud. Revisá tu conexión.' }
  }))) as ApiEnvelope<T>;
  return { response, payload };
}

async function refreshSessionOnce(): Promise<void> {
  refreshPromise ??= (async () => {
    const tokens = await loadTokens();
    if (!tokens) throw new ApiClientError('UNAUTHENTICATED', 'La sesión expiró. Iniciá sesión nuevamente.');
    const { response, payload } = await rawRequest<{ accessToken: string; refreshToken: string }>('/mobile/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: tokens.refreshToken })
    });
    if (!response.ok || !payload.success || !payload.data) {
      throw new ApiClientError(payload.error?.code ?? 'UNAUTHENTICATED', payload.error?.message ?? 'La sesión expiró. Iniciá sesión nuevamente.');
    }
    await saveTokens(payload.data);
  })().finally(() => {
    refreshPromise = null;
  });
  await refreshPromise;
}

const noRefreshPaths = new Set(['/mobile/auth/login', '/mobile/auth/refresh', '/mobile/auth/logout', '/mobile/auth/forgot-password', '/mobile/auth/reset-password']);

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const { response, payload } = await rawRequest<T>(path, init);
  if (response.status === 401 && payload.error?.code === 'UNAUTHENTICATED' && !retried && !noRefreshPaths.has(path)) {
    try {
      await refreshSessionOnce();
    } catch (error) {
      await clearTokens();
      unauthorizedHandler?.();
      throw error;
    }
    return request<T>(path, init, true);
  }
  if (!response.ok || !payload.success) {
    throw new ApiClientError(payload.error?.code ?? 'NETWORK_ERROR', payload.error?.message ?? 'No se pudo completar la solicitud.');
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, body: FormData): Promise<T> => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' })
};
