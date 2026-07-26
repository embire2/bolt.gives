#!/usr/bin/env node

import { runWebBrowseServer } from '../modules/agent/src/server/web-browse-server.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  runWebBrowseServer();
}
