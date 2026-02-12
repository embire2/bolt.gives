import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { normalizeSessionPayload } from '~/lib/services/session-payload';

interface SessionRecord {
  id?: string;
  title: string;
  payload: unknown;
  share_slug?: string | null;
}

function isPlaceholderValue(value: unknown) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return true;
  }

  // Guard against default .env.example placeholders.
  return /your_.*_here/i.test(trimmed) || trimmed.includes('your_supabase_project_url_here');
}

function isValidUrl(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getSupabaseConfig(context: any) {
  const env = context?.cloudflare?.env || process.env;
  const supabaseUrl = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL;
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.VITE_SUPABASE_ANON_KEY;

  if (!isValidUrl(supabaseUrl) || isPlaceholderValue(supabaseKey)) {
    return { supabaseUrl: undefined, supabaseKey: undefined };
  }

  return { supabaseUrl: String(supabaseUrl), supabaseKey: String(supabaseKey) };
}

function getHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function listSessions(context: any) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig(context);

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase session storage is not configured.' }, { status: 400 });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/bolt_sessions?select=id,title,created_at,share_slug&order=created_at.desc&limit=50`,
    {
      headers: getHeaders(supabaseKey),
    },
  );

  if (!response.ok) {
    return json({ error: await response.text() }, { status: response.status });
  }

  return json({ sessions: await response.json() });
}

async function loadSessionById(context: any, id: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig(context);

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase session storage is not configured.' }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/bolt_sessions?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: getHeaders(supabaseKey),
  });

  if (!response.ok) {
    return json({ error: await response.text() }, { status: response.status });
  }

  const rows = (await response.json()) as any[];

  const row = rows[0];

  if (!row) {
    return json({ session: null });
  }

  const normalized = normalizeSessionPayload(row.payload);

  return json({
    session: {
      ...row,
      payload: {
        ...normalized,
        title: typeof row.title === 'string' && row.title.trim().length > 0 ? row.title : normalized.title,
      },
    },
  });
}

async function loadSessionByShareSlug(context: any, shareSlug: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig(context);

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase session storage is not configured.' }, { status: 400 });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/bolt_sessions?share_slug=eq.${encodeURIComponent(shareSlug)}&select=*`,
    {
      headers: getHeaders(supabaseKey),
    },
  );

  if (!response.ok) {
    return json({ error: await response.text() }, { status: response.status });
  }

  const rows = (await response.json()) as any[];

  const row = rows[0];

  if (!row) {
    return json({ session: null });
  }

  const normalized = normalizeSessionPayload(row.payload);

  return json({
    session: {
      ...row,
      payload: {
        ...normalized,
        title: typeof row.title === 'string' && row.title.trim().length > 0 ? row.title : normalized.title,
      },
    },
  });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const shareSlug = url.searchParams.get('share');

  if (id) {
    return loadSessionById(context, id);
  }

  if (shareSlug) {
    return loadSessionByShareSlug(context, shareSlug);
  }

  return listSessions(context);
}

async function saveSession(context: any, record: SessionRecord, sessionId?: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig(context);

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase session storage is not configured.' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    title: record.title,
    payload: record.payload,
    updated_at: new Date().toISOString(),
  };

  if (sessionId) {
    payload.id = sessionId;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/bolt_sessions`, {
    method: 'POST',
    headers: {
      ...getHeaders(supabaseKey),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return json({ error: await response.text() }, { status: response.status });
  }

  const rows = (await response.json()) as any[];

  return json({ session: rows[0] || null });
}

async function shareSession(context: any, sessionId: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig(context);

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Supabase session storage is not configured.' }, { status: 400 });
  }

  const shareSlug = crypto.randomUUID();
  const response = await fetch(`${supabaseUrl}/rest/v1/bolt_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: getHeaders(supabaseKey),
    body: JSON.stringify({
      share_slug: shareSlug,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    return json({ error: await response.text() }, { status: response.status });
  }

  return json({ shareSlug });
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      action: 'save' | 'share';
      sessionId?: string;
      session?: SessionRecord;
    };

    if (body.action === 'save') {
      if (!body.session) {
        return json({ error: 'Missing session payload' }, { status: 400 });
      }

      return saveSession(context, body.session, body.sessionId);
    }

    if (body.action === 'share') {
      if (!body.sessionId) {
        return json({ error: 'Missing sessionId' }, { status: 400 });
      }

      return shareSession(context, body.sessionId);
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      { status: 500 },
    );
  }
}
