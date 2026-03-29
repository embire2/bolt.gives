import { describe, expect, it } from 'vitest';
import { createTestAndSecuritySteps, getMissingJestStubs } from './test-security';

describe('test-security', () => {
  it('creates lint/security/test steps in the expected order', () => {
    const steps = createTestAndSecuritySteps();

    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({
      description: 'Run ESLint',
      command: ['pnpm', 'run', 'lint'],
    });
    expect(steps[1]?.description).toContain('security scan');
    expect(steps[1]?.command?.[0]).toBe('bash');
    expect(steps[2]).toMatchObject({
      description: 'Run test suite',
      command: ['pnpm', 'test'],
    });
  });

  it('generates missing Vitest stubs for changed source files only', () => {
    const files = {
      '/src/already.test.ts': { type: 'file' },
      '/src/existing.test.ts': { type: 'file' },
    } as any;

    const stubs = getMissingJestStubs(files, [
      '/src/new.ts',
      '/src/existing.ts',
      '/src/existing.test.ts',
      '/node_modules/pkg/index.ts',
    ]);

    /*
     * /src/existing.ts should NOT get a stub because /src/existing.test.ts exists.
     * /src/new.ts should get a stub because no test exists.
     */
    const stubPaths = stubs.map((stub) => stub.path).sort();
    expect(stubPaths).toEqual(['/src/new.test.ts']);
    expect(stubs[0]?.content).toContain("from 'vitest'");
  });
});
