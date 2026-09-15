const PUBLIC_VALUES = [
  'VITE_LOG_LEVEL',
  'VITE_DISABLE_PERSISTENCE',
  'VITE_GIT_BRANCH',
  'VITE_GIT_COMMIT',
  'OPENAI_LIKE_API_MODELS',
] as const;
const PUBLIC_URLS = [
  'OPENAI_LIKE_API_BASE_URL',
  'OLLAMA_API_BASE_URL',
  'LMSTUDIO_API_BASE_URL',
  'TOGETHER_API_BASE_URL',
] as const;

export function publicEnvironmentDefines(environment: Record<string, string | undefined>): Record<string, string> {
  const defines: Record<string, string> = {};

  for (const name of PUBLIC_VALUES) {
    const value = environment[name];

    if (value !== undefined) {
      defines[`import.meta.env.${name}`] = JSON.stringify(value);
    }
  }

  for (const name of PUBLIC_URLS) {
    const value = environment[name];

    if (!value) {
      continue;
    }

    try {
      const url = new URL(value);

      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        continue;
      }

      defines[`import.meta.env.${name}`] = JSON.stringify(value);
    } catch {
      // Invalid or credential-bearing provider URLs must not enter a browser chunk.
    }
  }

  return defines;
}
