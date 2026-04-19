import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const LOCAL_OUTPUT_DIR = '/tmp/render-output';

let s3Client: S3Client | null = null;

function isR2Configured(): boolean {
  return !!(config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.accountId);
}

function getAppBaseUrl(): string {
  return process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${config.port}`;
}

function buildArtifactProxyUrl(key: string): string {
  return `${getAppBaseUrl()}/artifacts?key=${encodeURIComponent(key)}`;
}

function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * Upload a rendered file to Cloudflare R2, or fall back to local file serving.
 * Returns the public URL of the uploaded file.
 */
export async function uploadRender(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  if (isR2Configured()) {
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return buildArtifactProxyUrl(key);
  }

  // Fallback: save locally and serve via Express
  const filePath = path.join(LOCAL_OUTPUT_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`[storage] R2 not configured, saved locally: ${filePath}`);

  // Build public URL from the app's own domain
  return `${getAppBaseUrl()}/output/${key}`;
}

/**
 * Upload a buffer to a caller-specified R2 key. Used by the production
 * `POST /api/render` path where social-posting-v2 owns the storage convention
 * and render-engine just writes to the key it is told to.
 *
 * When R2 is not configured, falls back to writing under LOCAL_OUTPUT_DIR so
 * local dev / curl smoke tests still work.
 */
export async function putAt(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  if (isR2Configured()) {
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return;
  }

  const filePath = path.join(LOCAL_OUTPUT_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`[storage] R2 not configured, wrote locally: ${filePath}`);
}

export async function getAt(
  key: string,
): Promise<{ body: Buffer; contentType: string | null }> {
  if (isR2Configured()) {
    const client = getClient();
    const result = await client.send(new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    }));
    const bytes = await result.Body?.transformToByteArray();
    return {
      body: Buffer.from(bytes || []),
      contentType: result.ContentType || null,
    };
  }

  const filePath = path.join(LOCAL_OUTPUT_DIR, key);
  return {
    body: fs.readFileSync(filePath),
    contentType: null,
  };
}

export async function listKeys(prefix: string): Promise<string[]> {
  if (!isR2Configured()) {
    const baseDir = path.join(LOCAL_OUTPUT_DIR, prefix);
    if (!fs.existsSync(baseDir)) return [];

    const keys: string[] = [];
    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(nextPath);
          continue;
        }
        if (entry.isFile()) {
          keys.push(path.relative(LOCAL_OUTPUT_DIR, nextPath).split(path.sep).join('/'));
        }
      }
    }

    walk(baseDir);
    return keys;
  }

  const client = getClient();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: config.r2.bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const item of result.Contents || []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export function normalizeArtifactUrl(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (/\.r2\.dev$/i.test(parsed.hostname)) {
      const key = parsed.pathname.replace(/^\/+/, '');
      if (key) return buildArtifactProxyUrl(key);
    }
    return value;
  } catch {
    return value;
  }
}

export { LOCAL_OUTPUT_DIR, buildArtifactProxyUrl };
