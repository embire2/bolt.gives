// Local test harness only: resolve the reserved test hostname inside Node too.
import dns from 'node:dns';
import fs from 'node:fs';
import { hookReplayResponse } from './e2e-hook-replay.mjs';
import { startProductionServer, resolveProductionServerConfig } from './start-pages-production.mjs';

const lookup = dns.lookup;
const upstreamFetch = globalThis.fetch;

globalThis.fetch = async (...args) => {
  const url = new URL(typeof args[0] === 'object' && 'url' in args[0] ? args[0].url : String(args[0]));
  const observe = url.hostname === 'openrouter.ai';
  const started = Date.now();

  if (observe && process.env.BOLT_E2E_HOOK_REPLAY === '1') {
    fs.writeSync(1, JSON.stringify({ kind: 'fixture-hook-replay', simulatedProvider: true }) + '\n');
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.BOLT_E2E_REPLAY_DELAY_MS) || 1000));

    return hookReplayResponse(args[1]?.body);
  }

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

      if (response.body && response.headers.get('Content-Type')?.includes('text/event-stream')) {
        let buffer = '';
        let bytes = 0;
        let lastLog = 0;
        const counts = {};
        const decoder = new TextDecoder();
        const stream = response.body.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              bytes += chunk.length;
              buffer += decoder.decode(chunk, { stream: true });

              const blocks = buffer.split(/\r?\n\r?\n/);
              buffer = blocks.pop() || '';

              for (const block of blocks) {
                const line = block.split(/\r?\n/).find((line) => line.startsWith('data:'));

                if (!line) {
                  continue;
                }

                try {
                  const event = JSON.parse(line.slice(5));
                  counts[event.type || 'unknown'] = (counts[event.type || 'unknown'] || 0) + 1;

                  if (/response\.(completed|incomplete|failed)|^error$/.test(event.type)) {
                    fs.writeSync(
                      1,
                      JSON.stringify({
                        kind: 'fixture-provider-terminal',
                        type: event.type,
                        status: event.response?.status,
                        incomplete: event.response?.incomplete_details?.reason,
                        usage: event.response?.usage,
                        outputTypes: event.response?.output?.map((item) => item.type),
                      }) + '\n',
                    );
                  }
                } catch {}
              }

              if (buffer.length > 1_000_000) {
                buffer = '';
              }

              if (Date.now() - lastLog > 10_000) {
                lastLog = Date.now();
                fs.writeSync(
                  1,
                  JSON.stringify({
                    kind: 'fixture-provider-progress',
                    elapsedMs: Date.now() - started,
                    bytes,
                    counts,
                  }) + '\n',
                );
              }

              controller.enqueue(chunk);
            },
          }),
        );

        return new Response(stream, { status: response.status, headers: response.headers });
      }
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
