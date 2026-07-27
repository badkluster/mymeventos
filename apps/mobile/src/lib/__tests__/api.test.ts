jest.mock('../secureStorage', () => ({
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn()
}));

import * as secureStorage from '../secureStorage';
import { api, ApiClientError, setUnauthorizedHandler } from '../api';

const loadTokens = secureStorage.loadTokens as jest.Mock;
const saveTokens = secureStorage.saveTokens as jest.Mock;
const clearTokens = secureStorage.clearTokens as jest.Mock;

const mockTokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

describe('mobile api client', () => {
  beforeEach(() => {
    loadTokens.mockReset().mockResolvedValue(mockTokens);
    saveTokens.mockReset().mockResolvedValue(undefined);
    clearTokens.mockReset().mockResolvedValue(undefined);
  });

  it('attaches the bearer token and returns data on success', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { ok: true } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await api.get<{ ok: boolean }>('/mobile/attendance/status');

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('sends multipart uploads without converting the form to JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, { success: true, data: { asset: { url: 'https://cdn.example/avatar.jpg' } } }));
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const form = new FormData();
    form.append('context', 'users');

    await api.postForm('/uploads', form);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    timeoutSpy.mockRestore();
  });

  it('omits the JSON Content-Type when React Native passes a native multipart body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, { success: true, data: { asset: { url: 'https://cdn.example/avatar.jpg' } } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const nativeFormData = { append: jest.fn() } as unknown as FormData;

    await api.postForm('/uploads', nativeFormData);

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('returns a useful error when a multipart upload cannot reach the API', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const form = new FormData();
    form.append('context', 'users');

    await expect(api.postForm('/uploads', form)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar para completar la solicitud. Verificá tu conexión e intentá nuevamente.'
    });
  });

  it('uses the native multipart transport for React Native file descriptors', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('fetch must not be used for the upload'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const requests: Array<{
      open: jest.Mock;
      setRequestHeader: jest.Mock;
      send: jest.Mock;
      status: number;
      responseText: string;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      abort: jest.Mock;
    }> = [];
    const globalWithXhr = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
    const originalXhr = globalWithXhr.XMLHttpRequest;

    class NativeXmlHttpRequestMock {
      open = jest.fn();
      setRequestHeader = jest.fn();
      send = jest.fn(() => this.onload?.());
      abort = jest.fn();
      status = 201;
      responseText = JSON.stringify({ success: true, data: { asset: { url: 'https://cdn.example/avatar.jpg' } } });
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      constructor() {
        requests.push(this);
      }
    }

    globalWithXhr.XMLHttpRequest = NativeXmlHttpRequestMock as unknown as typeof XMLHttpRequest;
    try {
      const nativeFormData = { append: jest.fn() } as unknown as FormData;
      const result = await api.postForm<{ asset: { url: string } }>('/uploads', nativeFormData);

      expect(result).toEqual({ asset: { url: 'https://cdn.example/avatar.jpg' } });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(requests[0].open).toHaveBeenCalledWith('POST', 'http://localhost:3001/api/uploads');
      expect(requests[0].setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer access-1');
      expect(requests[0].send).toHaveBeenCalledWith(nativeFormData);
    } finally {
      if (originalXhr) globalWithXhr.XMLHttpRequest = originalXhr;
      else delete (globalWithXhr as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    }
  });

  it('refreshes the session once and retries on a 401 UNAUTHENTICATED, then succeeds', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { accessToken: 'access-2', refreshToken: 'refresh-2' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: true } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await api.get<{ ok: boolean }>('/mobile/attendance/status');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(saveTokens).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('shares a single refresh call across concurrent requests that both 401 at the same time', async () => {
    let refreshCalls = 0;
    let tokenIsStale = true;
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/mobile/auth/refresh')) {
        refreshCalls += 1;
        tokenIsStale = false;
        return jsonResponse(200, { success: true, data: { accessToken: 'access-2', refreshToken: 'refresh-2' } });
      }
      if (tokenIsStale) return jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } });
      return jsonResponse(200, { success: true, data: { ok: true } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = api.get('/mobile/attendance/status');
    const second = api.get('/mobile/attendance/history');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(refreshCalls).toBe(1);
    expect(firstResult).toEqual({ ok: true });
    expect(secondResult).toEqual({ ok: true });
  });

  it('clears tokens and calls the unauthorized handler when refresh itself fails', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'refresh token revoked' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.get('/mobile/attendance/status')).rejects.toBeInstanceOf(ApiClientError);
    expect(clearTokens).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });
});
