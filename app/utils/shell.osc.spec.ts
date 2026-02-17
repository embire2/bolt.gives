import { describe, expect, it } from 'vitest';
import { parseOsc654Signals } from './shell';

describe('parseOsc654Signals', () => {
  it('parses multiple OSC 654 signals from a single chunk (exit + prompt)', () => {
    const chunk = `before\x1b]654;exit=6:0\x07mid\x1b]654;prompt\x07after`;
    const signals = parseOsc654Signals(chunk);

    expect(signals).toEqual([{ type: 'exit', exitCode: 0 }, { type: 'prompt' }]);
  });

  it('parses non-exit signals and preserves ordering', () => {
    const chunk = `\x1b]654;interactive\x07\x1b]654;prompt\x07`;
    const signals = parseOsc654Signals(chunk);

    expect(signals).toEqual([{ type: 'interactive' }, { type: 'prompt' }]);
  });

  it('handles non-zero exit codes', () => {
    const chunk = `\x1b]654;exit=-1:127\x07`;
    const signals = parseOsc654Signals(chunk);

    expect(signals).toEqual([{ type: 'exit', exitCode: 127 }]);
  });
});
