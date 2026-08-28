const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');
type ApiEnvelope<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
export class ApiClientError extends Error { constructor(public code: string, message: string) { super(message); } }
let refreshPromise: Promise<unknown> | null = null;
const minimumPerformanceLoaderMs = 650;
async function rawRequest<T>(path: string, init?: RequestInit): Promise<{ response: Response; payload: ApiEnvelope<T> }> { const isFormData = init?.body instanceof FormData; const response = await fetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } }); const payload = await response.json().catch(() => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'No se pudo completar la solicitud.' } })) as ApiEnvelope<T>; return { response, payload }; }
async function refreshSessionOnce(): Promise<void> { refreshPromise ??= rawRequest('/auth/refresh', { method: 'POST', body: JSON.stringify({}) }).finally(() => { refreshPromise = null; }); const result = await refreshPromise as { response: Response; payload: ApiEnvelope<unknown> }; if (!result.response.ok || !result.payload.success) throw new ApiClientError(result.payload.error?.code ?? 'UNAUTHENTICATED', result.payload.error?.message ?? 'La sesión expiró. Iniciá sesión nuevamente.'); }
async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> { const { response, payload } = await rawRequest<T>(path, init); const canRefresh = !['/auth/login', '/auth/refresh', '/auth/logout', '/auth/logout-all'].includes(path); if (response.status === 401 && payload.error?.code === 'UNAUTHENTICATED' && !retried && canRefresh) { await refreshSessionOnce(); return request<T>(path, init, true); } if (!response.ok || !payload.success) throw new ApiClientError(payload.error?.code ?? 'NETWORK_ERROR', payload.error?.message ?? 'No se pudo completar la solicitud.'); return payload.data as T; }
async function get<T>(path: string): Promise<T> {
  if (!path.startsWith('/marketing/performance/')) return request<T>(path);
  const startedAt = Date.now();
  try {
    return await request<T>(path);
  } finally {
    const remaining = minimumPerformanceLoaderMs - (Date.now() - startedAt);
    if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}
async function download(path: string, retried = false): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  if (response.status === 401 && !retried) {
    await refreshSessionOnce();
    return download(path, true);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as ApiEnvelope<unknown> | undefined;
    throw new ApiClientError(payload?.error?.code ?? 'DOWNLOAD_ERROR', payload?.error?.message ?? 'No se pudo generar el archivo.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] ?? 'reporte';
  return { blob: await response.blob(), filename };
}
export const api = { get, post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }), put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }), patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }), delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }), download };
