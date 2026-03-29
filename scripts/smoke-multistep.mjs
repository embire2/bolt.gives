import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Load `.env.local` if present (do not print secrets).
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log('[smoke-multistep] OPENAI_API_KEY not set; skipping.');
  process.exit(0);
}

const modelName = process.env.AGENT_MODEL || 'gpt-4o-mini';
const openai = createOpenAI({ apiKey });

let stepCount = 0;
let sawToolCall = false;
let sawToolResult = false;
let output = '';

console.log(`[smoke-multistep] streaming with model: ${modelName}`);

const result = await streamText({
  model: openai(modelName),
  system: 'You are a test agent. Always use the add tool before answering.',
  tools: {
    add: tool({
      description: 'Add two integers and return their sum.',
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => ({ sum: a + b }),
    }),
  },
  toolChoice: 'required',
  maxSteps: Number(process.env.MAX_STEPS || 5),
  messages: [{ role: 'user', content: 'Compute 2 + 3. After using the tool, answer with the sum.' }],
  onStepFinish: ({ toolCalls, toolResults }) => {
    stepCount += 1;
    if (toolCalls?.length) {
      sawToolCall = true;
    }
    if (toolResults?.length) {
      sawToolResult = true;
    }
  },
});

for await (const chunk of result.textStream) {
  output += chunk;
}

if (stepCount < 2 || !sawToolCall || !sawToolResult) {
  console.error('[smoke-multistep] FAIL: expected multi-step tool usage');
  console.error(JSON.stringify({ stepCount, sawToolCall, sawToolResult, output: output.slice(0, 200) }, null, 2));
  process.exit(1);
}

console.log('[smoke-multistep] ok');
console.log(output.trim().slice(0, 200));

