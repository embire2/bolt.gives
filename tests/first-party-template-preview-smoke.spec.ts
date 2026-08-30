import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import {
  buildFirstPartyTemplatePackFiles,
  FIRST_PARTY_TEMPLATE_PACKS,
} from '../modules/agent/src/utils/firstPartyTemplatePacks';

const runTemplatePreviewSmoke = process.env.BOLT_TEMPLATE_PREVIEW_SMOKE === '1' ? describe : describe.skip;

runTemplatePreviewSmoke('first-party template Preview smoke', () => {
  let browser: Browser;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
  });

  afterAll(async () => {
    await browser?.close();
    await Promise.all(tempDirs.map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });

  for (const pack of FIRST_PARTY_TEMPLATE_PACKS) {
    it(`renders ${pack.id} on its first Preview`, async () => {
      const startedAt = performance.now();
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `bolt-template-${pack.id}-`));
      tempDirs.push(root);

      const files = buildFirstPartyTemplatePackFiles(pack, `Build a polished ${pack.label}`);

      await fs.mkdir(path.join(root, 'src'), { recursive: true });
      await fs.symlink(path.resolve(process.cwd(), 'node_modules'), path.join(root, 'node_modules'), 'dir');
      await Promise.all(files.map((file) => fs.writeFile(path.join(root, file.path), file.content, 'utf8')));
      await fs.writeFile(
        path.join(root, 'index.html'),
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        'utf8',
      );
      await fs.writeFile(
        path.join(root, 'src', 'main.tsx'),
        "import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);",
        'utf8',
      );

      let server: ViteDevServer | undefined;
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

      try {
        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          plugins: [react()],
          server: {
            host: '127.0.0.1',
            port: 0,
          },
        });
        await server.listen();

        const address = server.httpServer?.address();

        if (!address || typeof address === 'string') {
          throw new Error(`Could not resolve Preview port for ${pack.id}`);
        }

        await page.goto(`http://127.0.0.1:${address.port}`, {
          waitUntil: 'networkidle',
          timeout: 10_000,
        });

        const visibleText = (await page.locator('body').innerText()).toLowerCase();

        for (const signal of pack.smokeSignals) {
          expect(visibleText, `${pack.id} visible smoke signal: ${signal}`).toContain(signal.toLowerCase());
        }

        const firstPassMs = Math.round(performance.now() - startedAt);
        expect(firstPassMs).toBeLessThan(10_000);
        console.info(`[template-preview] ${pack.id} first-pass=${firstPassMs}ms`);
      } finally {
        await page.close();
        await server?.close();
      }
    });
  }
});
