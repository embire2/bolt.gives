import { describe, expect, it } from 'vitest';
import {
  buildCloudflarePagesWorkerScript,
  buildCloudflareProjectName,
  inferCloudflareBuildCommand,
  listCloudflareEntryAssetPaths,
  normalizeCloudflareProjectDeploymentRegistry,
  parseCloudflareDeploymentUrl,
  selectCloudflareBuildOutput,
} from './cloudflare-project-deployments.mjs';

describe('Cloudflare project deployments', () => {
  it('builds stable account-scoped project names without exposing the session id', () => {
    const first = buildCloudflareProjectName('private-session-123', 'My Calendar App');
    const second = buildCloudflareProjectName('private-session-123', 'My Calendar App');

    expect(first).toBe(second);
    expect(first).toMatch(/^bolt-my-calendar-app-[a-f0-9]{8}$/);
    expect(first).not.toContain('private-session');
  });

  it('selects the generated build output and supports static root projects', () => {
    expect(
      selectCloudflareBuildOutput({
        directories: ['src', 'dist'],
        hasBuildScript: true,
        hasRootIndex: true,
      }),
    ).toBe('dist');
    expect(selectCloudflareBuildOutput({ directories: ['assets'], hasRootIndex: true, hasBuildScript: false })).toBe(
      '.',
    );
  });

  it('uses the available package manager and parses Wrangler deployment output', () => {
    expect(inferCloudflareBuildCommand({ scripts: { build: 'vite build' } }, { pnpm: true })).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
    });
    expect(parseCloudflareDeploymentUrl('Deployment complete! https://a1b2c3d4.bolt-demo.pages.dev')).toBe(
      'https://a1b2c3d4.bolt-demo.pages.dev',
    );
  });

  it('builds a Pages advanced-mode Worker with asset and SPA fallback handling', () => {
    const worker = buildCloudflarePagesWorkerScript();

    expect(worker).toContain('env.ASSETS.fetch(request)');
    expect(worker).toContain("new URL('/index.html', request.url)");
    expect(worker).toContain('!assetLikePath');
    expect(worker).toContain("response.headers.get('content-type')?.includes('text/html')");
    expect(worker).toContain("x-bolt-deployment', 'cloudflare-pages-worker'");
    expect(worker).not.toContain('DATABASE_URL');
  });

  it('collects safe local entry assets without treating external or traversal URLs as deployable files', () => {
    expect(
      listCloudflareEntryAssetPaths(`
        <link rel="stylesheet" href="/assets/index.css?v=4">
        <script src="./app.js#ready"></script>
        <script src="https://cdn.example/app.js"></script>
        <img src="../private.env">
        <a href="#today">Today</a>
        <a href="/dashboard">Dashboard</a>
      `),
    ).toEqual(['app.js', 'assets/index.css']);
  });

  it('drops malformed persisted records instead of exposing partial deployments', () => {
    const registry = normalizeCloudflareProjectDeploymentRegistry({
      deployments: [
        { sessionId: '', projectName: 'missing-session' },
        { sessionId: 'session-1', projectName: 'demo' },
      ],
    });

    expect(registry.deployments).toHaveLength(1);
    expect(registry.deployments[0]).toMatchObject({ sessionId: 'session-1', projectName: 'demo' });
  });

  it('preserves full project names and repairs names truncated by the legacy 32-character normalizer', () => {
    const sessionId = 'private-session-123';
    const legacySessionId = 'another-session';
    const requestedName = 'long-calendar-project-name';
    const projectName = buildCloudflareProjectName(sessionId, requestedName);
    const legacyProjectName = buildCloudflareProjectName(legacySessionId, requestedName);
    const registry = normalizeCloudflareProjectDeploymentRegistry({
      deployments: [
        { sessionId, requestedName, projectName },
        { sessionId: legacySessionId, requestedName, projectName: legacyProjectName.slice(0, 32) },
      ],
    });

    expect(registry.deployments[0].projectName).toBe(projectName);
    expect(registry.deployments[1].projectName).toBe(legacyProjectName);
    expect(projectName.length).toBeGreaterThan(32);
  });

  it('retains durable hostname, Worker, and database metadata without credentials', () => {
    const registry = normalizeCloudflareProjectDeploymentRegistry({
      deployments: [
        {
          sessionId: 'session-1',
          projectName: 'demo',
          hostname: 'calendar.instances.bolt.gives',
          workerEnabled: true,
          databaseName: 'bolt_project_1234',
          databasePassword: 'must-not-survive',
        },
      ],
    });

    expect(registry.version).toBe(2);
    expect(registry.deployments[0]).toMatchObject({
      hostname: 'calendar.instances.bolt.gives',
      url: 'https://calendar.instances.bolt.gives',
      workerEnabled: true,
      databaseName: 'bolt_project_1234',
    });
    expect(JSON.stringify(registry)).not.toContain('must-not-survive');
  });
});
