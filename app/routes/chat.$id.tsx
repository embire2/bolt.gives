import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { ChatWorkspace } from './_index';

export async function loader(args: LoaderFunctionArgs) {
  return json({ id: args.params.id });
}

export default ChatWorkspace;
