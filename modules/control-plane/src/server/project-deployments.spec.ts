import { describe, expect, it } from 'vitest';
import {
  buildCustomDomainDnsInstructions,
  buildProjectHostname,
  buildResolvedProjectDnsStatus,
  encodeStripeForm,
  findProjectDeploymentByHost,
  normalizeProjectDeploymentRegistry,
  slugifyProjectSubdomain,
  validateProjectSubdomain,
} from './project-deployments.mjs';

describe('project deployment helpers', () => {
  it('validates safe bolt.gives project subdomains', () => {
    expect(slugifyProjectSubdomain('My Client App!')).toBe('my-client-app');
    expect(validateProjectSubdomain('calendar')).toMatchObject({ ok: true, subdomain: 'calendar' });
    expect(validateProjectSubdomain('admin')).toMatchObject({ ok: false });
    expect(validateProjectSubdomain('xy')).toMatchObject({ ok: false });
    expect(validateProjectSubdomain('-bad-')).toMatchObject({ ok: true, subdomain: 'bad' });
  });

  it('builds hostnames and DNS instructions without secrets', () => {
    expect(buildProjectHostname('client-app', 'bolt.gives')).toBe('client-app.bolt.gives');
    expect(buildCustomDomainDnsInstructions('Example.com', '31.6.62.183')).toEqual({
      type: 'A',
      name: 'example.com',
      value: '31.6.62.183',
      ttl: 'Auto',
      note: 'Create an A record for example.com pointing to 31.6.62.183. Leave DNS propagation time before retrying HTTPS.',
    });
  });

  it('treats an already resolving project hostname as active DNS', () => {
    expect(
      buildResolvedProjectDnsStatus(
        'smoke-30924.bolt.gives',
        '31.6.62.180',
        ['198.51.100.1', '31.6.62.180'],
        'Existing wildcard DNS is in place.',
      ),
    ).toEqual({
      status: 'active',
      message: 'smoke-30924.bolt.gives already resolves to 31.6.62.180. Existing wildcard DNS is in place.',
    });

    expect(buildResolvedProjectDnsStatus('smoke-30924.bolt.gives', '31.6.62.180', ['198.51.100.1'])).toBeNull();
  });

  it('normalizes a registry and finds deployments by bolt or custom host', () => {
    const registry = normalizeProjectDeploymentRegistry({
      deployments: [
        {
          sessionId: 'session-1',
          subdomain: 'demo',
          hostname: 'demo.bolt.gives',
          customDomains: [{ domain: 'customer.example', status: 'active' }],
        },
      ],
    });

    expect(findProjectDeploymentByHost(registry, 'demo.bolt.gives')?.sessionId).toBe('session-1');
    expect(findProjectDeploymentByHost(registry, 'customer.example')?.sessionId).toBe('session-1');
    expect(findProjectDeploymentByHost(registry, 'pending.example')).toBeNull();
  });

  it('encodes nested Stripe Checkout payloads as form pairs', () => {
    const pairs = encodeStripeForm({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 1000,
          },
        },
      ],
    });

    expect(pairs).toContainEqual(['mode', 'subscription']);
    expect(pairs).toContainEqual(['line_items[0][quantity]', '1']);
    expect(pairs).toContainEqual(['line_items[0][price_data][unit_amount]', '1000']);
  });
});
