import { describe, expect, it } from 'vitest';
import { createSecurityHeaders, enforceCsrf } from './security';

describe('createSecurityHeaders', () => {
  it('allows loopback websocket and http sources for localhost requests', () => {
    const headers = createSecurityHeaders({ NODE_ENV: 'development' }, new Request('http://127.0.0.1:8788/'));
    const csp = headers['Content-Security-Policy'];

    expect(csp).toContain("connect-src 'self' https: wss: blob:");
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('http://127.0.0.1:*');
    expect(csp).toContain('ws://localhost:*');
    expect(csp).toContain('ws://127.0.0.1:*');
    expect(csp).not.toContain('[::1]');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('keeps localhost allowances disabled for hosted production requests', () => {
    const headers = createSecurityHeaders({ NODE_ENV: 'production' }, new Request('https://alpha1.bolt.gives/'));
    const csp = headers['Content-Security-Policy'];

    expect(csp).not.toContain('http://localhost:*');
    expect(csp).not.toContain('ws://localhost:*');
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

describe('enforceCsrf', () => {
  it('blocks regular cross-origin API posts', () => {
    const response = enforceCsrf(
      new Request('https://alpha1.bolt.gives/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://trial.pages.dev',
        },
      }),
      { NODE_ENV: 'production' },
    );

    expect(response?.status).toBe(403);
  });

  it('allows hosted FREE relay posts to chat without a browser CSRF token', () => {
    const response = enforceCsrf(
      new Request('https://alpha1.bolt.gives/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://trial.pages.dev',
          'X-Bolt-Hosted-Free-Relay': '1',
          'X-Bolt-Hosted-Free-Relay-Secret': 'relay-secret',
        },
      }),
      { NODE_ENV: 'production' },
    );

    expect(response).toBeNull();
  });

  it('does not apply the hosted relay CSRF exception to unrelated API routes', () => {
    const response = enforceCsrf(
      new Request('https://alpha1.bolt.gives/api/update', {
        method: 'POST',
        headers: {
          Origin: 'https://trial.pages.dev',
          'X-Bolt-Hosted-Free-Relay': '1',
          'X-Bolt-Hosted-Free-Relay-Secret': 'relay-secret',
        },
      }),
      {
        NODE_ENV: 'production',
        BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
      },
    );

    expect(response?.status).toBe(403);
  });

  it('still requires a relay secret header before deferring to route verification', () => {
    const response = enforceCsrf(
      new Request('https://alpha1.bolt.gives/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://trial.pages.dev',
          'X-Bolt-Hosted-Free-Relay': '1',
        },
      }),
      { NODE_ENV: 'production' },
    );

    expect(response?.status).toBe(403);
  });

  it('allows a well-formed Desktop profile credential only on native chat routes', () => {
    const authorization = `BoltProfile 01f00000-0000-4000-8000-000000000001.${'a'.repeat(43)}`;
    const chatResponse = enforceCsrf(
      new Request('https://bolt.gives/api/chat', {
        method: 'POST',
        headers: { Authorization: authorization },
      }),
      { NODE_ENV: 'production' },
    );
    const unrelatedResponse = enforceCsrf(
      new Request('https://bolt.gives/api/update', {
        method: 'POST',
        headers: { Authorization: authorization },
      }),
      { NODE_ENV: 'production' },
    );

    expect(chatResponse).toBeNull();
    expect(unrelatedResponse?.status).toBe(403);
  });

  it('rejects malformed Desktop authorization before route handling', () => {
    const response = enforceCsrf(
      new Request('https://bolt.gives/api/chat', {
        method: 'POST',
        headers: { Authorization: 'BoltProfile not-a-real-session' },
      }),
      { NODE_ENV: 'production' },
    );

    expect(response?.status).toBe(403);
  });
});
