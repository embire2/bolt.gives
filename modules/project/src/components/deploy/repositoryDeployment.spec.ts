import { describe, expect, it, vi } from 'vitest';
import { buildAndSnapshotHostedRepository, repositoryFilesFromSnapshot } from './repositoryDeployment';

describe('repositoryFilesFromSnapshot', () => {
  it('keeps source files while excluding build output, dependencies, binaries, and secrets', () => {
    expect(
      repositoryFilesFromSnapshot({
        '/home/project/package.json': { type: 'file', content: '{"scripts":{"build":"vite build"}}', isBinary: false },
        '/home/project/src/App.tsx': { type: 'file', content: 'export default function App() {}', isBinary: false },
        '/home/project/.env': { type: 'file', content: 'SECRET=value', isBinary: false },
        '/home/project/dist/index.html': { type: 'file', content: '<html />', isBinary: false },
        '/home/project/node_modules/pkg/index.js': { type: 'file', content: 'module.exports = {}', isBinary: false },
        '/home/project/public/logo.png': { type: 'file', content: 'binary', isBinary: true },
      }),
    ).toEqual({
      'package.json': '{"scripts":{"build":"vite build"}}',
      'src/App.tsx': 'export default function App() {}',
    });
  });
});

describe('buildAndSnapshotHostedRepository', () => {
  it('builds and reads source from the hosted project rather than the browser runtime', async () => {
    const runCommand = vi.fn(async () => ({ exitCode: 0, output: 'built' }));
    const fetchSnapshot = vi.fn(async () => ({
      '/home/project/package.json': { type: 'file' as const, content: '{}', isBinary: false },
      '/home/project/src/main.tsx': { type: 'file' as const, content: 'render()', isBinary: false },
    }));

    await expect(
      buildAndSnapshotHostedRepository('session-123', {
        runCommand: runCommand as any,
        fetchSnapshot,
      }),
    ).resolves.toEqual({
      buildOutput: { exitCode: 0, output: 'built' },
      files: {
        'package.json': '{}',
        'src/main.tsx': 'render()',
      },
    });
    expect(runCommand).toHaveBeenCalledWith({
      sessionId: 'session-123',
      command: 'pnpm run build',
      kind: 'shell',
    });
    expect(fetchSnapshot).toHaveBeenCalledWith('session-123');
  });

  it('does not export a snapshot after a failed hosted build', async () => {
    const fetchSnapshot = vi.fn();

    await expect(
      buildAndSnapshotHostedRepository('session-123', {
        runCommand: vi.fn(async () => ({ exitCode: 1, output: 'build failed' })) as any,
        fetchSnapshot,
      }),
    ).resolves.toEqual({
      buildOutput: { exitCode: 1, output: 'build failed' },
      files: {},
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });

  it('repairs missing Node typings once and reruns the hosted build', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 2,
        output: "error TS2688: Cannot find type definition file for 'node'.",
      })
      .mockResolvedValueOnce({ exitCode: 0, output: 'installed @types/node' })
      .mockResolvedValueOnce({ exitCode: 0, output: 'built after repair' });
    const fetchSnapshot = vi.fn(async () => ({
      '/home/project/package.json': { type: 'file' as const, content: '{}', isBinary: false },
    }));

    await expect(
      buildAndSnapshotHostedRepository('session-123', {
        runCommand,
        fetchSnapshot,
      }),
    ).resolves.toEqual({
      buildOutput: { exitCode: 0, output: 'built after repair' },
      files: { 'package.json': '{}' },
    });
    expect(runCommand.mock.calls.map(([options]) => options.command)).toEqual([
      'pnpm run build',
      'pnpm add --save-dev @types/node@^22.10.0',
      'pnpm run build',
    ]);
    expect(fetchSnapshot).toHaveBeenCalledWith('session-123');
  });
});
