import { describe, expect, it } from 'vitest';
import { withDevelopmentCommentaryWorkstyle } from './prompt-workstyle';

describe('development commentary workstyle', () => {
  it('appends a <workstyle> section when missing', () => {
    const prompt = withDevelopmentCommentaryWorkstyle('base prompt');
    expect(prompt).toContain('base prompt');
    expect(prompt).toContain('<workstyle>');
    expect(prompt).toContain('frequent short progress updates');
    expect(prompt).toContain('Never output code changes outside <boltAction type="file"> blocks.');
    expect(prompt).toContain('If the user already provided one or more direct URLs');
  });

  it('is idempotent when <workstyle> already exists', () => {
    const base = `hello\n\n<workstyle>\n  something\n</workstyle>\n`;
    const once = withDevelopmentCommentaryWorkstyle(base);
    const twice = withDevelopmentCommentaryWorkstyle(once);
    expect(twice).toBe(once);
  });
});
