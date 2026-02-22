#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
const expectedVersion = process.env.EXPECTED_VERSION || pkg.version;
const versionLabel = `v${expectedVersion}`;
const domains = (process.env.RELEASE_GATE_DOMAINS || 'https://alpha1.bolt.gives,https://ahmad.bolt.gives')
  .split(',')
  .map((domain) => domain.trim())
  .filter(Boolean);
const primaryBaseUrl = process.env.RELEASE_GATE_SCREENSHOT_BASE_URL || domains[0];

if (!primaryBaseUrl) {
  throw new Error('Release gate failed: no base URL resolved for screenshot checks.');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  });

  assert(response.ok, `HTTP ${response.status} for ${url}`);
  return response.text();
}

async function checkDomain(domain) {
  const nonce = Date.now().toString(36);
  const homeText = await fetchText(`${domain}/?gate=${nonce}`);
  const changelogText = await fetchText(`${domain}/changelog?gate=${nonce}`);
  const changelogVersionPattern = new RegExp(
    `Current\\s+version\\s*:\\s*${versionLabel}|changelog\\s*\\(${versionLabel}\\)`,
    'i',
  );

  assert(homeText.includes(`bolt.gives ${versionLabel}`), `${domain}: expected home title/version ${versionLabel}`);
  assert(changelogVersionPattern.test(changelogText), `${domain}: expected changelog version ${versionLabel}`);
  assert(!/server error|error details|custom error/i.test(homeText), `${domain}: unexpected server error marker on home`);
  assert(
    !/server error|error details|custom error/i.test(changelogText),
    `${domain}: unexpected server error marker on changelog`,
  );

  return {
    domain,
    homeOk: true,
    changelogOk: true,
  };
}

function runNodeScript(scriptPath, envOverrides) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`Script ${scriptPath} failed with exit code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function parsePngSize(buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(buffer.length > 24, 'PNG buffer too small');
  assert(buffer.subarray(0, 8).equals(pngSignature), 'Invalid PNG signature');

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

async function checkScreenshot(filePath) {
  const buffer = await fs.readFile(filePath);
  const { width, height } = parsePngSize(buffer);
  const minBytes = 60_000;

  assert(width === 1600, `${path.basename(filePath)}: expected width 1600, received ${width}`);
  assert(height >= 900, `${path.basename(filePath)}: expected height >= 900, received ${height}`);
  assert(buffer.length >= minBytes, `${path.basename(filePath)}: expected >= ${minBytes} bytes, received ${buffer.length}`);
}

async function checkScreenshots(baseUrl) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-release-gate-'));

  await runNodeScript(path.join(rootDir, 'scripts', 'capture-readme-screenshots.mjs'), {
    BASE_URL: baseUrl,
    README_SCREENSHOT_DIR: tempDir,
    EXPECTED_VERSION: expectedVersion,
    README_SCREENSHOT_SKIP_PROMPTS: '1',
  });

  await runNodeScript(path.join(rootDir, 'scripts', 'capture-system-in-action.mjs'), {
    BASE_URL: baseUrl,
    SYSTEM_ACTION_SCREENSHOT_PATH: path.join(tempDir, 'system-in-action.png'),
    SYSTEM_ACTION_SKIP_PROMPT: '1',
  });

  const files = ['home.png', 'chat.png', 'chat-plan.png', 'changelog.png', 'system-in-action.png'];

  for (const fileName of files) {
    await checkScreenshot(path.join(tempDir, fileName));
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}

const domainResults = [];
for (const domain of domains) {
  domainResults.push(await checkDomain(domain));
}
await checkScreenshots(primaryBaseUrl);

console.log('Release gate passed.');
console.log(`Expected version: ${versionLabel}`);
console.log(`Checked domains: ${domainResults.map((result) => result.domain).join(', ')}`);
console.log(`Screenshot assertions source: ${primaryBaseUrl}`);
