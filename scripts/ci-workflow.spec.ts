import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('GitHub workflow dependency setup', () => {
  it('skips Electron downloads in web-only install jobs', () => {
    const webOnlyInstallFiles = [
      '.github/actions/setup-and-build/action.yaml',
      '.github/workflows/pages-production.yaml',
      '.github/workflows/release-gate.yml',
      '.github/workflows/security.yaml',
    ];

    for (const file of webOnlyInstallFiles) {
      expect(readRepoFile(file), file).toContain("ELECTRON_SKIP_BINARY_DOWNLOAD: '1'");
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
});
