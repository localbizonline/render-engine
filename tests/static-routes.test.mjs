import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const projectRoot = '/Users/jeremymartin/Documents/Cursor/render-engine';

async function read(relativePath) {
  return readFile(`${projectRoot}/${relativePath}`, 'utf8');
}

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function createElement(initial = {}) {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  let textContentValue = '';
  let innerHtmlValue = '';
  const element = {
    value: '',
    disabled: false,
    src: '',
    dataset: {},
    files: [],
    children: [],
    scrollTop: 0,
    scrollHeight: 0,
    scrollLeft: 0,
    style: { display: '' },
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        if (force === true) {
          classes.add(name);
          return true;
        }
        if (force === false) {
          classes.delete(name);
          return false;
        }
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    dispatchEvent(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    },
    appendChild(child) {
      this.children.push(child);
      this.scrollHeight = this.children.length;
      return child;
    },
    querySelector(selector) {
      if (selector === 'span') {
        if (!this._span) this._span = createElement();
        return this._span;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    remove() {
      this.removed = true;
    },
    focus() {
      this.focused = true;
    },
    pause() {},
    load() {},
    play() {
      return Promise.resolve();
    },
  };
  Object.defineProperty(element, 'textContent', {
    get() {
      return textContentValue;
    },
    set(value) {
      textContentValue = String(value ?? '');
      innerHtmlValue = textContentValue;
    },
  });
  Object.defineProperty(element, 'innerHTML', {
    get() {
      return innerHtmlValue;
    },
    set(value) {
      innerHtmlValue = String(value ?? '');
    },
  });
  Object.assign(element, initial);
  return element;
}

function createDesignerDom() {
  const elements = {
    apiKeyInput: createElement(),
    settingsDrawer: createElement(),
    btnToggleSettings: createElement(),
    v2BaseUrlInput: createElement(),
    v2AdminSecretInput: createElement(),
    btnOpenV2Admin: createElement(),
    statusDot: createElement(),
    modeReference: createElement(),
    modeV2: createElement(),
    modeJson: createElement(),
    sessionModePill: createElement(),
    draftStatePill: createElement(),
    sessionSummary: createElement(),
    sessionMeta: createElement(),
    pathHelper: createElement(),
    linkedTemplateBadge: createElement(),
    previewFreshness: createElement(),
    publishSummary: createElement(),
    autosaveStatus: createElement(),
    draftRestore: createElement(),
    draftRestoreTitle: createElement(),
    draftRestoreMeta: createElement(),
    btnRestoreDraft: createElement(),
    btnDiscardDraft: createElement(),
    workspaceTitle: createElement(),
    workspaceLead: createElement(),
    workspaceLinkedLabel: createElement(),
    historySummary: createElement(),
    publishLead: createElement(),
    advancedJsonPanel: createElement(),
    referenceModeImage: createElement(),
    referenceModeVideo: createElement(),
    referenceImagePanel: createElement(),
    referenceVideoPanel: createElement(),
    uploadZone: createElement(),
    fileInput: createElement(),
    uploadClear: createElement(),
    uploadPlaceholder: createElement(),
    uploadPreview: createElement(),
    videoUploadZone: createElement(),
    videoFileInput: createElement(),
    videoUploadClear: createElement(),
    videoUploadPlaceholder: createElement(),
    videoUploadPreview: createElement(),
    videoUploadMeta: createElement(),
    promptInput: createElement(),
    btnGenerate: createElement(),
    btnStop: createElement(),
    generateHint: createElement(),
    btnOpenSettingsHint: createElement(),
    toggleAutoIterate: createElement(),
    maxIterations: createElement({ value: '8' }),
    scoreTarget: createElement({ value: '8' }),
    feedbackInput: createElement(),
    btnIterate: createElement(),
    videoInsightsCard: createElement(),
    videoInsightHeadline: createElement(),
    videoInsightSummary: createElement(),
    videoInsightScore: createElement(),
    videoInsightMeta: createElement(),
    videoInsightMetrics: createElement(),
    videoInsightNotes: createElement(),
    btnNewBlankTemplate: createElement(),
    btnNewReelTemplate: createElement(),
    historyStrip: createElement(),
    logArea: createElement(),
    refPlaceholder: createElement(),
    refImage: createElement(),
    refVideo: createElement(),
    previewFrameControls: createElement(),
    previewFrameSelect: createElement({ value: '0' }),
    previewPlaceholder: createElement({ textContent: 'No preview yet' }),
    previewLoading: createElement(),
    previewImage: createElement(),
    previewVideo: createElement(),
    previewStatus: createElement(),
    jsonEditor: createElement(),
    btnRerender: createElement(),
    btnCopyJson: createElement(),
    v2ExportUrlInput: createElement(),
    saveName: createElement(),
    saveId: createElement(),
    saveImageCount: createElement({ value: '1' }),
    btnLoadV2: createElement(),
    btnSaveV2: createElement(),
    handoffStatus: createElement(),
    btnCopyV2TemplateId: createElement({ disabled: true }),
    btnCopyV2ExportUrl: createElement({ disabled: true }),
  };

  const selectorMap = new Map(
    Object.entries(elements).map(([id, element]) => [`#${id}`, element]),
  );

  const body = createElement();

  const document = {
    body,
    querySelector(selector) {
      return selectorMap.get(selector) || null;
    },
    createElement() {
      return createElement();
    },
  };

  return { document, elements, body };
}

function loadBridgeFactory({ locationSearch = '', locationHref = 'https://render-engine.example.com/designer' } = {}) {
  return read('public/designer-v2-bridge.js').then((bridgeSource) => {
    const replaceStateCalls = [];
    const window = {
      location: { search: locationSearch, href: `${locationHref}${locationSearch}` },
      history: {
        replaceState(...args) {
          replaceStateCalls.push(args);
        },
      },
      open() {},
      fetch() {
        throw new Error('Unexpected global fetch call');
      },
    };

    const context = vm.createContext({
      window,
      URL,
      URLSearchParams,
      Date,
      console,
    });

    vm.runInContext(bridgeSource, context);

    return {
      createTemplateLabV2Bridge: context.window.createTemplateLabV2Bridge,
      window,
      replaceStateCalls,
    };
  });
}

async function runDesignerApp({
  bridgeFactory,
  storageSeed = {},
  fetchImpl,
  bootstrap = null,
  locationSearch = '',
  locationPath = '/designer',
  locationHref = null,
} = {}) {
  const source = await read('public/designer-app.js');
  const storage = createStorage(storageSeed);
  const { document, elements, body } = createDesignerDom();
  const bridgeCalls = {
    connectInputs: [],
    initializeFromQueryParams: 0,
    loadTemplate: [],
    openAdmin: 0,
  };
  const bridgeContext = {
    exportUrl: '',
    linkedTemplateId: '',
  };
  let connectedInputs = null;

  const bridge = bridgeFactory
    ? bridgeFactory(bridgeCalls)
    : {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
          connectedInputs = args;
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: '',
            shouldAutoLoad: false,
            needsManualAuth: false,
          };
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          throw new Error('Unexpected loadTemplate call');
        },
        getContext() {
          return bridgeContext;
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
        setExportUrl(value) {
          bridgeContext.exportUrl = value;
          const match = String(value || '').match(/\/render-templates\/([^/]+)\/export\/?$/);
          bridgeContext.linkedTemplateId = match ? match[1] : '';
          if (connectedInputs?.exportUrlInput) connectedInputs.exportUrlInput.value = value;
          return value;
        },
        approveTemplate() {
          throw new Error('Unexpected approveTemplate call');
        },
      };

  const fetchCalls = [];
  const clipboardWrites = [];
  class FakeFormData {
    constructor() {
      this._entries = [];
    }
    append(name, value) {
      this._entries.push([name, value]);
    }
    get(name) {
      const match = this._entries.find(([key]) => key === name);
      return match ? match[1] : null;
    }
    entries() {
      return this._entries[Symbol.iterator]();
    }
  }

  const URLWithBlobHelpers = Object.assign(URL, {
    createObjectURL(file) {
      return `blob:${file?.name || 'reference-video'}`;
    },
    revokeObjectURL() {},
  });

  const resolvedFetch = fetchImpl || (async (url, options = {}) => {
    fetchCalls.push({ url, options });
    throw new Error(`Unexpected fetch call: ${url}`);
  });

  const window = {
    localStorage: storage,
    __TEMPLATE_LAB_BOOTSTRAP__: bootstrap,
    location: {
      pathname: locationPath,
      search: locationSearch,
      href: locationHref || `https://render-engine.example.com${locationPath}${locationSearch}`,
    },
    fetch(url, options) {
      fetchCalls.push({ url, options });
      return resolvedFetch(url, options);
    },
    createTemplateLabV2Bridge() {
      return bridge;
    },
    open() {},
    addEventListener() {},
    confirm() {
      return true;
    },
    URL: URLWithBlobHelpers,
  };

  const context = vm.createContext({
    window,
    document,
    localStorage: storage,
    fetch: window.fetch.bind(window),
    navigator: {
      clipboard: {
        writeText(value) {
          clipboardWrites.push(value);
          return Promise.resolve();
        },
      },
    },
    console,
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {},
    Date,
    URL: URLWithBlobHelpers,
    URLSearchParams,
    FormData: FakeFormData,
  });

  vm.runInContext(source, context);

  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    bridgeCalls,
    elements,
    body,
    fetchCalls,
    clipboardWrites,
  };
}

