import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreviewResponseHeaders,
  buildPreviewStateSummary,
  commandNeedsProjectManifest,
  mergeWorkspaceFileMap,
  normalizeSessionId,
  normalizeIncomingPreviewAlert,
  probeSessionPreviewHealth,
  resolveRuntimeWorkspaceRoot,
  restoreSessionLastKnownGoodWorkspace,
  runSessionOperation,
  shouldRetryPreviewProxyResponse,
  syncWorkspaceSnapshot,
  updateSessionPreview,
  waitForProjectManifest,
  workspaceHasOwnProjectManifest,
} from './runtime-server.mjs';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      fs.rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('runtime server workspace isolation', () => {
  it('uses an explicit runtime workspace root when provided', () => {
    expect(resolveRuntimeWorkspaceRoot({ RUNTIME_WORKSPACE_DIR: '/srv/custom-runtime' }, '/srv/bolt-gives')).toBe(
      '/srv/custom-runtime',
    );
  });

  it('defaults the runtime workspace root to a sibling path outside the repo', () => {
    expect(resolveRuntimeWorkspaceRoot({}, '/srv/bolt-gives')).toBe('/srv/bolt-gives-runtime-workspaces');
    expect(resolveRuntimeWorkspaceRoot({}, '/root/bolt.gives')).toBe('/root/bolt.gives-runtime-workspaces');
  });

  it('requires a project manifest for package-manager workspace commands only', () => {
    expect(commandNeedsProjectManifest('pnpm install')).toBe(true);
    expect(commandNeedsProjectManifest('npm run dev -- --host 127.0.0.1 --port 4100')).toBe(true);
    expect(commandNeedsProjectManifest('yarn dev')).toBe(true);
    expect(commandNeedsProjectManifest('bun run dev')).toBe(true);
    expect(commandNeedsProjectManifest('pnpm dlx create-vite')).toBe(false);
    expect(commandNeedsProjectManifest('npm create vite@latest . -- --template react')).toBe(false);
    expect(commandNeedsProjectManifest('echo "hello"')).toBe(false);
  });

  it('preserves safe session ids instead of hashing them away', () => {
    expect(normalizeSessionId('shared-session-1')).toBe('shared-session-1');
    expect(normalizeSessionId('  shared_session_2  ')).toBe('shared_session_2');
  });

  it('removes iframe-blocking headers from proxied preview responses', () => {
    expect(
      applyPreviewResponseHeaders({
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
        vary: 'Origin',
      }),
    ).toEqual(
      expect.objectContaining({
        vary: 'Origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      }),
    );
  });

  it('updates the hosted preview url when the dev server restarts on a new port', () => {
    const session = {
      id: 'session-123',
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-123/4100',
      },
    };

    const preview = updateSessionPreview(
      session as {
        id: string;
        preview?: {
          port: number;
          baseUrl: string;
        };
      },
      {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'alpha1.bolt.gives',
        },
      } as {
        headers: Record<string, string>;
      },
      4110,
    );

    expect(preview).toEqual({
      port: 4110,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-123/4110',
    });
    expect(session.preview?.port).toBe(4110);
  });

  it('builds a compact preview summary without shipping recent logs to the browser event stream', () => {
    expect(
      buildPreviewStateSummary({
        id: 'session-compact',
        preview: {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-compact/4100',
        },
        previewDiagnostics: {
          status: 'error',
          healthy: false,
          updatedAt: '2026-03-29T12:00:00.000Z',
          recentLogs: ['line 1', 'line 2'],
          alert: {
            type: 'error',
            title: 'Preview Error',
            description: 'Unexpected token',
            content: 'line 1',
            source: 'preview',
          },
        },
        previewRecovery: {
          state: 'running',
          token: 3,
          message: 'Recovering',
          updatedAt: '2026-03-29T12:00:01.000Z',
        },
      }),
    ).toEqual({
      sessionId: 'session-compact',
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-compact/4100',
      },
      status: 'error',
      healthy: false,
      updatedAt: '2026-03-29T12:00:00.000Z',
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: 'Unexpected token',
        content: 'line 1',
        source: 'preview',
      },
      recovery: {
        state: 'running',
        token: 3,
        message: 'Recovering',
        updatedAt: '2026-03-29T12:00:01.000Z',
      },
    });
  });

  it('normalizes browser-reported preview alerts before scheduling recovery', () => {
    expect(
      normalizeIncomingPreviewAlert({
        type: 'error',
        title: 'Preview Error',
        description: 'Unexpected token',
        content: '[plugin:vite:react-babel] Unexpected token',
      }),
    ).toEqual({
      type: 'error',
      title: 'Preview Error',
      description: 'Unexpected token',
      content: '[plugin:vite:react-babel] Unexpected token',
      source: 'preview',
    });
    expect(normalizeIncomingPreviewAlert({})).toBeNull();
  });

  it('treats ELIFECYCLE preview logs as a hosted preview failure during health probes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(' ELIFECYCLE  Command failed.\nerror when starting dev server', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      }),
    );

    const result = await probeSessionPreviewHealth({
      preview: {
        port: 4103,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-probe/4103',
      },
    });

    fetchSpy.mockRestore();

    expect(result.healthy).toBe(false);
    expect(result.alert?.description).toContain('ELIFECYCLE');
  });

  it('retries transient preview asset failures for browser GET requests only', () => {
    expect(shouldRetryPreviewProxyResponse({ method: 'GET', statusCode: 504, attempt: 0 })).toBe(true);
    expect(shouldRetryPreviewProxyResponse({ method: 'HEAD', statusCode: 502, attempt: 1 })).toBe(true);
    expect(shouldRetryPreviewProxyResponse({ method: 'POST', statusCode: 504, attempt: 0 })).toBe(false);
    expect(shouldRetryPreviewProxyResponse({ method: 'GET', statusCode: 404, attempt: 0 })).toBe(false);
    expect(shouldRetryPreviewProxyResponse({ method: 'GET', statusCode: 504, attempt: 99 })).toBe(false);
  });

  it('detects whether the isolated workspace owns its own project manifest', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');

    await expect(workspaceHasOwnProjectManifest(workspace)).resolves.toBe(false);

    await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"workspace-app"}', 'utf8');
    await expect(workspaceHasOwnProjectManifest(workspace)).resolves.toBe(true);
  });

  it('waits briefly for starter files to sync before rejecting package-manager commands', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');

    setTimeout(() => {
      void fs.writeFile(path.join(workspace, 'package.json'), '{"name":"workspace-app"}', 'utf8');
    }, 150);

    await expect(waitForProjectManifest(workspace, 2_000)).resolves.toBe(true);
  });

  it('merges browser-side file syncs without deleting server-created scaffold files', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');
    const session = {
      dir: workspace,
    };

    await syncWorkspaceSnapshot(session as { dir: string }, {
      '/home/project/package.json': {
        type: 'file',
        content: '{"name":"scaffolded-app"}',
        isBinary: false,
      },
    });

    await syncWorkspaceSnapshot(session as { dir: string }, {}, { prune: false });

    await expect(fs.readFile(path.join(workspace, 'package.json'), 'utf8')).resolves.toContain('scaffolded-app');
  });

  it('still supports explicit prune syncs when a full replacement is required', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');
    const session = {
      dir: workspace,
    };

    await syncWorkspaceSnapshot(session as { dir: string }, {
      '/home/project/package.json': {
        type: 'file',
        content: '{"name":"scaffolded-app"}',
        isBinary: false,
      },
    });

    await syncWorkspaceSnapshot(session as { dir: string }, {}, { prune: true });

    await expect(fs.readFile(path.join(workspace, 'package.json'), 'utf8')).rejects.toThrow();
  });

  it('serializes session operations so overlapping sync/command work cannot race the same workspace', async () => {
    const events: string[] = [];
    const session = {
      operationQueue: Promise.resolve(),
    };

    const slowTask = runSessionOperation(session as { operationQueue: Promise<void> }, async () => {
      events.push('slow:start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      events.push('slow:end');
    });

    const fastTask = runSessionOperation(session as { operationQueue: Promise<void> }, async () => {
      events.push('fast:start');
      events.push('fast:end');
    });

    await Promise.all([slowTask, fastTask]);

    expect(events).toEqual(['slow:start', 'slow:end', 'fast:start', 'fast:end']);
  });

  it('writes synced files atomically without leaving temporary artifacts behind', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');
    const session = {
      dir: workspace,
    };

    await syncWorkspaceSnapshot(session as { dir: string }, {
      '/home/project/.postcssrc.json': {
        type: 'file',
        content: '{"plugins":{"autoprefixer":{}}}',
        isBinary: false,
      },
    });

    await expect(fs.readFile(path.join(workspace, '.postcssrc.json'), 'utf8')).resolves.toBe(
      '{"plugins":{"autoprefixer":{}}}',
    );
    await expect(fs.readdir(workspace)).resolves.not.toContainEqual(expect.stringMatching(/\.bolt-sync-.*\.tmp$/));
  });

  it('merges incremental hosted sync payloads without dropping earlier files when prune is disabled', () => {
    const currentFiles = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'old app',
        isBinary: false,
      },
      '/home/project/src/main.tsx': {
        type: 'file',
        content: 'main entry',
        isBinary: false,
      },
    };

    const mergedFiles = mergeWorkspaceFileMap(
      currentFiles,
      {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'new app',
          isBinary: false,
        },
      },
      { prune: false },
    );

    expect(mergedFiles['/home/project/src/App.tsx']?.content).toBe('new app');
    expect(mergedFiles['/home/project/src/main.tsx']?.content).toBe('main entry');
  });

  it('restores the last known good hosted workspace snapshot after a preview failure', async () => {
    const workspace = await makeTempDir('bolt-runtime-workspace-');
    const goodFiles = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return <h1>Good</h1>; }',
        isBinary: false,
      },
    };

    const brokenFiles = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return <h1>Broken</h1>;',
        isBinary: false,
      },
    };

    const session = {
      dir: workspace,
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-restore/4100',
      },
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: null,
      },
      previewRecovery: {
        state: 'idle',
        token: 0,
        message: null,
        updatedAt: null,
      },
      currentFileMap: brokenFiles,
      restorePointFileMap: goodFiles,
      autoRestoreInFlight: false,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 200,
      }),
    );

    await syncWorkspaceSnapshot(session as { dir: string }, brokenFiles, { prune: false });
    await restoreSessionLastKnownGoodWorkspace(
      session as {
        dir: string;
        previewDiagnostics: {
          status: string;
          healthy: boolean;
          updatedAt: string | null;
          recentLogs: string[];
          alert: unknown;
        };
        preview: {
          port: number;
          baseUrl: string;
        };
        previewRecovery: {
          state: string;
          token: number;
          message: string | null;
          updatedAt: string | null;
        };
        currentFileMap: typeof brokenFiles;
        restorePointFileMap: typeof goodFiles;
        autoRestoreInFlight: boolean;
      },
      'test preview failure',
    );
    fetchSpy.mockRestore();

    await expect(fs.readFile(path.join(workspace, 'src', 'App.tsx'), 'utf8')).resolves.toContain('<h1>Good</h1>');
    expect(session.currentFileMap['/home/project/src/App.tsx']?.content).toContain('<h1>Good</h1>');
    expect(session.previewRecovery.state).toBe('restored');
    expect(session.previewDiagnostics.status).toBe('ready');
    expect(session.previewDiagnostics.healthy).toBe(true);
    expect(session.previewDiagnostics.alert).toBeNull();
    expect(session.previewDiagnostics.recentLogs.join('\n')).toContain('Preview is healthy again');
  });
});
