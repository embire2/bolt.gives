import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProfileSessionCredentials, hashProfileAuthToken } from './profile-auth.mjs';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSingleUserProfiles({ env = process.env, root, now = Date.now }) {
  const enabled = env.BOLT_SELF_HOST_MODE === 'single-user';
  const accessToken = env.BOLT_SELF_HOST_ACCESS_TOKEN || '';
  const credentialHash = hashProfileAuthToken(accessToken);
  const filename = path.join(root, 'owner-profile.json');
  let queue = Promise.resolve();
  let attempts = 0;
  let windowEnd = 0;

  /** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
  function serial(operation) {
    const result = queue.then(operation);
    queue = result.then(
      () => {},
      () => {},
    );

    return result;
  }

  function fail(message, status) {
    throw Object.assign(new Error(message), { status });
  }

  async function read() {
    if (!enabled || accessToken.length < 32) {
      fail('Single-owner login requires an operator-configured access token of at least 32 characters.', 503);
    }

    let record;

    try {
      record = JSON.parse(await fs.readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      const timestamp = new Date(now()).toISOString();
      record = {
        profile: {
          id: crypto.randomUUID(),
          name: 'Local Owner',
          email: 'owner@localhost',
          country: 'Local',
          createdAt: timestamp,
          updatedAt: timestamp,
          lastLoginAt: null,
        },
        credentialHash,
        sessions: [],
      };
    }

    if (record.credentialHash !== credentialHash) {
      record.sessions = [];
      record.credentialHash = credentialHash;
    }

    record.sessions = record.sessions.filter((session) => Date.parse(session.expiresAt) > now());

    return record;
  }

  async function save(record) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });

    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;

    try {
      await fs.writeFile(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, filename);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  function matches(session, input) {
    return session.id === input.id && session.tokenHash === hashProfileAuthToken(input.token);
  }

  return {
    enabled,
    login: (input) =>
      serial(async () => {
        if (now() >= windowEnd) {
          attempts = 0;
          windowEnd = now() + 60_000;
        }

        if (++attempts > 10) {
          fail('Too many owner login attempts. Try again in one minute.', 429);
        }

        const record = await read();
        const supplied = hashProfileAuthToken(String(input?.accessToken || ''));

        if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(credentialHash))) {
          fail('The owner access token is incorrect.', 401);
        }

        const { token, ...stored } = createProfileSessionCredentials({ now: new Date(now()), ttlMs: SESSION_TTL_MS });
        record.sessions = [...record.sessions.slice(-19), stored];
        record.profile.lastLoginAt = new Date(now()).toISOString();
        await save(record);

        return { ok: true, profile: record.profile, session: { id: stored.id, token, expiresAt: stored.expiresAt } };
      }),
    session: (input) =>
      serial(async () => {
        const record = await read();

        if (!record.sessions.some((session) => matches(session, input))) {
          fail('Profile session is invalid or expired.', 401);
        }

        return { ok: true, profile: record.profile };
      }),
    logout: (input) =>
      serial(async () => {
        const record = await read();
        record.sessions = record.sessions.filter((session) => !matches(session, input));
        await save(record);

        return { ok: true };
      }),
  };
}

export async function handleSingleUserProfileRequest({
  profiles,
  req,
  res,
  pathname,
  readJsonBody,
  sendJson,
  sendText,
}) {
  if (!profiles.enabled || !pathname.startsWith('/runtime/profile/')) {
    return false;
  }

  const methods = {
    '/runtime/profile/self-host/login': profiles.login,
    '/runtime/profile/session': profiles.session,
    '/runtime/profile/logout': profiles.logout,
  };

  try {
    const handler = methods[pathname];

    if (req.method === 'POST' && handler) {
      sendJson(res, 200, await handler(await readJsonBody(req)));
    } else {
      sendText(
        res,
        409,
        'This is a single-owner self-host. Use owner login and your own provider API key; hosted accounts and billing are not enabled.',
      );
    }
  } catch (error) {
    sendText(
      res,
      error.status || 500,
      error.status ? error.message : 'Unable to access the private owner session store.',
    );
  }

  return true;
}
