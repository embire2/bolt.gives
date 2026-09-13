import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy Linux update entrypoint', () => {
  it('delegates quoted paths and release options to the guarded installer without copying the checkout', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bolt update '));

    try {
      mkdirSync(path.join(root, 'scripts'));
      writeFileSync(path.join(root, 'scripts/update.sh'), readFileSync('scripts/update.sh'));
      writeFileSync(path.join(root, 'install.sh'), '#!/bin/bash\nprintf "%s\\n" "$@"\n');

      const output = execFileSync('bash', [path.join(root, 'scripts/update.sh'), '--branch', 'v4.1.0', '--skip-deps'], {
        encoding: 'utf8',
      });

      expect(output.trim().split('\n')).toEqual(['--install-dir', root, '--branch', 'v4.1.0', '--skip-deps']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
