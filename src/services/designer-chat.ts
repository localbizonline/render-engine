import { randomUUID } from 'crypto';
import type {
  DesignerChatDraftContext,
  DesignerChatMessage,
  DesignerChatTurnRequest,
  DesignerChatTurnResponse,
  TemplateDefinition,
} from '../types.js';
import { generateTemplate, iterateTemplate } from './claude.js';
import { renderTemplatePreview } from './template-preview.js';

interface DesignerChatSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: DesignerChatMessage[];
  draftContext: DesignerChatDraftContext;
}

interface DesignerChatToolset {
  generateTemplate: typeof generateTemplate;
  iterateTemplate: typeof iterateTemplate;
  renderPreview: typeof renderPreview;
}

const chatSessions = new Map<string, DesignerChatSession>();

let toolOverrides: Partial<DesignerChatToolset> | null = null;

const INFO_ONLY_PATTERN = /^(help|what can you do|how does this work|summari[sz]e|what changed|where are we|status)\b/i;

function renderPreview(template: TemplateDefinition, frameIndex = 0) {
  return renderTemplatePreview(template, {}, {
    mode: 'video',
    frameIndex,
  });
}

function getToolset(): DesignerChatToolset {
  return {
    generateTemplate: toolOverrides?.generateTemplate || generateTemplate,
    iterateTemplate: toolOverrides?.iterateTemplate || iterateTemplate,
    renderPreview: toolOverrides?.renderPreview || renderPreview,
  };
}

export function setDesignerChatToolOverridesForTests(overrides: Partial<DesignerChatToolset> | null) {
  toolOverrides = overrides;
}

