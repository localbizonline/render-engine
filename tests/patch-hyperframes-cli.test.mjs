import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENCODER_TARGET,
  PREPARE_TARGET,
  SCREENSHOT_TARGET,
  VIDEO_READY_REPLACEMENT,
  VIDEO_READY_TARGET,
  patchHyperframesCliSource,
} from '../scripts/patch-hyperframes-cli-lib.mjs';

function evaluateVideoReady(videos) {
  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, 'video');
      return videos;
    },
  };

  return Function('document', `return ${VIDEO_READY_REPLACEMENT};`)(document);
}

test('patchHyperframesCliSource replaces the video ready gate in every capture path', () => {
  const source = `
${SCREENSHOT_TARGET}
${ENCODER_TARGET}
${PREPARE_TARGET}
await page.waitForFunction(
  \`${VIDEO_READY_TARGET}\`,
  { timeout: pageReadyTimeout2 }
);
const videosReady = await page.evaluate(
  \`${VIDEO_READY_TARGET}\`
);
`;

  const patched = patchHyperframesCliSource(source);
  assert.doesNotMatch(patched, /every\(v => v\.readyState >= 1\)/);
  assert.equal(patched.split(VIDEO_READY_REPLACEMENT).length - 1, 2);
});

test('patchHyperframesCliSource is idempotent', () => {
  const source = `
${SCREENSHOT_TARGET}
${ENCODER_TARGET}
${PREPARE_TARGET}
${VIDEO_READY_TARGET}
`;
  const once = patchHyperframesCliSource(source);
  const twice = patchHyperframesCliSource(once);
  assert.equal(twice, once);
});

test('patched video ready expression ignores sourceless and failed videos but waits on live pending videos', () => {
  assert.equal(evaluateVideoReady([]), true);
  assert.equal(evaluateVideoReady([
    {
      currentSrc: '',
      readyState: 0,
      error: null,
      networkState: 0,
      getAttribute() { return ''; },
      querySelector() { return null; },
    },
  ]), true);

  assert.equal(evaluateVideoReady([
    {
      currentSrc: 'https://cdn.example.com/clip.mp4',
      readyState: 0,
      error: { code: 4 },
      networkState: 3,
      getAttribute() { return 'https://cdn.example.com/clip.mp4'; },
      querySelector() { return null; },
    },
  ]), true);

  assert.equal(evaluateVideoReady([
    {
      currentSrc: 'https://cdn.example.com/clip.mp4',
      readyState: 0,
      error: null,
      networkState: 2,
      getAttribute() { return 'https://cdn.example.com/clip.mp4'; },
      querySelector() { return null; },
    },
  ]), false);
});
