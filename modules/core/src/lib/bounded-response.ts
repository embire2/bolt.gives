export async function readBoundedResponse(response: Response, maxBytes = 1024 * 1024): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    if (Number(response.headers.get('content-length') || 0) > maxBytes) {
      throw new Error('Web response is too large.');
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > maxBytes) {
        throw new Error('Web response is too large.');
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(bytes);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
