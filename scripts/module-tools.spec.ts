import { describe, expect, it } from 'vitest';
import { readModuleMap } from './module-ownership.mjs';
import { selectAffectedModules } from './module-tools.mjs';

describe('module tools', () => {
  it('includes transitive dependents for a focused change', async () => {
    const map = await readModuleMap();

    expect(selectAffectedModules(map, ['modules/agent/src/lib/runtime/architect.ts'])).toEqual([
      'agent',
      'project',
      'surfaces',
    ]);
  });

  it('fans root configuration changes out to every module', async () => {
    const map = await readModuleMap();

    expect(selectAffectedModules(map, ['tsconfig.base.json'])).toEqual(Object.keys(map.modules));
  });

  it('does not compile modules for documentation-only changes', async () => {
    const map = await readModuleMap();

    expect(selectAffectedModules(map, ['README.md', 'docs/architecture/modules.md'])).toEqual([]);
  });
});
