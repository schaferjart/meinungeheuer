import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { webhookRoutes } from './routes/webhook.js';
import { sessionRoutes } from './routes/session.js';
import { configRoutes } from './routes/config.js';

export const app = new Hono();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Route groups
// ---------------------------------------------------------------------------

// ElevenLabs webhooks
app.route('/webhook', webhookRoutes);

// Session management
app.route('/api/session', sessionRoutes);

// Config, definitions, chain — all mounted at /api so:
//   GET  /api/config              → configRoutes GET /
//   POST /api/config/update       → configRoutes POST /update
//   GET  /api/definitions         → configRoutes GET /definitions
//   GET  /api/chain               → configRoutes GET /chain
app.route('/api/config', configRoutes);

// Also expose definitions and chain directly under /api for convenience
app.route('/api', configRoutes);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error('[app] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});
