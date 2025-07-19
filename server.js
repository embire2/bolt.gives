import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { installGlobals } from '@remix-run/node';
import * as build from './build/server/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import compression from 'compression';

// Load environment variables
dotenv.config();

// Install globals for Node.js
installGlobals();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Enable compression
app.use(compression());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve static files from build/client
app.use(express.static(join(__dirname, 'build', 'client'), {
  maxAge: '1y',
  setHeaders: (res, path) => {
    // Don't cache HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Handle Remix requests
app.all('*', createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
  getLoadContext(req) {
    // Pass environment variables to the app context
    return {
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        HF_API_KEY: process.env.HF_API_KEY,
        COHERE_API_KEY: process.env.COHERE_API_KEY,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        HYPERBOLIC_API_KEY: process.env.HYPERBOLIC_API_KEY,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        OPENAI_LIKE_API_KEY: process.env.OPENAI_LIKE_API_KEY,
        OPENAI_LIKE_API_BASE_URL: process.env.OPENAI_LIKE_API_BASE_URL,
        OLLAMA_API_BASE_URL: process.env.OLLAMA_API_BASE_URL,
        LMSTUDIO_API_BASE_URL: process.env.LMSTUDIO_API_BASE_URL,
        TOGETHER_API_BASE_URL: process.env.TOGETHER_API_BASE_URL,
        AWS_REGION: process.env.AWS_REGION,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        EXPO_PUBLIC_BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL,
        EXPO_PUBLIC_FRONTEND_URL: process.env.EXPO_PUBLIC_FRONTEND_URL,
        DISABLE_AUTH: process.env.DISABLE_AUTH,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        VITE_LOG_LEVEL: process.env.VITE_LOG_LEVEL,
      }
    };
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});