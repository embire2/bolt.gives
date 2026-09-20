import { securedFetch } from './useCsrf';

export async function securedChatFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await securedFetch(input, init);

  if (!response.ok || !response.body) {
    return response;
  }

  /*
   * Transfer the native byte consumer: Chromium can cancel a direct reader at EOF
   * before HTTPS completion settles. Cancel the unused branch, never drain two copies.
   */
  const owned = response.clone();
  void response.body.cancel('transferred to chat reader').catch(() => undefined);

  // Bounded read-ahead lets transport completion settle while the SDK renders the last chunk.
  const stream = new TransformStream<Uint8Array, Uint8Array>(
    {},
    undefined,
    new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
  );

  return new Response(owned.body!.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
