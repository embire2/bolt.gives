import { describe, expect, it } from 'vitest';
import { getCreateRedirectHost, getPublicUrlConfig } from './public-urls';

describe('public URL helpers', () => {
  it('falls back to the app managed-instances path when no dedicated create domain is configured', () => {
    const config = getPublicUrlConfig(
      {
        BOLT_APP_PUBLIC_URL: 'https://code.example.com',
        BOLT_ADMIN_PANEL_PUBLIC_URL: 'https://admin.example.com',
        BOLT_CREATE_TRIAL_PUBLIC_URL: '',
      },
      'https://code.example.com/',
    );

    expect(config.adminPanelUrl).toBe('https://admin.example.com');
    expect(config.createTrialUrl).toBe('https://code.example.com/managed-instances');
  });

  it('preserves an explicit dedicated create domain when configured', () => {
    const config = getPublicUrlConfig(
      {
        BOLT_APP_PUBLIC_URL: 'https://code.example.com',
        BOLT_CREATE_TRIAL_PUBLIC_URL: 'https://create.example.com',
      },
      'https://code.example.com/',
    );

    expect(config.createTrialUrl).toBe('https://create.example.com');
  });

  it('uses the hosted create domain as the redirect host unless a dedicated create URL is configured', () => {
    expect(getCreateRedirectHost({})).toBe('create.bolt.gives');
    expect(getCreateRedirectHost({ BOLT_CREATE_TRIAL_PUBLIC_URL: 'https://create.example.com' })).toBe(
      'create.example.com',
    );
  });
});
