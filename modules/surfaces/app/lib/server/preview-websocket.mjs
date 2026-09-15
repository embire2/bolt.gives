import http from 'node:http';
import https from 'node:https';

function reject(socket, status) {
  if (!socket.destroyed) {
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
}

/*
 * Node fetch cannot forward HTTP upgrades. Authorize via the same worker guard,
 * then tunnel only a runtime-owned Preview path to the configured control plane.
 */
export async function proxyPreviewWebSocket({ request, socket, head, url, env, authorize }) {
  const incoming = new URL(url);
  const match = incoming.pathname.match(/^\/runtime\/preview\/([a-zA-Z0-9_-]+)\/\d+(?:\/|$)/);

  if (!match) {
    reject(socket, 404);
    return;
  }

  if (request.headers.origin && request.headers.origin !== incoming.origin) {
    reject(socket, 403);
    return;
  }

  let upstream;

  try {
    upstream = new URL(env.BOLT_RUNTIME_CONTROL_URL || env.BOLT_RUNTIME_CONTROL_PUBLIC_URL);

    if (!['http:', 'https:'].includes(upstream.protocol)) {
      throw new Error('Invalid runtime transport');
    }

    const check = new URL(`/runtime/sessions/${match[1]}/preview-status`, incoming);
    const response = await authorize(
      new Request(check, {
        headers: { Cookie: request.headers.cookie || '' },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    await response.body?.cancel();

    if (!response.ok) {
      reject(socket, response.status === 401 || response.status === 403 ? response.status : 503);
      return;
    }
  } catch {
    reject(socket, 503);
    return;
  }

  if (socket.destroyed) {
    return;
  }

  const basePath = upstream.pathname.replace(/\/+$/, '').replace(/\/runtime$/, '');
  upstream.pathname = `${basePath}${incoming.pathname}`;
  upstream.search = incoming.search;

  const forward = (upstream.protocol === 'https:' ? https : http).request(upstream, {
    headers: {
      ...request.headers,
      host: upstream.host,
      'x-bolt-public-origin': incoming.origin,
      'x-forwarded-host': incoming.host,
      'x-forwarded-proto': incoming.protocol.slice(0, -1),
    },
  });
  const timer = setTimeout(() => forward.destroy(new Error('Preview upgrade timed out')), 10_000);
  timer.unref();
  socket.once('close', () => {
    clearTimeout(timer);
    forward.destroy();
  });
  socket.once('error', () => forward.destroy());
  forward.once('error', () => {
    clearTimeout(timer);
    reject(socket, 502);
  });
  forward.once('response', (response) => {
    clearTimeout(timer);
    response.resume();
    reject(socket, 502);
  });
  forward.once('upgrade', (response, upstreamSocket, upstreamHead) => {
    clearTimeout(timer);

    if (socket.destroyed) {
      upstreamSocket.destroy();
      return;
    }

    const headers = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];

    for (let index = 0; index < response.rawHeaders.length; index += 2) {
      headers.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`);
    }
    socket.write(`${headers.join('\r\n')}\r\n\r\n`);

    if (upstreamHead.length) {
      socket.write(upstreamHead);
    }

    if (head.length) {
      upstreamSocket.write(head);
    }

    upstreamSocket.on('error', () => socket.destroy());
    upstreamSocket.once('close', () => socket.destroy());
    socket.once('close', () => upstreamSocket.destroy());
    socket.pipe(upstreamSocket).pipe(socket);
  });
  forward.end();
}
