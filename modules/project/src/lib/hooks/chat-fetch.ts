import { securedFetch } from './useCsrf';

export async function securedChatFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await securedFetch(input, init);

  if (!response.ok || !response.body) {
    return response;
  }

  // Release the network reader independently of the SDK, without cloning or buffering the response.
  return new Response(response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>()), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
