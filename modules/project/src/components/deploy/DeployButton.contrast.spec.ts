import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Deploy dropdown contrast', () => {
  it('uses an opaque white menu with dark option text', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'modules/project/src/components/deploy/DeployButton.tsx'),
      'utf8',
    );

    expect(source).toContain('min-w-[310px] bg-white text-slate-950');
    expect(source).toContain('text-slate-900 hover:bg-slate-100 focus:bg-slate-100');
    expect(source).not.toContain("'bg-bolt-elements-background-depth-2',");
  });
});
