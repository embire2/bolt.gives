import { json } from '@remix-run/cloudflare';
import { getAgentMetricsSummary, listRecentAgentRunMetrics } from '~/lib/.server/llm/run-metrics';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.floor(limitParam))) : 20;

  return json({
    available: true,
    summary: getAgentMetricsSummary(),
    recentRuns: listRecentAgentRunMetrics(limit),
  });
}
