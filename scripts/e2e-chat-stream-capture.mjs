import fs from 'node:fs/promises';
import path from 'node:path';

// Passive CDP observation preserves the browser's real cancellation behavior.
export async function captureChatStreams(context, page, outputDirectory) {
  const client = await context.newCDPSession(page);
  const requests = new Map();
  let sequence = 0;
  await client.send('Network.enable');

  client.on('Network.responseReceived', ({ requestId, response }) => {
    if (new URL(response.url).pathname !== '/api/chat') {
      return;
    }

    const record = { sequence: ++sequence, buffered: '', chunks: [], bytes: 0, ready: null };
    requests.set(requestId, record);
    record.ready = client
      .send('Network.streamResourceContent', { requestId })
      .then(({ bufferedData }) => {
        record.buffered = Buffer.from(bufferedData, 'base64').toString('utf8');
      })
      .catch(() => undefined);
  });
  client.on('Network.dataReceived', ({ requestId, data }) => {
    const record = requests.get(requestId);

    if (record && data && record.bytes < 2 * 1024 * 1024) {
      const chunk = Buffer.from(data, 'base64');
      record.bytes += chunk.length;
      record.chunks.push(chunk);
    }
  });

  const save = async ({ requestId }) => {
    const record = requests.get(requestId);

    if (!record) {
      return;
    }

    requests.delete(requestId);
    await record.ready;
    await fs.writeFile(
      path.join(outputDirectory, `chat-observed-${record.sequence}.txt`),
      record.buffered + Buffer.concat(record.chunks).toString('utf8'),
      { mode: 0o600 },
    );
  };
  client.on('Network.loadingFinished', (event) => void save(event));
  client.on('Network.loadingFailed', (event) => void save(event));
}
