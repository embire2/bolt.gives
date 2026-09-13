import { describe, expect, it } from 'vitest';
import { isIsolatedPreviewNavigationAbort, observedPromptTokens } from './calendar-e2e-contracts.mjs';

describe('Calendar acceptance assertions', () => {
  it('checks the entire request before diagnostic history is truncated', () => {
    expect(observedPromptTokens(`INITIAL${'x'.repeat(5000)}FOLLOWUP`, 'INITIAL', 'FOLLOWUP')).toEqual({
      initialPromptObserved: true,
      followUpPromptObserved: true,
    });
  });
  it('distinguishes canceled Preview navigations from HTTP, TLS and connection failures', () => {
    const url = `https://pv-${'a'.repeat(32)}.preview.example/src/App.tsx`;
    expect(isIsolatedPreviewNavigationAbort(`REQFAIL GET ${url} :: net::ERR_ABORTED`)).toBe(true);
    expect(isIsolatedPreviewNavigationAbort(`REQFAIL GET ${url} :: net::ERR_CONNECTION_REFUSED`)).toBe(false);
    expect(isIsolatedPreviewNavigationAbort(`HTTP 500 ${url}`)).toBe(false);
    expect(isIsolatedPreviewNavigationAbort('REQFAIL GET https://bolt.gives/api/chat :: net::ERR_ABORTED')).toBe(false);
  });
});
