import { describe, expect, it, vi } from 'vitest';
import { endFailedCommandResponse } from './command-response.mjs';

describe('failed command streaming response', () => {
  it('reports an exit without rewriting headers after streaming starts', () => {
    const response = {
      headersSent: true,
      destroyed: false,
      writableEnded: false,
      writeHead: vi.fn(() => {
        throw new Error('headers already sent');
      }),
      end: vi.fn(),
    };
    expect(() => endFailedCommandResponse(response, 'Connection unavailable')).not.toThrow();
    expect(response.writeHead).not.toHaveBeenCalled();
    expect(response.end.mock.calls[0][0]).toContain('"exitCode":1');
  });

  it('does not write to an already completed response', () => {
    const response = { destroyed: false, writableEnded: true, end: vi.fn() };
    endFailedCommandResponse(response, 'Connection unavailable');
    expect(response.end).not.toHaveBeenCalled();
  });
});
