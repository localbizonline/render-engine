import { Router } from 'express';
import { config } from '../config.js';

export const designerRouter = Router();

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
