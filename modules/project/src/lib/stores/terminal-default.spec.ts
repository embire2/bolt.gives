import { describe, expect, it, vi } from 'vitest';

vi.mock('@bolt/runtime/lib/runtime/hosted-runtime-client', () => ({
  isHostedRuntimeEnabled: () => true,
}));

vi.mock('@bolt/project/utils/shell', () => ({
  newBoltShellProcess: () => ({
    init: vi.fn(),
  }),
  newShellProcess: vi.fn(),
}));

import { TerminalStore } from './terminal';

describe('TerminalStore', () => {
  it('keeps the terminal closed by default so project preview can load first', () => {
    const store = new TerminalStore(Promise.resolve({}) as any);

    expect(store.showTerminal.get()).toBe(false);
  });
});
