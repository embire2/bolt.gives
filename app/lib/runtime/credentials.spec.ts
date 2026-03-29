import { describe, expect, it } from 'vitest';
import { isPlaceholderCredential, normalizeCredential, normalizeHttpUrl } from './credentials';

describe('credentials helpers', () => {
  it('detects common placeholder credentials', () => {
    expect(isPlaceholderCredential('ROTATE_REQUIRED')).toBe(true);
    expect(isPlaceholderCredential('your_openai_key_here')).toBe(true);
    expect(isPlaceholderCredential('<api-key>')).toBe(true);
    expect(isPlaceholderCredential('sk-real-key-value')).toBe(false);
  });

  it('normalizes valid credentials and strips placeholders', () => {
    expect(normalizeCredential(' sk-live ')).toBe('sk-live');
    expect(normalizeCredential(' ROTATE_REQUIRED ')).toBeUndefined();
    expect(normalizeCredential('')).toBeUndefined();
  });

  it('normalizes http urls and rejects placeholders/invalid urls', () => {
    expect(normalizeHttpUrl('https://api.openai.com')).toBe('https://api.openai.com');
    expect(normalizeHttpUrl(' your_base_url_here ')).toBeUndefined();
    expect(normalizeHttpUrl('localhost:11434')).toBeUndefined();
  });
});
