import { describe, expect, it } from 'vitest';
import { buildCommentaryHeartbeat } from './commentary-heartbeat';

describe('buildCommentaryHeartbeat', () => {
  it('builds a plain-English heartbeat update for normal execution', () => {
    const heartbeat = buildCommentaryHeartbeat(125000, 'action');

    expect(heartbeat.phase).toBe('action');
    expect(heartbeat.message).toContain('Still working');
    expect(heartbeat.detail).toContain('Key changes:');
    expect(heartbeat.detail).toContain('Next:');
    expect(heartbeat.detail).toContain('within 60 seconds');
  });

  it('preserves recovery phase when the previous phase was recovery', () => {
    const heartbeat = buildCommentaryHeartbeat(62000, 'recovery');

    expect(heartbeat.phase).toBe('recovery');
  });
});
