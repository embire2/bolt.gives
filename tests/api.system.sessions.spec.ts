import { afterAll, describe, expect, it } from 'vitest';
import { action, loader } from '../app/routes/api.sessions';
import { normalizeSessionPayload, restoreConversationFromPayload } from '../app/lib/services/session-payload';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function isPlaceholderValue(value: unknown) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }

  return /your_.*_here/i.test(trimmed) || trimmed.includes('your_supabase_project_url_here');
}

function isValidUrl(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const hasSupabase = isValidUrl(supabaseUrl) && !isPlaceholderValue(supabaseKey);

function getHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function deleteSession(sessionId: string) {
  if (!supabaseUrl || !supabaseKey) {
    return;
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/bolt_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: getHeaders(supabaseKey),
    });
  } catch {
    // best-effort cleanup only (RLS may block anon deletes)
  }
}

describe.runIf(hasSupabase)('sessions api (supabase)', () => {
  const createdSessionIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdSessionIds.map((id) => deleteSession(id)));
  });

  it('save/list/load works against a real bolt_sessions table', async () => {
    const title = `__vitest__ bolt.gives sessions (${new Date().toISOString()})`;
    const payload = {
      title,
      conversation: [
        { id: 'u1', role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: 'world' },
      ],
      prompts: [{ id: 'u1', role: 'user', content: 'hello' }],
      responses: [{ id: 'a1', role: 'assistant', content: 'world' }],
      diffs: [],
      metadata: { test: true, kind: 'save-list-load' },
    };

    const saveResponse = await action({
      request: new Request('http://local.test/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          session: { title, payload },
        }),
      }),
      context: {},
      params: {},
    } as any);

    expect(saveResponse.status).toBe(200);
    const savedJson = (await saveResponse.json()) as any;
    expect(savedJson.session?.id).toBeTruthy();
    const sessionId = String(savedJson.session.id);
    createdSessionIds.push(sessionId);

    const listResponse = await loader({
      request: new Request('http://local.test/api/sessions'),
      context: {},
      params: {},
    } as any);

    expect(listResponse.status).toBe(200);
    const listJson = (await listResponse.json()) as any;
    expect(Array.isArray(listJson.sessions)).toBe(true);
    expect(listJson.sessions.some((s: any) => s.id === sessionId)).toBe(true);

    const loadResponse = await loader({
      request: new Request(`http://local.test/api/sessions?id=${encodeURIComponent(sessionId)}`),
      context: {},
      params: {},
    } as any);

    expect(loadResponse.status).toBe(200);
    const loadJson = (await loadResponse.json()) as any;
    expect(loadJson.session?.id).toBe(sessionId);

    const normalized = normalizeSessionPayload(loadJson.session?.payload);
    expect(normalized.title).toBe(title);
    expect(normalized.conversation.length).toBeGreaterThan(0);
    expect(normalized.prompts.length).toBeGreaterThan(0);
    expect(normalized.responses.length).toBeGreaterThan(0);

    const restored = restoreConversationFromPayload(normalized);
    expect(restored.map((m) => m.content)).toEqual(['hello', 'world']);
  });

  it('share-link load works (share_slug -> session payload)', async () => {
    const title = `__vitest__ bolt.gives shared session (${new Date().toISOString()})`;
    const payload = {
      title,
      conversation: [{ role: 'user', content: 'share-me' }],
      diffs: [],
      metadata: { test: true, kind: 'share' },
    };

    const saveResponse = await action({
      request: new Request('http://local.test/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          session: { title, payload },
        }),
      }),
      context: {},
      params: {},
    } as any);

    const savedJson = (await saveResponse.json()) as any;
    const sessionId = String(savedJson.session.id);
    createdSessionIds.push(sessionId);

    const shareResponse = await action({
      request: new Request('http://local.test/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'share',
          sessionId,
        }),
      }),
      context: {},
      params: {},
    } as any);

    expect(shareResponse.status).toBe(200);
    const shareJson = (await shareResponse.json()) as any;
    expect(typeof shareJson.shareSlug).toBe('string');
    expect(shareJson.shareSlug.length).toBeGreaterThan(0);

    const loadResponse = await loader({
      request: new Request(`http://local.test/api/sessions?share=${encodeURIComponent(shareJson.shareSlug)}`),
      context: {},
      params: {},
    } as any);

    expect(loadResponse.status).toBe(200);
    const loadJson = (await loadResponse.json()) as any;
    expect(loadJson.session?.id).toBe(sessionId);

    const restored = restoreConversationFromPayload(normalizeSessionPayload(loadJson.session?.payload));
    expect(restored[0]?.content).toBe('share-me');
  });

  it('backward-compat: missing/partial payload fields do not crash and are normalized on load', async () => {
    const title = `__vitest__ bolt.gives partial payload (${new Date().toISOString()})`;
    const payload = {
      title,
      // intentionally missing: prompts, responses, diffs
      conversation: [
        { role: 'user', content: 'partial' },
        { role: 'assistant', content: 'ok' },
      ],
      metadata: { test: true, kind: 'partial' },
    };

    const saveResponse = await action({
      request: new Request('http://local.test/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          session: { title, payload },
        }),
      }),
      context: {},
      params: {},
    } as any);

    const savedJson = (await saveResponse.json()) as any;
    const sessionId = String(savedJson.session.id);
    createdSessionIds.push(sessionId);

    const loadResponse = await loader({
      request: new Request(`http://local.test/api/sessions?id=${encodeURIComponent(sessionId)}`),
      context: {},
      params: {},
    } as any);

    const loadJson = (await loadResponse.json()) as any;
    const normalized = normalizeSessionPayload(loadJson.session?.payload);
    expect(normalized.title).toBe(title);
    expect(Array.isArray(normalized.prompts)).toBe(true);
    expect(Array.isArray(normalized.responses)).toBe(true);
    expect(Array.isArray(normalized.diffs)).toBe(true);

    const restored = restoreConversationFromPayload(normalized);
    expect(restored.map((m) => m.content)).toEqual(['partial', 'ok']);
  });
});
