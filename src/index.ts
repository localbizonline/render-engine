import { config } from './config.js';
import { initFonts } from './engine/font-manager.js';
import { initRegistry } from './templates/registry.js';
import { createApp } from './app.js';

async function start() {
  // Register fonts + load local template definitions
  initFonts();
  await initRegistry();
  console.log('[render-engine] Fonts + templates loaded');

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[render-engine] Listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('[render-engine] Failed to start:', err);
  process.exit(1);
});
