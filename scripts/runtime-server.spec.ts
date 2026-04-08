import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreviewResponseHeaders,
  authorizeHostedFreeRelaySecret,
  buildManagedInstanceRegistryFromAssignments,
  buildPreviewStateSummary,
  commandNeedsProjectManifest,
  collectMissingWorkspacePackages,
  inferHostedWorkspaceStartCommand,
  mergeWorkspaceFileMap,
  normalizeSessionId,
  normalizeIncomingPreviewAlert,
  normalizePackageImportSpecifier,
  normalizeTenantRegistry,
  prepareHostedWorkspaceForStart,
  probeSessionPreviewHealth,
  recordPreviewResponse,
  resolveRuntimeWorkspaceRoot,
  restoreSessionLastKnownGoodWorkspace,
  runSessionOperation,
  sanitizeLegacyTailwindCss,
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
  it('authorizes hosted FREE relay secrets only on exact match', () => {
    expect(authorizeHostedFreeRelaySecret('expected-secret', 'expected-secret')).toBe(true);
    expect(authorizeHostedFreeRelaySecret('wrong-secret', 'expected-secret')).toBe(false);
    expect(authorizeHostedFreeRelaySecret('', 'expected-secret')).toBe(false);
  });

  it('uses an explicit runtime workspace root when provided', () => {
    expect(resolveRuntimeWorkspaceRoot({ RUNTIME_WORKSPACE_DIR: '/srv/custom-runtime' }, '/srv/bolt-gives')).toBe(
      '/srv/custom-runtime',
    );
  });

  it('defaults the runtime workspace root to a sibling path outside the repo', () => {
    expect(resolveRuntimeWorkspaceRoot({}, '/srv/bolt-gives')).toBe('/srv/bolt-gives-runtime-workspaces');
    expect(resolveRuntimeWorkspaceRoot({}, '/root/bolt.gives')).toBe('/root/bolt.gives-runtime-workspaces');
  });

  it('rebuilds the managed instance registry from admin assignments deterministically', async () => {
    const assignments = [
      {
        id: 'instance-1',
        email: 'doctor@example.com',
        name: 'Doctor Trial',
        projectName: 'doctor-clinic',
        routeHostname: 'doctor-clinic.pages.dev',
        pagesUrl: 'https://doctor-clinic.pages.dev',
        plan: 'experimental-free-15d',
        status: 'active',
        createdAt: '2026-04-08T12:00:00.000Z',
        updatedAt: '2026-04-08T12:01:00.000Z',
        trialEndsAt: '2026-04-23T12:00:00.000Z',
        currentGitSha: '66c3e971482045c1ce334403082131ff4b15bb1e',
        previousGitSha: null,
        lastRolloutAt: '2026-04-08T12:01:00.000Z',
        lastDeploymentUrl: 'https://doctor-clinic.pages.dev',
        lastError: null,
        suspendedAt: null,
        expiredAt: null,
        sourceBranch: 'main',
      },
    ];
    const registry = buildManagedInstanceRegistryFromAssignments(assignments);

    expect(registry?.instances).toHaveLength(1);
    expect(registry?.instances[0]).toMatchObject({
      projectName: 'doctor-clinic',
      routeHostname: 'doctor-clinic.pages.dev',
      pagesUrl: 'https://doctor-clinic.pages.dev',
      status: 'active',
      clientSessionSecretHash: null,
    });
    expect(registry?.instances[0].clientKeyHash).toMatch(/^[a-f0-9]{64}$/);
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

  it('prefers an explicit public origin for hosted preview urls', () => {
    const session = {
      id: 'session-public-origin',
      preview: undefined,
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
          'x-bolt-public-origin': 'https://alpha1.bolt.gives',
          host: '127.0.0.1:4321',
        },
      } as {
        headers: Record<string, string>;
      },
      4120,
    );

    expect(preview).toEqual({
      port: 4120,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-public-origin/4120',
    });
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

  it('does not clear an existing preview error just because the html shell still returns 200', () => {
    const session = {
      id: 'session-preview-error-persist',
      preview: {
        port: 4105,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-preview-error-persist/4105',
      },
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: '2026-04-02T19:03:58.000Z',
        recentLogs: [
          '[stderr] 21:03:58 [vite] Pre-transform error: Failed to resolve import "./components/PatientForm" from "src/App.jsx". Does the file exist?',
        ],
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: 'Failed to resolve import "./components/PatientForm" from "src/App.jsx". Does the file exist?',
          content:
            '[stderr] 21:03:58 [vite] Pre-transform error: Failed to resolve import "./components/PatientForm" from "src/App.jsx". Does the file exist?',
          source: 'preview',
        },
      },
      previewRecovery: {
        state: 'idle',
        token: 0,
        message: null,
        updatedAt: null,
      },
      previewSubscribers: new Set(),
    };

    recordPreviewResponse(
      session as never,
      '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      200,
      '/',
    );

    expect(session.previewDiagnostics.status).toBe('error');
    expect(session.previewDiagnostics.healthy).toBe(false);
    expect(session.previewDiagnostics.alert?.description).toContain('PatientForm');
  });

  it('normalizes tenant registry records with lifecycle metadata', () => {
    const normalized = normalizeTenantRegistry({
      admin: {
        username: 'admin',
        passwordHash: 'hash',
      },
      tenants: [
        {
          id: 'tenant-1',
          name: 'Clinic A',
          email: 'OWNER@EXAMPLE.COM',
          passwordHash: 'tenant-hash',
          createdAt: '2026-03-31T08:00:00.000Z',
          status: 'pending',
          inviteToken: 'invite-token',
          inviteIssuedAt: '2026-03-31T08:05:00.000Z',
          inviteExpiresAt: '2026-03-31T09:05:00.000Z',
          invitePurpose: 'onboarding',
        },
      ],
    });

    expect(normalized.admin.mustChangePassword).toBe(true);
    expect(normalized.tenants[0]).toEqual(
      expect.objectContaining({
        id: 'tenant-1',
        email: 'owner@example.com',
        status: 'pending',
        mustChangePassword: true,
        inviteToken: 'invite-token',
        inviteIssuedAt: '2026-03-31T08:05:00.000Z',
        inviteExpiresAt: '2026-03-31T09:05:00.000Z',
        invitePurpose: 'onboarding',
      }),
    );
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

  it('preserves an existing preview alert during health probes until a fresh mutation clears it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
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
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: '2026-04-02T19:18:07.000Z',
        recentLogs: [],
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: 'Failed to resolve import "./components/PatientForm" from "src/App.jsx".',
          content: 'Pre-transform error',
          source: 'preview',
        },
      },
    });

    fetchSpy.mockRestore();

    expect(result.healthy).toBe(false);
    expect(result.alert?.description).toContain('PatientForm');
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

  it('normalizes bare package import specifiers from source imports', () => {
    expect(normalizePackageImportSpecifier('react-router-dom')).toBe('react-router-dom');
    expect(normalizePackageImportSpecifier('@tanstack/react-query/build')).toBe('@tanstack/react-query');
    expect(normalizePackageImportSpecifier('react-dom/client')).toBe('react-dom');
    expect(normalizePackageImportSpecifier('./App.css')).toBeNull();
    expect(normalizePackageImportSpecifier('node:fs')).toBeNull();
  });

  it('infers the hosted workspace start command from package.json scripts', () => {
    expect(
      inferHostedWorkspaceStartCommand({
        scripts: {
          dev: 'vite',
          start: 'node server.js',
        },
      }),
    ).toBe('pnpm run dev');
    expect(
      inferHostedWorkspaceStartCommand({
        scripts: {
          start: 'next start',
        },
      }),
    ).toBe('pnpm run start');
    expect(
      inferHostedWorkspaceStartCommand({
        scripts: {
          preview: 'vite preview',
        },
      }),
    ).toBe('pnpm run preview');
    expect(inferHostedWorkspaceStartCommand({ scripts: {} })).toBeNull();
  });

  it('detects missing workspace packages from source and style imports', () => {
    const missing = collectMissingWorkspacePackages(
      [
        {
          path: 'src/App.jsx',
          content: [
            "import { QueryClient } from 'react-query';",
            "import { BrowserRouter } from 'react-router-dom';",
            "import Widget from './Widget';",
          ].join('\n'),
        },
        {
          path: 'src/App.css',
          content: "@import 'tailwindcss/base';",
        },
      ],
      {
        dependencies: {
          react: '^19.0.0',
          'react-router-dom': '^7.0.0',
        },
      },
    );

    expect(missing).toEqual(expect.arrayContaining(['react-query']));
    expect(missing).not.toContain('react-router-dom');
    expect(missing).not.toContain('tailwindcss');
  });

  it('sanitizes legacy tailwind directives when no tailwind pipeline exists', () => {
    expect(
      sanitizeLegacyTailwindCss(
        ['@import "tailwindcss/base";', '@tailwind components;', '.card { color: red; }'].join('\n'),
      ),
    ).toEqual({
      changed: true,
      content: '.card { color: red; }\n',
    });
  });

  it('prepares hosted workspaces by stripping legacy tailwind directives before preview start', async () => {
    const workspace = await makeTempDir('bolt-runtime-prepare-');
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'workspace-app',
        private: true,
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
      }),
      'utf8',
    );
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'src', 'App.css'),
      '@import "tailwindcss/base";\n@tailwind utilities;\n.card { color: red; }\n',
      'utf8',
    );

    const result = await prepareHostedWorkspaceForStart(
      {
        dir: workspace,
      } as {
        dir: string;
      },
      {},
    );

    expect(result.changed).toBe(true);
    expect(result.sanitizedFiles).toEqual(['src/App.css']);
    expect(result.installedPackages).toEqual([]);
    await expect(fs.readFile(path.join(workspace, 'src', 'App.css'), 'utf8')).resolves.toBe('.card { color: red; }\n');
  });

  it('installs workspace dependencies before preview start when node_modules is missing', async () => {
    const workspace = await makeTempDir('bolt-runtime-install-');
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'workspace-app',
        private: true,
        scripts: {
          dev: 'vite',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          vite: '^5.0.0',
        },
      }),
      'utf8',
    );
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'main.jsx'), "import 'react';\n", 'utf8');

    const result = await prepareHostedWorkspaceForStart(
      {
        dir: workspace,
      } as {
        dir: string;
      },
      {},
    );

    expect(result.changed).toBe(false);
    await expect(fs.access(path.join(workspace, 'node_modules'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(workspace, 'node_modules', '.bin', 'vite'))).resolves.toBeUndefined();
  }, 120000);

  it('reinstalls workspace dependencies and clears stale vite cache when package.json changes', async () => {
    const workspace = await makeTempDir('bolt-runtime-reinstall-');
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'workspace-app',
        private: true,
        scripts: {
          dev: 'vite',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          vite: '^5.0.0',
        },
      }),
      'utf8',
    );

    const session = {
      dir: workspace,
      lastPreparedDependencyFingerprint: null,
    };

    await prepareHostedWorkspaceForStart(session as { dir: string; lastPreparedDependencyFingerprint: string | null }, {});
    await fs.mkdir(path.join(workspace, 'node_modules', '.vite'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'node_modules', '.vite', 'stale.txt'), 'stale-cache', 'utf8');

    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'workspace-app',
        private: true,
        scripts: {
          dev: 'vite',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          'date-fns': '^2.30.0',
        },
        devDependencies: {
          vite: '^5.0.0',
        },
      }),
      'utf8',
    );

    await prepareHostedWorkspaceForStart(session as { dir: string; lastPreparedDependencyFingerprint: string | null }, {});

    await expect(fs.access(path.join(workspace, 'node_modules', '.vite', 'stale.txt'))).rejects.toThrow();
    await expect(fs.access(path.join(workspace, 'node_modules', 'date-fns'))).resolves.toBeUndefined();
    expect(session.lastPreparedDependencyFingerprint).toBeTruthy();
  }, 120000);

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
