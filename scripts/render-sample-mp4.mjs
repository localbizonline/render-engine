#!/usr/bin/env node
// Render a Hyperframes sample HTML to a 1080x1920 MP4.
//
// Approach:
// 1. Playwright loads the HTML at the native 1080x1920 composition size
//    (scale transform is reset via injected CSS).
// 2. The GSAP timeline is paused on load, and we step it frame-by-frame
//    at 30fps up to its full duration, screenshotting each frame.
// 3. Frames are piped to ffmpeg → H.264 MP4, yuv420p, AAC silent audio.
//
// Usage:
//   node render-sample-mp4.mjs <html-url> <output.mp4>
//
// Example:
//   node render-sample-mp4.mjs \
//     http://localhost:8765/real-data/real_01_bold_editorial_g85_kitchen.html \
//     rendered/real_01.mp4

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

const [, , inputUrl, outputArg] = process.argv;
if (!inputUrl || !outputArg) {
  console.error('Usage: node render-sample-mp4.mjs <html-url> <output.mp4>');
  process.exit(1);
}
const outputPath = path.resolve(outputArg);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Inject CSS before the page loads to disable preview scaling.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      html, body { margin: 0 !important; padding: 0 !important; background: #000 !important;
        display: block !important; align-items: initial !important; justify-content: initial !important; }
      #root { transform: none !important; margin: 0 !important; }
    `;
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });

  console.log(`→ loading ${inputUrl}`);
  await page.goto(inputUrl, { waitUntil: 'networkidle', timeout: 60000 });

  // Pause the GSAP timeline. We expect one long-running child timeline.
  // If <body data-duration="N"> is present, use that as the total render length
  // (so outro holds beyond the last tween are captured). Otherwise fall back
  // to timeline.duration().
  const durationSec = await page.evaluate(() => {
    if (!window.gsap) throw new Error('GSAP not loaded');
    const children = gsap.globalTimeline.getChildren(true, false, true);
    const tl = children.find(c => typeof c.duration === 'function' && c.duration() > 5);
    if (!tl) throw new Error('no main timeline found');
    tl.pause();
    tl.repeat(0);
    window.__renderTl = tl;
    const override = parseFloat(document.body.getAttribute('data-duration') || '');
    return Number.isFinite(override) && override > 0 ? override : tl.duration();
  });

  console.log(`→ timeline duration: ${durationSec.toFixed(2)}s`);

  // Wait for all images to settle after navigation.
  await page.evaluate(() => Promise.all(
    [...document.images].map(i =>
      i.complete && i.naturalWidth > 0
        ? null
        : new Promise(res => { i.addEventListener('load', res); i.addEventListener('error', res); })
    ).filter(Boolean)
  ));

  const imageStatus = await page.evaluate(() =>
    [...document.images].map(i => ({ src: i.src, ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight }))
  );
  const failed = imageStatus.filter(i => !i.ok);
  if (failed.length) {
    console.warn(`⚠ ${failed.length} image(s) failed to load:`);
    for (const f of failed) console.warn(`    ${f.src}`);
  } else {
    console.log(`✓ all ${imageStatus.length} images loaded`);
  }

  const frameCount = Math.ceil(durationSec * FPS);
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-render-'));
  console.log(`→ capturing ${frameCount} frames at ${FPS}fps into ${frameDir}`);

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / FPS;
    await page.evaluate((time) => {
      window.__renderTl.seek(Math.min(time, window.__renderTl.duration()));
    }, t);
    const framePath = path.join(frameDir, `f_${String(i).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: framePath, type: 'jpeg', quality: 92, fullPage: false });
    if ((i + 1) % 30 === 0) process.stdout.write(`  ${i + 1}/${frameCount} frames\r`);
  }
  process.stdout.write(`  ${frameCount}/${frameCount} frames\n`);

  await browser.close();

  console.log(`→ encoding MP4 with ffmpeg`);
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(frameDir, 'f_%05d.jpg'),
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ]);
    ff.stderr.on('data', d => process.stderr.write(d));
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    ff.on('error', reject);
  });

  fs.rmSync(frameDir, { recursive: true, force: true });
  const stat = fs.statSync(outputPath);
  console.log(`✓ wrote ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
