import fs from 'fs';
import path from 'path';
import {
  buildArtifactProxyUrl,
  getAt,
  listKeys,
  LOCAL_OUTPUT_DIR,
  normalizeArtifactUrl,
  putAt,
  uploadRender,
} from './r2-storage.js';
import { resolveProviderTemplate } from '../providers/index.js';
import type {
  ProviderLabPostSnapshot,
  ProviderLabProviderId,
  ProviderPreviewResult,
  ProviderRunManifest,
} from '../providers/types.js';

const EXPERIMENTS_PREFIX = 'experiments';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '') || 'provider-lab';
}

function buildRunId(provider: ProviderLabProviderId, postId: string): string {
  const base = `${provider}-${postId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return slugify(base);
}

function normalizeTemplateId(value: unknown): string | null {
  const templateId = String(value || '').trim();
  return templateId || null;
}

function getExperimentsDir() {
  const dir = path.join(LOCAL_OUTPUT_DIR, EXPERIMENTS_PREFIX);
  ensureDir(dir);
  return dir;
}

function getRelativeOutputUrl(filePath: string): string {
  return `/output/${path.relative(LOCAL_OUTPUT_DIR, filePath).split(path.sep).join('/')}`;
}

function writeLocalArtifact(filePath: string, buffer: Buffer | string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

export async function renderProviderPreview(args: {
  provider: ProviderLabProviderId;
  snapshot: ProviderLabPostSnapshot;
  templateId?: string | null;
}): Promise<ProviderPreviewResult> {
  const { provider, template } = resolveProviderTemplate(args.provider, normalizeTemplateId(args.templateId));
  const artifacts = await provider.render({
    snapshot: args.snapshot,
    mode: 'preview',
    templateId: template.id,
  });

  const safePostId = slugify(args.snapshot.post.id || 'post');
  const previewId = buildRunId(args.provider, `${safePostId}-${artifacts.templateId}`);
  const videoUrl = await uploadRender(
    artifacts.mp4Buffer,
    `${EXPERIMENTS_PREFIX}/${args.provider}/previews/${previewId}.mp4`,
    'video/mp4',
  );
  const posterUrl = await uploadRender(
    artifacts.posterBuffer,
    `${EXPERIMENTS_PREFIX}/${args.provider}/previews/${previewId}.png`,
    'image/png',
  );

  return {
    provider: args.provider,
    providerLabel: provider.label,
    templateId: artifacts.templateId,
    templateLabel: template.label,
    previewUrl: videoUrl,
    posterUrl,
    durationMs: artifacts.durationMs,
    width: artifacts.width,
    height: artifacts.height,
  };
}

export async function renderProviderFinal(args: {
  provider: ProviderLabProviderId;
  snapshot: ProviderLabPostSnapshot;
  templateId?: string | null;
}): Promise<ProviderRunManifest> {
  const { provider, template } = resolveProviderTemplate(args.provider, normalizeTemplateId(args.templateId));
  const artifacts = await provider.render({
    snapshot: args.snapshot,
    mode: 'final',
    templateId: template.id,
  });

  const safeProvider = slugify(args.provider);
  const safePostId = slugify(args.snapshot.post.id || 'post');
  const safeTemplateId = slugify(artifacts.templateId || template.id);
  const runId = buildRunId(args.provider, `${safePostId}-${safeTemplateId}`);
  const runDir = path.join(getExperimentsDir(), safeProvider, runId);
  ensureDir(runDir);

  const localVideoPath = path.join(runDir, 'render.mp4');
  const localPosterPath = path.join(runDir, 'poster.png');
  const localManifestPath = path.join(runDir, 'manifest.json');
  writeLocalArtifact(localVideoPath, artifacts.mp4Buffer);
  writeLocalArtifact(localPosterPath, artifacts.posterBuffer);

  const remoteVideoUrl = await uploadRender(
    artifacts.mp4Buffer,
    `${EXPERIMENTS_PREFIX}/${safeProvider}/${runId}/render.mp4`,
    'video/mp4',
  );
  const remotePosterUrl = await uploadRender(
    artifacts.posterBuffer,
    `${EXPERIMENTS_PREFIX}/${safeProvider}/${runId}/poster.png`,
    'image/png',
  );
  const remoteManifestKey = `${EXPERIMENTS_PREFIX}/${safeProvider}/${runId}/manifest.json`;

  const manifest: ProviderRunManifest = {
    runId,
    provider: args.provider,
    providerLabel: provider.label,
    templateId: artifacts.templateId,
    templateLabel: template.label,
    postId: args.snapshot.post.id,
    createdAt: new Date().toISOString(),
    videoUrl: remoteVideoUrl || getRelativeOutputUrl(localVideoPath),
    posterUrl: remotePosterUrl || getRelativeOutputUrl(localPosterPath),
    manifestUrl: buildArtifactProxyUrl(remoteManifestKey),
    localVideoPath,
    localPosterPath,
    localManifestPath,
    durationMs: artifacts.durationMs,
    width: artifacts.width,
    height: artifacts.height,
    snapshot: args.snapshot,
  };

  writeLocalArtifact(localManifestPath, JSON.stringify(manifest, null, 2));
  await putAt(
    remoteManifestKey,
    Buffer.from(JSON.stringify(manifest, null, 2)),
    'application/json',
  );
  return manifest;
}

export async function listProviderRuns(limit = 12): Promise<ProviderRunManifest[]> {
  const manifests: ProviderRunManifest[] = [];

  const keys = await listKeys(EXPERIMENTS_PREFIX);
  const manifestKeys = keys.filter((key) => key.endsWith('/manifest.json'));

  if (manifestKeys.length) {
    for (const key of manifestKeys) {
      try {
        const artifact = await getAt(key);
        const parsed = JSON.parse(artifact.body.toString('utf8')) as ProviderRunManifest;
        manifests.push({
          ...parsed,
          videoUrl: normalizeArtifactUrl(parsed.videoUrl),
          posterUrl: normalizeArtifactUrl(parsed.posterUrl),
          manifestUrl: buildArtifactProxyUrl(key),
        });
      } catch {}
    }
  } else {
    const root = getExperimentsDir();
    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(nextPath);
          continue;
        }
        if (entry.isFile() && entry.name === 'manifest.json') {
          try {
            const parsed = JSON.parse(fs.readFileSync(nextPath, 'utf8')) as ProviderRunManifest;
            manifests.push({
              ...parsed,
              videoUrl: normalizeArtifactUrl(parsed.videoUrl),
              posterUrl: normalizeArtifactUrl(parsed.posterUrl),
              manifestUrl: normalizeArtifactUrl(parsed.manifestUrl),
            });
          } catch {}
        }
      }
    }
  }
  return manifests
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
