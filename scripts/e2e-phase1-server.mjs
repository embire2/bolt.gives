// Local test harness only: resolve the reserved test hostname inside Node too.
import dns from 'node:dns';
import fs from 'node:fs';
import { startProductionServer, resolveProductionServerConfig } from './start-pages-production.mjs';

const lookup = dns.lookup;
const upstreamFetch = globalThis.fetch;

globalThis.fetch = async (...args) => {
  const url = new URL(typeof args[0] === 'object' && 'url' in args[0] ? args[0].url : String(args[0]));
  const observe = url.hostname === 'magnetapi.org' || url.hostname.endsWith('.magnetapi.org');
  const started = Date.now();

  if (/\/sessions\/[^/]+\/sync$/.test(url.pathname) && typeof args[1]?.body === 'string') {
    const body = JSON.parse(args[1].body);
    fs.writeSync(
      1,
      `${JSON.stringify({
        kind: 'fixture-sync',
        at: new Date().toISOString(),
        prune: body.prune,
        files: Object.entries(body.files || {})
          .filter(([name]) => /App\.[jt]sx?$/.test(name))
          .map(([name, file]) => ({
            name,
            followup: /_FOLLOWUP/.test(file.content || ''),
            bytes: file.content?.length,
          })),
      })}\n`,
    );
  }

  try {
    const response = await upstreamFetch(...args);

    if (observe) {
      fs.writeSync(
        1,
        `${JSON.stringify({ kind: 'fixture-upstream', path: url.pathname, status: response.status, elapsedMs: Date.now() - started })}\n`,
      );
    }

    return response;
  } catch (error) {
    if (observe) {
      fs.writeSync(
        1,
        `${JSON.stringify({ kind: 'fixture-upstream-error', path: url.pathname, elapsedMs: Date.now() - started, name: error.name, message: error.message, cause: error.cause?.code })}\n`,
      );
    }

    throw error;
  }
};

dns.lookup = (hostname, options, callback) => {
  if (hostname !== 'phase1.localhost') {
    return lookup(hostname, options, callback);
  }

  const done = typeof options === 'function' ? options : callback;
  queueMicrotask(() => (options?.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4)));

  return undefined;
};

const server = await startProductionServer(resolveProductionServerConfig());

// Owned fixture diagnostics only. The harness redacts credentials and stores stdout mode 0600.
server.on('request', (request, response) => {
  if (new URL(request.url || '/', 'http://fixture.localhost').pathname !== '/api/chat') {
    return;
  }

  let tail = '';
  const write = response.write;

  response.write = function (chunk, ...args) {
    tail = (tail + String(chunk)).slice(-32_000);
    return write.call(this, chunk, ...args);
  };
  response.once('close', () => {
    fs.writeSync(
      1,
      JSON.stringify({
        kind: 'fixture-chat-stream',
        status: response.statusCode,
        finished: response.writableFinished,
        tail,
      }) + '\n',
    );
  });
});
