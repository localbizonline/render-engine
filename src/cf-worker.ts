import { Container, getContainer } from '@cloudflare/containers';
import {
  CONTAINER_PORT,
  proxyToHyperframesContainer,
  type HyperframesContainerStub,
  type RenderEngineWorkerEnv,
} from './cf-proxy.js';

const CONTAINER_NAME = 'hyperframes-render-engine';

export class HyperframesRenderEngineContainer extends Container {
  defaultPort = CONTAINER_PORT;
  requiredPorts = [CONTAINER_PORT];
}

export function getHyperframesContainer(env: RenderEngineWorkerEnv): HyperframesContainerStub {
  return getContainer(
    env.HYPERFRAMES_RENDER_ENGINE as never,
    CONTAINER_NAME,
  ) as unknown as HyperframesContainerStub;
}

export default {
  async fetch(request: Request, env: RenderEngineWorkerEnv) {
    return proxyToHyperframesContainer(request, env, getHyperframesContainer(env));
  },
};
