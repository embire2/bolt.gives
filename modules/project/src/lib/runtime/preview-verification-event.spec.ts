import { describe, expect, it, vi } from 'vitest';
import { recordPreviewVerification } from './preview-verification-event';

describe('restored Preview verification', () => {
  const ready = {
    status: 'ready' as const,
    healthy: true,
    alert: null,
    recovery: null,
    preview: { port: 5173, baseUrl: 'https://fixture.example/runtime/preview/id/5173', revision: 3 },
  };
  it('requires actual health rather than a restored URL', () => {
    const store = { get: () => [], set: vi.fn() };
    recordPreviewVerification({ ...ready, healthy: false }, store, false);
    recordPreviewVerification(ready, store, true);
    expect(store.set).toHaveBeenLastCalledWith([
      expect.objectContaining({ description: 'Preview health unavailable' }),
    ]);
    recordPreviewVerification(ready, store, false);
    expect(store.set).toHaveBeenLastCalledWith([expect.objectContaining({ description: 'Preview health confirmed' })]);
  });
  it('does not repeat unchanged verification events', () => {
    const store = {
      get: () => [
        {
          type: 'telemetry' as const,
          timestamp: '',
          description: 'Preview health confirmed',
          output: 'port=5173 revision=3',
        },
      ],
      set: vi.fn(),
    };
    recordPreviewVerification(ready, store, false);
    expect(store.set).not.toHaveBeenCalled();
  });
  it('cannot finalize a current generation or overwrite an execution error', () => {
    for (const type of ['step-start', 'error'] as const) {
      const store = { get: () => [{ type, timestamp: '', description: 'Current run' }], set: vi.fn() };
      recordPreviewVerification(ready, store, false);
      expect(store.set).not.toHaveBeenCalled();
    }
  });
});
