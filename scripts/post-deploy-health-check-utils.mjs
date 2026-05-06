export const PROMPT_SURFACE_SELECTORS = [
  'textarea[placeholder="How can Bolt help you today?"]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

export async function detectPromptSurface(page) {
  for (const selector of PROMPT_SURFACE_SELECTORS) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);

    if (visible) {
      return true;
    }
  }

  return false;
}

export function inferExpectedSurface(baseUrl) {
  const parsed = new URL(baseUrl);
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (hostname.startsWith('admin.') || pathname.includes('/tenant-admin')) {
    return 'admin';
  }

  if (hostname.startsWith('create.') || pathname.includes('/managed-instances')) {
    return 'managed-instances';
  }

  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return 'chat';
  }

  return 'website';
}

export function matchesExpectedSurface(expectedSurface, { title = '', bodyText = '' } = {}) {
  const haystack = `${title}\n${bodyText}`.toLowerCase();

  if (expectedSurface === 'admin') {
    return haystack.includes('tenant admin') || haystack.includes('operator') || haystack.includes('admin');
  }

  if (expectedSurface === 'managed-instances') {
    return haystack.includes('managed') && (haystack.includes('instance') || haystack.includes('cloudflare'));
  }

  if (expectedSurface === 'website') {
    return (
      haystack.includes('transparent ai coding workspace') ||
      haystack.includes('prompt-to-preview') ||
      haystack.includes('contribute to project')
    );
  }

  return false;
}
