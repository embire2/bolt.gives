import { describe, expect, it } from 'vitest';
import { mergePromptContext } from './prompt-merge';

describe('mergePromptContext', () => {
  it('returns the original content when no context is provided', () => {
    expect(mergePromptContext({ content: 'hello' })).toBe('hello');
  });

  it('appends sketch JSON when provided', () => {
    const merged = mergePromptContext({
      content: 'build a ui',
      sketchElements: [{ id: '1', type: 'rect', x: 1, y: 2, width: 3, height: 4 }],
    });

    expect(merged).toContain('build a ui');
    expect(merged).toContain('[Sketch JSON]');
    expect(merged).toContain('"type":"sketch-v1"');
    expect(merged).toContain('"elements"');
    expect(merged).toContain('"type":"rect"');
  });

  it('embeds the selected element payload when provided', () => {
    const merged = mergePromptContext({
      content: 'refactor this',
      selectedElement: { displayText: 'Button', tagName: 'button' },
    });

    expect(merged).toContain('refactor this');
    expect(merged).toContain('__boltSelectedElement__');
    expect(merged).toContain("data-element='");
    expect(merged).toContain('Button');
  });
});