test('app wiring keeps explicit public routes for the Template Lab entry points', async () => {
  const appSource = await read('src/app.ts');

  assert.match(appSource, /\/designer\/reference-video/);
  assert.match(appSource, /\/designer\/reference-image/);
  assert.match(appSource, /\/designer\/v2/);
  assert.match(appSource, /\/designer\/json/);
  assert.match(appSource, /app\.get\(['"]\/designer-v2-bridge\.js['"]/);
  assert.match(appSource, /app\.get\(['"]\/designer-app\.js['"]/);
  assert.match(appSource, /app\.get\(['"]\/health['"]/);
  assert.match(appSource, /express\.static\(PUBLIC_DIR/);
});

test('runtime bootstrap uses the shared app factory', async () => {
  const indexSource = await read('src/index.ts');

  assert.match(indexSource, /import \{ createApp \} from '\.\/app\.js';/);
  assert.match(indexSource, /const app = createApp\(\);/);
  assert.doesNotMatch(indexSource, /express\.static\(PUBLIC_DIR/);
});

test('designer HTML references the extracted V2 bridge and V2 handoff actions', async () => {
  const html = await read('public/designer.html');

  assert.match(html, /<title>Template Lab Designer<\/title>/);
  assert.match(html, /<script src="\/designer-v2-bridge\.js"><\/script>/);
  assert.match(html, /<script src="\/designer-app\.js"><\/script>/);
  assert.match(html, /<script src="\/designer-bootstrap\.js"><\/script>/);
  assert.match(html, /Approve for V2/);
  assert.match(html, /Load from V2/);
  assert.match(html, /New Blank Template/);
  assert.match(html, /New Reel Template/);
  assert.match(html, /Reference Video/);
  assert.match(html, /id="videoFileInput"/);
  assert.match(html, /id="referenceModeVideo"/);
  assert.match(html, /Match style from video/i);
  assert.match(html, /Video Review/);
  assert.match(html, /id="videoInsightsCard"/);
  assert.match(html, /id="videoInsightScore"/);
  assert.match(html, /id="btnNewBlankTemplate"/);
  assert.match(html, /id="btnNewReelTemplate"/);
  assert.match(html, /id="previewStatus"/);
  assert.match(html, /id="generateHint"/);
  assert.match(html, /id="btnOpenSettingsHint"/);
  assert.match(html, /id="previewFrameControls"/);
  assert.match(html, /id="previewFrameSelect"/);
  assert.match(html, /id="previewVideo"/);
  assert.match(html, /id="handoffStatus"/);
  assert.match(html, /id="btnCopyV2TemplateId"/);
  assert.match(html, /id="btnCopyV2ExportUrl"/);
  assert.match(html, /<input type="number" id="saveImageCount"/);
  assert.doesNotMatch(html, /3\+ Images \(MP4\)/);
  assert.doesNotMatch(html, /<label>Categories<\/label>/);
});

test('bridge module still exposes the key V2 bridge capabilities', async () => {
  const bridgeSource = await read('public/designer-v2-bridge.js');

  assert.match(bridgeSource, /function createTemplateLabV2Bridge/);
  assert.match(bridgeSource, /function initializeFromQueryParams/);
  assert.match(bridgeSource, /async function loadTemplate/);
  assert.match(bridgeSource, /async function approveTemplate/);
  assert.match(bridgeSource, /global\.createTemplateLabV2Bridge = createTemplateLabV2Bridge;/);
});

test('designer app module contains the extracted non-V2 Template Lab behavior', async () => {
  const designerAppSource = await read('public/designer-app.js');

  assert.match(designerAppSource, /const v2Bridge = window\.createTemplateLabV2Bridge/);
  assert.match(designerAppSource, /function parseStudioUrlState/);
  assert.match(designerAppSource, /function applyStudioUrlState/);
  assert.match(designerAppSource, /function renderVideoInsights/);
  assert.match(designerAppSource, /async function generate/);
  assert.match(designerAppSource, /fetchMultipartApi\('\/video'/);
  assert.match(designerAppSource, /async function autoIterate/);
  assert.match(designerAppSource, /function createBlankTemplateSession/);
  assert.match(designerAppSource, /async function approveTemplateForV2/);
});

test('designer app can preselect the reference-video workflow from a readable URL', async () => {
  const result = await runDesignerApp({
    bootstrap: { renderApiKey: 'render-key' },
    locationPath: '/designer/reference-video',
    locationSearch: '?prompt=match%20style%20from%20video',
  });

  assert.equal(result.elements.referenceModeVideo.classList.contains('active'), true);
  assert.equal(result.elements.referenceVideoPanel.classList.contains('active'), true);
  assert.equal(result.elements.referenceImagePanel.classList.contains('active'), false);
  assert.equal(result.elements.promptInput.value, 'match style from video');
  assert.match(result.elements.generateHint.textContent, /reference image\/video|reference video/i);
});

test('designer app can generate a reel template from a reference video upload', async () => {
  const result = await runDesignerApp({
    bootstrap: { renderApiKey: 'render-key' },
    fetchImpl: async (url, options = {}) => {
      if (url !== '/api/design/video') {
        throw new Error(`Unexpected fetch call: ${url}`);
      }

      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Api-Key'], 'render-key');
      assert.equal(options.body.get('prompt'), 'match the strong hook and CTA ending');
      assert.equal(options.body.get('referenceVideo').name, 'sample.mov');

      return {
        ok: true,
        async json() {
          return {
            analysis: {
              orientation: 'portrait',
              aspectRatio: '9:16',
              durationBucket: 'short',
              pacing: 'fast',
              majorSceneCount: 4,
              headlineTextDensity: 'medium',
              overlayTreatment: 'dark_panel',
              ctaTreatment: 'button_end_card',
              colorDirection: {
                mood: 'modern',
                dominantHex: '#10151D',
                secondaryHex: '#29415B',
                accentHex: '#4E8FE8',
                contrast: 'high',
              },
              slideshowBlueprint: {
                recommendedFrameCount: 4,
                transition: 'fade',
                openingStyle: 'quick hook',
                closingStyle: 'direct CTA',
              },
              scenes: [
                { order: 1, role: 'hook', visualStyle: 'full_bleed_image', overlayPlacement: 'bottom', textAmount: 'medium', focus: 'Opening headline' },
                { order: 2, role: 'proof', visualStyle: 'split_image', overlayPlacement: 'bottom', textAmount: 'light', focus: 'Service proof' },
                { order: 3, role: 'detail', visualStyle: 'full_bleed_image', overlayPlacement: 'center', textAmount: 'medium', focus: 'Close-up detail' },
                { order: 4, role: 'cta', visualStyle: 'text_panel', overlayPlacement: 'full', textAmount: 'medium', focus: 'Closing CTA' },
              ],
              confidence: 0.82,
              notes: ['Fast-paced cuts approximated as 4 still frames.'],
            },
            template: {
              id: 'reference-video-fast',
              reference: 'reference-video-fast',
              name: 'Reference Video Reel Match',
              outputFormat: 'mp4',
              width: 1080,
              height: 1920,
              imageCount: 3,
              categoryKeys: ['reel', 'video_reference'],
              fps: 30,
              transition: { type: 'fade', durationMs: 500 },
              frames: [
                { durationMs: 1800, background: { type: 'solid', color: '#111111' }, layers: [] },
                { durationMs: 1800, background: { type: 'solid', color: '#222222' }, layers: [] },
                { durationMs: 1800, background: { type: 'solid', color: '#333333' }, layers: [] },
                { durationMs: 2200, background: { type: 'solid', color: '#444444' }, layers: [] },
              ],
            },
            previewBase64: 'data:image/png;base64,preview',
            previewPosterBase64: 'data:image/png;base64,preview',
            previewKind: 'image',
            frameIndex: 0,
          };
        },
      };
    },
  });

  result.elements.referenceModeVideo.dispatchEvent('click');
  result.elements.videoFileInput.files = [{ name: 'sample.mov', type: 'video/quicktime', size: 3 * 1024 * 1024 }];
  result.elements.videoFileInput.dispatchEvent('change');
  result.elements.promptInput.value = 'match the strong hook and CTA ending';
  result.elements.promptInput.dispatchEvent('input');
  result.elements.btnGenerate.dispatchEvent('click');

  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.fetchCalls.length, 1);
  assert.equal(result.fetchCalls[0].url, '/api/design/video');
  assert.equal(result.elements.btnGenerate.textContent, 'Match Style from Video');
  assert.equal(result.elements.previewImage.src, 'data:image/png;base64,preview');
  assert.equal(result.elements.refVideo.src, 'blob:sample.mov');
  assert.match(result.elements.previewStatus.textContent, /Reference video analyzed/i);
  assert.equal(result.elements.videoInsightsCard.classList.contains('active'), true);
  assert.match(result.elements.videoInsightHeadline.textContent, /4 scenes/i);
  assert.match(result.elements.videoInsightMeta.textContent, /82% confidence/i);
  assert.match(result.elements.videoInsightMetrics.innerHTML, /dark panel/i);
  assert.match(result.elements.videoInsightNotes.innerHTML, /Fast-paced cuts approximated/i);
});

test('designer app can auto-review a reference video draft and loop toward a better reel', async () => {
  const result = await runDesignerApp({
    bootstrap: { renderApiKey: 'render-key' },
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/design/video') {
        return {
          ok: true,
          async json() {
            return {
              analysis: {
                orientation: 'portrait',
                aspectRatio: '9:16',
                durationBucket: 'short',
                pacing: 'fast',
                majorSceneCount: 4,
                headlineTextDensity: 'medium',
                overlayTreatment: 'dark_panel',
                ctaTreatment: 'button_end_card',
                colorDirection: {
                  mood: 'modern',
                  dominantHex: '#10151D',
                  secondaryHex: '#29415B',
                  accentHex: '#4E8FE8',
                  contrast: 'high',
                },
                slideshowBlueprint: {
                  recommendedFrameCount: 4,
                  transition: 'fade',
                  openingStyle: 'quick hook',
                  closingStyle: 'direct CTA',
                },
                scenes: [
                  { order: 1, role: 'hook', visualStyle: 'full_bleed_image', overlayPlacement: 'bottom', textAmount: 'medium', focus: 'Opening headline' },
                  { order: 2, role: 'proof', visualStyle: 'split_image', overlayPlacement: 'bottom', textAmount: 'light', focus: 'Service proof' },
                  { order: 3, role: 'detail', visualStyle: 'full_bleed_image', overlayPlacement: 'center', textAmount: 'medium', focus: 'Close-up detail' },
                  { order: 4, role: 'cta', visualStyle: 'text_panel', overlayPlacement: 'full', textAmount: 'medium', focus: 'Closing CTA' },
                ],
                confidence: 0.78,
                notes: ['Initial pass'],
              },
              template: {
                id: 'reference-video-fast',
                reference: 'reference-video-fast',
                name: 'Reference Video Reel Match',
                outputFormat: 'mp4',
                width: 1080,
                height: 1920,
                imageCount: 3,
                categoryKeys: ['reel', 'video_reference'],
                fps: 30,
                transition: { type: 'fade', durationMs: 500 },
                frames: [
                  { durationMs: 1800, background: { type: 'solid', color: '#111111' }, layers: [] },
                  { durationMs: 1800, background: { type: 'solid', color: '#222222' }, layers: [] },
                  { durationMs: 1800, background: { type: 'solid', color: '#333333' }, layers: [] },
                  { durationMs: 2200, background: { type: 'solid', color: '#444444' }, layers: [] },
                ],
                previewUrl: 'https://example.com/initial-preview.mp4',
              },
              previewBase64: 'data:image/png;base64,initial',
              previewPosterBase64: 'data:image/png;base64,initial',
              previewKind: 'video',
              previewUrl: 'https://example.com/initial-preview.mp4',
              frameIndex: 0,
            };
          },
        };
      }

      if (url === '/api/design/video/compare-iterate') {
        return {
          ok: true,
          async json() {
            return {
              score: 8,
              feedback: 'Closer match after tightening pacing and CTA treatment.',
              shouldContinue: false,
              changesApplied: 'Reduced frame count and strengthened the end card.',
              analysis: {
                orientation: 'portrait',
                aspectRatio: '9:16',
                durationBucket: 'short',
                pacing: 'punchy',
                majorSceneCount: 5,
                headlineTextDensity: 'medium',
                overlayTreatment: 'dark_panel',
                ctaTreatment: 'button_end_card',
                colorDirection: {
                  mood: 'modern',
                  dominantHex: '#10151D',
                  secondaryHex: '#29415B',
                  accentHex: '#4E8FE8',
                  contrast: 'high',
                },
                slideshowBlueprint: {
                  recommendedFrameCount: 5,
                  transition: 'fade',
                  openingStyle: 'strong hook',
                  closingStyle: 'direct CTA',
                },
                scenes: [
                  { order: 1, role: 'hook', visualStyle: 'text_panel', overlayPlacement: 'center', textAmount: 'medium', focus: 'Opening headline' },
                  { order: 2, role: 'proof', visualStyle: 'full_bleed_image', overlayPlacement: 'bottom', textAmount: 'light', focus: 'Service proof' },
                  { order: 3, role: 'detail', visualStyle: 'full_bleed_image', overlayPlacement: 'center', textAmount: 'medium', focus: 'Close-up detail' },
                  { order: 4, role: 'offer', visualStyle: 'split_image', overlayPlacement: 'bottom', textAmount: 'medium', focus: 'Offer' },
                  { order: 5, role: 'cta', visualStyle: 'logo_end_card', overlayPlacement: 'full', textAmount: 'light', focus: 'Closing CTA' },
                ],
                confidence: 0.88,
                notes: ['Refined pass'],
              },
              template: {
                id: 'reference-video-punchy',
                reference: 'reference-video-punchy',
                name: 'Reference Video Reel Match',
                outputFormat: 'mp4',
                width: 1080,
                height: 1920,
                imageCount: 4,
                categoryKeys: ['reel', 'video_reference'],
                fps: 30,
                transition: { type: 'fade', durationMs: 350 },
                frames: [
                  { durationMs: 1500, background: { type: 'solid', color: '#111111' }, layers: [] },
                  { durationMs: 1500, background: { type: 'solid', color: '#222222' }, layers: [] },
                  { durationMs: 1500, background: { type: 'solid', color: '#333333' }, layers: [] },
                  { durationMs: 1500, background: { type: 'solid', color: '#444444' }, layers: [] },
                  { durationMs: 2000, background: { type: 'solid', color: '#555555' }, layers: [] },
                ],
              },
              previewBase64: 'data:image/png;base64,iterated',
              previewPosterBase64: 'data:image/png;base64,iterated',
              previewKind: 'video',
              previewUrl: 'https://example.com/iterated-preview.mp4',
              frameIndex: 0,
            };
          },
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  result.elements.toggleAutoIterate.dispatchEvent('click');
  result.elements.referenceModeVideo.dispatchEvent('click');
  result.elements.videoFileInput.files = [{ name: 'sample.mov', type: 'video/quicktime', size: 3 * 1024 * 1024 }];
  result.elements.videoFileInput.dispatchEvent('change');
  result.elements.promptInput.value = 'match the strong hook and CTA ending';
  result.elements.promptInput.dispatchEvent('input');
  result.elements.btnGenerate.dispatchEvent('click');

  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.fetchCalls.length, 2);
  assert.equal(result.fetchCalls[0].url, '/api/design/video');
  assert.equal(result.fetchCalls[1].url, '/api/design/video/compare-iterate');
  assert.equal(result.fetchCalls[1].options.body.get('previewVideoUrl'), 'https://example.com/initial-preview.mp4');
  assert.equal(result.fetchCalls[1].options.body.get('previewImage'), null);
  assert.equal(result.elements.previewVideo.src, 'https://example.com/iterated-preview.mp4');
  assert.equal(result.elements.saveImageCount.value, '4');
  assert.equal(result.elements.jsonEditor.value.includes('"outputFormat": "mp4"'), true);
  assert.equal(result.elements.videoInsightsCard.classList.contains('active'), true);
  assert.equal(result.elements.videoInsightScore.textContent, '8/10');
  assert.match(result.elements.videoInsightHeadline.textContent, /5 scenes/i);
  assert.match(result.elements.videoInsightSummary.textContent, /Closer match/i);
  assert.match(result.elements.videoInsightMeta.textContent, /88% confidence/i);
  assert.match(result.elements.videoInsightNotes.innerHTML, /Review: Closer match/i);
});

test('bridge bootstrap derives context from a scoped Template Lab session link', async () => {
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory({
    locationSearch: '?v2ExportUrl=https%3A%2F%2Fv2.example.com%2Fapi%2Fadmin%2Frender-templates%2Frt_123%2Fexport&v2Token=scoped-token',
  });

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async () => {
      throw new Error('fetch should not run during bootstrap');
    },
  });

  const session = bridge.initializeFromQueryParams();
  const context = bridge.getContext();

  assert.equal(session.baseUrl, 'https://v2.example.com');
  assert.equal(session.exportUrl, 'https://v2.example.com/api/admin/render-templates/rt_123/export');
  assert.equal(session.linkedTemplateId, 'rt_123');
  assert.equal(session.authMode, 'session_token');
  assert.equal(session.hasAuth, true);
  assert.equal(session.hasScopedSession, true);
  assert.equal(session.shouldAutoLoad, true);
  assert.equal(session.needsManualAuth, false);

  assert.equal(context.baseUrl, 'https://v2.example.com');
  assert.equal(context.exportUrl, 'https://v2.example.com/api/admin/render-templates/rt_123/export');
  assert.equal(context.linkedTemplateId, 'rt_123');
});

test('bridge bootstrap scrubs scoped Template Lab params from the browser URL', async () => {
  const {
    createTemplateLabV2Bridge,
    replaceStateCalls,
  } = await loadBridgeFactory({
    locationHref: 'https://render-engine.example.com/designer',
    locationSearch: '?v2ExportUrl=https%3A%2F%2Fv2.example.com%2Fapi%2Fadmin%2Frender-templates%2Frt_987%2Fexport&v2Token=scoped-token',
  });

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async () => {
      throw new Error('fetch should not run during bootstrap');
    },
  });

  bridge.initializeFromQueryParams();

  assert.equal(replaceStateCalls.length, 1);
  assert.equal(replaceStateCalls[0][1], '');
  assert.equal(replaceStateCalls[0][2], 'https://render-engine.example.com/designer');
});

test('bridge loadTemplate normalizes exported V2 template data and updates context', async () => {
  const requests = [];
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory();

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            template: {
              id: 'rt_456',
              reference: 'modern-split',
              name: 'Modern Split',
              image_count: 2,
              output_format: 'png',
              template_json: {
                id: 'old-id',
                name: 'Old Name',
                imageCount: 1,
                outputFormat: 'png',
                frames: [],
              },
            },
            template_lab: {
              export_url: 'https://v2.example.com/api/admin/render-templates/rt_456/export',
            },
          };
        },
      };
    },
  });

  bridge.setFallbackAdminSecret('fallback-secret');
  const result = await bridge.loadTemplate('https://v2.example.com/api/admin/render-templates/rt_123/export');
  const context = bridge.getContext();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://v2.example.com/api/admin/render-templates/rt_123/export');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fallback-secret');

  assert.equal(result.template.id, 'modern-split');
  assert.equal(result.template.reference, 'modern-split');
  assert.equal(result.template.name, 'Modern Split');
  assert.equal(result.template.imageCount, 2);
  assert.equal(result.meta.id, 'rt_456');

  assert.equal(context.baseUrl, 'https://v2.example.com');
  assert.equal(context.exportUrl, 'https://v2.example.com/api/admin/render-templates/rt_456/export');
  assert.equal(context.linkedTemplateId, 'rt_456');
  assert.equal(context.authMode, 'admin_secret');
});

test('bridge can use the server-managed V2 proxy when defaults are available', async () => {
  const requests = [];
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory();

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    apiKey: 'render-key',
    initialBaseUrl: 'https://admin.localpros.co.za',
    serverV2Proxy: true,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          if (String(url).includes('/export?')) {
            return {
              template: {
                id: 'rt_proxy',
                reference: 'proxy-template',
                name: 'Proxy Template',
                image_count: 3,
                output_format: 'mp4',
                template_json: {
                  id: 'proxy-template',
                  outputFormat: 'mp4',
                  frames: [],
                },
              },
              template_lab: {
                export_url: 'https://admin.localpros.co.za/api/admin/render-templates/rt_proxy/export',
              },
            };
          }

          return {
            id: 'rt_proxy',
            mode: 'updated',
          };
        },
      };
    },
  });

  const session = bridge.initializeFromQueryParams();
  assert.equal(session.authMode, 'server_proxy');
  assert.equal(session.hasAuth, true);

  await bridge.loadTemplate('https://admin.localpros.co.za/api/admin/render-templates/rt_proxy/export');
  await bridge.approveTemplate({
    template: {
      id: 'proxy-template',
      reference: 'proxy-template',
      name: 'Proxy Template',
      imageCount: 3,
      outputFormat: 'mp4',
      frames: [],
    },
  });

  assert.equal(requests[0].url, '/api/designer/v2/export?url=https%3A%2F%2Fadmin.localpros.co.za%2Fapi%2Fadmin%2Frender-templates%2Frt_proxy%2Fexport');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers['X-Api-Key'], 'render-key');
  assert.equal(requests[1].url, '/api/designer/v2/import');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['X-Api-Key'], 'render-key');
  assert.equal(bridge.getContext().authMode, 'server_proxy');
});

