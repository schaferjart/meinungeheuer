import { serve } from '@hono/node-server';
import { APP_NAME } from '@denkfink/installation-core';
import { app } from './app.js';

const port = parseInt(process.env['PORT'] ?? '3001', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`${APP_NAME} backend running on http://localhost:${info.port}`);
});
