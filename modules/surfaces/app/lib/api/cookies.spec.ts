import { describe, expect, it } from 'vitest';
import { getApiKeysFromCookie, getProviderSettingsFromCookie, parseCookies } from './cookies';

describe('cookie parsing helpers', () => {
  it('skips malformed encoded cookie pairs without throwing', () => {
    expect(() => parseCookies('ok=value; bad=%E0%A4%A; another=1')).not.toThrow();
    expect(parseCookies('ok=value; bad=%E0%A4%A; another=1')).toEqual({
      ok: 'value',
      another: '1',
    });
  });

  it('returns empty provider settings for invalid JSON cookie values', () => {
    expect(getProviderSettingsFromCookie('providers=%7Binvalid-json')).toEqual({});
  });

  it('returns sanitized api key map from cookie payload', () => {
    const cookie = `apiKeys=${encodeURIComponent(JSON.stringify({ OpenAI: ' sk-test ', Empty: ' ' }))}`;

    expect(getApiKeysFromCookie(cookie)).toEqual({ OpenAI: 'sk-test' });
  });
});
