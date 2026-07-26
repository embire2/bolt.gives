import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, normalizeRepoPath, readModuleMap } from './module-ownership.mjs';

describe('module ownership', () => {
  it('defines the six production modules', async () => {
    const map = await readModuleMap();
    expect(Object.keys(map.modules)).toEqual(['core', 'agent', 'runtime', 'project', 'control-plane', 'surfaces']);
  });

  it('normalizes paths for stable reports', () => {
    expect(normalizeRepoPath('./modules\\core\\src\\index.ts')).toBe('modules/core/src/index.ts');
  });

  it('has no undeclared module dependency', async () => {
    const result = await checkModuleBoundaries();
    expect(result.errors).toEqual([]);
  });

  it('keeps new files small and prevents legacy hotspots from growing', async () => {
    const result = await checkModuleBoundaries({ enforceLineLimit: true });
    expect(result.errors).toEqual([]);
  });
});
