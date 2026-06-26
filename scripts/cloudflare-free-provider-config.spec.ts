import { describe, expect, it } from 'vitest';
import {
  buildFreeProviderSecretValues,
  buildHostedFreeRelayPlainEnv,
  mergePagesDeploymentConfigs,
  parseCloudflareFreeProviderConfigArgs,
  resolveTargetProjects,
} from './cloudflare-free-provider-config.mjs';

describe('cloudflare FREE provider config helpers', () => {
  it('builds only relay/control plain env values and never includes the upstream model key', () => {
    const plainEnv = buildHostedFreeRelayPlainEnv({
      hostedFreeRelayOrigin: 'https://bolt.gives/',
      runtimeControlPublicUrl: 'https://bolt.gives/runtime/',
      freeOpenRouterApiKey: 'must-not-be-used',
    });

    expect(plainEnv).toEqual({
      BOLT_HOSTED_FREE_RELAY_ORIGIN: 'https://bolt.gives',
      BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://bolt.gives/runtime',
    });
    expect(plainEnv).not.toHaveProperty('FREE_OPENROUTER_API_KEY');
  });

  it('syncs relay and quota secrets without using the upstream model key', () => {
    const secrets = buildFreeProviderSecretValues({
      BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
      BOLT_FREE_USAGE_QUOTA_SECRET: 'quota-secret',
      FREE_OPENROUTER_API_KEY: 'must-not-be-used',
    });

    expect(secrets).toEqual({
      BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
      BOLT_FREE_USAGE_QUOTA_SECRET: 'quota-secret',
    });
    expect(JSON.stringify(secrets)).not.toContain('must-not-be-used');
  });

  it('falls back to the relay secret when no dedicated quota secret is configured', () => {
    expect(
      buildFreeProviderSecretValues({
        BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
      }),
    ).toEqual({
      BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
      BOLT_FREE_USAGE_QUOTA_SECRET: 'relay-secret',
    });
  });

  it('merges relay and secret env into preview and production without dropping existing env vars', () => {
    const merged = mergePagesDeploymentConfigs(
      {
        production: {
          env_vars: {
            EXISTING_FLAG: {
              type: 'plain_text',
              value: '1',
            },
          },
        },
      },
      {
        BOLT_HOSTED_FREE_RELAY_ORIGIN: 'https://bolt.gives',
        BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://bolt.gives/runtime',
      },
      {
        BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret',
        BOLT_FREE_USAGE_QUOTA_SECRET: 'quota-secret',
      },
    ) as any;

    expect(merged.production.env_vars.EXISTING_FLAG.value).toBe('1');
    expect(merged.production.env_vars.BOLT_HOSTED_FREE_RELAY_ORIGIN.value).toBe('https://bolt.gives');
    expect(merged.preview.env_vars.BOLT_RUNTIME_CONTROL_PUBLIC_URL.value).toBe('https://bolt.gives/runtime');
    expect(merged.production.env_vars.BOLT_HOSTED_FREE_RELAY_SECRET).toEqual({
      type: 'secret_text',
      value: 'relay-secret',
    });
    expect(merged.preview.env_vars.BOLT_FREE_USAGE_QUOTA_SECRET).toEqual({
      type: 'secret_text',
      value: 'quota-secret',
    });
    expect(JSON.stringify(merged)).not.toContain('FREE_OPENROUTER_API_KEY');
  });

  it('targets the canonical Pages project plus active managed projects only when requested', () => {
    const projects = resolveTargetProjects({
      projects: [],
      includeManaged: true,
      env: {},
      registry: {
        instances: [
          { projectName: 'active-one', status: 'active' },
          { projectName: 'suspended-one', status: 'suspended' },
          { projectName: 'active-two', status: 'active' },
        ],
      },
    });

    expect(projects).toEqual(['bolt-gives', 'active-one', 'active-two']);
  });

  it('ignores the pnpm argument separator when parsing CLI options', () => {
    expect(parseCloudflareFreeProviderConfigArgs(['--', '--project', 'bolt-gives', '--dry-run'])).toEqual({
      dryRun: true,
      includeManaged: false,
      projects: ['bolt-gives'],
    });
  });
});
