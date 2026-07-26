import { describe, expect, it } from 'vitest';
import { STARTER_TEMPLATES } from './constants';
import { getLocalStarterTemplateFallback, getLocalStarterTemplateFiles } from './localStarterTemplates';

describe('local starter template coverage', () => {
  it('provides a local fallback scaffold for every starter template', () => {
    for (const template of STARTER_TEMPLATES) {
      const fallback = getLocalStarterTemplateFallback(template);

      expect(fallback, `Missing fallback for template "${template.name}"`).not.toBeNull();
      expect(fallback?.scaffoldCommand?.length || 0).toBeGreaterThan(0);
      expect(fallback?.stackLabel?.length || 0).toBeGreaterThan(0);
    }
  });

  it('provides local helper files for every starter template fallback', () => {
    for (const template of STARTER_TEMPLATES) {
      const files = getLocalStarterTemplateFiles(template);
      const filePaths = files.map((file) => file.path);

      expect(filePaths, `Missing README fallback for "${template.name}"`).toContain('README.md');
      expect(filePaths, `Missing .bolt prompt fallback for "${template.name}"`).toContain('.bolt/prompt');
    }
  });

  it('includes a deterministic built-in Vite React starter scaffold', () => {
    const template = STARTER_TEMPLATES.find((item) => item.name === 'Vite React');
    expect(template).toBeDefined();

    const files = getLocalStarterTemplateFiles(template!);
    const filePaths = files.map((file) => file.path);

    expect(filePaths).toContain('package.json');
    expect(filePaths).toContain('src/main.tsx');
    expect(filePaths).toContain('vite.config.ts');
  });
});
