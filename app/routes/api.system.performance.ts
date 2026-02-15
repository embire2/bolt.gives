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

    const errors: string[] = [];
    let memory:
      | {
          rss: number;
          heapUsed: number;
          heapTotal: number;
          external: number;
        }
      | undefined;
    let cpu:
      | {
          user: number;
          system: number;
        }
      | undefined;

    try {
      memory = proc.memoryUsage();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'process.memoryUsage failed');
    }

    try {
      cpu = proc.cpuUsage();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'process.cpuUsage failed');
    }

    if (errors.length) {
      return json({
        available: false,
        reason: errors.join('; '),
        memory,
        cpu,
      });
    }

    return json({
      available: true,
      timestamp: Date.now(),
      memory: {
        rss: memory!.rss,
        heapUsed: memory!.heapUsed,
        heapTotal: memory!.heapTotal,
        external: memory!.external,
      },
      cpu: {
        user: cpu!.user,
        system: cpu!.system,
      },
    });
  } catch (error) {
    // Avoid spamming 500s in runtimes where process metrics are partially implemented.
    return json({
      available: false,
      reason: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
