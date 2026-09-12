import { describe, expect, it } from 'vitest';
import { isAllowedUrl, isPublicAddress } from './public-web-url.mjs';

describe('public web destinations', () => {
  it.each([
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://localhost.',
    'http://10.0.0.1',
    'http://100.64.0.1',
    'http://169.254.169.254',
    'http://192.0.2.1',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://user:password@example.com',
    'file:///etc/passwd',
    'http://machine.internal',
  ])('blocks %s', (url) => {
    expect(isAllowedUrl(url)).toBe(false);
  });
  it.each([
    'https://example.com',
    'https://example.com/path?q=hello',
    'http://8.8.8.8',
    'https://[2606:4700:4700::1111]',
  ])('allows %s', (url) => {
    expect(isAllowedUrl(url)).toBe(true);
  });
  it('rejects invalid address strings', () => expect(isPublicAddress('not-an-address')).toBe(false));
});
