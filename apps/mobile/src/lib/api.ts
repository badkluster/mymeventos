import { loadTokens, saveTokens, clearTokens } from './secureStorage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 60_000;

type ApiEnvelope<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type ApiRequestInit = RequestInit & { timeoutMs?: number; multipart?: boolean };
type MultipartResponse<T> = { status: number; payload: ApiEnvelope<T> };

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

async function rawRequest<T>(path: string, init?: ApiRequestInit): Promise<{ response: Response; payload: ApiEnvelope<T> }> {
  const tokens = await loadTokens();
  const { timeoutMs = REQUEST_TIMEOUT_MS, multipart = false, ...fetchInit } = init ?? {};
  // React Native's native FormData implementation is not always recognized by
  // `instanceof FormData` under the new architecture. Multipart requests must
  // never receive a JSON Content-Type header: native fetch generates its own
  // boundary only when that header is omitted.
  const isFormData = multipart || fetchInit.body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...fetchInit,
      signal: fetchInit.signal ?? controller.signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
        ...fetchInit.headers
      }
    });
  } catch (error) {
    if (controller.signal.aborted) throw new ApiClientError('NETWORK_TIMEOUT', 'La conexión tardó demasiado. Verificá que la API esté disponible.');
    throw new ApiClientError('NETWORK_ERROR', 'No se pudo conectar para completar la solicitud. Verificá tu conexión e intentá nuevamente.');
  } finally {
    clearTimeout(timeout);
  }
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

async function request<T>(path: string, init?: ApiRequestInit, retried = false): Promise<T> {
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

function multipartPayload<T>(responseText: string): ApiEnvelope<T> {
  try {
    return JSON.parse(responseText) as ApiEnvelope<T>;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK_ERROR', message: 'No se pudo completar la solicitud. Revisá tu conexión.' }
    };
  }
}

/**
 * React Native's XMLHttpRequest is the native multipart transport. In particular,
 * it understands the `{ uri, name, type }` file descriptor returned by
 * expo-image-picker. The Expo fetch implementation can reject that body before
 * opening a connection, which leaves no trace in the API logs.
 */
async function nativeMultipartRequest<T>(path: string, body: FormData): Promise<MultipartResponse<T>> {
  const tokens = await loadTokens();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (callback: () => void) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      callback();
    };
    const networkError = () => finish(() => reject(new ApiClientError(
      'NETWORK_ERROR',
      'No se pudo conectar para completar la solicitud. Verificá tu conexión e intentá nuevamente.'
    )));

    try {
      xhr.open('POST', `${baseUrl}${path}`);
      // Do not set Content-Type here. React Native adds the multipart boundary.
      if (tokens) xhr.setRequestHeader('Authorization', `Bearer ${tokens.accessToken}`);
      xhr.onload = () => finish(() => resolve({ status: xhr.status, payload: multipartPayload<T>(xhr.responseText) }));
      xhr.onerror = networkError;
      xhr.onabort = networkError;
      timeout = setTimeout(() => finish(() => {
        xhr.abort();
        reject(new ApiClientError('NETWORK_TIMEOUT', 'La carga tardó demasiado. Verificá tu conexión e intentá nuevamente.'));
      }), UPLOAD_TIMEOUT_MS);
      xhr.send(body);
    } catch {
      networkError();
    }
  });
}

async function postForm<T>(path: string, body: FormData, retried = false): Promise<T> {
  // XMLHttpRequest exists in React Native and is purpose-built for its FormData
  // file descriptors. Keep the fetch fallback for Jest and any non-native runtime.
  if (typeof XMLHttpRequest === 'undefined') {
    return request<T>(path, { method: 'POST', body, multipart: true, timeoutMs: UPLOAD_TIMEOUT_MS }, retried);
  }

  const { status, payload } = await nativeMultipartRequest<T>(path, body);
  if (status === 401 && payload.error?.code === 'UNAUTHENTICATED' && !retried && !noRefreshPaths.has(path)) {
    try {
      await refreshSessionOnce();
    } catch (error) {
      await clearTokens();
      unauthorizedHandler?.();
      throw error;
    }
    return postForm<T>(path, body, true);
  }
  if (status < 200 || status >= 300 || !payload.success) {
    throw new ApiClientError(payload.error?.code ?? 'NETWORK_ERROR', payload.error?.message ?? 'No se pudo completar la solicitud.');
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, body: FormData): Promise<T> => postForm<T>(path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' })
};