test('bridge approveTemplate sends a PNG import payload and refreshes export context', async () => {
  const requests = [];
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory();

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            id: 'rt_999',
            mode: 'updated',
          };
        },
      };
    },
  });

  bridge.setBaseUrl('https://v2.example.com');
  bridge.setFallbackAdminSecret('fallback-secret');
  bridge.setLinkedTemplateId('rt_456');

  const { payload, exportUrl, result } = await bridge.approveTemplate({
    template: {
      id: 'modern-split',
      reference: 'modern-split',
      name: 'Modern Split',
      imageCount: 4,
      frames: [],
    },
    sourceMode: 'reference_image',
    sourcePrompt: 'match the provided screenshot',
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://v2.example.com/api/admin/render-templates/import');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fallback-secret');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');

  const postedPayload = JSON.parse(requests[0].options.body);
  assert.equal(postedPayload.render_template_id, 'rt_456');
  assert.equal(postedPayload.reference, 'modern-split');
  assert.equal(postedPayload.name, 'Modern Split');
  assert.equal(postedPayload.output_format, 'png');
  assert.equal(postedPayload.image_count, 4);
  assert.equal(postedPayload.source_mode, 'reference_image');
  assert.equal(postedPayload.source_prompt, 'match the provided screenshot');

  assert.equal(payload.output_format, 'png');
  assert.equal(result.id, 'rt_999');
  assert.equal(exportUrl, 'https://v2.example.com/api/admin/render-templates/rt_999/export');
  assert.equal(bridge.getContext().linkedTemplateId, 'rt_999');
});

