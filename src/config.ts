export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.RENDER_API_KEY || '',
  designer: {
    defaultV2BaseUrl: (process.env.DESIGNER_DEFAULT_V2_BASE_URL || process.env.V2_BASE_URL || 'https://admin.localpros.co.za').replace(/\/+$/, ''),
    defaultV2AdminSecret: process.env.DESIGNER_DEFAULT_V2_ADMIN_SECRET || process.env.V2_ADMIN_SECRET || '',
  },

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

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    videoModel: process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash',
  },
} as const;
