import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContainerEnvVars,
  isAllowedHyperframesProxyRequest,
  proxyToHyperframesContainer,
  type HyperframesContainerStub,
  type RenderEngineWorkerEnv,
} from '../src/cf-proxy.ts';

test('worker proxy only allows health and Hyperframes render routes', () => {
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/health')), true);
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/health', { method: 'HEAD' })), true);
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/api/render/hyperframes', { method: 'POST' })), true);
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/api/render/hyperframes/preview', { method: 'POST' })), true);
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/api/render', { method: 'POST' })), false);
  assert.equal(isAllowedHyperframesProxyRequest(new Request('https://example.com/api/render/hyperframes', { method: 'GET' })), false);
});

test('worker proxy forwards request body, headers, and non-2xx responses unchanged', async () => {
  const starts: ContainerStartOptions[] = [];
  const env = {
    HYPERFRAMES_RENDER_ENGINE: {},
    RENDER_API_KEY: 'render-secret',
    R2_ACCOUNT_ID: 'acc-1',
    R2_ACCESS_KEY_ID: 'key-1',
    R2_SECRET_ACCESS_KEY: 'secret-1',
  } satisfies RenderEngineWorkerEnv;

  const container: HyperframesContainerStub = {
    async startAndWaitForPorts(options) {
      starts.push(options || {});
    },
    async fetch(request) {
      assert.equal(request.headers.get('x-api-key'), 'render-secret');
      assert.equal(request.headers.get('content-type'), 'application/json');
      const body = await request.text();
      assert.equal(body, JSON.stringify({ hello: 'world' }));
      return new Response(body, {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'X-Upstream': 'container',
        },
      });
    },
  };

  const response = await proxyToHyperframesContainer(new Request('https://example.com/api/render/hyperframes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'render-secret',
    },
    body: JSON.stringify({ hello: 'world' }),
  }), env, container);

  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0], {
    startOptions: {
      envVars: {
        NODE_ENV: 'production',
        PORT: '3000',
        RENDER_API_KEY: 'render-secret',
        R2_ACCOUNT_ID: 'acc-1',
        R2_ACCESS_KEY_ID: 'key-1',
        R2_SECRET_ACCESS_KEY: 'secret-1',
      },
    },
    ports: 3000,
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('x-upstream'), 'container');
  assert.equal(await response.text(), JSON.stringify({ hello: 'world' }));
});

test('worker proxy returns 404 without touching the container for unsupported routes', async () => {
  let started = false;

  const container: HyperframesContainerStub = {
    async startAndWaitForPorts() {
      started = true;
    },
    async fetch() {
      throw new Error('should not fetch');
    },
  };

  const response = await proxyToHyperframesContainer(
    new Request('https://example.com/api/render', { method: 'POST' }),
    { HYPERFRAMES_RENDER_ENGINE: {} },
    container,
  );

  assert.equal(started, false);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Not found/i);
});

interface ContainerStartOptions {
  startOptions?: {
    envVars?: Record<string, string>
  }
  ports?: number | number[]
}

test('worker proxy builds container env vars from configured worker env', () => {
  const envVars = buildContainerEnvVars({
    HYPERFRAMES_RENDER_ENGINE: {},
    RENDER_API_KEY: 'render-secret',
    DESIGNER_DEFAULT_V2_BASE_URL: 'https://admin.localpros.co.za',
    NODE_ENV: 'staging',
    PORT: '8787',
    GOOGLE_API_KEY: '',
  });

  assert.deepEqual(envVars, {
    NODE_ENV: 'production',
    PORT: '3000',
    RENDER_API_KEY: 'render-secret',
    DESIGNER_DEFAULT_V2_BASE_URL: 'https://admin.localpros.co.za',
  });
});
