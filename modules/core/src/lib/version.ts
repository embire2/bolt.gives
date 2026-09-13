// Vite injects package.json's version; unbundled tools must not advertise a stale release.
export const APP_VERSION = typeof __APP_VERSION !== 'undefined' ? __APP_VERSION : 'development';
