import { describe, expect, it } from 'vitest';
import {
  getReleaseHomeReadinessMarkers,
  getScreenshotMinimumBytes,
  hasRenderedServerError,
} from './release-gate-utils.mjs';

describe('release error-page detection', () => {
  it('does not confuse a changelog description with a rendered server failure', () => {
    expect(hasRenderedServerError('<h1>Changelog</h1><li>Fixed a generic server error.</li>')).toBe(false);
  });

  it.each([
    '<title>Application Error</title>',
    '<h1>Server Error</h1>',
    '<h2 class="error">Custom <strong>Error</strong></h2>',
    '<summary>Error Details</summary>',
  ])('still rejects an actual error surface: %s', (html) => {
    expect(hasRenderedServerError(html)).toBe(true);
  });
});

describe('release gate home readiness', () => {
  it('tracks the current spam-safe GitHub contribution wording', () => {
    expect(getReleaseHomeReadinessMarkers('v3.1.0')).toEqual([
      'v3.1.0',
      'the transparent ai coding workspace',
      'contribute on github',
      'real screenshots',
    ]);
  });
});

describe('release gate screenshot thresholds', () => {
  it('keeps content-heavy screenshots on the default threshold', () => {
    expect(getScreenshotMinimumBytes('home.png')).toBe(60_000);
    expect(getScreenshotMinimumBytes('/tmp/bolt-release-gate/chat.png')).toBe(60_000);
  });

  it('allows the empty workspace capture to be lighter while still rejecting blank images', () => {
    expect(getScreenshotMinimumBytes('system-in-action.png')).toBe(40_000);
    expect(getScreenshotMinimumBytes('/tmp/bolt-release-gate/system-in-action.png')).toBe(40_000);
  });
});
