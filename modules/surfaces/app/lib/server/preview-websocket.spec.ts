import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { proxyPreviewWebSocket } from './preview-websocket.mjs';

const wsModule = createRequire(import.meta.url)('ws');

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0).reverse()) {
    close();
  }
});

async function listen(server: http.Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  closers.push(() => server.close());

  return `http://127.0.0.1:${(server.address() as any).port}`;
}

describe('production Preview upgrades', () => {
  it('authenticates before tunnelling a real WebSocket to the configured runtime', async () => {
    const runtime = http.createServer();
    const ws = new wsModule.WebSocketServer({ server: runtime });
    closers.push(() => {
      for (const client of ws.clients) {
        client.terminate();
      }
      ws.close();
    });
    ws.on('connection', (socket: any, request: http.IncomingMessage) =>
      socket.on('message', (data: Buffer) => socket.send(`${request.url}:${data}`)),
    );

    const upstream = await listen(runtime);
    const app = http.createServer();
    const base = await listen(app);
    const authorize = vi.fn(async (_request: Request) => new Response('{}'));
    app.on('upgrade', (request, socket, head) => {
      void proxyPreviewWebSocket({
        request,
        socket,
        head,
        url: `${base}${request.url}`,
        env: { BOLT_RUNTIME_CONTROL_URL: `${upstream}/runtime` },
        authorize,
      });
    });

    const client = new wsModule.WebSocket(
      `${base.replace('http', 'ws')}/runtime/preview/test-session/6200/?token=fixture`,
      {
        origin: base,
      },
    );
    closers.push(() => client.terminate());
    await once(client, 'open');

    const message = once(client, 'message');
    client.send('ping');
    expect(String((await message)[0])).toBe('/runtime/preview/test-session/6200/?token=fixture:ping');
    expect(authorize.mock.calls[0][0].url).toBe(`${base}/runtime/sessions/test-session/preview-status`);
  });
  it.each([
    ['/runtime/preview/session/6200/', 'https://attacker.example', 200, 403],
    ['/runtime/preview/session/6200/', 'https://app.example', 401, 401],
    ['/runtime/admin', 'https://app.example', 200, 404],
  ])('rejects unsafe or unauthorized upgrades (%s)', async (pathname, origin, status, expected) => {
    const socket = { destroyed: false, end: vi.fn() };
    const authorize = vi.fn(async () => new Response('{}', { status }));
    await proxyPreviewWebSocket({
      request: { headers: { origin } },
      socket,
      head: Buffer.alloc(0),
      url: `https://app.example${pathname}`,
      env: { BOLT_RUNTIME_CONTROL_URL: 'http://127.0.0.1:4321/runtime' },
      authorize,
    });
    expect(socket.end).toHaveBeenCalledWith(expect.stringContaining(`HTTP/1.1 ${expected}`));
  });
});
