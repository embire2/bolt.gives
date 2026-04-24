import { describe, expect, it } from 'vitest';
import { shouldEnableCloudflareDevProxy } from '../vite.config';

describe('shouldEnableCloudflareDevProxy', () => {
  it('enables the Cloudflare dev proxy only for non-test serve sessions', () => {
    expect(shouldEnableCloudflareDevProxy({ command: 'serve', mode: 'development' })).toBe(true);
    expect(shouldEnableCloudflareDevProxy({ command: 'serve', mode: 'test' })).toBe(false);
    expect(shouldEnableCloudflareDevProxy({ command: 'build', mode: 'production' })).toBe(false);
  });
});
