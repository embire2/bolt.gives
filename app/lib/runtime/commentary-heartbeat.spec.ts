import { describe, expect, it } from 'vitest';
import { buildCommentaryHeartbeat } from './commentary-heartbeat';

describe('buildCommentaryHeartbeat', () => {
  it('includes task context in the fallback heartbeat detail', () => {
    const heartbeat = buildCommentaryHeartbeat(120_000, 'action', {
      goal: 'a doctor appointment scheduling web app',
      currentStep: 'Starting the preview and checking the generated form flow.',
      lastVisibleResult: 'The install finished successfully.',
    });

    expect(heartbeat.message.length).toBeGreaterThan(0);
    expect(heartbeat.detail).toContain('Starting the preview and checking the generated form flow');
    expect(heartbeat.detail).toContain('The install finished successfully');
  });
});
