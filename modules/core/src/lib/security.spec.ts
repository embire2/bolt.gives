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
});
