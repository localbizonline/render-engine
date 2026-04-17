import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import type { Image } from 'canvas';
import type { TemplateDefinition, FrameDefinition, LayerDefinition, RenderVariables } from '../types.js';
import { renderPng } from './png-renderer.js';

export interface Mp4RenderContext {
  template: TemplateDefinition;
  variables: RenderVariables;
  userImages: Image[];
  logoImage: Image | null;
  squareCtaImage?: Image | null;
  landscapeCtaImage?: Image | null;
  assetImages?: Record<string, Image | null>;
  /**
   * Optional URL to a soundtrack (mp3 / m4a). If provided, the rendered
   * video is muxed with the audio in a second ffmpeg pass. On fetch or
   * mux failure the silent render is returned with a logged warning —
   * a silent reel is safer than none.
   */
  soundtrackUrl?: string | null;
}

/**
 * Expand `photoFrame` once per uploaded user photo, replacing any frame
 * whose `kind === 'photoSlot'`. The expansion deep-clones the photoFrame
 * and rewrites any `background.type === 'image'` and
 * `layer.type === 'image'` entries to reference the Nth user photo.
 *
 * When the template has no photoFrame, frames are returned unchanged —
 * existing static-count templates are not affected.
 *
 * See social-posting-v2/docs/PLAN_2026-04-17_SOUNDTRACKS_AND_DYNAMIC_TEMPLATES.md.
 */
export function expandPhotoFrames(
  template: TemplateDefinition,
  userImageCount: number,
): FrameDefinition[] {
  if (!template.photoFrame) return template.frames;

  const clonePhotoFrame = (index: number): FrameDefinition => {
    // JSON round-trip is cheap for the frame shape we have here (small,
    // no functions/Dates). Avoids missing fields on manual clones.
    const clone = JSON.parse(JSON.stringify(template.photoFrame)) as FrameDefinition;
    delete clone.kind;
    if (clone.background && clone.background.type === 'image') {
      clone.background.index = index;
    }
    clone.layers = clone.layers.map((layer: LayerDefinition) => {
      if (layer.type === 'image' && layer.source === 'user_image') {
        return { ...layer, index };
      }
      return layer;
    });
    return clone;
  };

  const out: FrameDefinition[] = [];
  for (const frame of template.frames) {
    if (frame.kind === 'photoSlot') {
      for (let i = 0; i < userImageCount; i++) {
        out.push(clonePhotoFrame(i));
      }
    } else {
      out.push(frame);
    }
  }
  return out;
}

/**
 * Render an MP4 slideshow from a multi-frame template.
 *
 * Flow:
 * 1. Expand photoFrame slots based on uploaded photo count (no-op for
 *    static-count templates).
 * 2. Render each resolved frame as a PNG using the existing png-renderer.
 * 3. Use FFmpeg xfade filter to create crossfade transitions.
 * 4. Return the MP4 buffer.
 */
