const CONTAINER_PORT = 3000;
const ALLOWED_PROXY_ROUTES = new Set([
  '/health',
  '/api/render/hyperframes',
  '/api/render/hyperframes/preview',
  '/api/render/hyperframes/still',
]);

const FORWARDED_CONTAINER_ENV_KEYS = [
  'RENDER_API_KEY',
  'DESIGNER_DEFAULT_V2_BASE_URL',
  'DESIGNER_DEFAULT_V2_ADMIN_SECRET',
  'V2_BASE_URL',
  'V2_ADMIN_SECRET',
  'HYPERFRAMES_RENDER_WORKERS_CLOUDFLARE',
  'HYPERFRAMES_RENDER_WORKERS',
  'HYPERFRAMES_RENDER_WORKERS_RAILWAY',
  'PRODUCER_MAX_WORKERS',
  'HYPERFRAMES_VERIFY_PREVIEW',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_VIDEO_MODEL',
] as const;

export { CONTAINER_PORT };

export interface RenderEngineWorkerEnv {
  HYPERFRAMES_RENDER_ENGINE: unknown
  [key: string]: unknown
}

export interface ContainerStartOptions {
  startOptions?: {
    envVars?: Record<string, string>
  }
  ports?: number | number[]
}

export interface HyperframesContainerStub {
  startAndWaitForPorts(options?: ContainerStartOptions): Promise<void>
  fetch(request: Request): Promise<Response>
}

export function isAllowedHyperframesProxyRequest(request: Request) {
  const { pathname } = new URL(request.url);
  if (!ALLOWED_PROXY_ROUTES.has(pathname)) return false;
  if (pathname === '/health') {
    return request.method === 'GET' || request.method === 'HEAD';
  }
  return request.method === 'POST';
}

export function buildContainerEnvVars(env: RenderEngineWorkerEnv): Record<string, string> {
  const envVars: Record<string, string> = {
    NODE_ENV: 'production',
    PORT: String(CONTAINER_PORT),
  };

  for (const key of FORWARDED_CONTAINER_ENV_KEYS) {
    const rawValue = env[key];
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    envVars[key] = value;
  }

  return envVars;
}

function createNotFoundResponse() {
  return new Response(JSON.stringify({
    success: false,
    error: 'Not found',
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function proxyToHyperframesContainer(
  request: Request,
  env: RenderEngineWorkerEnv,
  container: HyperframesContainerStub,
) {
  if (!isAllowedHyperframesProxyRequest(request)) {
    return createNotFoundResponse();
  }

  await container.startAndWaitForPorts({
    startOptions: {
      envVars: buildContainerEnvVars(env),
    },
    ports: CONTAINER_PORT,
  });

  return container.fetch(request);
}
