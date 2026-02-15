import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '~/routes/api.system.performance';

describe('api.system.performance loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns node process cpu and memory metrics when available', async () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100,
      heapTotal: 200,
      heapUsed: 150,
      external: 50,
      arrayBuffers: 10,
    });
    vi.spyOn(process, 'cpuUsage').mockReturnValue({
      user: 111,
      system: 222,
    });

    const response = await loader();
    const payload = (await response.json()) as any;

    expect(payload.available).toBe(true);
    expect(payload.memory.rss).toBe(100);
    expect(payload.cpu.user).toBe(111);
    expect(payload.cpu.system).toBe(222);
    expect(typeof payload.timestamp).toBe('number');
  });

  it('returns unavailable when process metrics are not present', async () => {
    const originalProcess = globalThis.process;
    Object.defineProperty(globalThis, 'process', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const response = await loader();
      const payload = (await response.json()) as any;

      expect(payload.available).toBe(false);
      expect(payload.reason).toContain('unavailable');
    } finally {
      Object.defineProperty(globalThis, 'process', {
        value: originalProcess,
        configurable: true,
        writable: true,
      });
    }
  });

  it('returns unavailable (200) when cpuUsage throws in the runtime', async () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100,
      heapTotal: 200,
      heapUsed: 150,
      external: 50,
      arrayBuffers: 10,
    });
    vi.spyOn(process, 'cpuUsage').mockImplementation(() => {
      throw new Error('process.cpuUsage is not implemented yet!');
    });

    const response = await loader();
    const payload = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(payload.available).toBe(false);
    expect(payload.reason).toContain('cpuUsage');
  });
});
