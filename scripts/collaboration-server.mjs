#!/usr/bin/env node

import { runCollaborationServer } from '../modules/project/src/server/collaboration-server.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollaborationServer();
}
