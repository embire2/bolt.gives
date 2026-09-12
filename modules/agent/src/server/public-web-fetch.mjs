import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isAllowedUrl, isPublicAddress } from '@bolt/core/lib/public-web-url.mjs';

export class WebDestinationError extends Error {
  constructor(message = 'Only public HTTP/HTTPS destinations are allowed.') {
    super(message);
    this.status = 400;
  }
}

/** @template T @param {Promise<T>} promise @param {AbortSignal} signal @returns {Promise<T>} */
function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** @param {string} input @param {{resolve?: (hostname: string, options: {all: true, verbatim: true}) => Promise<import('node:dns').LookupAddress[]>, signal?: AbortSignal}} options */
export async function resolvePublicDestination(input, { resolve = lookup, signal = AbortSignal.timeout(10_000) } = {}) {
  if (!isAllowedUrl(input)) {
    throw new WebDestinationError();
  }

  const url = new URL(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await abortable(resolve(hostname, { all: true, verbatim: true }), signal);

  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new WebDestinationError();
  }

  return { url, address: addresses[0] };
}

export async function publicWebFetch(input, options = {}) {
  const signal = options.signal || AbortSignal.timeout(options.timeoutMs || 15_000);
  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  let next = input;

  for (let hop = 0; hop <= 5; hop++) {
    const destination = await resolvePublicDestination(next, { resolve: options.resolve, signal });
    signal.throwIfAborted();

    const result = await readPinned(destination, { ...options, maxBytes, signal });

    if (
      options.redirect === 'manual' ||
      ![301, 302, 303, 307, 308].includes(result.status) ||
      !result.headers.location
    ) {
      return result;
    }

    next = new URL(result.headers.location, destination.url).href;
  }
  throw new WebDestinationError('The page exceeded the redirect limit.');
}

/** @returns {Promise<{url: string, status: number, headers: import('node:http').IncomingHttpHeaders, body: Buffer}>} */
function readPinned({ url, address }, { signal, maxBytes, request: requestOverride }) {
  return new Promise((resolve, reject) => {
    const request = requestOverride || (url.protocol === 'https:' ? https.request : http.request);
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        headers: {
          'User-Agent': 'bolt.gives public web reader',
          Accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.5',
          'Accept-Encoding': 'identity',
        },

        // Preserve Host and TLS SNI while preventing a second, rebinding DNS lookup.
        lookup: (_hostname, lookupOptions, callback) =>
          lookupOptions.all ? callback(null, [address]) : callback(null, address.address, address.family),
      },
      (response) => {
        const encoding = response.headers['content-encoding'];

        if ((encoding && encoding !== 'identity') || Number(response.headers['content-length'] || 0) > maxBytes) {
          const error = new WebDestinationError(
            'The page exceeds the readable response limit or uses unsupported compression.',
          );
          response.destroy();
          req.destroy();
          reject(error);

          return;
        }

        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;

          if (size > maxBytes) {
            const error = new WebDestinationError('The page exceeds the readable response limit.');
            response.destroy();
            req.destroy();
            reject(error);
          } else {
            chunks.push(chunk);
          }
        });
        response.on('error', reject);
        response.on('aborted', () => reject(new Error('The page response was interrupted.')));
        response.on('end', () =>
          resolve({
            url: url.href,
            status: response.statusCode || 502,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function protectBrowserContext(
  context,
  { signal = AbortSignal.timeout(30_000), fetchPage = publicWebFetch } = {},
) {
  let requests = 0;
  let totalBytes = 0;
  let mainError;
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();

    try {
      if (++requests > 80 || totalBytes > 8 * 1024 * 1024 || request.method() !== 'GET') {
        throw new WebDestinationError('The page exceeded the browsing budget.');
      }

      const response = await fetchPage(request.url(), { signal, redirect: 'manual' });
      totalBytes += response.body.length;

      if (totalBytes > 8 * 1024 * 1024) {
        throw new WebDestinationError('The page exceeded the browsing budget.');
      }

      const headers = {};

      for (const key of ['content-type', 'location']) {
        if (typeof response.headers[key] === 'string') {
          headers[key] = response.headers[key];
        }
      }
      await route.fulfill({ status: response.status, headers, body: response.body });
    } catch (error) {
      if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
        mainError = error;
      }

      await route.abort('blockedbyclient').catch(() => {});
    }
  });

  return () => {
    if (mainError) {
      throw mainError;
    }
  };
}