function createMessage(role: 'user' | 'assistant', content: string): DesignerChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function getOrCreateSession(sessionId?: string): DesignerChatSession {
  if (sessionId) {
    const existing = chatSessions.get(sessionId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const session: DesignerChatSession = {
    id: sessionId || randomUUID(),
    createdAt: now,
    updatedAt: now,
    messages: [],
    draftContext: {},
  };
  chatSessions.set(session.id, session);
  return session;
}

function normalizeDraftContext(input: DesignerChatDraftContext | undefined): DesignerChatDraftContext {
  const previewFrameIndex = input?.previewFrameIndex;

  return {
    prompt: typeof input?.prompt === 'string' ? input.prompt : '',
    referenceInputMode: input?.referenceInputMode === 'prompt'
      ? 'prompt'
      : input?.referenceInputMode === 'blank'
        ? 'blank'
        : input?.referenceInputMode === 'v2'
          ? 'v2'
          : 'video',
    referenceVideoActive: Boolean(input?.referenceVideoActive),
    currentTemplate: input?.currentTemplate || null,
    currentPreview: input?.currentPreview || null,
    currentPreviewKind: input?.currentPreviewKind === 'video' ? 'video' : 'image',
    currentPreviewVideoUrl: input?.currentPreviewVideoUrl || '',
    currentVideoAnalysis: input?.currentVideoAnalysis || null,
    previewFrameIndex: Number.isInteger(previewFrameIndex) ? previewFrameIndex : 0,
    handoff: {
      exportUrl: input?.handoff?.exportUrl || '',
      saveName: input?.handoff?.saveName || '',
      saveId: input?.handoff?.saveId || '',
      saveImageCount: input?.handoff?.saveImageCount || '',
    },
  };
}

function getRecentUserMessages(session: DesignerChatSession, limit = 6): string[] {
  return session.messages
    .filter((message) => message.role === 'user')
    .slice(-limit)
    .map((message) => message.content.trim())
    .filter(Boolean);
}

function buildConversationPrompt(session: DesignerChatSession, latestMessage: string, mode: 'generate' | 'iterate'): string {
  const recentInstructions = getRecentUserMessages(session);
  const establishedPrompt = String(session.draftContext.prompt || '').trim();
  const priorInstructions = recentInstructions.slice(0, -1);

  const sections = [
    mode === 'generate'
      ? 'Create a new MP4 reel template draft based on the conversation context below.'
      : 'Update the current MP4 reel template draft while preserving prior decisions unless the latest instruction overrides them.',
  ];

  if (establishedPrompt) {
    sections.push(`Existing design brief:\n${establishedPrompt}`);
  }

  if (priorInstructions.length) {
    sections.push(`Established user directions:\n${priorInstructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')}`);
  }

  sections.push(`Latest instruction:\n${latestMessage}`);

  return sections.join('\n\n').trim();
}

function shouldReplyWithInfoOnly(message: string): boolean {
  return INFO_ONLY_PATTERN.test(message.trim());
}

function createInfoReply(session: DesignerChatSession): string {
  const template = session.draftContext.currentTemplate;
  if (!template) {
    if (session.draftContext.referenceVideoActive) {
      return 'Generate the first reel from the reference video first, then keep refining it here in chat.';
    }

    return 'Describe the reel you want, and I will generate the first version here. Once a preview exists, keep replying with adjustments and I will continue from the current draft.';
  }

  const summaryBits = [
    `We are currently working on "${template.name || template.id}".`,
    `It is an MP4 reel with ${template.frames.length} frames.`,
  ];

  if (session.draftContext.referenceVideoActive) {
    summaryBits.push('The current session also has a reference-video workflow active, so I can keep refining the reel with text directions.');
  }

  return `${summaryBits.join(' ')} Tell me what to adjust next.`;
}

function updateSessionDraftContext(
  session: DesignerChatSession,
  draftContext: DesignerChatDraftContext,
  template?: TemplateDefinition,
  preview?: Awaited<ReturnType<typeof renderPreview>>,
) {
  const nextTemplate = template || draftContext.currentTemplate || session.draftContext.currentTemplate || null;
  const nextPreview = preview
    ? {
        currentPreview: preview.previewPosterBase64 || preview.previewBase64 || '',
        currentPreviewKind: preview.previewKind || (preview.previewUrl ? 'video' : 'image'),
        currentPreviewVideoUrl: preview.previewUrl || '',
      }
    : {
        currentPreview: draftContext.currentPreview || session.draftContext.currentPreview || '',
        currentPreviewKind: draftContext.currentPreviewKind || session.draftContext.currentPreviewKind || 'image',
        currentPreviewVideoUrl: draftContext.currentPreviewVideoUrl || session.draftContext.currentPreviewVideoUrl || '',
      };

  session.draftContext = {
    ...session.draftContext,
    ...draftContext,
    currentTemplate: nextTemplate,
    currentPreview: nextPreview.currentPreview || null,
    currentPreviewKind: nextPreview.currentPreviewKind,
    currentPreviewVideoUrl: nextPreview.currentPreviewVideoUrl,
  };
  session.updatedAt = new Date().toISOString();
}

function appendMessage(session: DesignerChatSession, message: DesignerChatMessage) {
  session.messages.push(message);
  if (session.messages.length > 40) {
    session.messages = session.messages.slice(-40);
  }
  session.updatedAt = new Date().toISOString();
}

function buildAssistantReply(action: 'generated' | 'iterated'): string {
  if (action === 'generated') {
    return 'I started a new reel draft and rendered a fresh preview. Keep replying with adjustments and I will keep building on this version.';
  }

  return 'I updated the current reel draft and rendered a fresh preview. Tell me what to adjust next.';
}

export async function runDesignerChatTurn(
  input: DesignerChatTurnRequest,
): Promise<DesignerChatTurnResponse> {
  const message = String(input.message || '').trim();
  if (!message) {
    throw new Error('message is required');
  }

  const session = getOrCreateSession(input.sessionId);
  const draftContext = normalizeDraftContext(input.draftContext);
  updateSessionDraftContext(session, draftContext);

  const userMessage = createMessage('user', message);
  appendMessage(session, userMessage);

  if (shouldReplyWithInfoOnly(message)) {
    const assistantMessage = createMessage('assistant', createInfoReply(session));
    appendMessage(session, assistantMessage);
    return {
      sessionId: session.id,
      messages: session.messages,
      assistantMessage,
      action: 'info',
    };
  }

  if (!session.draftContext.currentTemplate && session.draftContext.referenceVideoActive) {
    const assistantMessage = createMessage('assistant', 'Generate the first reel from the reference video first, then I can keep refining it conversationally from there.');
    appendMessage(session, assistantMessage);
    return {
      sessionId: session.id,
      messages: session.messages,
      assistantMessage,
      action: 'info',
    };
  }

  const tools = getToolset();
  let template: TemplateDefinition;
  let preview: Awaited<ReturnType<typeof renderPreview>>;
  let action: 'generated' | 'iterated';

  if (session.draftContext.currentTemplate) {
    const iterationPrompt = buildConversationPrompt(session, message, 'iterate');
    template = await tools.iterateTemplate(
      iterationPrompt,
      session.draftContext.currentTemplate,
    );
    preview = await tools.renderPreview(template, session.draftContext.previewFrameIndex || 0);
    action = 'iterated';
  } else {
    const generationPrompt = buildConversationPrompt(session, message, 'generate');
    template = await tools.generateTemplate(generationPrompt);
    preview = await tools.renderPreview(template, session.draftContext.previewFrameIndex || 0);
    action = 'generated';
  }

  if (!session.draftContext.prompt && !session.draftContext.currentTemplate) {
    draftContext.prompt = message;
  }

  updateSessionDraftContext(session, draftContext, template, preview);

  const assistantMessage = createMessage('assistant', buildAssistantReply(action));
  appendMessage(session, assistantMessage);

  return {
    sessionId: session.id,
    messages: session.messages,
    assistantMessage,
    action,
    template,
    previewBase64: preview.previewBase64,
    previewPosterBase64: preview.previewPosterBase64,
    previewKind: preview.previewKind,
    previewUrl: preview.previewUrl,
    previewWarning: preview.previewWarning,
    frameIndex: session.draftContext.previewFrameIndex || 0,
  };
}

export function clearDesignerChatSessionsForTests() {
  chatSessions.clear();
}

export function getDesignerChatSessionForTests(sessionId: string) {
  return chatSessions.get(sessionId) || null;
}