test('bridge approveTemplate preserves MP4 output format in the import payload', async () => {
  const requests = [];
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory();

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            id: 'rt_mp4',
            mode: 'updated',
          };
        },
      };
    },
  });

  bridge.setBaseUrl('https://v2.example.com');
  bridge.setFallbackAdminSecret('fallback-secret');
  bridge.setLinkedTemplateId('rt_existing_mp4');

  await bridge.approveTemplate({
    template: {
      id: 'reel-layout',
      reference: 'reel-layout',
      name: 'Reel Layout',
      imageCount: 4,
      outputFormat: 'mp4',
      frames: [],
    },
  });

  const postedPayload = JSON.parse(requests[0].options.body);
  assert.equal(postedPayload.render_template_id, 'rt_existing_mp4');
  assert.equal(postedPayload.output_format, 'mp4');
  assert.equal(postedPayload.image_count, 4);
});

test('bridge approveTemplate can create a brand-new V2 template when no linked template id exists', async () => {
  const requests = [];
  const {
    createTemplateLabV2Bridge,
  } = await loadBridgeFactory();

  const bridge = createTemplateLabV2Bridge({
    storage: createStorage(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            id: 'rt_new_blank',
            mode: 'created',
          };
        },
      };
    },
  });

  bridge.setBaseUrl('https://v2.example.com');
  bridge.setFallbackAdminSecret('fallback-secret');

  const { payload, exportUrl, result } = await bridge.approveTemplate({
    template: {
      id: 'untitled-template',
      reference: 'untitled-template',
      name: 'Untitled Template',
      imageCount: 1,
      outputFormat: 'png',
      frames: [],
    },
    sourceMode: 'manual_json',
  });

  const postedPayload = JSON.parse(requests[0].options.body);
  assert.equal(postedPayload.render_template_id, undefined);
  assert.equal(postedPayload.reference, 'untitled-template');
  assert.equal(postedPayload.name, 'Untitled Template');
  assert.equal(postedPayload.output_format, 'png');
  assert.equal(postedPayload.image_count, 1);

  assert.equal(payload.reference, 'untitled-template');
  assert.equal(result.id, 'rt_new_blank');
  assert.equal(exportUrl, 'https://v2.example.com/api/admin/render-templates/rt_new_blank/export');
  assert.equal(bridge.getContext().linkedTemplateId, 'rt_new_blank');
});

