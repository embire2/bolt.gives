import { describe, expect, it } from 'vitest';
import {
  buildCloudflareProjectName,
  inferCloudflareBuildCommand,
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
});
