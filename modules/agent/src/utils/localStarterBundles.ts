import type { LocalTemplateFile } from './localStarterTemplates';

export const VITE_VANILLA_FALLBACK_FILES: LocalTemplateFile[] = [
  {
    name: 'package.json',
    path: 'package.json',
    content: `{
  "name": "vite-vanilla-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173"
  },
  "devDependencies": {
    "vite": "^5.4.19"
  }
}
`,
  },
  {
    name: 'index.html',
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="A Vite application ready to customize." />
    <title>Vite App</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  },
  {
    name: 'src/main.js',
    path: 'src/main.js',
    content: `import './style.css';

document.querySelector('#app').innerHTML = \`
  <section class="starter-card">
    <span class="starter-label">Vite workspace</span>
    <h1>Ready for your idea</h1>
    <p>The project runtime is connected and ready for the requested experience.</p>
    <button type="button" id="starter-action">Check interaction</button>
    <output id="starter-status" aria-live="polite"></output>
  </section>
\`;

document.querySelector('#starter-action').addEventListener('click', () => {
  document.querySelector('#starter-status').textContent = 'Interaction ready';
});
`,
  },
  {
    name: 'src/style.css',
    path: 'src/style.css',
    content: `:root {
  font-family: Georgia, 'Times New Roman', serif;
  color: #17221a;
  background: #edf4e8;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.starter-card {
  width: min(100%, 42rem);
  padding: clamp(2rem, 6vw, 4rem);
  border: 1px solid #9bb092;
  border-radius: 1.5rem;
  background: #fffef8;
  box-shadow: 0 1.5rem 4rem rgb(36 58 42 / 14%);
}

.starter-label {
  color: #4a6b51;
  font: 700 0.75rem/1.2 ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0.75rem 0;
  font-size: clamp(2.3rem, 7vw, 4.8rem);
  line-height: 0.95;
}

p {
  max-width: 36rem;
  color: #526257;
  font: 1.05rem/1.7 ui-sans-serif, sans-serif;
}

button {
  margin-top: 1rem;
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 999px;
  color: white;
  background: #234d32;
  font: 700 0.9rem/1 ui-sans-serif, sans-serif;
  cursor: pointer;
}

output {
  display: block;
  min-height: 1.5rem;
  margin-top: 0.75rem;
  color: #31583d;
  font: 0.9rem/1.5 ui-sans-serif, sans-serif;
}
`,
  },
];
