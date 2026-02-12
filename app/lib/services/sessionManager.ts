import { normalizeSessionPayload, type SessionPayload } from './session-payload';

export type { SessionPayload, SessionDiffRecord } from './session-payload';

export interface SavedSessionSummary {
  id: string;
  title: string;
  created_at: string;
  share_slug?: string;
}

export class SessionManager {
  static async saveSession(payload: SessionPayload, sessionId?: string) {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save',
        sessionId,
        session: {
          title: payload.title,
          payload,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { session: { id: string } };

    return data.session;
  }

  static async listSessions() {
    const response = await fetch('/api/sessions');

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { sessions: SavedSessionSummary[] };

    return data.sessions;
  }

  static async loadSessionById(id: string) {
    const response = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`);

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { session: { id: string; payload: unknown } | null };

    if (!data.session) {
      return null;
    }

    return {
      ...data.session,
      payload: normalizeSessionPayload(data.session.payload),
    };
  }

  static async loadSessionByShareSlug(shareSlug: string) {
    const response = await fetch(`/api/sessions?share=${encodeURIComponent(shareSlug)}`);

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { session: { id: string; payload: unknown } | null };

    if (!data.session) {
      return null;
    }

    return {
      ...data.session,
      payload: normalizeSessionPayload(data.session.payload),
    };
  }

  static async createShareLink(sessionId: string) {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'share',
        sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { shareSlug: string };

    return `${window.location.origin}/?shareSession=${encodeURIComponent(data.shareSlug)}`;
  }
}
