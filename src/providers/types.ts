export type ProviderLabProviderId = 'hyperframes' | 'remotion';

export interface ProviderLabTemplateDefinition {
  id: string;
  label: string;
  description: string;
  status?: 'ready' | 'coming-soon';
}

export interface ProviderLabPostSnapshot {
  post: {
    id: string;
    org_id: string | null;
    category_id: string | null;
    category_name?: string | null;
    status: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  content: {
    title: string | null;
    subtitle: string | null;
    body: string | null;
  };
  brand: {
    company_name: string | null;
    primary_colour: string | null;
    secondary_colour: string | null;
    logo_url: string | null;
  };
  media: {
    image_urls: string[];
    poster_url: string | null;
    video_url: string | null;
  };
  platform_context: {
    platforms: string[];
    variant: string | null;
  };
}

export interface ProviderRenderArtifacts {
  templateId: string;
  mp4Buffer: Buffer;
  posterBuffer: Buffer;
  durationMs: number;
  width: number;
  height: number;
  verificationSummary?: string;
  timings?: {
    cliMs: number;
    verifyMs: number;
    posterMs: number;
    totalMs: number;
    workerCount: number | null;
    runtime: 'cloudflare' | 'railway' | 'local';
  };
}

export interface ProviderPreviewResult {
  provider: ProviderLabProviderId;
  providerLabel: string;
  templateId: string;
  templateLabel: string;
  previewUrl: string;
  posterUrl: string;
  durationMs: number;
  width: number;
  height: number;
}

export interface ProviderRunManifest {
  runId: string;
  provider: ProviderLabProviderId;
  providerLabel: string;
  templateId: string;
  templateLabel: string;
  postId: string;
  createdAt: string;
  videoUrl: string;
  posterUrl: string;
  manifestUrl: string;
  localVideoPath: string;
  localPosterPath: string;
  localManifestPath: string;
  durationMs: number;
  width: number;
  height: number;
  snapshot: ProviderLabPostSnapshot;
}

export interface ProviderExperimentProvider {
  id: ProviderLabProviderId;
  label: string;
  templates: ProviderLabTemplateDefinition[];
  render(input: {
    snapshot: ProviderLabPostSnapshot;
    mode: 'preview' | 'final';
    templateId: string;
  }): Promise<ProviderRenderArtifacts>;
}
