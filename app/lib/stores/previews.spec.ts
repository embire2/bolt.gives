import { beforeEach, describe, expect, it, vi } from 'vitest';

const hostedRuntimeMocks = vi.hoisted(() => ({
  isHostedRuntimeEnabled: vi.fn(() => false),
}));

vi.mock('~/lib/runtime/hosted-runtime-client', () => hostedRuntimeMocks);

describe('PreviewsStore', () => {
  beforeEach(() => {
    vi.resetModules();
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(false);
  });

  it('does not initialize browser preview sync channels on hosted runtime instances', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const storageSetItem = vi.fn();
    const storage = {
      getItem: vi.fn(),
      setItem: storageSetItem,
      key: vi.fn(),
      length: 0,
    };
    const broadcastChannel = vi.fn();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: broadcastChannel,
    });

    const previewModule = await import('./previews');

    new previewModule.PreviewsStore(
      Promise.resolve({
        on: vi.fn(),
      }) as any,
    );

    expect(broadcastChannel).not.toHaveBeenCalled();
    expect(globalThis.localStorage.setItem).toBe(storageSetItem);
  });
});
