import { describe, expect, it } from 'vitest';
import { makeCreateViteNonInteractive } from './shell-command-utils';

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
