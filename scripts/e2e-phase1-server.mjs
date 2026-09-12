// Local test harness only: resolve the reserved test hostname inside Node too.
import dns from 'node:dns';
import { startProductionServer, resolveProductionServerConfig } from './start-pages-production.mjs';

const lookup = dns.lookup;

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
  if (request.url?.split('?')[0] !== '/api/chat') {
    return;
  }

  let tail = '';
  const write = response.write;

  response.write = function (chunk, ...args) {
    tail = (tail + String(chunk)).slice(-32_000);
    return write.call(this, chunk, ...args);
  };
  response.once('close', () => {
    console.log(
      JSON.stringify({
        kind: 'fixture-chat-stream',
        status: response.statusCode,
        finished: response.writableFinished,
        tail,
      }),
    );
  });
});
