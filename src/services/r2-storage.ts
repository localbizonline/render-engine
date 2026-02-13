import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const LOCAL_OUTPUT_DIR = '/tmp/render-output';

let s3Client: S3Client | null = null;

function isR2Configured(): boolean {
  return !!(config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.accountId);
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
    const publicUrl = config.r2.publicUrl.replace(/\/$/, '');
    return `${publicUrl}/${key}`;
  }

  // Fallback: save locally and serve via Express
  const filePath = path.join(LOCAL_OUTPUT_DIR, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`[storage] R2 not configured, saved locally: ${filePath}`);

  // Build public URL from the app's own domain
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${config.port}`;
  return `${baseUrl}/output/${key}`;
}

export { LOCAL_OUTPUT_DIR };
