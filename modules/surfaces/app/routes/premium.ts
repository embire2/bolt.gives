import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/pricing${url.search}`);
}
