import type { AppLoadContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';
import { checkRateLimit, createSecurityHeaders, enforceCsrf } from '~/lib/security';

const WEBCONTAINER_PREFIXES = ['/webcontainer.connect', '/webcontainer.preview'];

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: any,
  loadContext: AppLoadContext,
) {
  const url = new URL(request.url);
  const env = ((loadContext as any)?.cloudflare?.env ?? (loadContext as any)?.env) as
    | Record<string, string | undefined>
    | undefined;

  /*
   * Apply the same CSRF + rate-limit gate we apply in the Cloudflare Pages
   * entry, so non-CF runtimes (Node/Docker/Electron/Tauri) get identical
   * protection.
   */
  if (url.pathname.startsWith('/api/')) {
    const csrf = enforceCsrf(request, env);

    if (csrf) {
      return csrf;
    }

    const rl = await checkRateLimit(request, url.pathname);

    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil(((rl.resetTime ?? Date.now()) - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': String(rl.limit ?? ''),
          'X-RateLimit-Remaining': String(rl.remaining ?? 0),
          'X-RateLimit-Reset': String(rl.resetTime ?? ''),
          ...createSecurityHeaders(env, request),
        },
      });
    }
  }

  const readable = await renderToReadableStream(<RemixServer context={remixContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  const body = new ReadableStream({
    start(controller) {
      const head = renderHeadToString({ request, remixContext, Head });

      controller.enqueue(
        new Uint8Array(
          new TextEncoder().encode(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`,
          ),
        ),
      );

      const reader = readable.getReader();

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              controller.enqueue(new Uint8Array(new TextEncoder().encode('</div></body></html>')));
              controller.close();

              return;
            }

            controller.enqueue(value);
            read();
          })
          .catch((error) => {
            controller.error(error);
            readable.cancel();
          });
      }
      read();
    },

    cancel() {
      readable.cancel();
    },
  });

  if (isbot(request.headers.get('user-agent') || '')) {
    await readable.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  /*
   * Merge security headers. Honor any value the loader already set so routes
   * that need relaxed COEP (WebContainer iframes) can keep their override.
   */
  const security = createSecurityHeaders(env, request);

  for (const [key, value] of Object.entries(security)) {
    if (
      (key === 'Cross-Origin-Embedder-Policy' || key === 'Cross-Origin-Opener-Policy') &&
      WEBCONTAINER_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      continue;
    }

    if (!responseHeaders.has(key)) {
      responseHeaders.set(key, value);
    }
  }

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
