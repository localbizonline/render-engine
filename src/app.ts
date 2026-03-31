import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { renderRouter } from './routes/render.js';
import { templatesRouter } from './routes/templates.js';
import { previewRouter } from './routes/preview.js';
import { designRouter } from './routes/design.js';
import { LOCAL_OUTPUT_DIR } from './services/r2-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '20mb' }));

  // Serve locally rendered files (fallback when R2 not configured)
  app.use('/output', express.static(LOCAL_OUTPUT_DIR, {
    maxAge: '1y',
    immutable: true,
  }));

  // Serve designer UI and other static files
  app.use(express.static(PUBLIC_DIR, {
    extensions: ['html'],
  }));

  app.get(['/designer', '/designer.html'], (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer.html'));
  });

  app.get('/designer-v2-bridge.js', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer-v2-bridge.js'));
  });

  app.get('/designer-app.js', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer-app.js'));
  });

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

  return app;
}
