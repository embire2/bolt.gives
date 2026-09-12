import { describe, expect, it } from 'vitest';
import { previewRequestHeaders } from './preview-request-headers.mjs';

describe('generated app credential boundary', () => {
  it('does not forward platform sessions or provider credentials to generated HTTP or WebSocket servers', () => {
    expect(
      previewRequestHeaders({
        Cookie:
          'apiKeys=dummy; bolt_profile_session=dummy; githubToken=dummy; git%3Agithub.com=dummy; VITE_VERCEL_ACCESS_TOKEN=dummy; app_session=keep',
        Authorization: 'BoltProfile dummy',
        'X-Bolt-Premium-Internal': 'dummy',
        Upgrade: 'websocket',
      }),
    ).toEqual({ cookie: 'app_session=keep', upgrade: 'websocket' });
  });
  it('preserves the generated app own authorization', () => {
    expect(previewRequestHeaders({ authorization: 'Bearer app-only', cookie: 'app_session=keep' })).toEqual({
      authorization: 'Bearer app-only',
      cookie: 'app_session=keep',
    });
  });
});
