import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreviewResponseHeaders,
  applyUnavailablePackageVersionRepair,
  authorizeFreeUsageQuotaSecret,
  authorizeHostedFreeRelaySecret,
  buildHostedWorkspaceBootstrapAlert,
  buildFreeUsageQuotaDecision,
  buildManagedInstanceDeployArgs,
  buildManagedInstanceDeployArtifactDecision,
  buildManagedInstanceRolloutGuardDecision,
  buildManagedInstanceRegistryFromAssignments,
  buildWorkspaceFileMapFromDisk,
  buildPreviewStateSummary,
  commandNeedsProjectManifest,
  consumeRuntimeCommandStreamForReady,
  collectMissingWorkspacePackages,
  ensureHostedWorkspaceProjectBootstrap,
  extractUnavailablePackageVersionRepair,
  getFreeUsageQuotaDayKey,
  getFreeUsageQuotaResetAt,
  inferHostedWorkspaceStartCommand,
  isPreviewPortReserved,
  mergeWorkspaceFileMap,
  markSessionMutationStart,
  normalizeSessionId,
  normalizeIncomingPreviewAlert,
  normalizeFreeUsageQuotaLedger,
  normalizePackageImportSpecifier,
  normalizeTenantRegistry,
  prepareHostedWorkspaceForStart,
  probeSessionPreviewHealth,
  refreshSessionCurrentFileMapFromDisk,
  repairHostedWorkspaceSupportFilesAfterSync,
  repairUnsafeJsxTextEntities,
  resolveStalePreviewRedirectPath,
  recordPreviewResponse,
  releaseReservedPreviewPorts,
  resolveRuntimeWorkspaceRoot,
  resolvePublishedProjectUpgradeTarget,
  resolveSessionSnapshotFiles,
  runSerializedManagedInstanceRollout,
  restoreSessionLastKnownGoodWorkspace,
  runSessionOperation,
  sanitizeLegacyTailwindCss,
  shouldRefreshManagedInstanceForRollout,
  shouldRetryPreviewProxyResponse,
  startReservedPreviewProbe,
  startHostedPreviewForSession,
  syncWorkspaceSnapshot,
  updateSessionPreview,
  waitForProjectManifest,
  writeJsonAtomically,
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

  it('authorizes hosted FREE quota writes with the same exact-match secret discipline', () => {
    expect(authorizeFreeUsageQuotaSecret('quota-secret', 'quota-secret')).toBe(true);
    expect(authorizeFreeUsageQuotaSecret('relay-secret', 'quota-secret')).toBe(false);
    expect(authorizeFreeUsageQuotaSecret('', 'quota-secret')).toBe(false);
  });

  it('resets hosted FREE usage at midnight GMT+2', () => {
    expect(getFreeUsageQuotaDayKey(new Date('2026-06-26T21:59:00.000Z'))).toBe('2026-06-26');
    expect(getFreeUsageQuotaResetAt(new Date('2026-06-26T21:59:00.000Z'))).toBe('2026-06-26T22:00:00.000Z');
    expect(getFreeUsageQuotaDayKey(new Date('2026-06-26T22:00:01.000Z'))).toBe('2026-06-27');
    expect(getFreeUsageQuotaResetAt(new Date('2026-06-26T22:00:01.000Z'))).toBe('2026-06-27T22:00:00.000Z');
  });

  it('blocks hosted FREE usage when the daily dollar cap is reached', () => {
    const decision = buildFreeUsageQuotaDecision(
      { costUsd: 1 },
      { limitUsd: 1, now: new Date('2026-06-26T12:00:00.000Z') },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.remainingUsd).toBe(0);
    expect(decision.message).toContain('FREE daily coding limit');
    expect(decision.message).toContain('00:00 GMT+2');
  });

  it('normalizes hosted FREE usage ledgers without retaining invalid subjects', () => {
    const validSubject = 'a'.repeat(64);
    const ledger = normalizeFreeUsageQuotaLedger({
      days: {
        '2026-06-26': {
          [validSubject]: {
            costUsd: '0.25',
            requests: '2',
            promptTokens: '100',
            completionTokens: '50',
            totalTokens: '150',
            updatedAt: '2026-06-26T10:00:00.000Z',
          },
          invalid: {
            costUsd: 999,
          },
        },
        nope: {
          [validSubject]: {
            costUsd: 999,
          },
        },
      },
    });
    const days = ledger.days as Record<string, Record<string, any>>;

    expect(days['2026-06-26'][validSubject]).toMatchObject({
      costUsd: 0.25,
      requests: 2,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(days['2026-06-26']).not.toHaveProperty('invalid');
    expect(days).not.toHaveProperty('nope');
  });

  it('uses an explicit runtime workspace root when provided', () => {
    expect(resolveRuntimeWorkspaceRoot({ RUNTIME_WORKSPACE_DIR: '/srv/custom-runtime' }, '/srv/bolt-gives')).toBe(
      '/srv/custom-runtime',
    );
  });

  it('detects ready events while draining hosted preview autostart streams', async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'status', message: 'starting' })}\n`));
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'ready', preview: { port: 4100 } })}\n`));
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'exit', exitCode: 0 })}\n`));
          controller.close();
        },
      }),
    );

    await expect(consumeRuntimeCommandStreamForReady(response)).resolves.toEqual({
      ready: true,
      exitCode: 0,
      stderr: '',
    });
  });

  it('captures autostart stderr when the runtime stream exits before ready', async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'stderr', chunk: 'Preview failed\n' })}\n`));
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'exit', exitCode: 1 })}\n`));
          controller.close();
        },
      }),
    );

    await expect(consumeRuntimeCommandStreamForReady(response)).resolves.toEqual({
      ready: false,
      exitCode: 1,
      stderr: 'Preview failed',
    });
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
        plan: 'experimental-free-indefinite',
        status: 'active',
        createdAt: '2026-04-08T12:00:00.000Z',
        updatedAt: '2026-04-08T12:01:00.000Z',
        trialEndsAt: null,
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

  it('refuses managed-instance rollout when the live checkout is behind origin/main', () => {
    const decision = buildManagedInstanceRolloutGuardDecision({
      hasGitMetadata: true,
      currentSha: 'abc123',
      originMainSha: 'def456',
      behindCount: 3,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('behind origin/main');
    expect(decision.behindCount).toBe(3);
  });

  it('allows managed Cloudflare deploys from the live rsync checkout', () => {
    const args = buildManagedInstanceDeployArgs(
      { projectName: 'tenant-preview' },
      { sourceBranch: 'main' },
      '3d400050b6d8529edc2a994e9a9bbbf650974029',
      'startup-sync',
    );

    expect(args).toContain('--commit-dirty=true');
    expect(args).toEqual(
      expect.arrayContaining([
        'pages',
        'deploy',
        '--project-name',
        'tenant-preview',
        '--branch',
        'main',
        '--commit-hash',
        '3d400050b6d8529edc2a994e9a9bbbf650974029',
      ]),
    );
  });

  it('waits for complete managed deploy artifacts before fleet rollout', () => {
    expect(
      buildManagedInstanceDeployArtifactDecision({
        deployDirReadable: false,
        serverBuildReadable: true,
        deployDir: '/srv/bolt-gives/build/client',
        serverBuildPath: '/srv/bolt-gives/build/server/index.js',
      }),
    ).toEqual({
      ready: false,
      reason: 'Managed instance deploy artifact is not ready yet: /srv/bolt-gives/build/client is missing or unreadable.',
    });

    expect(
      buildManagedInstanceDeployArtifactDecision({
        deployDirReadable: true,
        serverBuildReadable: false,
        deployDir: '/srv/bolt-gives/build/client',
        serverBuildPath: '/srv/bolt-gives/build/server/index.js',
      }),
    ).toEqual({
      ready: false,
      reason:
        'Managed instance deploy artifact is not ready yet: /srv/bolt-gives/build/server/index.js is missing or unreadable.',
    });

    expect(
      buildManagedInstanceDeployArtifactDecision({
        deployDirReadable: true,
        serverBuildReadable: true,
      }),
    ).toEqual({ ready: true, reason: null });
  });

  it('skips inactive and already-current managed instances during full-fleet rollout', () => {
    const gitSha = '21cffb14b66e4d08461b61e3fb6a2de7eb61a3c1';

    expect(shouldRefreshManagedInstanceForRollout({ status: 'expired', currentGitSha: 'old-sha' }, gitSha)).toBe(false);
    expect(shouldRefreshManagedInstanceForRollout({ status: 'suspended', currentGitSha: 'old-sha' }, gitSha)).toBe(
      false,
    );
    expect(shouldRefreshManagedInstanceForRollout({ status: 'failed', currentGitSha: 'old-sha' }, gitSha)).toBe(true);
    expect(shouldRefreshManagedInstanceForRollout({ status: 'active', currentGitSha: gitSha }, gitSha)).toBe(false);
    expect(shouldRefreshManagedInstanceForRollout({ status: 'active', currentGitSha: 'old-sha' }, gitSha)).toBe(true);
    expect(shouldRefreshManagedInstanceForRollout({ status: 'provisioning', currentGitSha: null }, gitSha)).toBe(true);
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

  it('does not mark healthy javascript preview assets as preview errors', () => {
    const session = {
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-assets/4100',
      },
      previewDiagnostics: {
        status: 'starting',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: null,
      },
      autoRestoreTimer: null,
      autoRestoreInFlight: false,
      restorePointFileMap: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return <h1>Clinic Console</h1>; }',
          isBinary: false,
        },
      },
      workspaceMutationId: 1,
      lastAutoRestoreFingerprint: null,
    };

    recordPreviewResponse(
      session as any,
      'import { createRoot } from "/runtime/preview/session-assets/4100/node_modules/react-dom/client.js";\nconsole.log("preview ok");\n',
      200,
      '/src/main.tsx',
      'text/javascript',
    );

    expect(session.previewDiagnostics.alert).toBeNull();
    expect(session.previewDiagnostics.status).toBe('starting');
    expect(session.previewDiagnostics.healthy).toBe(false);
  });

  it('clears stale preview alerts after a later healthy html document response', () => {
    const session = {
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-ready/4100',
      },
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: 'Previous compile error',
          content: 'Transform failed with 1 error',
          source: 'preview',
        },
      },
    };

    recordPreviewResponse(
      session as any,
      '<!doctype html><html><body><div id="root"></div></body></html>',
      200,
      '/',
      'text/html',
    );

    expect(session.previewDiagnostics.alert).toEqual(
      expect.objectContaining({
        description: 'Previous compile error',
      }),
    );
    expect(session.previewDiagnostics.status).toBe('error');
    expect(session.previewDiagnostics.healthy).toBe(false);
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

  it('starts probing the reserved preview port before dev-server stdout is parsed', () => {
    const probedPorts: number[] = [];
    const session = {
      id: 'session-initial-probe',
      preview: undefined as { port: number; baseUrl: string } | undefined,
    };

    const started = startReservedPreviewProbe(
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
      'start',
      4130,
      {
        startProbe(port: number) {
          probedPorts.push(port);
        },
      },
    );

    expect(started).toBe(true);
    expect(probedPorts).toEqual([4130]);
    expect(session.preview).toEqual({
      port: 4130,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-initial-probe/4130',
    });
    releaseReservedPreviewPorts(session as { id: string });
  });

  it('releases stale preview paths when a session moves to a new port', () => {
    const session = {
      id: 'session-redirect',
      preview: {
        port: 4110,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-redirect/4110',
      },
    };

    expect(
      resolveStalePreviewRedirectPath(
        session as {
          id: string;
          preview?: {
            port: number;
            baseUrl: string;
          };
        },
        '/runtime/preview/session-redirect/4100/src/main.tsx?import',
      ),
    ).toBe('/runtime/preview/session-redirect/4110/src/main.tsx?import');
  });

  it('releases reserved preview ports when a session terminates', () => {
    const session = {
      id: 'session-port-release',
      preview: undefined as { port: number; baseUrl: string } | undefined,
    };

    updateSessionPreview(
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
      4105,
    );

    expect(isPreviewPortReserved(4105, 'session-port-release')).toBe(true);

    releaseReservedPreviewPorts(session as { id: string });

    expect(isPreviewPortReserved(4105, 'session-port-release')).toBe(false);
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
        runtimeNodeWorkspace: {
          projectSlug: 'session-compact',
          cliUsername: 'bolt_session',
          status: 'active',
        },
        runtimeNodeWorkspaceSecretHandoff: {
          projectSlug: 'session-compact',
          cliUsername: 'bolt_session',
          oneTimeCliPassword: 'should-not-leak',
          oneTimeDatabasePassword: 'should-not-leak',
          status: 'active',
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
      runtimeNodeWorkspace: {
        projectSlug: 'session-compact',
        cliUsername: 'bolt_session',
        status: 'active',
      },
    });
  });

  it('routes published project websocket upgrades to the active preview port', () => {
    expect(
      resolvePublishedProjectUpgradeTarget(
        {
          status: 'active',
          previewPort: 4100,
        },
        {
          preview: {
            port: 4123,
          },
        },
      ),
    ).toEqual({
      ok: true,
      portRaw: '4123',
      upstreamPath: null,
    });
  });

  it('falls back to the deployment preview port for published project websocket upgrades', () => {
    expect(
      resolvePublishedProjectUpgradeTarget(
        {
          status: 'active',
          previewPort: 4100,
        },
        {},
      ),
    ).toEqual({
      ok: true,
      portRaw: '4100',
      upstreamPath: null,
    });
  });

  it('returns graceful websocket upgrade errors for unavailable published projects', () => {
    expect(resolvePublishedProjectUpgradeTarget({ status: 'active', previewPort: 4100 }, null)).toMatchObject({
      ok: false,
      statusCode: 503,
    });
    expect(resolvePublishedProjectUpgradeTarget({ status: 'suspended', previewPort: 4100 }, {})).toMatchObject({
      ok: false,
      statusCode: 404,
    });
  });

  it('clears a stale preview error once the current html shell is healthy again', () => {
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
    expect(session.previewDiagnostics.alert).toEqual(
      expect.objectContaining({
        description: 'Failed to resolve import "./components/PatientForm" from "src/App.jsx". Does the file exist?',
      }),
    );
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

  it('ignores detached ELIFECYCLE noise once the preview server is already ready', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        [
          ' ELIFECYCLE  Command failed.',
          'Port 4107 is in use, trying another one...',
          'VITE v5.4.21  ready in 259 ms',
          '➜  Local:   http://127.0.0.1:4108/',
        ].join('\n'),
        {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        },
      ),
    );

    const result = await probeSessionPreviewHealth({
      preview: {
        port: 4108,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-probe-ready/4108',
      },
    });

    fetchSpy.mockRestore();

    expect(result.healthy).toBe(true);
    expect(result.alert).toBeNull();
  });

  it('ignores stale lifecycle-only preview alerts when the root probe is healthy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      }),
    );

    const result = await probeSessionPreviewHealth({
      preview: {
        port: 4109,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-stale-lifecycle/4109',
      },
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: '[stdout] ELIFECYCLE Command failed.',
          content: '[stdout] ELIFECYCLE Command failed.',
          source: 'preview',
        },
      },
    });

    fetchSpy.mockRestore();

    expect(result.healthy).toBe(true);
    expect(result.alert).toBeNull();
  });

  it('clears stale lifecycle-only preview alerts after a successful proxied preview response', () => {
    const session = {
      id: 'session-clear-lifecycle',
      preview: {
        port: 4111,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-clear-lifecycle/4111',
      },
      previewSubscribers: new Set(),
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: '[stdout] ELIFECYCLE Command failed.',
          content: '[stdout] ELIFECYCLE Command failed.',
          source: 'preview',
        },
      },
      previewRecovery: {
        state: 'idle',
        token: 0,
        message: null,
        updatedAt: null,
      },
    };

    recordPreviewResponse(
      session as any,
      '<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>',
      200,
      '/',
      'text/html; charset=utf-8',
    );

    expect(session.previewDiagnostics.status).toBe('ready');
    expect(session.previewDiagnostics.healthy).toBe(true);
    expect(session.previewDiagnostics.alert).toBeNull();
  });

  it('clears stale starter-placeholder alerts once generated workspace files replace the starter', () => {
    const session = {
      id: 'session-clear-starter',
      preview: {
        port: 4112,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-clear-starter/4112',
      },
      currentFileMap: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return <h1>Generated App</h1>; }',
          isBinary: false,
        },
      },
      previewSubscribers: new Set(),
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: {
          type: 'warning',
          title: 'Starter Placeholder Still Visible',
          description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
          content: 'Vite + React\nYour fallback starter is ready.',
          source: 'preview',
        },
      },
      previewRecovery: {
        state: 'idle',
        token: 0,
        message: null,
        updatedAt: null,
      },
    };

    recordPreviewResponse(
      session as any,
      '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      200,
      '/',
      'text/html; charset=utf-8',
    );

    expect(session.previewDiagnostics.status).toBe('ready');
    expect(session.previewDiagnostics.healthy).toBe(true);
    expect(session.previewDiagnostics.alert).toBeNull();
  });

  it('does not clear starter-placeholder alerts while the current workspace still contains the starter', () => {
    const session = {
      id: 'session-keep-starter',
      preview: {
        port: 4113,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-keep-starter/4113',
      },
      currentFileMap: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return <p>Your fallback starter is ready.</p>; }',
          isBinary: false,
        },
      },
      previewDiagnostics: {
        status: 'error',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: {
          type: 'warning',
          title: 'Starter Placeholder Still Visible',
          description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
          content: 'Vite + React\nYour fallback starter is ready.',
          source: 'preview',
        },
      },
    };

    recordPreviewResponse(
      session as any,
      '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      200,
      '/',
      'text/html; charset=utf-8',
    );

    expect(session.previewDiagnostics.status).toBe('error');
    expect(session.previewDiagnostics.healthy).toBe(false);
    expect(session.previewDiagnostics.alert).toEqual(
      expect.objectContaining({
        title: 'Starter Placeholder Still Visible',
      }),
    );
  });

  it('detects missing vite bootstrap files before trusting the preview shell', async () => {
    const workspace = await makeTempDir('bolt-runtime-probe-bootstrap-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'index.html'),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'src', 'App.tsx'),
      'export default function App() { return <h1>Doctor Scheduler</h1>; }\n',
      'utf8',
    );
    await fs.writeFile(path.join(workspace, 'vite.config.ts'), 'export default {};\n', 'utf8');

    const result = await probeSessionPreviewHealth({
      dir: workspace,
      preview: {
        port: 4103,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-probe/4103',
      },
      previewDiagnostics: {
        status: 'starting',
        healthy: false,
        updatedAt: null,
        recentLogs: [],
        alert: null,
      },
    } as any);

    expect(result.healthy).toBe(false);
    expect(result.alert?.description).toContain('src/main.tsx');
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

  it('repairs unsafe JSX angle text entities generated inside simple elements', () => {
    expect(
      repairUnsafeJsxTextEntities('<button onClick={prevMonth} className="nav-button"><</button><button>></button>'),
    ).toEqual({
      changed: true,
      content: '<button onClick={prevMonth} className="nav-button">&lt;</button><button>&gt;</button>',
    });
  });

  it('prepares hosted workspaces by repairing unsafe JSX text before preview start', async () => {
    const workspace = await makeTempDir('bolt-runtime-prepare-jsx-');
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
      path.join(workspace, 'src', 'Calendar.tsx'),
      'export function Calendar(){return <button className="nav-button"><</button>;}\n',
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
    expect(result.repairedFiles).toEqual(['src/Calendar.tsx']);
    expect(result.sanitizedFiles).toEqual([]);
    expect(result.installedPackages).toEqual([]);
    expect(result.generatedFiles).toEqual([]);
    await expect(fs.readFile(path.join(workspace, 'src', 'Calendar.tsx'), 'utf8')).resolves.toContain(
      '<button className="nav-button">&lt;</button>',
    );
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
    expect(result.generatedFiles).toEqual([]);
    await expect(fs.readFile(path.join(workspace, 'src', 'App.css'), 'utf8')).resolves.toBe('.card { color: red; }\n');
  });

  it('self-heals missing vite tsconfig support files for generated workspaces before preview start', async () => {
    const workspace = await makeTempDir('bolt-runtime-vite-tsconfig-support-');
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'workspace-app',
        private: true,
        scripts: {
          dev: 'vite',
          build: 'vite build',
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
    await fs.writeFile(
      path.join(workspace, 'tsconfig.json'),
      JSON.stringify(
        {
          files: [],
          references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
        },
        null,
        2,
      ),
      'utf8',
    );
    await fs.writeFile(path.join(workspace, 'vite.config.js'), 'export default {};\n', 'utf8');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'main.tsx'), "console.log('ready');\n", 'utf8');

    const result = await prepareHostedWorkspaceForStart(
      {
        dir: workspace,
      } as {
        dir: string;
      },
      {},
    );

    expect(result.generatedFiles).toEqual(['tsconfig.app.json', 'tsconfig.node.json']);
    await expect(fs.readFile(path.join(workspace, 'tsconfig.app.json'), 'utf8')).resolves.toContain(
      '"include": [\n    "src"\n  ]',
    );
    await expect(fs.readFile(path.join(workspace, 'tsconfig.node.json'), 'utf8')).resolves.toContain(
      '"include": [\n    "vite.config.*"\n  ]',
    );
  }, 120000);

  it('repairs missing vite tsconfig support files after a workspace sync and returns file-map entries', async () => {
    const workspace = await makeTempDir('bolt-runtime-vite-tsconfig-sync-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
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
    await fs.writeFile(
      path.join(workspace, 'tsconfig.json'),
      JSON.stringify(
        {
          files: [],
          references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
        },
        null,
        2,
      ),
      'utf8',
    );
    await fs.writeFile(path.join(workspace, 'vite.config.ts'), 'export default {};\n', 'utf8');
    await fs.writeFile(path.join(workspace, 'src', 'main.tsx'), "console.log('ready');\n", 'utf8');

    const repair = await repairHostedWorkspaceSupportFilesAfterSync({
      dir: workspace,
    } as {
      dir: string;
    });
    const generatedFileMap = repair.fileMap as Record<
      string,
      {
        type: string;
        isBinary: boolean;
        content: string;
      }
    >;

    expect(repair.generatedFiles).toEqual(['tsconfig.app.json', 'tsconfig.node.json']);
    expect(repair.repairedFiles).toEqual([]);
    expect(generatedFileMap).toMatchObject({
      '/home/project/tsconfig.app.json': {
        type: 'file',
        isBinary: false,
      },
      '/home/project/tsconfig.node.json': {
        type: 'file',
        isBinary: false,
      },
    });
    expect(generatedFileMap['/home/project/tsconfig.app.json'].content).toContain('"include": [\n    "src"\n  ]');
  });

  it('repairs unsafe JSX angle text immediately after a workspace sync', async () => {
    const workspace = await makeTempDir('bolt-runtime-jsx-sync-repair-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
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
    await fs.writeFile(
      path.join(workspace, 'src', 'App.jsx'),
      [
        'export default function App(){',
        '  return <div><button className="nav-button"><</button><button className="nav-button">></button></div>;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const repair = await repairHostedWorkspaceSupportFilesAfterSync({
      dir: workspace,
    } as {
      dir: string;
    });
    const repairedFileMap = repair.fileMap as Record<
      string,
      {
        type: string;
        isBinary: boolean;
        content: string;
      }
    >;

    expect(repair.generatedFiles).toEqual([]);
    expect(repair.repairedFiles).toEqual(['src/App.jsx']);
    expect(repairedFileMap['/home/project/src/App.jsx']?.content).toContain(
      '<button className="nav-button">&lt;</button>',
    );
    await expect(fs.readFile(path.join(workspace, 'src', 'App.jsx'), 'utf8')).resolves.toContain(
      '<button className="nav-button">&gt;</button>',
    );
  });

  it('extracts unavailable package version repairs from pnpm stderr', () => {
    expect(
      extractUnavailablePackageVersionRepair(`ERR_PNPM_NO_MATCHING_VERSION No matching version found for react-calendar@^4.9.0

