import { describe, expect, it } from 'vitest';
import {
  decodeHtmlCommandDelimiters,
  makeCreateViteNonInteractive,
  makeFileChecksPortable,
  makeInstallCommandsProjectAware,
} from './shell-command-utils';

describe('decodeHtmlCommandDelimiters', () => {
  it('normalizes HTML-escaped && separators in arbitrary command chains', () => {
    const input = 'cd /home/project &amp;&amp; pnpm install &amp;&amp; pnpm run build';
    const res = decodeHtmlCommandDelimiters(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('cd /home/project && pnpm install && pnpm run build');
  });
});

describe('makeCreateViteNonInteractive', () => {
  it('rewrites npm create vite + npm install chains to non-interactive pnpm dlx', () => {
    const input = 'npm create vite@latest . -- --template react && npm install';
    const res = makeCreateViteNonInteractive(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toContain('pnpm dlx create-vite@latest');
    expect(res.modifiedCommand).toContain('--template react');
    expect(res.modifiedCommand).toContain('--no-interactive');
    expect(res.modifiedCommand).toContain('pnpm install');

    // Crucially: the --no-interactive flag must apply to create-vite, not the install step.
    expect(res.modifiedCommand).toMatch(/create-vite@latest.*--no-interactive\s+&&\s+pnpm install/i);
  });

  it('adds --no-interactive to direct create-vite invocations', () => {
    const input = 'pnpm dlx create-vite@latest . --template react';
    const res = makeCreateViteNonInteractive(input);
    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toMatch(/create-vite@latest.*--no-interactive/i);
  });

  it('does not modify unrelated commands', () => {
    const input = 'pnpm -v';
    const res = makeCreateViteNonInteractive(input);
    expect(res.shouldModify).toBe(false);
  });
});

describe('makeFileChecksPortable', () => {
  it('rewrites test -f checks in command chains for jsh compatibility', () => {
    const input =
      'mkdir -p /home/project && test -f docs-summary.md && echo FILE_OK && cd /home/project && test -f docs-summary.md && echo FILE_OK';
    const res = makeFileChecksPortable(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).not.toContain('test -f');
    expect(res.modifiedCommand).toContain('ls docs-summary.md >/dev/null 2>&1');
    expect(res.modifiedCommand).toContain('&& echo FILE_OK');
  });

  it('does not modify commands without test -f checks', () => {
    const input = 'ls -la && echo done';
    const res = makeFileChecksPortable(input);

    expect(res.shouldModify).toBe(false);
  });
});

describe('makeInstallCommandsProjectAware', () => {
  it('removes install commands before cd when scaffolding into a subdirectory', () => {
    const input = 'mkdir -p mini-react-e2e && npm install && cd mini-react-e2e && npm install';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('mkdir -p mini-react-e2e && cd mini-react-e2e && npm install');
  });

  it('normalizes HTML-escaped command separators before applying rewrite', () => {
    const input = 'mkdir -p mini-react-e2e &amp;&amp; npm install &amp;&amp; cd mini-react-e2e &amp;&amp; npm install';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('mkdir -p mini-react-e2e && cd mini-react-e2e && npm install');
  });

  it('removes package.json probes before cd when the same probe runs inside scaffold dir', () => {
    const input = 'mkdir -p mini-react-e2e && cat package.json && cd mini-react-e2e && cat package.json';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('mkdir -p mini-react-e2e && cd mini-react-e2e && cat package.json');
  });

  it('keeps root and nested installs when there is no scaffolding hint', () => {
    const input = 'npm install && cd packages/web && npm install';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(false);
  });
});
