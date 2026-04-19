import { Router } from 'express';
import { config } from '../config.js';
import type { DesignerChatTurnRequest } from '../types.js';
import { runDesignerChatTurn } from '../services/designer-chat.js';
import { listProviders } from '../providers/index.js';
import type { ProviderLabPostSnapshot, ProviderLabProviderId } from '../providers/types.js';
import { listProviderRuns, renderProviderFinal, renderProviderPreview } from '../services/provider-lab.js';

export const designerRouter = Router();

function parseProviderId(value: unknown): ProviderLabProviderId {
  if (value === 'hyperframes' || value === 'remotion') return value;
  const error = new Error('provider must be "hyperframes" or "remotion"');
  (error as Error & { status?: number }).status = 400;
  throw error;
}

function parsePostSnapshot(value: unknown): ProviderLabPostSnapshot {
  if (!value || typeof value !== 'object') {
    const error = new Error('snapshot is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const snapshot = value as ProviderLabPostSnapshot;
  if (!snapshot.post?.id) {
    const error = new Error('snapshot.post.id is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  if (!Array.isArray(snapshot.media?.image_urls)) {
    const error = new Error('snapshot.media.image_urls must be an array');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return snapshot;
}

function getConfiguredV2BaseUrl(): string {
  return String(config.designer.defaultV2BaseUrl || '').trim().replace(/\/+$/, '');
}

export function hasConfiguredV2Proxy(): boolean {
  return Boolean(getConfiguredV2BaseUrl() && config.designer.defaultV2AdminSecret);
}

function getAllowedV2Origins(): string[] {
  const origins = new Set<string>();
  const configuredBaseUrl = getConfiguredV2BaseUrl();
  if (configuredBaseUrl) origins.add(new URL(configuredBaseUrl).origin);
  origins.add('https://rep.localpros.co.za');
  origins.add('https://admin.localpros.co.za');
  return [...origins];
}

export function getDesignerBootstrapPayload() {
  return {
    renderApiKey: String(config.apiKey || ''),
    v2BaseUrl: getConfiguredV2BaseUrl(),
    v2ServerProxyEnabled: hasConfiguredV2Proxy(),
  };
}

export function renderDesignerBootstrapScript(): string {
  return `window.__TEMPLATE_LAB_BOOTSTRAP__ = Object.assign({}, window.__TEMPLATE_LAB_BOOTSTRAP__ || {}, ${JSON.stringify(getDesignerBootstrapPayload())});\n`;
}

function assertV2ProxyConfigured() {
  const baseUrl = getConfiguredV2BaseUrl();
  const adminSecret = String(config.designer.defaultV2AdminSecret || '').trim();

  if (!baseUrl || !adminSecret) {
    const error = new Error('Server-side V2 defaults are not configured');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }

  return { baseUrl, adminSecret };
}

function normalizeExportUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    const error = new Error('Export URL is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  assertV2ProxyConfigured();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    const error = new Error('Export URL must be a valid absolute URL');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  if (!getAllowedV2Origins().includes(parsed.origin)) {
    const error = new Error('Export URL must match the configured V2 origin');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  return parsed.toString();
}

designerRouter.get('/bootstrap.js', (_req, res) => {
  res.type('application/javascript').send(renderDesignerBootstrapScript());
});

designerRouter.get('/provider-lab/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});

designerRouter.get('/provider-lab/runs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit || '12'), 10) || 12, 50));
    const runs = await listProviderRuns(limit);
    res.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

designerRouter.get('/v2/export', async (req, res) => {
  try {
    const { adminSecret } = assertV2ProxyConfigured();
    const exportUrl = normalizeExportUrl(String(req.query.url || ''));

    const upstream = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
      },
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.post('/v2/import', async (req, res) => {
  try {
    const { baseUrl, adminSecret } = assertV2ProxyConfigured();
    const upstream = await fetch(`${baseUrl}/api/admin/render-templates/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.get('/v2/post', async (req, res) => {
  try {
    const { baseUrl, adminSecret } = assertV2ProxyConfigured();
    const postId = String(req.query.id || '').trim();

    if (!postId) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const upstream = await fetch(`${baseUrl}/api/admin/experiment-posts/${encodeURIComponent(postId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
      },
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.get('/v2/posts/recent', async (req, res) => {
  try {
    const { baseUrl, adminSecret } = assertV2ProxyConfigured();
    const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit || '12'), 10) || 12, 50));
    const status = String(req.query.status || 'ready').trim();
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);

    const upstream = await fetch(`${baseUrl}/api/admin/experiment-posts?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
      },
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.post('/provider-lab/preview', async (req, res) => {
  try {
    const provider = parseProviderId(req.body?.provider);
    const snapshot = parsePostSnapshot(req.body?.snapshot);
    const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId.trim() : '';
    const preview = await renderProviderPreview({ provider, snapshot, templateId });
    res.json(preview);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.post('/provider-lab/render', async (req, res) => {
  try {
    const provider = parseProviderId(req.body?.provider);
    const snapshot = parsePostSnapshot(req.body?.snapshot);
    const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId.trim() : '';
    const manifest = await renderProviderFinal({ provider, snapshot, templateId });
    res.status(201).json({ run: manifest });
  } catch (error) {
    const status = error instanceof Error && 'status' in error && typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : String(error);
    res.status(status).json({ error: message });
  }
});

designerRouter.post('/chat/message', async (req, res) => {
  const { message } = req.body as DesignerChatTurnRequest;
  if (!String(message || '').trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const result = await runDesignerChatTurn(req.body as DesignerChatTurnRequest);
    res.json(result);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    const status = /required/i.test(messageText) ? 400 : 500;
    res.status(status).json({ error: messageText });
  }
});
