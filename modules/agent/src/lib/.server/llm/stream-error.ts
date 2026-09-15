/** Providers and the data-stream bridge can reject with strings, not only Error objects. */
export function describeStreamError(error: unknown, env: Record<string, string | undefined> = {}): string {
  const seen = new Set<unknown>();

  function message(value: unknown, depth = 0): string {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object' || depth > 3 || seen.has(value)) {
      return '';
    }

    seen.add(value);

    const entry = value as { message?: unknown; error?: unknown; cause?: unknown; code?: unknown };

    return (
      message(entry.message, depth + 1) ||
      message(entry.error, depth + 1) ||
      message(entry.cause, depth + 1) ||
      message(entry.code, depth + 1)
    );
  }

  let result =
    message(error).trim() ||
    'Generation stream disconnected before completion (unrecognized upstream error). Your project is preserved.';

  for (const [key, value] of Object.entries(env)) {
    if (value && value.length >= 8 && /key|secret|password|token|database_url/i.test(key)) {
      result = result.split(value).join('[redacted]');
    }
  }

  return result
    .replace(/\b(?:sk-|ghp_|magnet-user-)[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/(https?:\/\/|postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
    .slice(0, 1000);
}