test('bridge syncs connected inputs, persists values, and opens the V2 admin from baseUrl', async () => {
  const {
    createTemplateLabV2Bridge,
    window,
  } = await loadBridgeFactory();
  const storage = createStorage({
    designer_v2_base_url: 'https://stored.example.com/',
    designer_v2_admin_secret: 'stored-secret',
  });
  const opened = [];
  window.open = (...args) => {
    opened.push(args);
  };

  const baseUrlInput = createElement();
  const fallbackSecretInput = createElement();
  const exportUrlInput = createElement();

  const bridge = createTemplateLabV2Bridge({
    storage,
    fetchImpl: async () => {
      throw new Error('Unexpected fetch during input sync test');
    },
  });

  bridge.connectInputs({
    baseUrlInput,
    fallbackSecretInput,
    exportUrlInput,
  });

  assert.equal(baseUrlInput.value, 'https://stored.example.com');
  assert.equal(fallbackSecretInput.value, 'stored-secret');
  assert.equal(exportUrlInput.value, '');

  baseUrlInput.value = 'https://app.example.com/';
  baseUrlInput.dispatchEvent('input');
  exportUrlInput.value = 'https://app.example.com/api/admin/render-templates/rt_777/export';
  exportUrlInput.dispatchEvent('input');

  assert.equal(storage.getItem('designer_v2_base_url'), 'https://app.example.com');
  assert.equal(bridge.getContext().baseUrl, 'https://app.example.com');
  assert.equal(bridge.getContext().exportUrl, 'https://app.example.com/api/admin/render-templates/rt_777/export');
  assert.equal(bridge.getContext().linkedTemplateId, 'rt_777');

  bridge.openAdmin();
  assert.deepEqual(opened, [[
    'https://app.example.com/admin#video-templates',
    '_blank',
    'noopener,noreferrer',
  ]]);
});

test('designer app auto-loads an approved V2 template when a scoped session link is present', async () => {
  const previewBase64 = 'data:image/png;base64,preview';
  const result = await runDesignerApp({
    storageSeed: {
      designer_api_key: 'render-key',
    },
    bridgeFactory(bridgeCalls) {
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_321/export',
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'modern-split',
              reference: 'modern-split',
              name: 'Modern Split',
              imageCount: 2,
              frames: [],
            },
            meta: {
              id: 'rt_321',
              reference: 'modern-split',
              name: 'Modern Split',
              image_count: 2,
            },
          };
        },
        getContext() {
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_321/export',
            linkedTemplateId: 'rt_321',
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
    async fetchImpl(url, options = {}) {
      assert.equal(url, '/api/preview');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Api-Key'], 'render-key');
      return {
        async json() {
          return {
            previewBase64,
          };
        },
        ok: true,
      };
    },
  });

  assert.equal(result.bridgeCalls.connectInputs.length, 1);
  assert.equal(result.bridgeCalls.initializeFromQueryParams, 1);
  assert.deepEqual(result.bridgeCalls.loadTemplate, [
    'https://v2.example.com/api/admin/render-templates/rt_321/export',
  ]);
  assert.equal(result.elements.saveName.value, 'Modern Split');
  assert.equal(result.elements.saveId.value, 'modern-split');
  assert.equal(result.elements.saveImageCount.value, '2');
  assert.equal(result.elements.previewImage.src, previewBase64);
  assert.equal(result.elements.previewPlaceholder.style.display, 'none');
  assert.equal(result.elements.handoffStatus.innerHTML.includes('Loaded V2 template'), true);
  assert.equal(result.elements.previewStatus.textContent.includes('Loaded from V2 and rendered locally'), true);
  assert.equal(result.elements.jsonEditor.value.includes('"modern-split"'), true);
  assert.equal(result.elements.btnCopyV2TemplateId.disabled, false);
  assert.equal(result.elements.btnCopyV2ExportUrl.disabled, false);
});

