import { hyperframesProvider } from './hyperframes.js';
import type {
  ProviderExperimentProvider,
  ProviderLabProviderId,
  ProviderLabTemplateDefinition,
} from './types.js';

const remotionStub: ProviderExperimentProvider = {
  id: 'remotion',
  label: 'Remotion',
  templates: [],
  async render() {
    throw new Error('Remotion is scaffolded but not implemented yet in Provider Lab.');
  },
};

const providers = new Map<ProviderLabProviderId, ProviderExperimentProvider>([
  [hyperframesProvider.id, hyperframesProvider],
  [remotionStub.id, remotionStub],
]);

export function getProvider(providerId: ProviderLabProviderId): ProviderExperimentProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider;
}

export function resolveProviderTemplate(
  providerId: ProviderLabProviderId,
  requestedTemplateId?: string | null,
): { provider: ProviderExperimentProvider; template: ProviderLabTemplateDefinition } {
  const provider = getProvider(providerId);
  const readyTemplates = provider.templates.filter((template) => template.status !== 'coming-soon');
  const fallbackTemplate = readyTemplates[0] || provider.templates[0];

  if (!fallbackTemplate) {
    throw new Error(`${provider.label} has no available templates in Provider Lab.`);
  }

  if (!requestedTemplateId) {
    return { provider, template: fallbackTemplate };
  }

  const template = provider.templates.find((entry) => entry.id === requestedTemplateId);
  if (!template) {
    throw new Error(`Unknown template "${requestedTemplateId}" for provider ${provider.label}.`);
  }
  if (template.status === 'coming-soon') {
    throw new Error(`${provider.label} template "${template.label}" is not implemented yet.`);
  }

  return { provider, template };
}

export function listProviders(): Array<{
  id: ProviderLabProviderId;
  label: string;
  defaultTemplateId: string | null;
  templates: ProviderLabTemplateDefinition[];
}> {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    label: provider.label,
    defaultTemplateId: provider.templates.find((template) => template.status !== 'coming-soon')?.id || provider.templates[0]?.id || null,
    templates: provider.templates,
  }));
}
