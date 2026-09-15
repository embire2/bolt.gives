#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import {
  projectProcessConfig,
  prepareProjectProcessDirectory,
  spawnProjectProcess,
} from '@bolt/runtime/server/project-process.mjs';

const config = projectProcessConfig();
assert.equal(config.mode, 'podman', 'This acceptance test requires the real rootless container runner.');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-project-isolation-'));
const project = path.join(root, 'project');
const sibling = path.join(root, 'other-project');
const server = http.createServer((_req, res) => res.end('private-host-service'));
const children = [];
const results = [];
let preview;
const report = (name) => {
  results.push(name);
  console.log(`PASS: ${name}`);
};

async function execute(source, extra = {}) {
  const child = spawnProjectProcess(
    'node',
    ['-e', source],
    {
      cwd: project,
      env: { PROJECT_DATABASE_FIXTURE: 'project-only-value' },
      ...extra,
    },
    config,
  );
  children.push(child);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);

  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, stderr);

    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

try {
  await fs.chmod(root, 0o711);
  await fs.mkdir(project, { mode: 0o700 });
  await fs.mkdir(sibling, { mode: 0o700 });
  await fs.chown(project, config.uid, config.gid);
  await fs.writeFile(path.join(sibling, 'secret'), 'other-project-fixture', { mode: 0o600 });
  await fs.symlink(path.join(sibling, 'secret'), path.join(project, 'escape'));
  await prepareProjectProcessDirectory(project, config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const hostPort = server.address().port;
  const output = JSON.parse(
    await execute(`
    const fs = require('fs');
    const paths = ${JSON.stringify(['/root', '/etc/shadow', path.join(sibling, 'secret'), `${project}/escape`, `${config.home}/.local/share/containers`, `/run/user/${config.uid}/podman/podman.sock`])};
    const readable = paths.filter(p => { try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; } });
    console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),readable,
      memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),
      pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),
      cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(),
      database:process.env.PROJECT_DATABASE_FIXTURE,
      operator:process.env.BOLT_SELF_HOST_ACCESS_TOKEN || null}));
  `),
  );
  assert.equal(output.uid, config.uid);
  assert.equal(output.gid, config.gid);
  assert.deepEqual(output.readable, []);
  assert.equal(output.memory, String(1536 * 1024 * 1024));
  assert.equal(output.pids, '256');
  assert.equal(output.cpu, '100000 100000');
  assert.equal(output.database, 'project-only-value');
  assert.equal(output.operator, null);
  report('non-root UID/GID, filesystem/symlink isolation, CPU/RAM/PID limits and scoped environment');

  assert.equal(
    (
      await execute(`
    Promise.all(['127.0.0.1','10.0.2.2'].map(async host => {
      try { await fetch('http://'+host+':${hostPort}', {signal:AbortSignal.timeout(2000)}); return false; }
      catch { return true; }
    })).then(results => { if(!results.every(Boolean)) process.exit(1); console.log('blocked'); });
  `)
    ).trim(),
    'blocked',
  );
  report('host loopback and slirp gateway cannot reach private host services');

  const portServer = http.createServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));

  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  preview = spawnProjectProcess(
    'node',
    [
      '-e',
      `
    require('http').createServer((_req,res)=>res.end('isolated-preview-ready')).listen(${port},'0.0.0.0');
  `,
    ],
    { cwd: project, env: {}, previewPort: port },
    config,
  );
  children.push(preview);

  let stderr = '';
  preview.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const deadline = Date.now() + 20_000;
  let body;

  while (Date.now() < deadline && preview.exitCode === null) {
    body = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })
      .then((response) => response.text())
      .catch(() => null);

    if (body === 'isolated-preview-ready') {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(body, 'isolated-preview-ready', stderr);
  report('only the allocated Preview port is published on host loopback');
  console.log(JSON.stringify({ passed: results.length, uid: config.uid }));
} finally {
  for (const child of children) {
    if (child.exitCode === null) {
      await child.terminateProject();
    }
  }

  if (preview?.exitCode === null) {
    await once(preview, 'exit');
  }

  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
