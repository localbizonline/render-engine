import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  __hyperframesProviderTestHooks,
  hyperframesProvider,
  setHyperframesRenderOverrideForTests,
} from '../src/providers/hyperframes.ts';
import type { ProviderLabPostSnapshot } from '../src/providers/types.ts';

function buildSnapshot(
  overrides: Partial<ProviderLabPostSnapshot> = {},
): ProviderLabPostSnapshot {
  return {
    post: {
      id: 'post-1',
      org_id: 'org-1',
      category_id: 'cat-1',
      category_name: 'Recent Job',
      status: 'published',
      ...(overrides.post || {}),
    },
    content: {
      title: 'Kitchen makeover complete',
      subtitle: 'Custom cupboards installed',
      body: 'New storage, cleaner lines, and a brighter working space.',
      ...(overrides.content || {}),
    },
    brand: {
      company_name: 'Acme Services',
      primary_colour: '#123456',
      secondary_colour: '#abcdef',
      logo_url: null,
      ...(overrides.brand || {}),
    },
    media: {
      image_urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
      poster_url: null,
      video_url: null,
      ...(overrides.media || {}),
    },
    platform_context: {
      platforms: ['Instagram', 'Facebook'],
      variant: 'feed',
      ...(overrides.platform_context || {}),
    },
  };
}

async function captureHtml(snapshot: ProviderLabPostSnapshot, templateId: string): Promise<string> {
  let htmlDocument = '';

  setHyperframesRenderOverrideForTests(async ({ htmlDocument: nextHtmlDocument }) => {
    htmlDocument = nextHtmlDocument;
    return {
      templateId,
      mp4Buffer: Buffer.from('mp4'),
      posterBuffer: Buffer.from('poster'),
      durationMs: 1000,
      width: 1080,
      height: 1920,
    };
  });

  try {
    await hyperframesProvider.render({
      snapshot,
      mode: 'preview',
      templateId,
    });
  } finally {
    setHyperframesRenderOverrideForTests(null);
  }

  return htmlDocument;
}

test('basic Hyperframes template only renders post-sourced text', async () => {
  const html = await captureHtml(buildSnapshot(), 'hyperframes-basic-v1');

  assert.match(html, /Kitchen makeover complete/);
  assert.match(html, /Custom cupboards installed/);
  assert.match(html, /New storage, cleaner lines, and a brighter working space\./);
  assert.doesNotMatch(html, /Acme Services/);
  assert.doesNotMatch(html, /Recent Job/);
  assert.doesNotMatch(html, /Instagram/);
  assert.doesNotMatch(html, /Facebook/);
  assert.doesNotMatch(html, /Provider Lab Reel/);
  assert.doesNotMatch(html, /Real post snapshot/);
  assert.doesNotMatch(html, /Social Reel/);
});

test('split-panel Hyperframes template falls back within post copy only', async () => {
  const html = await captureHtml(buildSnapshot({
    content: {
      title: null,
      subtitle: null,
      body: 'Only the post body should appear on screen.',
    },
  }), 'hyperframes-split-panel-v1');

  assert.match(html, /Only the post body should appear on screen\./);
  assert.doesNotMatch(html, /Acme Services/);
  assert.doesNotMatch(html, /Recent Job/);
  assert.doesNotMatch(html, /Instagram/);
  assert.doesNotMatch(html, /Facebook/);
  assert.doesNotMatch(html, /Provider Lab Reel/);
  assert.doesNotMatch(html, /Real post snapshot/);
  assert.doesNotMatch(html, /Social Reel/);
});

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit ${code}: ${output.trim()}`));
    });
  });
}

test('Hyperframes CLI render resolves when a valid output is complete even if the child hangs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperframes-provider-cli-hang-'));
  const fixturePath = path.join(tmpDir, 'fixture.mp4');
  const cliPath = path.join(tmpDir, 'fake-hyperframes-cli.mjs');
  const outputPath = path.join(tmpDir, 'render.mp4');

  await runCommand('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=160x284:d=1:r=30',
    '-pix_fmt',
    'yuv420p',
    fixturePath,
  ]);

  fs.writeFileSync(
    cliPath,
    `#!/usr/bin/env node
import fs from 'node:fs';
const outputIndex = process.argv.indexOf('--output');
if (outputIndex === -1 || !process.argv[outputIndex + 1]) {
  console.error('missing --output');
  process.exit(2);
}
fs.copyFileSync(${JSON.stringify(fixturePath)}, process.argv[outputIndex + 1]);
setInterval(() => {}, 1000);
`,
    'utf8',
  );
  fs.chmodSync(cliPath, 0o755);

  const previousCliPath = process.env.HYPERFRAMES_CLI_PATH;
  const previousWatchdog = process.env.HYPERFRAMES_RENDER_OUTPUT_WATCHDOG_MS;
  process.env.HYPERFRAMES_CLI_PATH = cliPath;
  process.env.HYPERFRAMES_RENDER_OUTPUT_WATCHDOG_MS = '250';

  try {
    const startedAt = Date.now();
    await __hyperframesProviderTestHooks.runHyperframesCliRender({
      projectDir: tmpDir,
      outputPath,
      mode: 'preview',
    });
    assert.ok(Date.now() - startedAt < 5000);
    assert.equal(await __hyperframesProviderTestHooks.probeCompletedVideoOutput(outputPath), true);
  } finally {
    if (previousCliPath === undefined) {
      delete process.env.HYPERFRAMES_CLI_PATH;
    } else {
      process.env.HYPERFRAMES_CLI_PATH = previousCliPath;
    }
    if (previousWatchdog === undefined) {
      delete process.env.HYPERFRAMES_RENDER_OUTPUT_WATCHDOG_MS;
    } else {
      process.env.HYPERFRAMES_RENDER_OUTPUT_WATCHDOG_MS = previousWatchdog;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
