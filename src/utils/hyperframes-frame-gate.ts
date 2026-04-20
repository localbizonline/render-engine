import { spawn } from 'node:child_process';

export interface HyperframesFrameGateConfig {
  sampleWidth: number;
  sampleHeight: number;
  tileColumns: number;
  tileRows: number;
  blackMeanThreshold: number;
  darkMeanThreshold: number;
  oneFrameDropoutPixelThreshold: number;
  oneFrameDropoutPixelRecoverThreshold: number;
  oneFrameDropoutTileThreshold: number;
  oneFrameDropoutTileRecoverThreshold: number;
}

export interface HyperframesFrameGateSample {
  frameIndex: number;
  timeSeconds: number;
  mean: number;
  pixelData: Uint8Array;
  tileMeans: number[];
}

export interface HyperframesFrameGateAnomaly {
  frameIndex: number;
  timeSeconds: number;
  mean: number;
  diffFromPrev?: number;
  diffToNext?: number;
  recoverDiff?: number;
  tileFlash?: number;
  tileRecover?: number;
}

export interface HyperframesFrameGateReport {
  fps: number;
  frameCount: number;
  durationSeconds: number;
  blackFrames: HyperframesFrameGateAnomaly[];
  darkFrames: HyperframesFrameGateAnomaly[];
  oneFrameDropouts: HyperframesFrameGateAnomaly[];
  failed: boolean;
  summary: string;
}

const DEFAULT_CONFIG: HyperframesFrameGateConfig = {
  sampleWidth: 120,
  sampleHeight: 214,
  tileColumns: 12,
  tileRows: 16,
  blackMeanThreshold: 0.02,
  darkMeanThreshold: 0.03,
  oneFrameDropoutPixelThreshold: 0.02,
  oneFrameDropoutPixelRecoverThreshold: 0.008,
  oneFrameDropoutTileThreshold: 0.06,
  oneFrameDropoutTileRecoverThreshold: 0.018,
};

function parseFraction(value: string | null | undefined): number | null {
  if (!value) return null;
  if (!value.includes('/')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const [numerator, denominator] = value.split('/');
  const a = Number(numerator);
  const b = Number(denominator);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const result = a / b;
  return Number.isFinite(result) && result > 0 ? result : null;
}

function buildSummary(report: HyperframesFrameGateReport): string {
  const parts = [
    `frames=${report.frameCount}`,
    `black=${report.blackFrames.length}`,
    `dark=${report.darkFrames.length}`,
    `dropouts=${report.oneFrameDropouts.length}`,
  ];
  if (report.blackFrames.length > 0) {
    parts.push(`black_at=${report.blackFrames.map((item) => item.timeSeconds.toFixed(4)).join(',')}`);
  }
  if (report.oneFrameDropouts.length > 0) {
    parts.push(`dropouts_at=${report.oneFrameDropouts.map((item) => item.timeSeconds.toFixed(4)).join(',')}`);
  }
  return parts.join(' ');
}

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(`Frame gate sample size mismatch: ${a.length} vs ${b.length}`);
  }
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs(a[i] - b[i]);
  }
  return total / (a.length * 255);
}

function maxTileDiff(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Frame gate tile size mismatch: ${a.length} vs ${b.length}`);
  }
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = Math.abs(a[i] - b[i]);
    if (diff > max) max = diff;
  }
  return max;
}

function computeTileMeans(
  data: Uint8Array,
  width: number,
  height: number,
  tileColumns: number,
  tileRows: number,
): number[] {
  const tileMeans: number[] = [];
  for (let row = 0; row < tileRows; row += 1) {
    const yStart = Math.floor((row * height) / tileRows);
    const yEnd = Math.floor(((row + 1) * height) / tileRows);
    for (let col = 0; col < tileColumns; col += 1) {
      const xStart = Math.floor((col * width) / tileColumns);
      const xEnd = Math.floor(((col + 1) * width) / tileColumns);
      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        const rowOffset = y * width;
        for (let x = xStart; x < xEnd; x += 1) {
          sum += data[rowOffset + x];
          count += 1;
        }
      }
      tileMeans.push(count > 0 ? sum / (count * 255) : 0);
    }
  }
  return tileMeans;
}

async function runProcess(command: string, args: string[]): Promise<string> {
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
        resolve(output);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit ${code}: ${output.trim()}`));
    });
  });
}

async function probeVideo(videoPath: string): Promise<{ fps: number; durationSeconds: number; frameCount: number | null }> {
  const output = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=avg_frame_rate,nb_frames,duration',
    '-of',
    'json',
    videoPath,
  ]);
  const parsed = JSON.parse(output) as {
    streams?: Array<{ avg_frame_rate?: string; nb_frames?: string; duration?: string }>;
  };
  const stream = parsed.streams?.[0] || {};
  const fps = parseFraction(stream.avg_frame_rate) || 30;
  const durationSeconds = Number(stream.duration) || 0;
  const frameCount = stream.nb_frames ? Number(stream.nb_frames) : null;
  return {
    fps,
    durationSeconds,
    frameCount: Number.isFinite(frameCount) ? frameCount : null,
  };
}

