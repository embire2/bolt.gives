import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installScript = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');

describe('install.sh', () => {
  it('enforces the Node 22 compatible Ubuntu 20.04 minimum', () => {
    expect(installScript).toContain('Supported target: Ubuntu 20.04+.');
    expect(installScript).toContain('bolt.gives requires Ubuntu 20.04 or newer for Node.js ${NODE_MAJOR}.');
    expect(installScript).toContain('10#${ubuntu_major} < 20');
  });

  it('installs local PostgreSQL tooling only for self-host operators who opt in', () => {
    expect(installScript).toContain('if [[ "${INSTALL_POSTGRES}" -eq 1 ]]');
    expect(installScript).toContain('packages+=(postgresql postgresql-contrib)');
    expect(installScript).toContain('need_cmd psql');
    expect(installScript).not.toContain('packages=(git curl ca-certificates build-essential python3 postgresql');
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
    expect(installScript).toContain(
      'Application health check failed after first startup; restarting the service stack once',
    );
  });

  it('has a committed self-host installer smoke command', () => {
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

    expect(packageJson).toContain('"smoke:self-host-installer"');
    expect(packageJson).toContain('scripts/self-host-installer-smoke.mjs');
  });
});
