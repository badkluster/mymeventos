const mockMemoryStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockMemoryStore.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockMemoryStore.set(key, value); },
  removeItem: async (key: string) => { mockMemoryStore.delete(key); }
}));

import { enqueuePunch, getQueue, removeFromQueue } from '../offlineQueue';

describe('offlineQueue', () => {
  it('starts empty', async () => {
    expect(await getQueue()).toEqual([]);
  });

  it('enqueues a punch and can read it back', async () => {
    await enqueuePunch({ requestId: 'req-1', kind: 'check-in', payload: { foo: 'bar' } });
    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ requestId: 'req-1', kind: 'check-in', payload: { foo: 'bar' } });
    expect(typeof queue[0].queuedAt).toBe('string');
  });

  it('preserves FIFO order across multiple enqueued punches', async () => {
    await enqueuePunch({ requestId: 'req-2', kind: 'check-out', payload: {} });
    const queue = await getQueue();
    expect(queue.map((item) => item.requestId)).toEqual(['req-1', 'req-2']);
  });

  it('removes a punch by requestId without touching the others', async () => {
    await removeFromQueue('req-1');
    const queue = await getQueue();
    expect(queue.map((item) => item.requestId)).toEqual(['req-2']);
  });

  it('removing a requestId that is not queued is a no-op', async () => {
    await removeFromQueue('does-not-exist');
    const queue = await getQueue();
    expect(queue).toHaveLength(1);
  });
});
