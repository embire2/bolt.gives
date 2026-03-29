import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commandNeedsProjectManifest,
  resolveRuntimeWorkspaceRoot,
  runSessionOperation,
  syncWorkspaceSnapshot,
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
});
