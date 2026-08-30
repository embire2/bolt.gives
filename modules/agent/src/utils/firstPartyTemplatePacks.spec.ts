import { describe, expect, it } from 'vitest';
import {
  buildFirstPartyTemplatePackFiles,
  FIRST_PARTY_TEMPLATE_PACKS,
  selectFirstPartyTemplatePack,
} from './firstPartyTemplatePacks';

describe('first-party template packs', () => {
  it('ships a deterministic first-pass app for every supported family', () => {
    expect(FIRST_PARTY_TEMPLATE_PACKS).toHaveLength(6);

    for (const pack of FIRST_PARTY_TEMPLATE_PACKS) {
      const files = buildFirstPartyTemplatePackFiles(pack, `Build a ${pack.label}`);
      const app = files.find((file) => file.path === 'src/App.tsx');
      const css = files.find((file) => file.path === 'src/App.css');
      const combined = files
        .map((file) => file.content)
        .join('\n')
        .toLowerCase();

      expect(app, `${pack.id} App.tsx`).toBeDefined();
      expect(css, `${pack.id} App.css`).toBeDefined();
      expect(combined).not.toContain('your fallback starter is ready');

      for (const signal of pack.smokeSignals) {
        expect(combined, `${pack.id} smoke signal: ${signal}`).toContain(signal.toLowerCase());
      }
    }
  });

  it('prefers a specific product family over the generic website match', () => {
    expect(selectFirstPartyTemplatePack('Build a portfolio website')?.id).toBe('portfolio');
    expect(selectFirstPartyTemplatePack('Build an ecommerce website')?.id).toBe('commerce-catalog');
    expect(selectFirstPartyTemplatePack('Build a Google Calendar website')?.id).toBe('calendar-planner');
  });

  it('quotes user-provided headings instead of injecting them into TSX markup', () => {
    const pack = FIRST_PARTY_TEMPLATE_PACKS.find((candidate) => candidate.id === 'marketing-site') || null;
    const files = buildFirstPartyTemplatePackFiles(
      pack,
      'Build a marketing site with visible heading "Launch ` ${notExecutable}"',
    );
    const app = files.find((file) => file.path === 'src/App.tsx')?.content || '';

    expect(app).toContain('const pageHeading = "Launch ` ${notExecutable}";');
    expect(app).toContain('<h1>{pageHeading}</h1>');
    expect(app).not.toContain('<h1>Launch');
  });
});
