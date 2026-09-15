import { describe, expect, it, vi } from 'vitest';
import { normalizeHostedFreeResponsesSse } from './hosted-free-responses-build';

describe('FREE buffered file transport activity', () => {
  it('tracks real buffered arguments without exposing partial files or counting keepalives', async () => {
    const onActivity = vi.fn();
    const events = [
      {
        type: 'response.output_item.added',
        item: { id: 'file1', type: 'function_call', name: 'write_file', arguments: '' },
      },
      { type: 'response.function_call_arguments.delta', item_id: 'unknown', delta: 'ignored' },
      { type: 'response.function_call_arguments.delta', item_id: 'file1', delta: '' },
      { type: 'response.function_call_arguments.delta', item_id: 'file1', delta: '{"path":"src/App.tsx","content":"' },
      { type: 'response.function_call_arguments.delta', item_id: 'file1', delta: 'unfinished source' },
    ];
    const response = new Response(
      `: keepalive\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}`,
      {
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
    const text = await normalizeHostedFreeResponsesSse(response, onActivity).text();
    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(text).not.toContain('unfinished source');
    expect(text).not.toContain('<boltAction');
  });
});
