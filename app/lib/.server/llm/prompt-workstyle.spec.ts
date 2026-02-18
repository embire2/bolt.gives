import { describe, expect, it } from 'vitest';
import { withDevelopmentCommentaryWorkstyle } from './prompt-workstyle';

describe('withDevelopmentCommentaryWorkstyle', () => {
  it('appends workstyle guidance for run/build and shell compatibility', () => {
    const prompt = withDevelopmentCommentaryWorkstyle('Base prompt');

    expect(prompt).toContain('If the user asks to build/run an app');
    expect(prompt).toContain('ls <file> >/dev/null 2>&1');
    expect(prompt).toContain('include the exact created file path');
  });

  it('does not append duplicate workstyle blocks', () => {
    const first = withDevelopmentCommentaryWorkstyle('Base prompt');
    const second = withDevelopmentCommentaryWorkstyle(first);

    const matches = second.match(/<workstyle>/g) || [];
    expect(matches).toHaveLength(1);
  });
});
