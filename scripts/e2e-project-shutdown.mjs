#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { projectProcessConfig, spawnProjectProcess } from '@bolt/runtime/server/project-process.mjs';

const config = projectProcessConfig();
assert.equal(config.mode, 'podman', 'Requires the real rootless container runner.');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-shutdown-acceptance-'));
await fs.chown(root, config.uid, config.gid);
await fs.chmod(root, 0o700);

let child;

try {
  for (let index = 0; index < 5; index++) {
    const marker = `shutdown-${index}.txt`;
    child = spawnProjectProcess(
      'node',
      [
        '-e',
        `
      process.on('SIGTERM', () => {
        require('fs').writeFileSync(${JSON.stringify(marker)}, 'graceful');
        process.exit(0);
      });
      console.log('READY');
      setInterval(() => {}, 1000);
    `,
      ],
      { cwd: root, env: {} },
      config,
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const closed = once(child, 'close');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 25_000);

    try {
      const [ready] = await once(child.stdout, 'data');
      assert.match(ready.toString(), /READY/);

      const first = child.terminateProject();
      assert.equal(child.terminateProject(), first, 'Repeated stop must share one operation.');
      assert.equal((await first).stopped, true);

      const [code] = await closed;
      assert.equal(code, 0, stderr);
      assert.equal(await fs.readFile(path.join(root, marker), 'utf8'), 'graceful');
      assert.doesNotMatch(stderr, /Could not retrieve exit code|died not found/i);
      console.log(`PASS: shutdown ${index + 1}, SIGTERM flushed project state and attached process settled.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  for (let index = 0; index < 3; index++) {
    child = spawnProjectProcess('node', ['-e', 'setInterval(() => {}, 1000)'], { cwd: root, env: {} }, config);
    child.stdout.resume();
    child.stderr.resume();

    const closed = once(child, 'close');

    try {
      const stopped = await child.terminateProject();
      assert.equal(stopped.stopped, true);
      assert(
        child.exitCode !== null || child.signalCode !== null,
        'Stop succeeded before the attached container client closed.',
      );
      await closed;
      console.log(`PASS: immediate stop ${index + 1}, no successful stop before container creation/exit settles.`);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await closed;
      }
    }
  }
} finally {
  if (child?.exitCode === null) {
    await child.terminateProject();
  }

  await fs.rm(root, { recursive: true, force: true });
}
