import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import { convertToCoreMessages, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import mime from 'mime';

// Load `.env.local` if present (do not print secrets).
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log('[smoke-vision] OPENAI_API_KEY not set; skipping.');
  process.exit(0);
}

const modelName = process.env.VISION_MODEL || 'gpt-4o-mini';

const imagePath = process.env.VISION_IMAGE_PATH || path.resolve(process.cwd(), 'public', 'boltlogo2.png');
if (!fs.existsSync(imagePath)) {
  console.error(`[smoke-vision] image not found: ${imagePath}`);
  process.exit(1);
}

const imageBytes = fs.readFileSync(imagePath);
const contentType = mime.getType(imagePath) || 'application/octet-stream';
const imageBase64 = imageBytes.toString('base64');
const imageDataUrl = `data:${contentType};base64,${imageBase64}`;

const uiMessages = [
  {
    id: 'm1',
    role: 'user',
    content: 'What do you see in this image? Answer in one short sentence.',
    experimental_attachments: [
      {
        name: path.basename(imagePath),
        contentType,
        url: imageDataUrl,
      },
    ],
  },
];

const coreMessages = convertToCoreMessages(uiMessages);

const openai = createOpenAI({ apiKey });

console.log(`[smoke-vision] calling OpenAI vision model: ${modelName}`);

const result = await generateText({
  model: openai(modelName),
  messages: coreMessages,
});

console.log('[smoke-vision] ok');
console.log(result.text.slice(0, 200));
