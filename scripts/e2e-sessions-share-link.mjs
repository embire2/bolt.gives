#!/usr/bin/env node
/* eslint-disable no-console */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

const PORT = Number(process.env.PORT || 5173);
const BASE_URL = `http://localhost:${PORT}`;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function headersForSupabase(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function waitForHttpOk(url, timeoutMs = 90_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        return;
      }
    } catch {
      // ignore
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Timeout waiting for ${url}`);
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'pipe',
    ...options,
  });

  return child;
}

function killProcessGroup(child) {
  if (!child?.pid) {
    return;
  }

  try {
    // Negative PID targets the process group.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
}

async function requestJson(url, init) {
  const resp = await fetch(url, init);
  const text = await resp.text();

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${url}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createWebDriverSession(driverBaseUrl) {
  const create = await requestJson(`${driverBaseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          'moz:firefoxOptions': {
            args: ['-headless'],
          },
        },
      },
    }),
  });

  const sessionId = create?.value?.sessionId || create?.sessionId;
  if (!sessionId) {
    throw new Error(`Failed to create WebDriver session: ${JSON.stringify(create).slice(0, 500)}`);
  }

  return sessionId;
}

async function driverNavigate(driverBaseUrl, sessionId, url) {
  await requestJson(`${driverBaseUrl}/session/${sessionId}/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

async function driverExecute(driverBaseUrl, sessionId, script, args = []) {
  const resp = await requestJson(`${driverBaseUrl}/session/${sessionId}/execute/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, args }),
  });

  return resp?.value;
}

async function driverScreenshot(driverBaseUrl, sessionId) {
  const resp = await requestJson(`${driverBaseUrl}/session/${sessionId}/screenshot`, {
    method: 'GET',
  });

  return resp?.value;
}

async function driverQuit(driverBaseUrl, sessionId) {
  try {
    await requestJson(`${driverBaseUrl}/session/${sessionId}`, { method: 'DELETE' });
  } catch {
    // ignore
  }
}

async function run() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY');
  }

  console.log(`[e2e] starting dev server on ${BASE_URL}...`);

  const logPath = path.resolve('.e2e-sessions-share-link.dev.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });

  // Start dev server (collab + app). We keep it in the same process group.
  const dev = startProcess('pnpm', ['run', 'dev'], {
    env: process.env,
    detached: true,
  });
  dev.stdout.pipe(logStream);
  dev.stderr.pipe(logStream);

  try {
    await waitForHttpOk(`${BASE_URL}/`);

    console.log('[e2e] creating session via /api/sessions...');
    const title = `__e2e__ share-link (${new Date().toISOString()})`;
    const save = await requestJson(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        session: {
          title,
          payload: {
            title,
            conversation: [
              { id: 'u1', role: 'user', content: 'share-link-e2e' },
              { id: 'a1', role: 'assistant', content: 'loaded' },
            ],
            prompts: [{ id: 'u1', role: 'user', content: 'share-link-e2e' }],
            responses: [{ id: 'a1', role: 'assistant', content: 'loaded' }],
            diffs: [],
          },
        },
      }),
    });

    const sessionId = save?.session?.id;
    if (!sessionId) {
      throw new Error(`Unexpected save response: ${JSON.stringify(save).slice(0, 500)}`);
    }

    console.log('[e2e] creating share slug...');
    const share = await requestJson(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'share', sessionId }),
    });

    const shareSlug = share?.shareSlug;
    if (!shareSlug) {
      throw new Error(`Unexpected share response: ${JSON.stringify(share).slice(0, 500)}`);
    }

    console.log('[e2e] starting geckodriver...');
    const driverPort = 4444;
    const driverBaseUrl = `http://127.0.0.1:${driverPort}`;
    const driver = startProcess('geckodriver', ['--port', String(driverPort)], {
      env: process.env,
      detached: true,
    });

    let session;
    try {
      // Give geckodriver a moment to start listening.
      await new Promise((r) => setTimeout(r, 700));

      session = await createWebDriverSession(driverBaseUrl);

      const shareUrl = `${BASE_URL}/?shareSession=${encodeURIComponent(shareSlug)}`;
      console.log(`[e2e] opening share link...`);
      await driverNavigate(driverBaseUrl, session, shareUrl);

      const needle = 'share-link-e2e';
      const timeoutMs = 15_000;
      const started = Date.now();
      let found = false;

      while (Date.now() - started < timeoutMs) {
        const ok = await driverExecute(
          driverBaseUrl,
          session,
          'return (document.body && document.body.innerText || \"\").includes(arguments[0]);',
          [needle],
        );

        if (ok === true) {
          found = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      const screenshotB64 = await driverScreenshot(driverBaseUrl, session);
      if (typeof screenshotB64 === 'string' && screenshotB64.length > 0) {
        const outDir = path.resolve('docs/screenshots');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'share-session-e2e.png');
        fs.writeFileSync(outPath, Buffer.from(screenshotB64, 'base64'));
        console.log(`[e2e] wrote screenshot: ${outPath}`);
      }

      if (!found) {
        const bodyText = await driverExecute(driverBaseUrl, session, 'return (document.body && document.body.innerText) || \"\";');
        throw new Error(`Share link did not restore message in time. bodyText: ${String(bodyText).slice(0, 500)}`);
      }

      console.log('[e2e] share link restore: ok');
    } finally {
      if (session) {
        await driverQuit(driverBaseUrl, session);
      }

      killProcessGroup(driver);
    }

    console.log('[e2e] cleaning up created session row...');
    try {
      await fetch(`${supabaseUrl}/rest/v1/bolt_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: headersForSupabase(supabaseKey),
      });
    } catch {
      // ignore
    }

    console.log('[e2e] complete');
  } finally {
    killProcessGroup(dev);
    logStream.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
