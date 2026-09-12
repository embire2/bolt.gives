export { isAllowedUrl } from '@bolt/core/lib/public-web-url.mjs';

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
