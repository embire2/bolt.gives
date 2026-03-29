import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Load `.env.local` if present (do not print secrets).
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log('[smoke-small-model] OPENAI_API_KEY not set; skipping.');
  process.exit(0);
}

const modelName = process.env.SMALL_MODEL || 'gpt-3.5-turbo';
const openai = createOpenAI({ apiKey });

const system = `
You are Bolt, a coding agent. Be concise and follow the output contract exactly.

CRITICAL OUTPUT CONTRACT (build requests):
- Respond with exactly ONE <boltArtifact> and include one or more <boltAction> blocks.
- NEVER output code changes outside of <boltAction type="file"> blocks.
- For <boltAction type="file">: include COMPLETE file contents (no diffs).
`.trim();
const prompt =
  'Create a <boltArtifact> that adds a new file /tmp/bolt-small-model-smoke.txt containing the text "ok".';

console.log(`[smoke-small-model] calling OpenAI model: ${modelName}`);
const res = await generateText({
  model: openai(modelName),
  system,
  prompt,
});

const text = res.text || '';
const hasArtifact = text.includes('<boltArtifact');
const hasAction = text.includes('<boltAction');

if (!hasArtifact || !hasAction) {
  console.error('[smoke-small-model] FAIL: output did not include <boltArtifact>/<boltAction>');
  console.error(text.slice(0, 400));
  process.exit(1);
}

console.log('[smoke-small-model] ok');
