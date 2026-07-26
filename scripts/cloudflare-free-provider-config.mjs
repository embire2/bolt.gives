#!/usr/bin/env node

import { runCloudflareFreeProviderConfigCli } from '../modules/control-plane/src/server/cloudflare-free-provider-config.mjs';

export * from '../modules/control-plane/src/server/cloudflare-free-provider-config.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  runCloudflareFreeProviderConfigCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
