const DEFAULT_ADMIN_PANEL_URL = 'https://admin.bolt.gives';
const DEFAULT_CREATE_TRIAL_URL = 'https://create.bolt.gives';

type EnvLike = Record<string, string | undefined>;

export interface PublicUrlConfig {
  adminPanelUrl: string;
  createTrialUrl: string;
  adminHost: string;
  createHost: string;
}

function normalizeConfiguredUrl(rawValue: string | undefined, fallbackUrl: string) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return fallbackUrl;
  }

  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return new URL(`https://${value}`).toString().replace(/\/$/, '');
  }
}

export function getPublicUrlConfig(env: EnvLike = typeof process !== 'undefined' ? process.env : {}): PublicUrlConfig {
  const adminPanelUrl = normalizeConfiguredUrl(env.BOLT_ADMIN_PANEL_PUBLIC_URL, DEFAULT_ADMIN_PANEL_URL);
  const createTrialUrl = normalizeConfiguredUrl(env.BOLT_CREATE_TRIAL_PUBLIC_URL, DEFAULT_CREATE_TRIAL_URL);

  return {
    adminPanelUrl,
    createTrialUrl,
    adminHost: new URL(adminPanelUrl).host.toLowerCase(),
    createHost: new URL(createTrialUrl).host.toLowerCase(),
  };
}

export const DEFAULT_PUBLIC_URL_CONFIG = getPublicUrlConfig({});
