import { describe, expect, it } from 'vitest';
import { parseProfileAuthorizationHeader, serializeProfileAuthorization } from './profile-session';

describe('Desktop profile authorization', () => {
  it('round-trips a native profile session without accepting malformed values', () => {
    const credentials = {
      id: '01f00000-0000-4000-8000-000000000001',
      token: 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
    };

    expect(parseProfileAuthorizationHeader(serializeProfileAuthorization(credentials))).toEqual(credentials);
    expect(parseProfileAuthorizationHeader('Bearer secret')).toBeNull();
    expect(parseProfileAuthorizationHeader('BoltProfile missing-token')).toBeNull();
  });
});
