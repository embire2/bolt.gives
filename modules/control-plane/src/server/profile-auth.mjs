#!/usr/bin/env node

import crypto from 'node:crypto';

export const PROFILE_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const PROFILE_LOGIN_LINK_TTL_MS = 15 * 60 * 1000;

export function normalizeUserProfileInput(input = {}) {
  return {
    name: String(input.name || '')
      .trim()
      .replace(/\s+/g, ' '),
    email: String(input.email || '')
      .trim()
      .toLowerCase(),
    country: String(input.country || '')
      .trim()
      .replace(/\s+/g, ' '),
  };
}

export function validateUserProfileInput(input = {}) {
  const profile = normalizeUserProfileInput(input);

  if (profile.name.length < 3 || profile.name.length > 120 || !profile.name.includes(' ')) {
    throw new Error('Enter both your name and surname.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) || profile.email.length > 254) {
    throw new Error('Enter a valid email address.');
  }

  if (profile.country.length < 2 || profile.country.length > 80) {
    throw new Error('Enter your country.');
  }

  return profile;
}

export function normalizeProfileReturnTo(value, fallback = '/chat') {
  const candidate = String(value || '').trim();

  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://bolt.gives');

    if (parsed.origin !== 'https://bolt.gives') {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function createProfileAuthRateLimitKey({ scope, requestKey, email } = {}) {
  const normalizedScope = String(scope || 'profile').trim() || 'profile';
  const normalizedRequestKey = String(requestKey || 'unknown').trim() || 'unknown';
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  return `${normalizedScope}:${normalizedRequestKey}:${normalizedEmail || '-'}`;
}

export function hashProfileAuthToken(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

export function createProfileAuthToken(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString('base64url');
}

export function createProfileSessionCredentials(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const token = createProfileAuthToken(options.randomBytes);
  const ttlMs = Math.max(60_000, Number(options.ttlMs || PROFILE_SESSION_TTL_MS));

  return {
    id: crypto.randomUUID(),
    token,
    tokenHash: hashProfileAuthToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function createProfileLoginCredentials(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const token = createProfileAuthToken(options.randomBytes);
  const ttlMs = Math.max(60_000, Number(options.ttlMs || PROFILE_LOGIN_LINK_TTL_MS));

  return {
    id: crypto.randomUUID(),
    token,
    tokenHash: hashProfileAuthToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function sanitizeUserProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: String(profile.id || ''),
    name: String(profile.name || ''),
    email: String(profile.email || ''),
    country: String(profile.country || ''),
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null,
    lastLoginAt: profile.lastLoginAt || null,
  };
}
