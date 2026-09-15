import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mandatory release workflow triggers', () => {
  it('runs installer acceptance on every PR head that the release gate waits for', () => {
    const gate = fs.readFileSync('.github/workflows/pr-release-validation.yaml', 'utf8');
    const installer = fs.readFileSync('.github/workflows/installer-recovery.yml', 'utf8');
    expect(gate).toContain("'Installer Recovery'");
    expect(installer).toMatch(/\bpull_request:/);
    expect(installer).not.toMatch(/\n\s+paths(?:-ignore)?:/);
  });
});
