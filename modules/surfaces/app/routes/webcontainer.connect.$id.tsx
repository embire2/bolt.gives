import { type LoaderFunction } from '@remix-run/cloudflare';

type RuntimeEnv = {
  WC_LICENSE_KEY?: string;
  WC_ENTERPRISE_SDK_URL?: string;
  WC_COORDINATOR_ORIGIN?: string;
};

export const loader: LoaderFunction = async ({ request, context }) => {
  const url = new URL(request.url);
  const editorOrigin = url.searchParams.get('editorOrigin') || 'https://stackblitz.com';
  const env = ((context as { env?: RuntimeEnv } | undefined)?.env ?? {}) as RuntimeEnv;
  const licenseKey = env.WC_LICENSE_KEY ?? '';
  const enterpriseSdkUrl = env.WC_ENTERPRISE_SDK_URL ?? 'https://webcontainer.io/enterprise-sdk/+esm';
  const coordinatorOrigin = env.WC_COORDINATOR_ORIGIN ?? 'https://webcontainer.io';
  const safeEditorOrigin = JSON.stringify(editorOrigin);
  const safeLicenseKey = JSON.stringify(licenseKey);
  const safeEnterpriseSdkUrl = JSON.stringify(enterpriseSdkUrl);
  const safeCoordinatorOrigin = JSON.stringify(coordinatorOrigin);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Boot WebContainer</title>
        <style>
          body {
            font-family: Inter, system-ui, -apple-system, sans-serif;
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #0b1020;
            color: #e2e8f0;
          }

          #status {
            border: 1px solid rgba(148, 163, 184, 0.35);
            border-radius: 12px;
            padding: 14px 18px;
            background: rgba(15, 23, 42, 0.55);
            max-width: 720px;
          }

          #status[data-state="maintenance"] {
            border-color: rgba(248, 113, 113, 0.5);
            background: rgba(127, 29, 29, 0.35);
          }
        </style>
      </head>
      <body>
        <div id="status" data-state="booting">Booting enterprise WebContainer...</div>
        <script type="module">
          (async () => {
            const status = document.getElementById('status');
            const editorOrigin = ${safeEditorOrigin};
            const licenseKey = ${safeLicenseKey};
            const enterpriseSdkUrl = ${safeEnterpriseSdkUrl};
            const coordinatorOrigin = ${safeCoordinatorOrigin};
            const MAX_BOOT_ATTEMPTS = 3;

            const setStatus = (text, state) => {
              if (!status) return;
              status.textContent = text;
              status.dataset.state = state;
            };

            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

            const getBootOptions = () => ({
              enterprise: {
                licenseKey,
                coordinatorOrigin,
                persistence: {
                  enabled: true,
                  backend: 'indexeddb',
                },
                performance: {
                  memoryLimitMb: 8192,
                  fastIpc: true,
                  optimizedSnapshotting: true,
                },
              },
              experimental: {
                memoryLimitMb: 8192,
                fastIpc: true,
                optimizedSnapshotting: true,
                persistentFilesystem: true,
              },
            });

            try {
              if (!licenseKey) {
                throw new Error('Missing enterprise license key (WC_LICENSE_KEY).');
              }

              const { WebContainer } = await import(enterpriseSdkUrl);
              let lastError = null;
              let webcontainer = null;

              for (let attempt = 1; attempt <= MAX_BOOT_ATTEMPTS; attempt++) {
                try {
                  setStatus('Booting enterprise WebContainer (attempt ' + attempt + '/' + MAX_BOOT_ATTEMPTS + ')...', 'booting');
                  webcontainer = await WebContainer.boot(getBootOptions());
                  break;
                } catch (error) {
                  lastError = error;
                  console.error('Enterprise WebContainer boot attempt failed', { attempt, error });

                  if (attempt < MAX_BOOT_ATTEMPTS) {
                    await sleep(300 * attempt);
                  }
                }
              }

              if (!webcontainer) {
                throw lastError || new Error('WebContainer boot failed after retries.');
              }

              window.__boltWebContainer = webcontainer;
              setStatus('Enterprise WebContainer is ready.', 'ready');

              if (window.parent && editorOrigin) {
                window.parent.postMessage(
                  { type: 'bolt:webcontainer:ready', mode: 'enterprise-local', editorOrigin },
                  editorOrigin,
                );
              }
            } catch (error) {
              console.error('Failed to boot enterprise WebContainer:', error);
              setStatus(
                'Maintenance Mode: Enterprise WebContainer is temporarily unavailable. Please retry shortly.',
                'maintenance',
              );
            }
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(htmlContent, {
    headers: {
      'Content-Type': 'text/html',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  });
};
