import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Header workbench boot boundary', () => {
  it('keeps preview and deploy actions out of the initial header chunk', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules/surfaces/app/components/header/Header.tsx'), 'utf8');
    const usageBadgeSource = readFileSync(
      resolve(process.cwd(), 'modules/surfaces/app/components/header/UsageBalanceBadge.client.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(
      /import\s+\{\s*HeaderActionButtons\s*\}\s+from\s+['"]\.\/HeaderActionButtons\.client['"]/,
    );
    expect(source).toContain("import('./HeaderActionButtons.client')");
    expect(usageBadgeSource).not.toMatch(
      /import\s+\{\s*workbenchStore\s*\}\s+from\s+['"]@bolt\/project\/lib\/stores\/workbench['"]/,
    );
    expect(usageBadgeSource).toContain("import('@bolt/project/lib/stores/workbench')");
  });

  it('keeps operator links out of the public menu and protects the project title', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules/surfaces/app/components/header/Header.tsx'), 'utf8');

    expect(source).not.toContain('Admin Panel');
    expect(source).not.toContain('WebCoder Premium');
    expect(source).not.toContain('href="/tenant-admin"');
    expect(source).not.toContain('href="/premium"');
    expect(source).toContain("profile ? '/profile' : '/login'");
    expect(source).not.toContain('absolute left-1/2');
    expect(source).toContain('min-w-0 flex-1');
    expect(source).toContain('flex shrink-0 items-center');
  });
});