export async function renderMp4(ctx: Mp4RenderContext): Promise<Buffer> {
  const { template, variables, userImages, logoImage, squareCtaImage, landscapeCtaImage, assetImages } = ctx;

  // Expand dynamic photo frames once, then treat the resolved frames as
  // the canonical input for the rest of the pipeline.
  const resolvedFrames = expandPhotoFrames(template, userImages.length);
  const frameCount = resolvedFrames.length;

  if (frameCount < 2) {
    throw new Error('MP4 templates require at least 2 frames');
  }

  // renderPng indexes into template.frames by frameIndex, so to render the
  // expanded frame set we pass a derived template whose `frames` is the
  // resolved array. photoFrame is removed on the derived object to make
  // the "already expanded" intent explicit.
  const resolvedTemplate: TemplateDefinition = { ...template, frames: resolvedFrames };
  delete (resolvedTemplate as { photoFrame?: FrameDefinition }).photoFrame;

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'render-mp4-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    // 1. Render each resolved frame as PNG
    const framePaths: string[] = [];
    for (let i = 0; i < frameCount; i++) {
      const pngBuffer = renderPng({
        template: resolvedTemplate,
        variables,
        userImages,
        logoImage,
        squareCtaImage,
        landscapeCtaImage,
        assetImages,
        frameIndex: i,
      });
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, '0')}.png`);
      writeFileSync(framePath, pngBuffer);
      framePaths.push(framePath);
    }

    // 2. Build FFmpeg command with xfade transitions
    const transitionType = template.transition?.type || 'fade';
    const transitionDurationSec = (template.transition?.durationMs || 800) / 1000;
    const fps = template.fps || 30;

    // Each frame duration in seconds, using the resolved set so
    // photoFrame's own durationMs applies once per expanded photo.
    const frameDurationSec = resolvedFrames.map(
      (f) => (f.durationMs || 3000) / 1000
    );

    await buildMp4WithXfade({
      framePaths,
      outputPath,
      frameDurations: frameDurationSec,
      transitionType: mapTransitionType(transitionType),
      transitionDuration: transitionDurationSec,
      fps,
      width: template.width,
      height: template.height,
    });

    // 3. Optional: mux a soundtrack on top of the silent video. Failure
    //    here is non-fatal — we fall back to the silent render rather
    //    than failing the whole job. See PLAN_2026-04-17 doc.
    const { readFileSync } = await import('fs');
    if (ctx.soundtrackUrl) {
      try {
        const audioPath = await downloadSoundtrack(ctx.soundtrackUrl, tmpDir);
        const muxedPath = path.join(tmpDir, 'with-audio.mp4');
        await muxAudio({ videoPath: outputPath, audioPath, outputPath: muxedPath });
        return readFileSync(muxedPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[mp4-renderer] soundtrack mux failed, returning silent render: ${msg}`);
      }
    }

    return readFileSync(outputPath);
  } finally {
    // Cleanup temp dir
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function downloadSoundtrack(url: string, tmpDir: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'RenderEngine/1.0' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch soundtrack ${url}: ${res.status}`);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const ext = contentType.includes('mpeg') || url.endsWith('.mp3')
    ? 'mp3'
    : contentType.includes('mp4') || url.endsWith('.m4a')
      ? 'm4a'
      : 'audio';
  const buffer = Buffer.from(await res.arrayBuffer());
  const audioPath = path.join(tmpDir, `soundtrack.${ext}`);
  writeFileSync(audioPath, buffer);
  return audioPath;
}

function muxAudio(opts: { videoPath: string; audioPath: string; outputPath: string }): Promise<void> {
  const { videoPath, audioPath, outputPath } = opts;
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      // `-c:v copy` avoids re-encoding video for the audio mux, so this
      // step adds a second or two, not a full render. `-shortest` trims
      // the audio to the video length. `-map 0:v:0 -map 1:a:0` pins the
      // streams explicitly so a stray metadata stream cannot reorder.
      .outputOptions(['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-map', '0:v:0', '-map', '1:a:0'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`FFmpeg mux error: ${err.message}`)))
      .run();
  });
}

function mapTransitionType(type: string): string {
  // Map our transition types to FFmpeg xfade transition names
  const map: Record<string, string> = {
    fade: 'fade',
    crossfade: 'fade',
    slide_left: 'slideleft',
    slide_right: 'slideright',
    zoom: 'smoothup',
  };
  return map[type] || 'fade';
}

interface XfadeOptions {
  framePaths: string[];
  outputPath: string;
  frameDurations: number[];
  transitionType: string;
  transitionDuration: number;
  fps: number;
  width: number;
  height: number;
}

function buildMp4WithXfade(opts: XfadeOptions): Promise<void> {
  const {
    framePaths,
    outputPath,
    frameDurations,
    transitionType,
    transitionDuration,
    fps,
    width,
    height,
  } = opts;

  return new Promise((resolve, reject) => {
    // For N frames, we need N-1 xfade filters chained together
    // Each input is a still image looped for its duration
    const cmd = ffmpeg();

    // Add each frame as an input with its duration
    for (let i = 0; i < framePaths.length; i++) {
      cmd.input(framePaths[i])
        .inputOptions([
          '-loop', '1',
          '-t', String(frameDurations[i]),
          '-framerate', String(fps),
        ]);
    }

    // Build the xfade filter chain
    const filterParts: string[] = [];
    const n = framePaths.length;

    if (n === 2) {
      // Simple case: single xfade
      const offset = frameDurations[0] - transitionDuration;
      filterParts.push(
        `[0:v][1:v]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset},format=yuv420p[v]`
      );
    } else {
      // Chain: [0][1] -> [v1], [v1][2] -> [v2], etc.
      let cumulativeOffset = 0;

      for (let i = 0; i < n - 1; i++) {
        const inputA = i === 0 ? '[0:v]' : `[v${i}]`;
        const inputB = `[${i + 1}:v]`;
        const outputLabel = i === n - 2 ? '[v]' : `[v${i + 1}]`;

        if (i === 0) {
          cumulativeOffset = frameDurations[0] - transitionDuration;
        } else {
          cumulativeOffset += frameDurations[i] - transitionDuration;
        }

        const formatSuffix = i === n - 2 ? ',format=yuv420p' : '';
        filterParts.push(
          `${inputA}${inputB}xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${cumulativeOffset}${formatSuffix}${outputLabel}`
        );
      }
    }

    cmd
      .complexFilter(filterParts.join(';'))
      .outputOptions([
        '-map', '[v]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', String(fps),
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}
