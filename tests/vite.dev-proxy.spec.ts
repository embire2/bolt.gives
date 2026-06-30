import { describe, expect, it } from 'vitest';
import { normalizeProductVersion, shouldEnableCloudflareDevProxy } from '../vite.config';

describe('shouldEnableCloudflareDevProxy', () => {
  it('enables the Cloudflare dev proxy only for non-test serve sessions', () => {
    expect(shouldEnableCloudflareDevProxy({ command: 'serve', mode: 'development' })).toBe(true);
    expect(shouldEnableCloudflareDevProxy({ command: 'serve', mode: 'test' })).toBe(false);
    expect(shouldEnableCloudflareDevProxy({ command: 'build', mode: 'production' })).toBe(false);
  });
});

describe('normalizeProductVersion', () => {
  it('renders package prerelease patch versions as product release versions', () => {
    expect(normalizeProductVersion('3.0.9-24')).toBe('3.0.9.24');
    expect(normalizeProductVersion('3.1.0')).toBe('3.1.0');
  });
});
