import { describe, expect, it } from 'vitest';
import { normalizeArtifactFilePath, toWorkbenchRelativeFilePath } from './file-paths';

describe('normalizeArtifactFilePath', () => {
  it('preserves canonical project paths', () => {
    expect(normalizeArtifactFilePath('/home/project/src/App.jsx')).toBe('/home/project/src/App.jsx');
  });

  it('maps root-relative artifact paths into the workdir', () => {
    expect(normalizeArtifactFilePath('/src/App.jsx')).toBe('/home/project/src/App.jsx');
    expect(normalizeArtifactFilePath('/package.json')).toBe('/home/project/package.json');
  });

  it('maps plain relative paths into the workdir', () => {
    expect(normalizeArtifactFilePath('src/App.jsx')).toBe('/home/project/src/App.jsx');
    expect(normalizeArtifactFilePath('./src/App.jsx')).toBe('/home/project/src/App.jsx');
  });
});

describe('toWorkbenchRelativeFilePath', () => {
  it('returns a workbench-relative path for absolute project files', () => {
    expect(toWorkbenchRelativeFilePath('/home/project/src/App.jsx')).toBe('src/App.jsx');
  });

  it('returns a workbench-relative path for root-relative artifact files', () => {
    expect(toWorkbenchRelativeFilePath('/src/App.jsx')).toBe('src/App.jsx');
  });
});
