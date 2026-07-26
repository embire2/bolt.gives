import { describe, expect, it } from 'vitest';
import type { InteractiveStepRunnerEvent } from './interactive-step-runner';
import { getLastMeaningfulProgressTimestamp, isProgressBearingStepEvent } from './stall-progress';

function event(overrides: Partial<InteractiveStepRunnerEvent>): InteractiveStepRunnerEvent {
  return {
    type: 'telemetry',
    timestamp: '2026-02-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('stall-progress', () => {
  it('ignores telemetry events for progress checks', () => {
    expect(
      isProgressBearingStepEvent(
        event({
          type: 'telemetry',
          description: 'runtime telemetry',
        }),
      ),
    ).toBe(false);
  });

  it('ignores internal stall error events so they do not reset recovery timers', () => {
    expect(
      isProgressBearingStepEvent(
        event({
          type: 'error',
          description: 'Potential stall detected',
        }),
      ),
    ).toBe(false);
  });

  it('returns the latest actionable step timestamp instead of fallback', () => {
    const fallbackTimestamp = new Date('2026-02-23T00:00:00.000Z').getTime();
    const latest = getLastMeaningfulProgressTimestamp(
      [
        event({
          type: 'telemetry',
          timestamp: '2026-02-23T00:00:05.000Z',
        }),
        event({
          type: 'step-start',
          timestamp: '2026-02-23T00:00:10.000Z',
        }),
        event({
          type: 'error',
          description: 'Potential stall detected',
          timestamp: '2026-02-23T00:00:20.000Z',
        }),
      ],
      fallbackTimestamp,
    );

    expect(latest).toBe(new Date('2026-02-23T00:00:10.000Z').getTime());
  });

  it('considers additional non-step progress timestamps such as streamed text activity', () => {
    const fallbackTimestamp = new Date('2026-02-23T00:00:00.000Z').getTime();
    const latest = getLastMeaningfulProgressTimestamp(
      [
        event({
          type: 'step-start',
          timestamp: '2026-02-23T00:00:10.000Z',
        }),
      ],
      fallbackTimestamp,
      [new Date('2026-02-23T00:00:25.000Z').getTime()],
    );

    expect(latest).toBe(new Date('2026-02-23T00:00:25.000Z').getTime());
  });

  it('treats hosted commentary data timestamps as meaningful progress when step events are only telemetry', () => {
    const fallbackTimestamp = new Date('2026-02-23T00:00:00.000Z').getTime();
    const latest = getLastMeaningfulProgressTimestamp(
      [
        event({
          type: 'telemetry',
          description: 'runtime telemetry',
          timestamp: '2026-02-23T00:00:35.000Z',
        }),
      ],
      fallbackTimestamp,
      [new Date('2026-02-23T00:00:50.000Z').getTime()],
    );

    expect(latest).toBe(new Date('2026-02-23T00:00:50.000Z').getTime());
  });
});
