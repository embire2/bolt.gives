import { describe, expect, it } from 'vitest';
import { createSecurityHeaders } from './security';

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