test('designer app loads V2 template metadata without previewing when no render-engine API key is present', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_654/export',
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'left-panel',
              reference: 'left-panel',
              name: 'Left Panel',
              imageCount: 1,
              frames: [],
            },
            meta: {
              id: 'rt_654',
              reference: 'left-panel',
              name: 'Left Panel',
              image_count: 1,
            },
          };
        },
        getContext() {
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_654/export',
            linkedTemplateId: 'rt_654',
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
  });

  assert.equal(result.bridgeCalls.initializeFromQueryParams, 1);
  assert.deepEqual(result.bridgeCalls.loadTemplate, [
    'https://v2.example.com/api/admin/render-templates/rt_654/export',
  ]);
  assert.equal(result.fetchCalls.length, 0);
  assert.equal(result.elements.saveName.value, 'Left Panel');
  assert.equal(result.elements.saveId.value, 'left-panel');
  assert.equal(result.elements.saveImageCount.value, '1');
  assert.equal(result.elements.previewImage.src, '');
  assert.equal(result.elements.previewPlaceholder.style.display, '');
  assert.equal(
    result.elements.previewPlaceholder.textContent,
    'Template loaded. Add the render-engine API key to preview it.',
  );
  assert.equal(result.elements.handoffStatus.innerHTML.includes('Loaded V2 template'), true);
  assert.equal(result.elements.previewStatus.textContent.includes('Loaded from V2. Add the render-engine API key'), true);
  assert.equal(result.elements.jsonEditor.value.includes('"left-panel"'), true);
  assert.equal(result.elements.btnCopyV2TemplateId.disabled, false);
  assert.equal(result.elements.btnCopyV2ExportUrl.disabled, false);
});

test('designer app restores a saved local draft and keeps the session recoverable', async () => {
  const restoredPreview = 'data:image/png;base64,restored-preview';
  const result = await runDesignerApp({
    storageSeed: {
      designer_studio_draft_v1: JSON.stringify({
        version: 1,
        savedAt: '2026-03-31T10:15:00.000Z',
        sessionMode: 'json',
        referenceImage: 'data:image/png;base64,reference',
        prompt: 'Refine the footer balance',
        currentTemplate: {
          id: 'saved-template',
          reference: 'saved-template',
          name: 'Saved Template',
          imageCount: 2,
          outputFormat: 'png',
          frames: [],
        },
        currentPreview: restoredPreview,
        previewStale: true,
        previewFrameIndex: 0,
        lastApprovedSnapshot: null,
        sessionDirty: true,
        generatedSaveId: 'saved-template',
        saveIdTouched: false,
        jsonEditorValue: '{\n  "id": "saved-template"\n}',
        handoff: {
          exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_saved/export',
          saveName: 'Saved Template',
          saveId: 'saved-template',
          saveImageCount: '2',
        },
      }),
    },
  });

  assert.equal(result.elements.draftRestore.style.display, '');
  assert.equal(result.elements.autosaveStatus.textContent.includes('Last local recovery snapshot saved'), true);

  result.elements.btnRestoreDraft.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.elements.saveName.value, 'Saved Template');
  assert.equal(result.elements.saveId.value, 'saved-template');
  assert.equal(result.elements.v2ExportUrlInput.value, 'https://v2.example.com/api/admin/render-templates/rt_saved/export');
  assert.equal(result.elements.previewImage.src, restoredPreview);
  assert.equal(result.elements.promptInput.value, 'Refine the footer balance');
  assert.equal(result.elements.previewStatus.textContent.includes('Draft restored'), true);
  assert.equal(result.elements.draftRestore.style.display, 'none');
});

test('designer app can start a new blank template session for admin-only V2 creation', async () => {
  const result = await runDesignerApp();

  result.elements.btnNewBlankTemplate.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.elements.saveName.value, 'Untitled Template');
  assert.equal(result.elements.saveId.value, 'untitled-template');
  assert.equal(result.elements.saveImageCount.value, '1');
  assert.equal(result.elements.v2ExportUrlInput.value, '');
  assert.equal(result.elements.previewPlaceholder.textContent, 'Blank template ready. Re-render from JSON when you want a local preview.');
  assert.equal(result.elements.handoffStatus.innerHTML.includes('create a new V2 record'), true);
  assert.equal(result.elements.previewStatus.textContent.includes('Blank draft ready.'), true);
  assert.equal(result.elements.jsonEditor.value.includes('"untitled-template"'), true);
  assert.equal(result.elements.btnSaveV2.disabled, false);
});

test('designer app explains why generate is disabled when the render API key is missing', async () => {
  const result = await runDesignerApp();

  result.elements.promptInput.value = 'simple slideshow reel';
  result.elements.promptInput.dispatchEvent('input');

  assert.equal(result.elements.btnGenerate.disabled, true);
  assert.equal(result.elements.settingsDrawer.classList.contains('open'), true);
  assert.equal(result.elements.generateHint.textContent.includes('Render API Key'), true);
  assert.equal(result.elements.btnOpenSettingsHint.style.display, 'inline-flex');

  result.elements.btnOpenSettingsHint.dispatchEvent('click');
  assert.equal(result.elements.apiKeyInput.focused, true);
});

