import { Hono } from 'hono';
import { runCleanup } from '../services/cleanup.js';

export const cleanupRoutes = new Hono();

// ---------------------------------------------------------------------------
// Auth middleware — same pattern as webhook.ts
// ---------------------------------------------------------------------------

cleanupRoutes.use('*', async (c, next) => {
  const secret = process.env['WEBHOOK_SECRET'];

  if (!secret) {
    await next();
    return;
  }

  const querySecret = c.req.query('secret');
  const authHeader = c.req.header('Authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (querySecret !== secret && bearerSecret !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// ---------------------------------------------------------------------------
// POST /run — trigger cleanup
// ---------------------------------------------------------------------------

cleanupRoutes.post('/run', async (c) => {
  try {
    const summary = await runCleanup();
    return c.json({ success: true, ...summary });
  } catch (err) {
    console.error('[cleanup/run] Unexpected error:', err);
    return c.json({ success: false, error: 'Internal error' }, 500);
  }
});
