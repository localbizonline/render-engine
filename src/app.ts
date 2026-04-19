import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { renderRouter } from './routes/render.js';
import { templatesRouter } from './routes/templates.js';
import { previewRouter } from './routes/preview.js';
import { designRouter } from './routes/design.js';
import { designerRouter, renderDesignerBootstrapScript } from './routes/designer.js';
import { getAt, LOCAL_OUTPUT_DIR } from './services/r2-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const NODE_MODULES_DIR = path.resolve(__dirname, '../node_modules');

export function createApp() {
  const app = express();
  const designerShellRoutes = [
    '/designer',
    '/designer.html',
    '/designer/provider-lab',
    '/designer/prompt',
    '/designer/reference-video',
    '/designer/v2',
    '/designer/json',
  ];

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

  app.get(designerShellRoutes, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer.html'));
  });

  app.get('/designer-v2-bridge.js', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer-v2-bridge.js'));
  });

  app.get('/designer-app.js', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer-app.js'));
  });

  app.get('/designer-canvas-editor.js', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'designer-canvas-editor.js'));
  });

  app.get('/vendor/konva.min.js', (_req, res) => {
    res.sendFile(path.join(NODE_MODULES_DIR, 'konva/konva.min.js'));
  });

  app.get('/designer-bootstrap.js', (req, res) => {
    res.type('application/javascript').send(renderDesignerBootstrapScript());
  });

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/artifacts', async (req, res) => {
    const key = String(req.query.key || '').trim();
    if (!key) {
      res.status(400).send('key is required');
      return;
    }

    // Only expose Provider Lab experiment artifacts through the public proxy.
    if (!key.startsWith('experiments/')) {
      res.status(403).send('forbidden');
      return;
    }

    try {
      const artifact = await getAt(key);
      if (artifact.contentType) {
        res.type(artifact.contentType);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(artifact.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/NoSuchKey|not found|ENOENT/i.test(message)) {
        res.status(404).send('not found');
        return;
      }
      res.status(500).send('artifact load failed');
    }
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
  app.use('/api/designer', designerRouter);

  return app;
}
