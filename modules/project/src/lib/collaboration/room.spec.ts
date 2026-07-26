import { describe, expect, it } from 'vitest';
import { buildCollaborationRoomName, resolveCollaborationProjectScope } from './room';

describe('collaboration room isolation', () => {
  it('uses the hosted runtime session as the project scope', () => {
    expect(
      resolveCollaborationProjectScope({
        hostedRuntimeSessionId: 'project-session-a',
        host: 'alpha1.bolt.gives',
        pathname: '/chat/1',
      }),
    ).toBe('runtime:project-session-a');
  });

  it('does not put the same file path from different projects in one room', () => {
    const firstRoom = buildCollaborationRoomName('runtime:project-a', '/src/App.tsx');
    const secondRoom = buildCollaborationRoomName('runtime:project-b', '/src/App.tsx');

    expect(firstRoom).not.toBe(secondRoom);
    expect(decodeURIComponent(firstRoom)).toBe('runtime:project-a:/src/App.tsx');
  });
});
