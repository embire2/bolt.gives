import { describe, expect, it } from 'vitest';
import {
  createProfileAuthRateLimitKey,
  createProfileLoginCredentials,
  createProfileLoginCodeCredentials,
  createProfileSessionCredentials,
  hashProfileAuthToken,
  hashProfileLoginCode,
  normalizeProfileReturnTo,
  sanitizeUserProfile,
  validateUserProfileInput,
} from './profile-auth.mjs';

describe('profile authentication contracts', () => {
  it('requires a full name, valid email, and country', () => {
    expect(
      validateUserProfileInput({
        name: '  Ada   Lovelace ',
        email: ' ADA@Example.COM ',
        country: ' South   Africa ',
      }),
    ).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      country: 'South Africa',
    });

    expect(() => validateUserProfileInput({ name: 'Ada', email: 'ada@example.com', country: 'ZA' })).toThrow(
      'name and surname',
    );
  });

  it('creates opaque credentials and stores only their hashes', () => {
    const randomBytes = () => Buffer.alloc(32, 7);
    const now = new Date('2026-07-29T10:00:00.000Z');
    const session = createProfileSessionCredentials({ randomBytes, now, ttlMs: 60_000 });
    const login = createProfileLoginCredentials({ randomBytes, now, ttlMs: 120_000 });

    expect(session.token).not.toBe(session.tokenHash);
    expect(session.tokenHash).toBe(hashProfileAuthToken(session.token));
    expect(session.expiresAt).toBe('2026-07-29T10:01:00.000Z');
    expect(login.expiresAt).toBe('2026-07-29T10:02:00.000Z');
  });

  it('creates a six-digit desktop login code and binds its hash to the challenge', () => {
    const now = new Date('2026-08-01T10:00:00.000Z');
    const secret = 'desktop-login-secret-long-enough';
    const login = createProfileLoginCodeCredentials({
      now,
      secret,
      randomInt: () => 42,
    });

    expect(login.code).toBe('000042');
    expect(login.codeHash).toBe(hashProfileLoginCode({ challengeId: login.id, code: login.code, secret }));
    expect(login.expiresAt).toBe('2026-08-01T10:10:00.000Z');
    expect(() => hashProfileLoginCode({ challengeId: login.id, code: login.code, secret: 'short' })).toThrow(
      'configured securely',
    );
  });

  it('accepts only same-site relative return paths', () => {
    expect(normalizeProfileReturnTo('/chat/project?tab=preview')).toBe('/chat/project?tab=preview');
    expect(normalizeProfileReturnTo('https://attacker.example/phish')).toBe('/chat');
    expect(normalizeProfileReturnTo('//attacker.example/phish')).toBe('/chat');
  });

  it('rate limits login requests by both client and normalized email', () => {
    expect(
      createProfileAuthRateLimitKey({
        scope: 'login',
        requestKey: '203.0.113.10',
        email: ' Person@Example.com ',
      }),
    ).toBe('login:203.0.113.10:person@example.com');
    expect(
      createProfileAuthRateLimitKey({
        scope: 'login',
        requestKey: '203.0.113.11',
        email: 'person@example.com',
      }),
    ).not.toBe('login:203.0.113.10:person@example.com');
  });

  it('sanitizes profiles without returning private authentication state', () => {
    expect(
      sanitizeUserProfile({
        id: 'profile-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        country: 'United Kingdom',
        createdAt: '2026-07-29T10:00:00.000Z',
        updatedAt: '2026-07-29T10:00:00.000Z',
        lastLoginAt: null,
        tokenHash: 'private',
      }),
    ).toEqual({
      id: 'profile-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      country: 'United Kingdom',
      createdAt: '2026-07-29T10:00:00.000Z',
      updatedAt: '2026-07-29T10:00:00.000Z',
      lastLoginAt: null,
    });
  });
});
