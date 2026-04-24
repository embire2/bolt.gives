import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Header workbench boot boundary', () => {
  it('keeps preview and deploy actions out of the initial header chunk', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/header/Header.tsx'), 'utf8');

    expect(source).not.toMatch(
      /import\s+\{\s*HeaderActionButtons\s*\}\s+from\s+['"]\.\/HeaderActionButtons\.client['"]/,
    );
    expect(source).toContain("import('./HeaderActionButtons.client')");
  });
});
