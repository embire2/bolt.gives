import { describe, expect, it } from 'vitest';
import { buildCommentaryHeartbeat } from './commentary-heartbeat';
import { getCommentaryPoolMessage } from './commentary-pool.generated';

describe('buildCommentaryHeartbeat', () => {
  it('builds a plain-English heartbeat update for normal execution', () => {
    const heartbeat = buildCommentaryHeartbeat(125000, 'action');
    const expected = getCommentaryPoolMessage('action', 2, 'fallback');

    expect(heartbeat.phase).toBe('action');
    expect(heartbeat.message).toBe(expected);
    expect(heartbeat.detail).toContain('Key changes:');
    expect(heartbeat.detail).toContain('Next:');
    expect(heartbeat.detail).toContain('within 60 seconds');
  });

  it('preserves recovery phase when the previous phase was recovery', () => {
    const heartbeat = buildCommentaryHeartbeat(62000, 'recovery');

    expect(heartbeat.phase).toBe('recovery');
  });
});
