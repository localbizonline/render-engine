import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import type { Image } from 'canvas';
import type { TemplateDefinition, RenderVariables } from '../types.js';
import { renderPng } from './png-renderer.js';

export interface Mp4RenderContext {
  template: TemplateDefinition;
  variables: RenderVariables;
  userImages: Image[];
  logoImage: Image | null;
  squareCtaImage?: Image | null;
  landscapeCtaImage?: Image | null;
}

/**
 * Render an MP4 slideshow from a multi-frame template.
 *
 * Flow:
 * 1. Render each frame as a PNG using the existing png-renderer
 * 2. Use FFmpeg xfade filter to create crossfade transitions
 * 3. Return the MP4 buffer
 */
export async function renderMp4(ctx: Mp4RenderContext): Promise<Buffer> {
  const { template, variables, userImages, logoImage, squareCtaImage, landscapeCtaImage } = ctx;
  const frameCount = template.frames.length;

  if (frameCount < 2) {
    throw new Error('MP4 templates require at least 2 frames');
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'render-mp4-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    // 1. Render each frame as PNG
    const framePaths: string[] = [];
    for (let i = 0; i < frameCount; i++) {
      const pngBuffer = renderPng({
        template,
        variables,
        userImages,
        logoImage,
        squareCtaImage,
        landscapeCtaImage,
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

    // Each frame duration in seconds
    const frameDurationSec = template.frames.map(
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

    // 3. Read output and return as buffer
    const { readFileSync } = await import('fs');
    return readFileSync(outputPath);
  } finally {
    // Cleanup temp dir
    rmSync(tmpDir, { recursive: true, force: true });
  }
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
