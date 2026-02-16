#!/usr/bin/env node
import http from 'node:http';
import { chromium } from 'playwright';

const HOST = process.env.WEB_BROWSE_HOST || '127.0.0.1';
const PORT = Number(process.env.WEB_BROWSE_PORT || '4179');
const NAVIGATION_TIMEOUT_MS = Number(process.env.WEB_BROWSE_TIMEOUT_MS || '30000');
const DEFAULT_MAX_CONTENT_CHARS = Number(process.env.WEB_BROWSE_MAX_CONTENT_CHARS || '20000');

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', '[::1]', '0.0.0.0']);

function isAllowedUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }

  return true;
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJsonBody(req) {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk.toString();

    if (raw.length > 1_000_000) {
      throw new Error('Request body is too large');
    }
  }

  return raw ? JSON.parse(raw) : {};
}

let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }

  return browserPromise;
}

async function withPage(handler) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

  try {
    return await handler(page);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function browsePage(payload) {
  const url = String(payload?.url || '').trim();

  if (!url) {
    throw new Error('URL is required');
  }

  if (!isAllowedUrl(url)) {
    throw new Error('URL is not allowed');
  }

  const maxChars = Math.max(1000, Math.min(Number(payload?.maxChars || DEFAULT_MAX_CONTENT_CHARS), 40000));

  return withPage(async (page) => {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(750);

    const extracted = await page.evaluate((contentLimit) => {
      const text = (document.body?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, contentLimit);

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .slice(0, 30);

      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => ({
          title: (anchor.textContent || '').trim(),
          url: anchor.href,
        }))
        .filter((link) => link.url && /^https?:\/\//.test(link.url))
        .slice(0, 40);

      const description =
        document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
        '';

      return {
        title: document.title || '',
        description,
        content: text,
        headings,
        links,
      };
    }, maxChars);

    return {
      url,
      finalUrl: page.url(),
      status: response?.status() ?? 0,
      ...extracted,
    };
  });
}

async function searchWeb(payload) {
  const query = String(payload?.query || '').trim();

  if (!query) {
    throw new Error('Query is required');
  }

  const maxResults = Math.max(1, Math.min(Number(payload?.maxResults || 5), 8));
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
  const jinaSearchUrl = `https://r.jina.ai/http://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;

  const parseJinaSearchMarkdown = (markdown, limit) => {
    const lines = markdown.split('\n');
    const results = [];
    const seen = new Set();

    const matchResultLine = /^\s*(\d+)\.\s+(.+?)\s+\[\!\[Image.*?\]\(.*?\)\]\((https?:\/\/duckduckgo\.com\/\?q=[^)]+)\)\s*(.*)$/i;
    const matchSubLinkLine = /^\s*\*\s+\[###\s+(.+?)\]\((https?:\/\/[^)]+)\)/i;

    for (const line of lines) {
      if (results.length >= limit) {
        break;
      }

      const resultLine = line.match(matchResultLine);

      if (resultLine) {
        const title = resultLine[2]?.trim() || '';
        const duckUrl = resultLine[3] || '';
        const snippet = resultLine[4]?.trim() || '';
        const domainMatch = duckUrl.match(/[?&]q=([^&]+)/);
        const decoded = domainMatch ? decodeURIComponent(domainMatch[1]) : '';
        const siteMatch = decoded.match(/site:([a-z0-9.-]+\.[a-z]{2,})/i);
        const candidate = siteMatch ? siteMatch[1] : decoded.replace(/^site:/i, '');
        const normalizedUrl = candidate.startsWith('http') ? candidate : `https://${candidate}`;

        if (normalizedUrl && !/\s/.test(normalizedUrl) && /^https?:\/\/[^\s]+$/i.test(normalizedUrl) && !seen.has(normalizedUrl)) {
          seen.add(normalizedUrl);
          results.push({
            title,
            url: normalizedUrl,
            snippet,
          });
        }

        continue;
      }

      const subLinkLine = line.match(matchSubLinkLine);

      if (subLinkLine) {
        const title = subLinkLine[1]?.trim() || '';
        const url = subLinkLine[2] || '';

        if (url && !seen.has(url)) {
          seen.add(url);
          results.push({
            title,
            url,
            snippet: '',
          });
        }
      }
    }

    return results.slice(0, limit);
  };

  return withPage(async (page) => {
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(1200);

    let results = await page.evaluate((limit) => {
      const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();

      // Try DuckDuckGo's current result containers first
      const cards = Array.from(document.querySelectorAll('[data-testid="result"]'));

      const fromCards = cards
        .map((card) => {
          const link = card.querySelector('a[href]');
          const title = normalize(link?.textContent);
          const url = link?.href || '';
          const snippet = normalize(
            card.querySelector('[data-result="snippet"], .result__snippet, [data-testid="result-snippet"]')
              ?.textContent,
          );

          return { title, url, snippet };
        })
        .filter((item) => item.url && /^https?:\/\//.test(item.url));

      if (fromCards.length > 0) {
        return fromCards.slice(0, limit);
      }

      // Fallback for classic DDG markup
      const classic = Array.from(document.querySelectorAll('.result'))
        .map((row) => {
          const link = row.querySelector('.result__a, a[href]');
          const title = normalize(link?.textContent);
          const url = link?.href || '';
          const snippet = normalize(row.querySelector('.result__snippet')?.textContent);

          return { title, url, snippet };
        })
        .filter((item) => item.url && /^https?:\/\//.test(item.url));

      return classic.slice(0, limit);
    }, maxResults);

    if (!results.length) {
      // Captcha/challenge pages sometimes block direct scraping on server IP ranges.
      // Fallback to Jina's readable mirror of DDG results to keep web search usable.
      const fallbackResponse = await fetch(jinaSearchUrl, {
        method: 'GET',
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

      if (fallbackResponse.ok) {
        const fallbackText = await fallbackResponse.text();
        results = parseJinaSearchMarkdown(fallbackText, maxResults);
      }
    }

    return {
      query,
      engine: 'duckduckgo',
      results,
    };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const payload = await readJsonBody(req);

    if (req.url === '/browse') {
      const data = await browsePage(payload);
      sendJson(res, 200, data);
      return;
    }

    if (req.url === '/search') {
      const data = await searchWeb(payload);
      sendJson(res, 200, data);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[web-browse] listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();

    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {
      // ignore
    }

    process.exit(0);
  });
}
