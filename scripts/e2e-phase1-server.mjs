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
await startProductionServer(resolveProductionServerConfig());
