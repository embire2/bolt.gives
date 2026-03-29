const PLACEHOLDER_SNIPPETS = ['your_', '_here', 'placeholder', 'replace_me', 'changeme'];
const ROTATE_REQUIRED_REGEX = /rotate[\s_-]*required/i;

function isBracketPlaceholder(value: string): boolean {
  return /^<[^>]+>$/.test(value.trim());
}

export function isPlaceholderCredential(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();

  if (normalized.length === 0) {
    return true;
  }

  if (ROTATE_REQUIRED_REGEX.test(normalized)) {
    return true;
  }

  if (isBracketPlaceholder(rawValue)) {
    return true;
  }

  return PLACEHOLDER_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

export function normalizeCredential(rawValue: unknown): string | undefined {
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const trimmed = rawValue.trim();

  if (trimmed.length === 0 || isPlaceholderCredential(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function normalizeHttpUrl(rawValue: unknown): string | undefined {
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const trimmed = rawValue.trim();

  if (trimmed.length === 0 || isPlaceholderCredential(trimmed)) {
    return undefined;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}
