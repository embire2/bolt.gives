import { describe, expect, it, vi } from 'vitest';
import type { ITerminal } from '~/types/terminal';
import { createDeferredBoltTerminal, TerminalStore } from './terminal';

function createMockTerminal(): ITerminal & {
  writes: string[];
  inputs: string[];
  emitData: (data: string) => void;
  resetCount: number;
} {
  const listeners = new Set<(data: string) => void>();

  return {
    writes: [],
    inputs: [],
    resetCount: 0,
    reset() {
      this.resetCount += 1;
    },
    write(data: string) {
      this.writes.push(data);
    },
    onData(cb: (data: string) => void) {
      listeners.add(cb);
    },
    input(data: string) {
      this.inputs.push(data);
    },
    emitData(data: string) {
      for (const listener of listeners) {
        listener(data);
      }
    },
  };
}

describe('createDeferredBoltTerminal', () => {
  it('buffers shell output before a visible terminal attaches', () => {
    const proxy = createDeferredBoltTerminal();
    const delegate = createMockTerminal();

    proxy.write('booting...\n');
    proxy.write('ready\n');
    proxy.attachDelegate(delegate);

    expect(delegate.resetCount).toBe(1);
    expect(delegate.writes.join('')).toContain('booting...\nready\n');
  });

  it('replays programmatic input through registered shell listeners', () => {
    const proxy = createDeferredBoltTerminal();
    const listener = vi.fn();

    proxy.onData(listener);
    proxy.input('pnpm run dev\n');

    expect(listener).toHaveBeenCalledWith('pnpm run dev\n');
  });

  it('forwards later interactive input from the attached terminal', () => {
    const proxy = createDeferredBoltTerminal();
    const delegate = createMockTerminal();
    const listener = vi.fn();

    proxy.onData(listener);
    proxy.attachDelegate(delegate);
    delegate.emitData('npm test\n');

    expect(listener).toHaveBeenCalledWith('npm test\n');
  });
});

describe('TerminalStore', () => {
  it('handles background bolt shell initialization failures without leaking unhandled rejections', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spawn = vi.fn().mockResolvedValue(undefined);

    new TerminalStore(
      Promise.resolve({
        spawn,
      } as any),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spawn).toHaveBeenCalledWith('/bin/jsh', expect.arrayContaining(['--osc']), expect.any(Object));
    expect(warn).toHaveBeenCalledWith(
      'Failed to initialize background bolt shell:',
      expect.objectContaining({
        message: 'WebContainer shell process did not expose input/output streams',
      }),
    );

    warn.mockRestore();
  });
});
