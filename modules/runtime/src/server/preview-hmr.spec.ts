import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { disableManagedPreviewHmr } from './preview-hmr.mjs';

const require = createRequire(import.meta.url);
const client = readFileSync(resolve(dirname(require.resolve('vite/package.json')), 'dist/client/client.mjs'), 'utf8');

function evaluateClient(source: string) {
  const connect = vi.fn();
  const styles: object[] = [];
  const context = {
    console: { debug: vi.fn(), error: vi.fn() },
    URL,
    HTMLElement: class {},
    WebSocket: class {
      constructor() {
        connect();
      }
      addEventListener = vi.fn();
    },
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({ setAttribute: vi.fn(), textContent: '' }),
      head: {
        appendChild: (style: object) => styles.push(style),
        removeChild: (style: object) => styles.splice(styles.indexOf(style), 1),
      },
    },
    setTimeout: vi.fn(),
  };
  const executable = source
    .replace(/import ['"]@vite\/env['"];?/, '')
    .replaceAll('import.meta.url', JSON.stringify('https://project.preview.example/@vite/client'))
    .replace(/__[A-Z_]+__/g, 'null')
    .replace(/export \{([^}]+)\};?/, 'globalThis.exports = {$1};');
  const sandbox = vm.createContext(context);
  vm.runInContext(executable, sandbox);

  return { connect, styles, api: vm.runInContext('exports', sandbox) };
}

describe('managed Preview HMR transport', () => {
  it('reproduces the pinned Vite client connecting despite disabled server HMR', () => {
    expect(evaluateClient(client).connect).toHaveBeenCalledOnce();
  });

  it('disables reconnects while keeping the actual Vite CSS and module helpers', () => {
    const output = disableManagedPreviewHmr(client, '/@vite/client?token=fixture');
    const { connect, styles, api } = evaluateClient(output);
    expect(connect).not.toHaveBeenCalled();
    expect(api.createHotContext('/src/App.tsx').data).toEqual({});
    expect(api.injectQuery('/src/App.tsx#x', 't=1')).toBe('/src/App.tsx?t=1#x');
    api.updateStyle('/src/App.css', 'body { color: red; }');
    expect(styles).toEqual([expect.objectContaining({ textContent: 'body { color: red; }' })]);
    api.removeStyle('/src/App.css');
    expect(styles).toHaveLength(0);
    expect(disableManagedPreviewHmr(output, '/@vite/client')).toBe(output);
  });

  it('never changes application code or asset URLs', () => {
    expect(disableManagedPreviewHmr(client, '/src/client.js')).toBe(client);

    const application = 'const socket = new WebSocket("wss://app.example/events");';

    expect(disableManagedPreviewHmr(application, '/@vite/client')).toBe(application);
    expect(disableManagedPreviewHmr('import x from "/src/App.tsx";', '/src/main.tsx')).toBe(
      'import x from "/src/App.tsx";',
    );
  });
});
