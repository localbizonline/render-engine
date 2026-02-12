import express from 'express';
import { config } from './config.js';
import { initFonts } from './engine/font-manager.js';
import { initRegistry } from './templates/registry.js';
import { renderRouter } from './routes/render.js';
import { templatesRouter } from './routes/templates.js';
import { previewRouter } from './routes/preview.js';
import { designRouter } from './routes/design.js';

const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API key auth middleware for /api routes
app.use('/api', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!config.apiKey) {
    // No key configured = skip auth (dev mode)
    return next();
  }
  if (key !== config.apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
});

// Routes
app.use('/api/render', renderRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/preview', previewRouter);
app.use('/api/design', designRouter);

async function start() {
  // Register fonts + load template definitions
  initFonts();
  initRegistry();
  console.log('[render-engine] Fonts + templates loaded');

  app.listen(config.port, () => {
    console.log(`[render-engine] Listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('[render-engine] Failed to start:', err);
  process.exit(1);
});
