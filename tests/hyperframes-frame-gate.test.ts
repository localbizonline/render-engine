import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHyperframesSamples,
  type HyperframesFrameGateSample,
} from '../src/utils/hyperframes-frame-gate.ts';

function sample(frameIndex: number, pixels: number[], tileMeans?: number[]): HyperframesFrameGateSample {
  const mean = pixels.reduce((sum, value) => sum + value, 0) / (pixels.length * 255);
  return {
    frameIndex,
    timeSeconds: frameIndex / 30,
    mean,
    pixelData: Uint8Array.from(pixels),
    tileMeans: tileMeans ?? [mean],
  };
}

test('frame gate ignores ordinary multi-frame transitions', () => {
  const samples = [
    sample(0, [10, 10, 10, 10], [0.05]),
    sample(1, [70, 70, 70, 70], [0.25]),
    sample(2, [130, 130, 130, 130], [0.5]),
    sample(3, [190, 190, 190, 190], [0.75]),
    sample(4, [240, 240, 240, 240], [0.94]),
  ];

  const report = analyzeHyperframesSamples(samples, 30, samples.length / 30, {
    oneFrameDropoutPixelThreshold: 0.02,
    oneFrameDropoutPixelRecoverThreshold: 0.008,
    oneFrameDropoutTileThreshold: 0.06,
    oneFrameDropoutTileRecoverThreshold: 0.018,
  });

  assert.equal(report.oneFrameDropouts.length, 0);
  assert.equal(report.failed, false);
});

test('frame gate flags a localized one-frame dropout between matching neighbors', () => {
  const stablePixels = [220, 220, 220, 220];
  const blankPixels = [220, 220, 220, 220];
  const samples = [
    sample(0, stablePixels, [0.86, 0.22, 0.86, 0.86]),
    sample(1, stablePixels, [0.86, 0.22, 0.86, 0.86]),
    sample(2, blankPixels, [0.86, 0.86, 0.86, 0.86]),
    sample(3, stablePixels, [0.86, 0.22, 0.86, 0.86]),
    sample(4, stablePixels, [0.86, 0.22, 0.86, 0.86]),
  ];

  const report = analyzeHyperframesSamples(samples, 30, samples.length / 30, {
    oneFrameDropoutPixelThreshold: 0.001,
    oneFrameDropoutPixelRecoverThreshold: 0.0001,
    oneFrameDropoutTileThreshold: 0.2,
    oneFrameDropoutTileRecoverThreshold: 0.01,
  });

  assert.equal(report.oneFrameDropouts.length, 1);
  assert.equal(report.oneFrameDropouts[0].frameIndex, 2);
  assert.equal(report.failed, true);
});

test('frame gate flags globally black frames separately from local dropouts', () => {
  const samples = [
    sample(0, [255, 255, 255, 255], [1]),
    sample(1, [0, 0, 0, 0], [0]),
    sample(2, [255, 255, 255, 255], [1]),
  ];

  const report = analyzeHyperframesSamples(samples, 30, samples.length / 30, {
    oneFrameDropoutPixelThreshold: 0.5,
    oneFrameDropoutPixelRecoverThreshold: 0.1,
    oneFrameDropoutTileThreshold: 0.5,
    oneFrameDropoutTileRecoverThreshold: 0.1,
  });

  assert.equal(report.blackFrames.length, 1);
  assert.equal(report.blackFrames[0].frameIndex, 1);
  assert.equal(report.failed, true);
});
