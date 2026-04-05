import { describe, expect, it } from 'vitest';
import {
  buildManagedInstanceHostname,
  claimManagedInstanceTrial,
  createManagedInstanceTrialExpiry,
  getManagedInstanceBySessionSecret,
  normalizeManagedInstanceRegistry,
  resolveManagedInstancePagesAddress,
  sanitizeManagedInstanceForClient,
  sanitizeManagedInstanceForOperator,
} from './managed-instances.mjs';

describe('managed instance registry helpers', () => {
  it('creates a single experimental trial instance claim per client identity', () => {
    const registry = normalizeManagedInstanceRegistry({});

    const firstClaim = claimManagedInstanceTrial(registry, {
      name: 'OpenWeb Clinic',
      email: 'doctor@example.com',
      requestedSubdomain: 'doctor-clinic',
      trialDays: 15,
      rootDomain: 'pages.dev',
    });

    expect(firstClaim.kind).toBe('created');
    expect(firstClaim.instance.projectName).toBe('doctor-clinic');
    expect(firstClaim.instance.routeHostname).toBe('doctor-clinic.pages.dev');

    const duplicateClaim = claimManagedInstanceTrial(registry, {
      name: 'OpenWeb Clinic',
      email: 'doctor@example.com',
      requestedSubdomain: 'doctor-clinic',
      trialDays: 15,
      rootDomain: 'pages.dev',
    });

    expect(duplicateClaim.kind).toBe('conflict');
    expect(duplicateClaim.code).toBe('client-instance-exists');
  });

  it('rejects a second claim for an already-reserved subdomain', () => {
    const registry = normalizeManagedInstanceRegistry({});

    const firstClaim = claimManagedInstanceTrial(registry, {
      name: 'Clinic One',
      email: 'owner-one@example.com',
      requestedSubdomain: 'clinic-one',
      rootDomain: 'pages.dev',
    });

    expect(firstClaim.kind).toBe('created');

    const secondClaim = claimManagedInstanceTrial(registry, {
      name: 'Clinic Two',
      email: 'owner-two@example.com',
      requestedSubdomain: 'clinic-one',
      rootDomain: 'pages.dev',
    });

    expect(secondClaim.kind).toBe('conflict');
    expect(secondClaim.code).toBe('subdomain-unavailable');
  });

  it('returns the same instance when the original session token is reused', () => {
    const registry = normalizeManagedInstanceRegistry({});
    const claim = claimManagedInstanceTrial(registry, {
      name: 'Clinic Three',
      email: 'owner-three@example.com',
      requestedSubdomain: 'clinic-three',
      rootDomain: 'pages.dev',
    });

    expect(claim.kind).toBe('created');

    if (claim.kind !== 'created') {
      throw new Error('Expected the initial managed instance claim to be created.');
    }

    const sessionSecret = claim.sessionSecret;

    if (!sessionSecret) {
      throw new Error('Expected created managed instance claim to return a session secret.');
    }

    const existing = claimManagedInstanceTrial(registry, {
      name: 'Clinic Three',
      email: 'owner-three@example.com',
      requestedSubdomain: 'clinic-three',
      rootDomain: 'pages.dev',
      sessionSecret,
    });

    expect(existing.kind).toBe('existing');
    expect(existing.instance.id).toBe(claim.instance.id);
    expect(getManagedInstanceBySessionSecret(registry, sessionSecret)?.id).toBe(claim.instance.id);
  });

  it('does not allow a second browser-session claim to create a new instance under a different email', () => {
    const registry = normalizeManagedInstanceRegistry({});
    const claim = claimManagedInstanceTrial(registry, {
      name: 'Clinic Session Lock',
      email: 'owner-session@example.com',
      requestedSubdomain: 'clinic-session-lock',
      rootDomain: 'pages.dev',
    });

    expect(claim.kind).toBe('created');

    if (claim.kind !== 'created' || !claim.sessionSecret) {
      throw new Error('Expected initial managed instance claim to create a reusable session.');
    }

    const duplicateSession = claimManagedInstanceTrial(registry, {
      name: 'Another Clinic',
      email: 'different-owner@example.com',
      requestedSubdomain: 'another-clinic',
      rootDomain: 'pages.dev',
      sessionSecret: claim.sessionSecret,
    });

    expect(duplicateSession.kind).toBe('existing');
    expect(duplicateSession.instance.id).toBe(claim.instance.id);
  });

  it('sanitizes managed instance state before returning it to the client', () => {
    const registry = normalizeManagedInstanceRegistry({
      instances: [
        {
          id: 'instance-1',
          name: 'Clinic Four',
          email: 'owner-four@example.com',
          clientKeyHash: 'client-hash',
          clientSessionSecretHash: 'secret-hash',
          projectName: 'clinic-four',
          routeHostname: 'clinic-four.pages.dev',
          pagesUrl: 'https://clinic-four.pages.dev',
          status: 'active',
        },
      ],
    });

    expect(sanitizeManagedInstanceForClient(registry.instances[0])).toEqual(
      expect.objectContaining({
        id: 'instance-1',
        projectName: 'clinic-four',
        routeHostname: 'clinic-four.pages.dev',
        pagesUrl: 'https://clinic-four.pages.dev',
        status: 'active',
      }),
    );
    expect(sanitizeManagedInstanceForClient(registry.instances[0])).not.toHaveProperty('clientSessionSecretHash');
    expect(sanitizeManagedInstanceForClient(registry.instances[0])).not.toHaveProperty('clientKeyHash');
    expect(sanitizeManagedInstanceForOperator(registry.instances[0])).not.toHaveProperty('clientSessionSecretHash');
    expect(sanitizeManagedInstanceForOperator(registry.instances[0])).not.toHaveProperty('clientKeyHash');
  });

  it('builds hostnames and trial expiries deterministically', () => {
    expect(buildManagedInstanceHostname('Clinic Five', 'pages.dev')).toBe('clinic-five.pages.dev');
    expect(Date.parse(createManagedInstanceTrialExpiry(15))).toBeGreaterThan(Date.now());
  });

  it('prefers the actual Cloudflare-assigned subdomain when resolving the live Pages host', () => {
    expect(
      resolveManagedInstancePagesAddress(
        {
          name: 'team2',
          subdomain: 'team2-6og.pages.dev',
          domains: ['team2-6og.pages.dev'],
        },
        'team2',
        'pages.dev',
      ),
    ).toEqual({
      routeHostname: 'team2-6og.pages.dev',
      pagesUrl: 'https://team2-6og.pages.dev',
    });

    expect(resolveManagedInstancePagesAddress(null, 'clinic-five', 'pages.dev')).toEqual({
      routeHostname: 'clinic-five.pages.dev',
      pagesUrl: 'https://clinic-five.pages.dev',
    });
  });
});
