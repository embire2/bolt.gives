import { describe, expect, it } from 'vitest';
import {
  decodeHtmlCommandDelimiters,
  makeCreateViteNonInteractive,
  makeFileChecksPortable,
  makeInstallCommandsLowNoise,
  makeInstallCommandsProjectAware,
  makeScaffoldCommandsProjectAware,
  normalizeShellCommandSurface,
  unwrapCommandJsonEnvelope,
} from './shell-command-utils';

describe('unwrapCommandJsonEnvelope', () => {
  it('unwraps JSON command envelopes emitted by models', () => {
    const input = '{"command":"cd /home/project && pnpm install"}';
    const res = unwrapCommandJsonEnvelope(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('cd /home/project && pnpm install');
  });

  it('does not modify plain shell commands', () => {
    const input = 'cd /home/project && pnpm install';
    const res = unwrapCommandJsonEnvelope(input);

    expect(res.shouldModify).toBe(false);
  });
});

describe('decodeHtmlCommandDelimiters', () => {
  it('normalizes HTML-escaped && separators in arbitrary command chains', () => {
    const input = 'cd /home/project &amp;&amp; pnpm install &amp;&amp; pnpm run build';
    const res = decodeHtmlCommandDelimiters(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('cd /home/project && pnpm install && pnpm run build');
  });
});

describe('normalizeShellCommandSurface', () => {
  it('strips model-added shell command prefixes', () => {
    const input = 'Run shell command: pnpm install';
    const res = normalizeShellCommandSurface(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('pnpm install');
  });

  it('strips list bullets and fenced wrappers', () => {
    const input = '```bash\n- pnpm run dev\n```';
    const res = normalizeShellCommandSurface(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('pnpm run dev');
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

  it('moves install commands after cd when the post-cd segment is malformed', () => {
    const input = 'mkdir -p mini-react-e2e && npm install && cd mini-react-e2e && npm installStart Application';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe(
      'mkdir -p mini-react-e2e && cd mini-react-e2e && npm install && npm installStart Application',
    );
  });

  it('keeps root and nested installs when there is no scaffolding hint', () => {
    const input = 'npm install && cd packages/web && npm install';
    const res = makeInstallCommandsProjectAware(input);

    expect(res.shouldModify).toBe(false);
  });
});

describe('makeInstallCommandsLowNoise', () => {
  it('adds append-only reporter for pnpm install commands', () => {
    const input = 'pnpm install && pnpm run dev';
    const res = makeInstallCommandsLowNoise(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('pnpm install --reporter=append-only && pnpm run dev');
  });

  it('adds quiet flags for npm install commands', () => {
    const input = 'npm install && npm run dev';
    const res = makeInstallCommandsLowNoise(input);

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('npm install --no-progress --silent && npm run dev');
  });

  it('does not modify install commands that are already low-noise', () => {
    const input = 'pnpm install --reporter=append-only && pnpm run dev';
    const res = makeInstallCommandsLowNoise(input);

    expect(res.shouldModify).toBe(false);
  });
});

describe('makeScaffoldCommandsProjectAware', () => {
  it('drops scaffold commands when project is already initialized', () => {
    const input = 'pnpm dlx create-vite@latest . --template react --no-interactive && pnpm install';
    const res = makeScaffoldCommandsProjectAware(input, { projectInitialized: true });

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toBe('pnpm install');
  });

  it('keeps scaffold commands for uninitialized projects', () => {
    const input = 'pnpm dlx create-vite@latest . --template react --no-interactive && pnpm install';
    const res = makeScaffoldCommandsProjectAware(input, { projectInitialized: false });

    expect(res.shouldModify).toBe(false);
  });

  it('emits a no-op echo when scaffold is the only segment', () => {
    const input = 'npm create vite@latest . -- --template react';
    const res = makeScaffoldCommandsProjectAware(input, { projectInitialized: true });

    expect(res.shouldModify).toBe(true);
    expect(res.modifiedCommand).toContain('Skipping scaffold command');
  });
});