test('designer app picks up server bootstrapped defaults without manual setup', async () => {
  const result = await runDesignerApp({
    bootstrap: {
      renderApiKey: 'bootstrapped-key',
      v2BaseUrl: 'https://admin.localpros.co.za',
      v2ServerProxyEnabled: true,
    },
    async fetchImpl(url) {
      if (url === '/api/design') {
        return {
          ok: true,
          async json() {
            return {
              template: {
                id: 'boot-reel',
                reference: 'boot-reel',
                name: 'Boot Reel',
                outputFormat: 'mp4',
                width: 1080,
                height: 1920,
                imageCount: 4,
                frames: [],
              },
              previewBase64: 'data:image/png;base64,boot-preview',
              previewPosterBase64: 'data:image/png;base64,boot-preview',
              previewKind: 'video',
              previewUrl: 'https://cdn.example.com/boot-reel.mp4',
            };
          },
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  assert.equal(result.elements.apiKeyInput.value, 'bootstrapped-key');

  result.elements.promptInput.value = 'simple slideshow reel';
  result.elements.promptInput.dispatchEvent('input');

  assert.equal(result.elements.btnGenerate.disabled, false);
});

test('designer app can generate a prompt-only reel draft without a reference image', async () => {
  const result = await runDesignerApp({
    storageSeed: {
      designer_api_key: 'render-key',
    },
    async fetchImpl(url) {
      if (url === '/api/design') {
        return {
          ok: true,
          async json() {
            return {
              template: {
                id: 'prompt-reel',
                reference: 'prompt-reel',
                name: 'Prompt Reel',
                outputFormat: 'mp4',
                width: 1080,
                height: 1920,
                imageCount: 4,
                frames: [
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 0 }, layers: [] },
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 1 }, layers: [] },
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 2 }, layers: [] },
                  { durationMs: 2200, background: { type: 'solid', color: '#10151D' }, layers: [] },
                ],
              },
              previewBase64: 'data:image/png;base64,prompt-reel-preview',
              previewPosterBase64: 'data:image/png;base64,prompt-reel-preview',
              previewKind: 'video',
              previewUrl: 'https://cdn.example.com/prompt-reel.mp4',
            };
          },
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  result.elements.promptInput.value = 'Create a vertical plumbing reel';
  result.elements.promptInput.dispatchEvent('input');

  assert.equal(result.elements.btnGenerate.disabled, false);

  result.elements.btnGenerate.dispatchEvent('click');
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.fetchCalls.some((call) => call.url === '/api/design'), true);
  assert.equal(result.elements.saveName.value, 'Prompt Reel');
  assert.equal(result.elements.saveId.value, 'prompt-reel');
  assert.equal(result.elements.saveImageCount.value, '4');
  assert.equal(result.elements.previewVideo.src, 'https://cdn.example.com/prompt-reel.mp4');
  assert.equal(result.elements.jsonEditor.value.includes('"outputFormat": "mp4"'), true);
});

test('designer app can generate a reel draft from a restored reference-image session', async () => {
  const result = await runDesignerApp({
    storageSeed: {
      designer_api_key: 'render-key',
      designer_studio_draft_v1: JSON.stringify({
        version: 1,
        savedAt: '2026-04-06T10:15:00.000Z',
        sessionMode: 'reference',
        referenceImage: 'data:image/png;base64,reference-image',
        prompt: 'Use full-screen frames with bold CTA',
        currentTemplate: null,
        currentPreview: null,
        previewStale: false,
        previewFrameIndex: 0,
        lastApprovedSnapshot: null,
        sessionDirty: true,
        generatedSaveId: '',
        saveIdTouched: false,
        jsonEditorValue: '',
        handoff: {
          exportUrl: '',
          saveName: '',
          saveId: '',
          saveImageCount: '1',
        },
      }),
    },
    async fetchImpl(url) {
      if (url === '/api/design/vision') {
        return {
          ok: true,
          async json() {
            return {
              template: {
                id: 'vision-reel',
                reference: 'vision-reel',
                name: 'Vision Reel',
                outputFormat: 'mp4',
                width: 1080,
                height: 1920,
                imageCount: 4,
                frames: [
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 0 }, layers: [] },
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 1 }, layers: [] },
                  { durationMs: 1800, background: { type: 'image', source: 'user_image', index: 2 }, layers: [] },
                  { durationMs: 2200, background: { type: 'solid', color: '#10151D' }, layers: [] },
                ],
              },
              previewBase64: 'data:image/png;base64,vision-reel-preview',
              previewPosterBase64: 'data:image/png;base64,vision-reel-preview',
              previewKind: 'video',
              previewUrl: 'https://cdn.example.com/vision-reel.mp4',
            };
          },
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  result.elements.btnRestoreDraft.dispatchEvent('click');
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.elements.btnGenerate.disabled, false);

  result.elements.btnGenerate.dispatchEvent('click');
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.fetchCalls.some((call) => call.url === '/api/design/vision'), true);
  assert.equal(result.elements.saveName.value, 'Vision Reel');
  assert.equal(result.elements.saveId.value, 'vision-reel');
  assert.equal(result.elements.previewVideo.src, 'https://cdn.example.com/vision-reel.mp4');
});

test('designer app approval surfaces the updated V2 id and export URL in the handoff area', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_111/export',
        linkedTemplateId: 'rt_111',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_111/export',
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        getContext() {
          return bridgeContext;
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'hero-banner',
              reference: 'hero-banner',
              name: 'Hero Banner',
              imageCount: 1,
              frames: [],
            },
            meta: {
              id: 'rt_111',
              reference: 'hero-banner',
              name: 'Hero Banner',
              image_count: 1,
            },
          };
        },
        async approveTemplate(args) {
          bridgeCalls.approveArgs = args;
          bridgeContext.exportUrl = 'https://v2.example.com/api/admin/render-templates/rt_222/export';
          bridgeContext.linkedTemplateId = 'rt_222';
          return {
            result: {
              id: 'rt_222',
              mode: 'updated',
            },
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_222/export',
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
  });

  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.elements.btnSaveV2.disabled, false);
  assert.equal(result.bridgeCalls.approveArgs.template.outputFormat, 'png');
  assert.equal(result.bridgeCalls.approveArgs.name, 'Hero Banner');
  assert.equal(result.elements.handoffStatus.innerHTML.includes('Approved in V2 as'), true);
  assert.equal(result.elements.handoffStatus.innerHTML.includes('rt_222'), true);
  assert.equal(
    result.elements.handoffStatus.innerHTML.includes('https://v2.example.com/api/admin/render-templates/rt_222/export'),
    true,
  );
  result.elements.btnCopyV2TemplateId.dispatchEvent('click');
  result.elements.btnCopyV2ExportUrl.dispatchEvent('click');
  await Promise.resolve();
  assert.deepEqual(result.clipboardWrites, [
    'rt_222',
    'https://v2.example.com/api/admin/render-templates/rt_222/export',
  ]);
});

test('designer app can approve a blank template session into a new V2 record', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: '',
        linkedTemplateId: '',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: '',
            shouldAutoLoad: false,
            needsManualAuth: false,
          };
        },
        getContext() {
          return bridgeContext;
        },
        async approveTemplate(args) {
          bridgeCalls.approveArgs = args;
          bridgeContext.exportUrl = 'https://v2.example.com/api/admin/render-templates/rt_new_blank/export';
          bridgeContext.linkedTemplateId = 'rt_new_blank';
          return {
            result: {
              id: 'rt_new_blank',
              mode: 'created',
            },
            exportUrl: bridgeContext.exportUrl,
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
        setExportUrl(value) {
          bridgeContext.exportUrl = value;
          bridgeContext.linkedTemplateId = '';
          return value;
        },
      };
    },
  });

  result.elements.btnNewBlankTemplate.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  result.elements.saveName.value = 'Fresh Layout';
  result.elements.saveName.dispatchEvent('input');
  result.elements.saveId.value = 'fresh-layout';
  result.elements.saveId.dispatchEvent('input');

  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.bridgeCalls.approveArgs.reference, 'fresh-layout');
  assert.equal(result.bridgeCalls.approveArgs.name, 'Fresh Layout');
  assert.equal(result.bridgeCalls.approveArgs.template.reference, 'fresh-layout');
  assert.equal(result.bridgeCalls.approveArgs.template.outputFormat, 'png');
  assert.equal(result.elements.handoffStatus.innerHTML.includes('rt_new_blank'), true);
  assert.equal(result.elements.btnCopyV2TemplateId.disabled, false);
  assert.equal(result.elements.btnCopyV2ExportUrl.disabled, false);
});

test('designer app can start and approve a blank reel session into a new V2 record', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: '',
        linkedTemplateId: '',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: '',
            shouldAutoLoad: false,
            needsManualAuth: false,
          };
        },
        getContext() {
          return bridgeContext;
        },
        async approveTemplate(args) {
          bridgeCalls.approveArgs = args;
          bridgeContext.exportUrl = 'https://v2.example.com/api/admin/render-templates/rt_new_reel/export';
          bridgeContext.linkedTemplateId = 'rt_new_reel';
          return {
            result: {
              id: 'rt_new_reel',
              mode: 'created',
            },
            exportUrl: bridgeContext.exportUrl,
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
        setExportUrl(value) {
          bridgeContext.exportUrl = value;
          bridgeContext.linkedTemplateId = '';
          return value;
        },
      };
    },
  });

  result.elements.btnNewReelTemplate.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  result.elements.saveName.value = 'Fresh Reel';
  result.elements.saveName.dispatchEvent('input');
  result.elements.saveId.value = 'fresh-reel';
  result.elements.saveId.dispatchEvent('input');

  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.bridgeCalls.approveArgs.reference, 'fresh-reel');
  assert.equal(result.bridgeCalls.approveArgs.template.outputFormat, 'mp4');
  assert.equal(result.bridgeCalls.approveArgs.template.height, 1920);
  assert.equal(result.bridgeCalls.approveArgs.template.frames.length > 1, true);
  assert.equal(result.elements.handoffStatus.innerHTML.includes('rt_new_reel'), true);
});

