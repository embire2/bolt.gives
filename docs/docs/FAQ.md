# bolt.gives FAQ

## What platforms are supported?

- Using bolt.gives in a browser: supported on Windows, macOS, and Linux.
- Installing / self-hosting bolt.gives: supported on **Ubuntu 18.04+ only**.
  - Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
  - macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Do I need a bolt.gives account to use it?

No. bolt.gives does not require a bolt.gives signup/account.

To use an LLM provider, you will typically need an account with that provider (OpenAI/Anthropic/OpenRouter/etc.) to obtain an API key.

## My first prompt fails with an API-key error. What do I do?

Configure an API key for the provider you selected:

- In-app (recommended): open Settings, select the provider, paste the API key.
- Or via `.env.local` (for self-hosting): copy `.env.example` to `.env.local` and fill in keys.

## My build fails with \"JavaScript heap out of memory\"

Use the high-memory build:

```bash
pnpm run build:highmem
```

Or:

```bash
NODE_OPTIONS=--max-old-space-size=6142 pnpm run build
```

## Is Supabase required?

No. Supabase is optional and is only needed for session save/resume/share features.

