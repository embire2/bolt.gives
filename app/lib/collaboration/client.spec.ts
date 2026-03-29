import { describe, expect, it } from 'vitest';
import { isUnsafeStoredCollaborationUrl, resolveDefaultCollaborationServerUrl } from './client';

describe('collaboration client URL resolution', () => {
  it('uses localhost collaboration server for local development', () => {
    expect(
      resolveDefaultCollaborationServerUrl({
        host: 'localhost',
        protocol: 'http:',
        originHost: 'localhost:5173',
      }),
    ).toBe('ws://localhost:1234');
  });

  it('uses alpha1 collaboration server for Cloudflare Pages hosts', () => {
    expect(
      resolveDefaultCollaborationServerUrl({
        host: 'bolt-gives.pages.dev',
        protocol: 'https:',
        originHost: 'bolt-gives.pages.dev',
      }),
    ).toBe('wss://alpha1.bolt.gives/collab');

    expect(
      resolveDefaultCollaborationServerUrl({
        host: '3809d258.bolt-gives.pages.dev',
        protocol: 'https:',
        originHost: '3809d258.bolt-gives.pages.dev',
      }),
    ).toBe('wss://alpha1.bolt.gives/collab');
  });

  it('uses same-host collaboration for non-pages production hosts', () => {
    expect(
      resolveDefaultCollaborationServerUrl({
        host: 'alpha1.bolt.gives',
        protocol: 'https:',
        originHost: 'alpha1.bolt.gives',
      }),
    ).toBe('wss://alpha1.bolt.gives/collab');
  });

  it('treats pages self-target and localhost as unsafe stored URLs on remote hosts', () => {
    expect(isUnsafeStoredCollaborationUrl('wss://bolt-gives.pages.dev/collab', 'bolt-gives.pages.dev')).toBe(true);
    expect(isUnsafeStoredCollaborationUrl('ws://localhost:1234', 'bolt-gives.pages.dev')).toBe(true);
    expect(isUnsafeStoredCollaborationUrl('wss://alpha1.bolt.gives/collab', 'bolt-gives.pages.dev')).toBe(false);
  });
});
