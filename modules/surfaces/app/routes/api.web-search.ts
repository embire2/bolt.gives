import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { isAllowedUrl } from '@bolt/core/utils/url';
import { browsePageWithPlaywright } from '@bolt/agent/lib/.server/web-browse-client';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let url: unknown;

  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return json({ error: 'A JSON request containing a URL is required.' }, { status: 400 });
  }

  if (typeof url !== 'string' || !isAllowedUrl(url)) {
    return json({ error: 'Only public HTTP/HTTPS URLs without credentials are accepted.' }, { status: 400 });
  }

  try {
    const page = await browsePageWithPlaywright(
      { url, maxChars: 8000 },
      { env: (context as { cloudflare?: { env?: Env } }).cloudflare?.env },
    );

    if (page.status >= 400) {
      return json({ error: `The website returned HTTP ${page.status}.` }, { status: 502 });
    }

    return json({
      success: true,
      data: {
        title: page.title,
        description: page.description,
        content: page.content,
        sourceUrl: page.finalUrl || url,
      },
    });
  } catch {
    // Never replace the protected browsing transports with an unrestricted fetch.
    return json(
      { error: 'The website could not be read safely. Check its public URL or try again later.' },
      { status: 502 },
    );
  }
}