function buildSample(
  frameData: Uint8Array,
  frameIndex: number,
  fps: number,
  config: HyperframesFrameGateConfig,
): HyperframesFrameGateSample {
  const pixelData = frameData;
  let sum = 0;
  for (let i = 0; i < pixelData.length; i += 1) {
    sum += pixelData[i];
  }
  return {
    frameIndex,
    timeSeconds: frameIndex / fps,
    mean: sum / (pixelData.length * 255),
    pixelData,
    tileMeans: computeTileMeans(
      pixelData,
      config.sampleWidth,
      config.sampleHeight,
      config.tileColumns,
      config.tileRows,
    ),
  };
}

async function extractSamples(
  videoPath: string,
  fps: number,
  config: HyperframesFrameGateConfig,
): Promise<HyperframesFrameGateSample[]> {
  const frameSize = config.sampleWidth * config.sampleHeight;
  const samples: HyperframesFrameGateSample[] = [];

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-i',
      videoPath,
      '-vf',
      `scale=${config.sampleWidth}:${config.sampleHeight}:flags=bilinear,format=gray`,
      '-vsync',
      '0',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      'pipe:1',
    ];
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let pending = Buffer.alloc(0);

    child.stdout.on('data', (chunk: Uint8Array) => {
      const nextChunk = Buffer.from(chunk);
      pending = pending.length > 0 ? Buffer.concat([pending, nextChunk]) : nextChunk;
      while (pending.length >= frameSize) {
        const frame = pending.subarray(0, frameSize);
        pending = pending.subarray(frameSize);
        samples.push(buildSample(Uint8Array.from(frame), samples.length, fps, config));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        if (pending.length !== 0) {
          reject(new Error(`ffmpeg rawvideo stream ended with ${pending.length} trailing bytes`));
          return;
        }
        resolve();
        return;
      }
      reject(new Error(`ffmpeg rawvideo extraction failed with exit ${code}: ${stderr.trim()}`));
    });
  });

  return samples;
}

export function analyzeHyperframesSamples(
  samples: HyperframesFrameGateSample[],
  fps: number,
  durationSeconds: number,
  overrides?: Partial<HyperframesFrameGateConfig>,
): HyperframesFrameGateReport {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const blackFrames: HyperframesFrameGateAnomaly[] = [];
  const darkFrames: HyperframesFrameGateAnomaly[] = [];
  const oneFrameDropouts: HyperframesFrameGateAnomaly[] = [];

  for (const sample of samples) {
    if (sample.mean < config.blackMeanThreshold) {
      blackFrames.push({
        frameIndex: sample.frameIndex,
        timeSeconds: sample.timeSeconds,
        mean: sample.mean,
      });
    }
    if (sample.mean < config.darkMeanThreshold) {
      darkFrames.push({
        frameIndex: sample.frameIndex,
        timeSeconds: sample.timeSeconds,
        mean: sample.mean,
      });
    }
  }

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    const diffFromPrev = meanAbsDiff(prev.pixelData, curr.pixelData);
    const diffToNext = meanAbsDiff(curr.pixelData, next.pixelData);
    const recoverDiff = meanAbsDiff(prev.pixelData, next.pixelData);
    const tileFlash = Math.min(
      maxTileDiff(prev.tileMeans, curr.tileMeans),
      maxTileDiff(curr.tileMeans, next.tileMeans),
    );
    const tileRecover = maxTileDiff(prev.tileMeans, next.tileMeans);

    const pixelDropout = Math.min(diffFromPrev, diffToNext) >= config.oneFrameDropoutPixelThreshold
      && recoverDiff <= config.oneFrameDropoutPixelRecoverThreshold;
    const tileDropout = tileFlash >= config.oneFrameDropoutTileThreshold
      && tileRecover <= config.oneFrameDropoutTileRecoverThreshold
      && recoverDiff <= Math.max(
        config.oneFrameDropoutPixelRecoverThreshold * 2,
        config.oneFrameDropoutTileRecoverThreshold,
      );
    const isDropout = pixelDropout || tileDropout;

    if (!isDropout) continue;

    oneFrameDropouts.push({
      frameIndex: curr.frameIndex,
      timeSeconds: curr.timeSeconds,
      mean: curr.mean,
      diffFromPrev,
      diffToNext,
      recoverDiff,
      tileFlash,
      tileRecover,
    });
  }

  const report: HyperframesFrameGateReport = {
    fps,
    frameCount: samples.length,
    durationSeconds,
    blackFrames,
    darkFrames,
    oneFrameDropouts,
    failed: blackFrames.length > 0 || oneFrameDropouts.length > 0,
    summary: '',
  };
  report.summary = buildSummary(report);
  return report;
}

export async function scanVideoForHyperframesFrameIssues(
  videoPath: string,
  overrides?: Partial<HyperframesFrameGateConfig>,
): Promise<HyperframesFrameGateReport> {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const { fps, durationSeconds, frameCount: probedFrameCount } = await probeVideo(videoPath);
  const samples = await extractSamples(videoPath, fps, config);
  const report = analyzeHyperframesSamples(
    samples,
    fps,
    durationSeconds || samples.length / fps,
    config,
  );
  report.frameCount = probedFrameCount && probedFrameCount > 0 ? probedFrameCount : samples.length;
  report.summary = buildSummary(report);
  return report;
}
