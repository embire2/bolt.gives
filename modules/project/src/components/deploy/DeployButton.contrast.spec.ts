import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

describe('Deploy dropdown contrast', () => {
  it('uses an opaque white menu with dark option text', () => {
    const source = readFileSync(resolve(TEST_DIR, 'DeployButton.tsx'), 'utf8');

    expect(source).toContain('min-w-[310px] bg-white text-slate-950');
    expect(source).toContain('text-slate-900 hover:bg-slate-100 focus:bg-slate-100');
    expect(source).not.toContain("'bg-bolt-elements-background-depth-2',");
  });
});
