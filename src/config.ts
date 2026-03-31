export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.RENDER_API_KEY || '',

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'render-engine-output',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
} as const;
