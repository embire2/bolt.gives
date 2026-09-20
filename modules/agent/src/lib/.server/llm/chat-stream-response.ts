export function createChatStreamResponse(body: ReadableStream<Uint8Array>, maxDurationMs?: number): Response {
  return new Response(body, {
    status: 200,
    headers: {
      // This is AI SDK v1 data framing (0:, 2:, d:), not EventSource SSE (data:).
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Bolt-Stream-Deadline-Ms': maxDurationMs?.toString() || 'disabled',
    },
  });
}