test('designer app preserves MP4 output format when approving a loaded V2 reel template', async () => {
  const result = await runDesignerApp({
    storageSeed: {
      designer_api_key: 'render-key',
    },
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_mp4/export',
        linkedTemplateId: 'rt_mp4',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: bridgeContext.exportUrl,
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        getContext() {
          return bridgeContext;
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'reel-layout',
              reference: 'reel-layout',
              name: 'Reel Layout',
              imageCount: 4,
              outputFormat: 'mp4',
              frames: [],
            },
            meta: {
              id: 'rt_mp4',
              reference: 'reel-layout',
              name: 'Reel Layout',
              image_count: 4,
              output_format: 'mp4',
            },
          };
        },
        async approveTemplate(args) {
          bridgeCalls.approveArgs = args;
          return {
            result: {
              id: 'rt_mp4',
              mode: 'updated',
            },
            exportUrl: bridgeContext.exportUrl,
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
    async fetchImpl(url) {
      if (url === '/api/preview') {
        return {
          async json() {
            return {
              previewBase64: 'data:image/png;base64,preview',
              previewPosterBase64: 'data:image/png;base64,preview',
              previewKind: 'video',
              previewUrl: 'https://render-engine.example.com/output/reel-preview.mp4',
            };
          },
          ok: true,
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  });

  assert.equal(
    result.elements.previewStatus.textContent.includes('MP4 authoring review'),
    true,
  );
  assert.equal(result.elements.previewVideo.style.display, '');
  assert.equal(result.elements.previewVideo.src, 'https://render-engine.example.com/output/reel-preview.mp4');
  assert.equal(JSON.parse(result.fetchCalls[0].options.body).previewMode, 'video');

  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.bridgeCalls.approveArgs.template.outputFormat, 'mp4');
  assert.equal(result.bridgeCalls.approveArgs.outputFormat, 'mp4');
});

test('designer app exposes an MP4 frame selector and re-renders the chosen poster frame', async () => {
  const previewResponses = [
    'data:image/png;base64,frame0',
    'data:image/png;base64,frame1',
  ];
  const result = await runDesignerApp({
    storageSeed: {
      designer_api_key: 'render-key',
    },
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_mp4_frame/export',
        linkedTemplateId: 'rt_mp4_frame',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: bridgeContext.exportUrl,
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        getContext() {
          return bridgeContext;
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'reel-layout-frame',
              reference: 'reel-layout-frame',
              name: 'Reel Layout Frame',
              imageCount: 4,
              outputFormat: 'mp4',
              frames: [
                { durationMs: 2500, background: { type: 'solid', color: '#111111' }, layers: [] },
                { durationMs: 3100, background: { type: 'solid', color: '#222222' }, layers: [] },
              ],
            },
            meta: {
              id: 'rt_mp4_frame',
              reference: 'reel-layout-frame',
              name: 'Reel Layout Frame',
              image_count: 4,
              output_format: 'mp4',
            },
          };
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
    async fetchImpl(url, options = {}) {
      assert.equal(url, '/api/preview');
      const body = JSON.parse(options.body);
      const frameIndex = body.frameIndex ?? 0;
      return {
        async json() {
          return {
            previewBase64: previewResponses[frameIndex],
            previewPosterBase64: previewResponses[frameIndex],
            previewKind: 'image',
          };
        },
        ok: true,
      };
    },
  });

  assert.equal(result.elements.previewFrameControls.style.display, '');
  assert.equal(result.elements.previewFrameSelect.disabled, false);
  assert.equal(result.elements.previewFrameSelect.innerHTML.includes('Frame 1 (2.5s)'), true);
  assert.equal(result.elements.previewFrameSelect.innerHTML.includes('Frame 2 (3.1s)'), true);
  assert.equal(result.elements.previewImage.src, 'data:image/png;base64,frame0');

  result.elements.previewFrameSelect.value = '1';
  result.elements.previewFrameSelect.dispatchEvent('input');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const previewCalls = result.fetchCalls.filter((call) => call.url === '/api/preview');
  assert.equal(previewCalls.length, 2);
  assert.equal(JSON.parse(previewCalls[0].options.body).frameIndex, 0);
  assert.equal(JSON.parse(previewCalls[0].options.body).previewMode, 'video');
  assert.equal(JSON.parse(previewCalls[1].options.body).frameIndex, 1);
  assert.equal(JSON.parse(previewCalls[1].options.body).previewMode, 'poster');
  assert.equal(result.elements.previewImage.src, 'data:image/png;base64,frame1');
  assert.equal(result.elements.previewStatus.textContent.includes('Showing frame 2'), true);
});

test('designer app blocks V2 approval when the template name or id is missing', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      const bridgeContext = {
        exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_555/export',
        linkedTemplateId: 'rt_555',
      };
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_555/export',
            shouldAutoLoad: true,
            needsManualAuth: false,
            authMode: 'session_token',
          };
        },
        getContext() {
          return bridgeContext;
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          return {
            template: {
              id: 'clean-grid',
              reference: 'clean-grid',
              name: 'Clean Grid',
              imageCount: 2,
              frames: [],
            },
            meta: {
              id: 'rt_555',
              reference: 'clean-grid',
              name: 'Clean Grid',
              image_count: 2,
            },
          };
        },
        async approveTemplate(args) {
          bridgeCalls.approveArgs = args;
          throw new Error('approveTemplate should not run when validation fails');
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
  });

  result.elements.saveName.value = '';
  result.elements.saveName.dispatchEvent('input');
  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();

  assert.equal(result.bridgeCalls.approveArgs, undefined);
  assert.equal(result.elements.handoffStatus.innerHTML.includes('Template name is required'), true);

  result.elements.saveName.value = 'Clean Grid';
  result.elements.saveName.dispatchEvent('input');
  result.elements.saveId.value = '';
  result.elements.saveId.dispatchEvent('input');
  result.elements.btnSaveV2.dispatchEvent('click');
  await Promise.resolve();

  assert.equal(result.bridgeCalls.approveArgs, undefined);
  assert.equal(result.elements.handoffStatus.innerHTML.includes('Template ID is required'), true);
});

test('designer app does not auto-load an approved template when V2 auth is missing', async () => {
  const result = await runDesignerApp({
    bridgeFactory(bridgeCalls) {
      return {
        connectInputs(args) {
          bridgeCalls.connectInputs.push(args);
        },
        initializeFromQueryParams() {
          bridgeCalls.initializeFromQueryParams += 1;
          return {
            exportUrl: 'https://v2.example.com/api/admin/render-templates/rt_654/export',
            shouldAutoLoad: false,
            needsManualAuth: true,
          };
        },
        async loadTemplate(exportUrl) {
          bridgeCalls.loadTemplate.push(exportUrl);
          throw new Error('Should not auto-load without auth');
        },
        openAdmin() {
          bridgeCalls.openAdmin += 1;
        },
      };
    },
  });

  assert.equal(result.bridgeCalls.initializeFromQueryParams, 1);
  assert.deepEqual(result.bridgeCalls.loadTemplate, []);
  assert.equal(result.fetchCalls.length, 0);
  assert.equal(result.elements.previewImage.src, '');
  assert.equal(result.elements.previewPlaceholder.textContent, 'No preview yet');
});
