import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

let s3Client: S3Client | null = null;

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
 * Upload a rendered file to Cloudflare R2.
 * Returns the public URL of the uploaded file.
 */
export async function uploadRender(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
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

  // Return public URL
  const publicUrl = config.r2.publicUrl.replace(/\/$/, '');
  return `${publicUrl}/${key}`;
}
