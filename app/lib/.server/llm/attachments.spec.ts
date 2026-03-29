import { describe, expect, it } from 'vitest';
import { convertToCoreMessages } from 'ai';

describe('convertToCoreMessages attachments', () => {
  it('converts experimental_attachments data-url images into core image parts', () => {
    // 1x1 PNG
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+2B5kAAAAASUVORK5CYII=';

    const messages: any = [
      {
        id: 'm1',
        role: 'user',
        content: 'describe this image',
        experimental_attachments: [
          {
            name: 'pixel.png',
            contentType: 'image/png',
            url: `data:image/png;base64,${png1x1}`,
          },
        ],
      },
    ];

    const core = convertToCoreMessages(messages);

    expect(core).toHaveLength(1);
    expect(core[0]?.role).toBe('user');

    const content = core[0]?.content as any[];
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toMatchObject({ type: 'text', text: 'describe this image' });
    expect(content[1]?.type).toBe('image');
    expect(content[1]?.image).toBeInstanceOf(Uint8Array);
    expect((content[1]?.image as Uint8Array).byteLength).toBeGreaterThan(0);
  });
});
