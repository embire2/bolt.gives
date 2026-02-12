import { json } from '@remix-run/cloudflare';

export async function loader() {
  try {
    const proc = globalThis.process;

    if (!proc || typeof proc.memoryUsage !== 'function' || typeof proc.cpuUsage !== 'function') {
      return json({
        available: false,
        reason: 'Node process metrics unavailable in this runtime',
      });
    }

    const memory = proc.memoryUsage();
    const cpu = proc.cpuUsage();

    return json({
      available: true,
      timestamp: Date.now(),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
    });
  } catch (error) {
    return json(
      {
        available: false,
        reason: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
