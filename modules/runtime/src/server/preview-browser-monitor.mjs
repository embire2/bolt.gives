const MONITOR = `<script data-bolt-preview-monitor>
(() => {
  let reports = 0;
  const report = (error) => {
    if (reports >= 3) return;
    const message = typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : 'The generated app encountered a browser error.';
    reports++;
    fetch('/__bolt/error', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 500), stack: String(error?.stack || '').slice(0, 2000) }),
    }).catch(() => {});
  };
  window.addEventListener('error', event => { if (event.error || event.message) report(event.error || event.message); });
  window.addEventListener('unhandledrejection', event => report(event.reason));
})();
</script>`;

export function injectPreviewBrowserMonitor(html) {
  if (typeof html !== 'string' || html.includes('data-bolt-preview-monitor')) {
    return html;
  }

  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${MONITOR}`) : html;
}

export async function readPreviewBrowserError(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > 8192) {
      throw new Error('Preview error report exceeds its size limit.');
    }

    chunks.push(buffer);
  }

  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  if (typeof value?.message !== 'string' || !value.message.trim()) {
    throw new Error('Preview error report requires a message.');
  }

  return {
    message: value.message.slice(0, 500),
    stack: typeof value.stack === 'string' ? value.stack.slice(0, 2000) : '',
  };
}
