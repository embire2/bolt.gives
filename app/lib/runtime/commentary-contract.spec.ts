import { describe, expect, it } from 'vitest';
import { enforceCommentaryContract } from './commentary-contract';

describe('enforceCommentaryContract', () => {
  it('adds required Key changes and Next sections when missing', () => {
    const result = enforceCommentaryContract({
      phase: 'action',
      message: 'Running install and preparing preview.',
    });

    expect(result.detail).toContain('Key changes:');
    expect(result.detail).toContain('Next:');
    expect(result.detail).toContain('Running install and preparing preview.');
  });

  it('preserves explicit Key changes and Next sections from detail', () => {
    const result = enforceCommentaryContract({
      phase: 'verification',
      message: 'Checking outputs.',
      detail: 'Key changes: Installed dependencies and updated imports.\nNext: Re-run preview compile.',
    });

    expect(result.detail).toContain('Key changes: Installed dependencies and updated imports.');
    expect(result.detail).toContain('Next: Re-run preview compile.');
  });

  it('trims overly long messages into micro updates', () => {
    const result = enforceCommentaryContract({
      phase: 'plan',
      message:
        'Planning the strategy with a very long message that should be shortened so commentary cards stay readable and concise for long running tasks in the timeline.',
    });

    expect(result.message.length).toBeLessThanOrEqual(160);
    expect(result.message.endsWith('...') || result.message.endsWith('.')).toBe(true);
  });

  it('normalizes technical jargon into plain-English wording', () => {
    const result = enforceCommentaryContract({
      phase: 'recovery',
      message: 'Sub-agent failed with stderr output and exit code 1.',
      detail: 'Key changes: Tool calls finished with JSON parse error.\nNext: Inspect stdout and retry.',
    });

    expect(result.message.toLowerCase()).toContain('assistant helper');
    expect(result.message.toLowerCase()).toContain('error output');
    expect(result.message.toLowerCase()).toContain('status code');
    expect(result.detail.toLowerCase()).toContain('actions');
    expect(result.detail.toLowerCase()).toContain('structured data');
    expect(result.detail.toLowerCase()).toContain('command output');
  });
});
