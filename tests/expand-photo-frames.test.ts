import test from 'node:test';
import assert from 'node:assert/strict';
import { expandPhotoFrames } from '../src/engine/mp4-renderer.ts';
import type { TemplateDefinition } from '../src/types.ts';

// Unit coverage for the dynamic photo-count expansion added 2026-04-17.
// See social-posting-v2/docs/PLAN_2026-04-17_SOUNDTRACKS_AND_DYNAMIC_TEMPLATES.md.

function minimalTemplate(overrides: Partial<TemplateDefinition> = {}): TemplateDefinition {
  return {
    id: 't',
    name: 't',
    reference: 't',
    outputFormat: 'mp4',
    width: 1080,
    height: 1920,
    imageCount: 5,
    categoryKeys: ['reel'],
    fps: 30,
    frames: [],
    ...overrides,
  };
}

test('expandPhotoFrames is a no-op when the template has no photoFrame', () => {
  const tpl = minimalTemplate({
    frames: [
      { durationMs: 1000, background: { type: 'solid', color: '#111' }, layers: [] },
      { durationMs: 1000, background: { type: 'solid', color: '#222' }, layers: [] },
    ],
  });

  const out = expandPhotoFrames(tpl, 7);
  assert.equal(out.length, 2);
  assert.deepEqual(out, tpl.frames);
});

test('expandPhotoFrames replaces photoSlot frames with N copies of photoFrame', () => {
  const tpl = minimalTemplate({
    frames: [
      { durationMs: 800, background: { type: 'solid', color: '#000' }, layers: [] },        // intro
      { kind: 'photoSlot', durationMs: 0, background: { type: 'solid', color: '#000' }, layers: [] }, // slot
      { durationMs: 1500, background: { type: 'solid', color: '#fff' }, layers: [] },       // outro
    ],
    photoFrame: {
      durationMs: 1200,
      background: { type: 'image', source: 'user_image', index: 0 },
      layers: [
        { type: 'image', source: 'user_image', index: 0, fit: 'cover', x: 0, y: 0, width: 1080, height: 1920 },
      ],
    },
  });

  const out = expandPhotoFrames(tpl, 5);
  // 1 intro + 5 expanded photo frames + 1 outro = 7
  assert.equal(out.length, 7);

  // Intro and outro survive intact at start and end.
  assert.deepEqual(out[0], tpl.frames[0]);
  assert.deepEqual(out[6], tpl.frames[2]);

  // Each expanded frame has the correct image index.
  for (let i = 0; i < 5; i++) {
    const frame = out[i + 1];
    assert.equal(frame.kind, undefined, 'expanded frames must not carry the photoSlot marker');
    assert.equal((frame.background as { index: number }).index, i);
    const imageLayer = frame.layers.find((l): l is { type: 'image'; index: number } & Record<string, unknown> =>
      (l as { type: string }).type === 'image');
    assert.ok(imageLayer, 'expanded frame must have an image layer');
    assert.equal(imageLayer.index, i);
  }
});

test('expandPhotoFrames preserves photoFrame duration per expanded copy', () => {
  const tpl = minimalTemplate({
    frames: [{ kind: 'photoSlot', background: { type: 'solid', color: '#000' }, layers: [] }],
    photoFrame: {
      durationMs: 1234,
      background: { type: 'solid', color: '#abc' },
      layers: [],
    },
  });
  const out = expandPhotoFrames(tpl, 3);
  assert.equal(out.length, 3);
  for (const f of out) {
    assert.equal(f.durationMs, 1234);
  }
});

test('expandPhotoFrames supports zero-photo edge case by collapsing the slot', () => {
  const tpl = minimalTemplate({
    frames: [
      { durationMs: 800, background: { type: 'solid', color: '#000' }, layers: [] },
      { kind: 'photoSlot', background: { type: 'solid', color: '#000' }, layers: [] },
      { durationMs: 1500, background: { type: 'solid', color: '#fff' }, layers: [] },
    ],
    photoFrame: {
      durationMs: 1200,
      background: { type: 'image', source: 'user_image', index: 0 },
      layers: [],
    },
  });

  const out = expandPhotoFrames(tpl, 0);
  // photoSlot evaporates, intro + outro remain.
  assert.equal(out.length, 2);
  assert.equal((out[0].background as { color: string }).color, '#000');
  assert.equal((out[1].background as { color: string }).color, '#fff');
});

test('expandPhotoFrames clones deeply — mutating a returned frame does not mutate the template', () => {
  const photoFrame = {
    durationMs: 1000,
    background: { type: 'image' as const, source: 'user_image' as const, index: 0 },
    layers: [
      { type: 'text' as const, content: 'hi', x: 0, y: 0, width: 100, height: 100,
        fontFamily: 'Inter', fontSize: 24, fontWeight: 'bold' as const, color: '#fff', align: 'center' as const },
    ],
  };
  const tpl = minimalTemplate({
    frames: [{ kind: 'photoSlot', background: { type: 'solid', color: '#000' }, layers: [] }],
    photoFrame,
  });
  const out = expandPhotoFrames(tpl, 2);
  // Mutate the first expanded frame.
  (out[0].background as { index: number }).index = 99;
  // Template's photoFrame background must be untouched.
  assert.equal((tpl.photoFrame!.background as { index: number }).index, 0);
});
