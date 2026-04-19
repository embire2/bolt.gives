import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installScript = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');

describe('install.sh', () => {
  it('installs local PostgreSQL client tooling for self-host operators', () => {
    expect(installScript).toContain('postgresql-client');
    expect(installScript).toContain('need_cmd psql');
  });

  it('prompts interactively for local PostgreSQL database credentials', () => {
    expect(installScript).toContain('Local PostgreSQL database name');
    expect(installScript).toContain('Local PostgreSQL user name');
    expect(installScript).toContain('Local PostgreSQL password (leave blank to generate)');
  });

  it('prompts for private operator credentials and seeds the tenant registry locally', () => {
    expect(installScript).toContain('--operator-username');
    expect(installScript).toContain('--operator-password');
    expect(installScript).toContain('Private operator/admin username');
    expect(installScript).toContain('Private operator/admin password');
    expect(installScript).toContain('tenant-registry.json');
    expect(installScript).toContain('Fresh non-interactive installs require --operator-password');
  });

  it('contains recovery paths for dependencies, builds, and first health check startup', () => {
    expect(installScript).toContain('repair_repo_dependencies');
    expect(installScript).toContain('Build failed on first attempt; clearing generated artifacts and retrying once');
    expect(installScript).toContain('Application health check failed after first startup; restarting the service stack once');
  });
});
