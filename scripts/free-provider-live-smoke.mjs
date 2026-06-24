#!/usr/bin/env node

const DEFAULT_TARGETS = ['https://alpha1.bolt.gives', 'https://bolt.gives', 'https://bolt-gives.pages.dev'];
const targets = (
  process.env.FREE_PROVIDER_SMOKE_URLS ||
  process.env.BASE_URLS ||
  process.argv.slice(2).join(',') ||
  DEFAULT_TARGETS.join(',')
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function toLlmCallUrl(baseUrl) {
  return new URL('/api/llmcall', baseUrl).toString();
}

async function smokeTarget(baseUrl) {
  const url = toLlmCallUrl(baseUrl);
  const origin = new URL(url).origin;
  const csrf = `free-smoke-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.FREE_PROVIDER_SMOKE_TIMEOUT_MS || '45000'));

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: `${origin}/chat`,
        Cookie: `csrf_token=${csrf}`,
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({
        system: 'Reply with exactly OK.',
        message: 'OK?',
        model: 'deepseek/deepseek-v4-pro',
        provider: { name: 'FREE' },
        streamOutput: false,
      }),
    });
    const text = await response.text();

    if (!response.ok || /invalid or missing api key|missing api key/i.test(text)) {
      throw new Error(
        `${baseUrl}: FREE provider smoke failed with ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
      );
    }

    return {
      baseUrl,
      ok: true,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];

for (const target of targets) {
  results.push(await smokeTarget(target));
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
