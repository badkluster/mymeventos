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
