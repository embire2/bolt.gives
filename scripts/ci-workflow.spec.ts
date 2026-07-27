import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('GitHub workflow dependency setup', () => {
  it('does not restore the retired Electron build surface', () => {
    const webOnlyInstallFiles = [
      '.github/actions/setup-and-build/action.yaml',
      '.github/workflows/pages-production.yaml',
      '.github/workflows/release-gate.yml',
      '.github/workflows/security.yaml',
    ];

    for (const file of webOnlyInstallFiles) {
      expect(readRepoFile(file), file).not.toContain('ELECTRON_SKIP_BINARY_DOWNLOAD');
    }

    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];

    expect(Object.keys(packageJson.scripts ?? {}).some((name) => name.startsWith('electron:'))).toBe(false);
    expect(dependencyNames.filter((name) => name === 'electron' || name.startsWith('electron-'))).toEqual([]);
    expect(dependencyNames.filter((name) => name.startsWith('@electron/'))).toEqual([]);

    for (const retiredPath of [
      '.github/workflows/electron.yml',
      'electron-builder.yml',
      'electron-update.yml',
      'vite-electron.config.ts',
      'modules/surfaces/electron',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, retiredPath)), retiredPath).toBe(false);
    }
  });

  it('uses one current CodeQL target for JavaScript and TypeScript', () => {
    const workflow = readRepoFile('.github/workflows/security.yaml');

    expect(workflow).toContain("language: ['javascript-typescript']");
    expect(workflow).toContain('github/codeql-action/init@v4');
    expect(workflow).toContain('github/codeql-action/autobuild@v4');
    expect(workflow).toContain('github/codeql-action/analyze@v4');
    expect(workflow).not.toMatch(/github\/codeql-action\/(?:init|autobuild|analyze)@v3/);
  });

  it('smokes the exact immutable URL emitted by the current Wrangler deployment', () => {
    const workflow = readRepoFile('.github/workflows/pages-production.yaml');

    expect(workflow).toContain('pnpm exec wrangler pages deploy build/client');
    expect(workflow).toContain("deployment_url=\"$(grep -Eo 'https://[a-z0-9-]+\\.bolt-gives\\.pages\\.dev'");
    expect(workflow).toContain('echo "url=$deployment_url" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('DEPLOYMENT_URL: ${{ steps.deploy.outputs.url }}');
    expect(workflow).toContain('for attempt in $(seq 1 24); do');
    expect(workflow).toContain('Deployment is not ready (attempt $attempt/24); retrying in 5 seconds.');
    expect(workflow).toContain('Production deployment did not become ready: $DEPLOYMENT_URL');
    expect(workflow).not.toContain('cloudflare/pages-action');
  });
});
