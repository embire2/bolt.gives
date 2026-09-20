type AdminProxyEnv = { BOLT_RUNTIME_CONTROL_PUBLIC_URL?: string };

/** Keep admin authentication on the configured backend; never copy its signing key into a fleet instance. */
export async function proxyManagedAdmin(request: Request, env: AdminProxyEnv): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname !== '/admin' && url.pathname !== '/tenant-admin') {
    return null;
  }

  const backend = env.BOLT_RUNTIME_CONTROL_PUBLIC_URL;

  if (!backend) {
    return null;
  }

  const target = new URL(`${url.pathname}${url.search}`, backend);

  if (target.origin === url.origin) {
    return null;
  }

  if (target.protocol !== 'https:') {
    return new Response('Admin gateway requires HTTPS.', { status: 503 });
  }

  const origin = request.headers.get('Origin');

  if (
    !['GET', 'HEAD'].includes(request.method) &&
    ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
  ) {
    return new Response('Cross-origin admin request blocked.', { status: 403 });
  }

  const headers = new Headers(request.headers);

  for (const key of ['Host', 'Content-Length', 'X-Bolt-Public-Origin', 'X-Forwarded-Host']) {
    headers.delete(key);
  }

  if (origin) {
    headers.set('Origin', target.origin);
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),

    // Node's server adapter also streams POST bodies through this gateway.
    ...({ duplex: 'half' } as RequestInit),
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store');

  const location = responseHeaders.get('Location');

  if (location) {
    const destination = new URL(location, target);

    if (destination.origin === target.origin) {
      responseHeaders.set('Location', `${url.origin}${destination.pathname}${destination.search}`);
    }
  }

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}
