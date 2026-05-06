import { json } from '@remix-run/cloudflare';

import { ChatWorkspace } from './_index';

export const loader = () => json({});

export default ChatWorkspace;
