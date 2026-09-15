const PLATFORM_COOKIE = /^(?:(?:__Host-)?bolt[_:-]|cody[-:]|git(?::|hub|lab)|VITE_|apiKeys$|providers$|csrf_token$)/i;

export function previewRequestHeaders(headers) {
  const result = {};

  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();

    if (/^x-(?:bolt|cody)-/.test(lower)) {
      continue;
    }

    if (lower === 'authorization' && /^BoltProfile\s/i.test(String(value))) {
      continue;
    }

    if (lower === 'cookie') {
      const cookies = String(value || '')
        .split(';')
        .filter((part) => {
          let key = part.trim().split('=')[0];

          try {
            key = decodeURIComponent(key);
          } catch {
            return false;
          }

          return key && !PLATFORM_COOKIE.test(key);
        })
        .map((part) => part.trim())
        .join('; ');

      if (cookies) {
        result[lower] = cookies;
      }
    } else {
      result[lower] = value;
    }
  }

  return result;
}