The latest release of react-calendar is "6.0.1".`),
    ).toEqual({
      packageName: 'react-calendar',
      requestedVersion: '^4.9.0',
      latestVersion: '6.0.1',
    });
  });

  it('repairs declared dependency versions while preserving the range prefix', () => {
    const packageJson = {
      dependencies: {
        'react-calendar': '^4.9.0',
      },
    };

    expect(
      applyUnavailablePackageVersionRepair(packageJson, {
        packageName: 'react-calendar',
        requestedVersion: '^4.9.0',
        latestVersion: '6.0.1',
      }),
    ).toEqual({
      changed: true,
      nextVersion: '^6.0.1',
    });
    expect(packageJson.dependencies['react-calendar']).toBe('^6.0.1');
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

  it('bootstraps a runnable Vite React manifest when generated source files have no package.json', async () => {
    const workspace = await makeTempDir('bolt-runtime-bootstrap-manifest-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'index.html'),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'src', 'main.jsx'),
      "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n",
      'utf8',
    );
    await fs.writeFile(
      path.join(workspace, 'src', 'App.jsx'),
      'export default function App(){return <div>Doctor schedule</div>;}\n',
      'utf8',
    );

    const repair = await ensureHostedWorkspaceProjectBootstrap({
      dir: workspace,
    } as {
      dir: string;
    });

    expect(repair.generatedFiles).toContain('package.json');
    expect(repair.generatedFiles).toContain('vite.config.js');
    expect(repair.inferredStartCommand).toBe('pnpm run dev');
    await expect(fs.readFile(path.join(workspace, 'package.json'), 'utf8')).resolves.toContain(
      '"dev": "vite --host 0.0.0.0 --port 5173"',
    );
    await expect(fs.readFile(path.join(workspace, 'vite.config.js'), 'utf8')).resolves.toContain(
      '@vitejs/plugin-react',
    );
    await expect(workspaceHasOwnProjectManifest(workspace)).resolves.toBe(true);
  });

  it('self-heals unavailable dependency versions before preview start', async () => {
    const workspace = await makeTempDir('bolt-runtime-install-repair-');
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
          kleur: '^999.0.0',
        },
        devDependencies: {
          vite: '^5.0.0',
        },
      }),
      'utf8',
    );
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'main.jsx'), "import 'react';\n", 'utf8');

    await prepareHostedWorkspaceForStart(
      {
        dir: workspace,
      } as {
        dir: string;
      },
      {},
    );

    const repairedPackageJson = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(repairedPackageJson.dependencies.kleur).not.toBe('^999.0.0');
    expect(repairedPackageJson.dependencies.kleur).toMatch(/^\^?\d+\.\d+\.\d+$/);
    await expect(fs.access(path.join(workspace, 'node_modules', 'kleur'))).resolves.toBeUndefined();
  }, 120000);

  it('reinstalls workspace dependencies and clears stale vite cache when package.json changes', async () => {
    const workspace = await makeTempDir('bolt-runtime-reinstall-');
    const dependencyInstallCommand = [
      'mkdir -p node_modules/.bin node_modules/react node_modules/react-dom node_modules/vite node_modules/date-fns',
      "printf '#!/bin/sh\\n' > node_modules/.bin/vite",
      "printf 'lockfileVersion: 9.0\\n' > pnpm-lock.yaml",
    ].join(' && ');

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

    await prepareHostedWorkspaceForStart(session as { dir: string; lastPreparedDependencyFingerprint: string | null }, {
      dependencyInstallCommand,
    });
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

    await prepareHostedWorkspaceForStart(session as { dir: string; lastPreparedDependencyFingerprint: string | null }, {
      dependencyInstallCommand,
    });

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

  it('builds a hosted runtime snapshot from the real workspace on disk', async () => {
    const workspace = await makeTempDir('bolt-runtime-snapshot-disk-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'src', 'App.tsx'),
      'export default function App() { return <h1>Doctor Scheduler</h1>; }\n',
      'utf8',
    );

    const fileMap = (await buildWorkspaceFileMapFromDisk({ dir: workspace } as { dir: string })) as Record<string, any>;

    expect(fileMap['/home/project/src/App.tsx']).toEqual({
      type: 'file',
      content: 'export default function App() { return <h1>Doctor Scheduler</h1>; }\n',
      isBinary: false,
    });
  });

  it('prefers the real workspace snapshot when in-memory state is empty', async () => {
    const workspace = await makeTempDir('bolt-runtime-snapshot-empty-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'src', 'App.tsx'),
      'export default function App() { return <h1>Clinic Console</h1>; }\n',
      'utf8',
    );

    const session: { dir: string; currentFileMap: Record<string, any> } = {
      dir: workspace,
      currentFileMap: {},
    };

    const resolvedSnapshot = (await resolveSessionSnapshotFiles(session)) as Record<string, any>;

    expect(resolvedSnapshot['/home/project/src/App.tsx']).toEqual({
      type: 'file',
      content: 'export default function App() { return <h1>Clinic Console</h1>; }\n',
      isBinary: false,
    });
    expect(session.currentFileMap['/home/project/src/App.tsx']).toBeDefined();
  });

  it('replaces a stale starter snapshot with the generated workspace snapshot from disk', async () => {
    const workspace = await makeTempDir('bolt-runtime-snapshot-starter-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspace, 'src', 'App.tsx'),
      'export default function App() { return <h1>Generated Scheduler</h1>; }\n',
      'utf8',
    );

    const session: { dir: string; currentFileMap: Record<string, any> } = {
      dir: workspace,
      currentFileMap: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content:
            'export default function App() { return <><h1>Vite + React</h1><p>Your fallback starter is ready.</p></>; }\n',
          isBinary: false,
        },
      },
    };

    const resolvedSnapshot = (await resolveSessionSnapshotFiles(session)) as Record<string, any>;

    expect(resolvedSnapshot['/home/project/src/App.tsx']).toEqual({
      type: 'file',
      content: 'export default function App() { return <h1>Generated Scheduler</h1>; }\n',
      isBinary: false,
    });
    expect(session.currentFileMap['/home/project/src/App.tsx']).toEqual({
      type: 'file',
      content: 'export default function App() { return <h1>Generated Scheduler</h1>; }\n',
      isBinary: false,
    });
  });

  it('refreshes the in-memory file map from the real workspace after sync', async () => {
    const workspace = await makeTempDir('bolt-runtime-current-file-map-');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'main.tsx'), 'console.log("ready");\n', 'utf8');
    await fs.writeFile(
      path.join(workspace, 'src', 'App.tsx'),
      'export default function App() { return <h1>Healthy</h1>; }\n',
      'utf8',
    );
    const session: { dir: string; currentFileMap: Record<string, any> } = {
      dir: workspace,
      currentFileMap: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'stale app',
          isBinary: false,
        },
      },
    };

    const refreshed = await refreshSessionCurrentFileMapFromDisk(session as any);

    expect(refreshed['/home/project/src/main.tsx']).toEqual({
      type: 'file',
      content: 'console.log("ready");\n',
      isBinary: false,
    });
    expect(session.currentFileMap['/home/project/src/App.tsx']?.content).toContain('Healthy');
  });

  it('builds a bootstrap alert when a vite workspace loses its main entry file', () => {
    const alert = buildHostedWorkspaceBootstrapAlert({
      '/home/project/index.html': {
        type: 'file',
        content:
          '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        isBinary: false,
      },
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return <h1>Clinic Console</h1>; }',
        isBinary: false,
      },
      '/home/project/vite.config.ts': {
        type: 'file',
        content: 'export default {};',
        isBinary: false,
      },
    } as any);

    expect(alert?.description).toContain('src/main.tsx');
  });

  it('builds a bootstrap alert when a vite package has no preview entry files yet', () => {
    const alert = buildHostedWorkspaceBootstrapAlert({
      '/home/project/package.json': {
        type: 'file',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          devDependencies: {
            vite: '^5.0.0',
            '@vitejs/plugin-react': '^4.0.0',
          },
        }),
        isBinary: false,
      },
    } as any);

    expect(alert?.description).toContain('index.html');
  });

  it('does not autostart a hosted preview from a package-only vite workspace', async () => {
    const workspace = await makeTempDir('bolt-runtime-package-only-autostart-');
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        scripts: {
          dev: 'vite',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          vite: '^5.0.0',
          '@vitejs/plugin-react': '^4.0.0',
        },
      }),
      'utf8',
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const session = {
        id: 'package-only-autostart',
        dir: workspace,
        preview: undefined,
        autoRestoreInFlight: false,
        processes: new Map(),
        publicOrigin: 'https://alpha1.bolt.gives',
        previewSubscribers: new Set(),
        previewDiagnostics: {
          status: 'idle',
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
      };

      await expect(startHostedPreviewForSession(session as any)).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((session.previewDiagnostics.alert as { description?: string } | null)?.description).toContain(
        'index.html',
      );
      expect(session.previewDiagnostics.recentLogs.join('\n')).toContain('index.html');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not overwrite the restore point with a starter placeholder snapshot', () => {
    const generatedRestorePoint = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return <h1>Generated Scheduler</h1>; }\n',
        isBinary: false,
      },
    };
    const starterSnapshot = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content:
          'export default function App() { return <><h1>Vite + React</h1><p>Your fallback starter is ready.</p></>; }\n',
        isBinary: false,
      },
    };
    const session = {
      previewDiagnostics: {
        healthy: true,
        status: 'ready',
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
      preview: {
        port: 4100,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/starter-restore-guard/4100',
      },
      currentFileMap: starterSnapshot,
      restorePointFileMap: generatedRestorePoint,
      workspaceMutationId: 0,
      lastAutoRestoreFingerprint: 'keep-generated-restore-point',
    };

    markSessionMutationStart(session as any);

    expect(session.restorePointFileMap).toBe(generatedRestorePoint);
    expect(session.workspaceMutationId).toBe(1);
    expect(session.previewRecovery.state).toBe('idle');
    expect(session.previewDiagnostics.status).toBe('starting');
    expect(session.previewDiagnostics.healthy).toBe(false);
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

  it('deduplicates overlapping full-fleet managed instance rollouts', async () => {
    const events: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const first = runSerializedManagedInstanceRollout(
        async () => {
          events.push('first:start');
          await new Promise((resolve) => setTimeout(resolve, 20));
          events.push('first:end');
        },
        { reason: 'startup-sync' },
      );

      const second = runSerializedManagedInstanceRollout(
        async () => {
          events.push('second:start');
        },
        { reason: 'interval-sync' },
      );

      await Promise.all([first, second]);
      expect(warn).toHaveBeenCalledWith(
        '[runtime] managed rollout already in progress; skipping overlapping interval-sync.',
      );
    } finally {
      warn.mockRestore();
    }

    expect(events).toEqual(['first:start', 'first:end']);
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

  it('uses unique atomic temp paths when concurrent registry writes share the same millisecond', async () => {
    const workspace = await makeTempDir('bolt-runtime-atomic-json-');
    const target = path.join(workspace, 'managed-instance-registry.json');
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1777059934414);

    try {
      await Promise.all([writeJsonAtomically(target, '{"version":1}'), writeJsonAtomically(target, '{"version":2}')]);
    } finally {
      dateNow.mockRestore();
    }

    const written = await fs.readFile(target, 'utf8');
    expect(['{"version":1}', '{"version":2}']).toContain(written);
    await expect(fs.readdir(workspace)).resolves.toEqual(['managed-instance-registry.json']);
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
