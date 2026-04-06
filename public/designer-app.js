(function() {
  'use strict';

  const bootstrap = window.__TEMPLATE_LAB_BOOTSTRAP__ || {};

  const state = {
    apiKey: localStorage.getItem('designer_api_key') || String(bootstrap.renderApiKey || '').trim(),
    referenceInputMode: 'image',
    referenceImage: null,
    referenceVideoFile: null,
    referenceVideoObjectUrl: '',
    referenceVideoMeta: null,
    currentVideoAnalysis: null,
    currentTemplate: null,
    currentPreview: null,
    currentPreviewKind: 'image',
    currentPreviewVideoUrl: '',
    history: [],
    activeHistoryIndex: -1,
    isGenerating: false,
    isAutoIterating: false,
    isApproving: false,
    autoIterateEnabled: false,
    iterationHistory: [],
    sessionMode: 'reference',
    lastApprovedSnapshot: null,
    sessionDirty: false,
    previewStale: false,
    previewFrameIndex: 0,
    generatedSaveId: '',
    saveIdTouched: false,
    savedDraftMeta: null,
  };

  const DRAFT_STORAGE_KEY = 'designer_studio_draft_v1';
  let draftSaveTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const body = document.body;

  const apiKeyInput = $('#apiKeyInput');
  const settingsDrawer = $('#settingsDrawer');
  const btnToggleSettings = $('#btnToggleSettings');
  const v2BaseUrlInput = $('#v2BaseUrlInput');
  const v2AdminSecretInput = $('#v2AdminSecretInput');
  const btnOpenV2Admin = $('#btnOpenV2Admin');
  const statusDot = $('#statusDot');

  const modeReference = $('#modeReference');
  const modeV2 = $('#modeV2');
  const modeJson = $('#modeJson');
  const sessionModePill = $('#sessionModePill');
  const draftStatePill = $('#draftStatePill');
  const sessionSummary = $('#sessionSummary');
  const sessionMeta = $('#sessionMeta');
  const pathHelper = $('#pathHelper');
  const linkedTemplateBadge = $('#linkedTemplateBadge');
  const previewFreshness = $('#previewFreshness');
  const publishSummary = $('#publishSummary');
  const autosaveStatus = $('#autosaveStatus');
  const draftRestore = $('#draftRestore');
  const draftRestoreTitle = $('#draftRestoreTitle');
  const draftRestoreMeta = $('#draftRestoreMeta');
  const btnRestoreDraft = $('#btnRestoreDraft');
  const btnDiscardDraft = $('#btnDiscardDraft');
  const workspaceTitle = $('#workspaceTitle');
  const workspaceLead = $('#workspaceLead');
  const workspaceLinkedLabel = $('#workspaceLinkedLabel');
  const historySummary = $('#historySummary');
  const publishLead = $('#publishLead');
  const advancedJsonPanel = $('#advancedJsonPanel');

  const referenceModeImage = $('#referenceModeImage');
  const referenceModeVideo = $('#referenceModeVideo');
  const referenceImagePanel = $('#referenceImagePanel');
  const referenceVideoPanel = $('#referenceVideoPanel');
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  const uploadClear = $('#uploadClear');
  const uploadPlaceholder = $('#uploadPlaceholder');
  const uploadPreview = $('#uploadPreview');
  const videoUploadZone = $('#videoUploadZone');
  const videoFileInput = $('#videoFileInput');
  const videoUploadClear = $('#videoUploadClear');
  const videoUploadPlaceholder = $('#videoUploadPlaceholder');
  const videoUploadPreview = $('#videoUploadPreview');
  const videoUploadMeta = $('#videoUploadMeta');
  const promptInput = $('#promptInput');
  const btnGenerate = $('#btnGenerate');
  const btnStop = $('#btnStop');
  const generateHint = $('#generateHint');
  const btnOpenSettingsHint = $('#btnOpenSettingsHint');
  const toggleAutoIterate = $('#toggleAutoIterate');
  const maxIterations = $('#maxIterations');
  const scoreTarget = $('#scoreTarget');
  const feedbackInput = $('#feedbackInput');
  const btnIterate = $('#btnIterate');
  const btnNewBlankTemplate = $('#btnNewBlankTemplate');
  const btnNewReelTemplate = $('#btnNewReelTemplate');
  const historyStrip = $('#historyStrip');
  const logArea = $('#logArea');
  const videoInsightsCard = $('#videoInsightsCard');
  const videoInsightHeadline = $('#videoInsightHeadline');
  const videoInsightSummary = $('#videoInsightSummary');
  const videoInsightScore = $('#videoInsightScore');
  const videoInsightMeta = $('#videoInsightMeta');
  const videoInsightMetrics = $('#videoInsightMetrics');
  const videoInsightNotes = $('#videoInsightNotes');
  const refPlaceholder = $('#refPlaceholder');
  const refImage = $('#refImage');
  const refVideo = $('#refVideo');
  const previewPlaceholder = $('#previewPlaceholder');
  const previewLoading = $('#previewLoading');
  const previewImage = $('#previewImage');
  const previewVideo = $('#previewVideo');
  const previewFrameControls = $('#previewFrameControls');
  const previewFrameSelect = $('#previewFrameSelect');
  const previewStatus = $('#previewStatus');
  const jsonEditor = $('#jsonEditor');
  const btnRerender = $('#btnRerender');
  const btnCopyJson = $('#btnCopyJson');
  const v2ExportUrlInput = $('#v2ExportUrlInput');
  const saveName = $('#saveName');
  const saveId = $('#saveId');
  const saveImageCount = $('#saveImageCount');
  const btnLoadV2 = $('#btnLoadV2');
  const btnSaveV2 = $('#btnSaveV2');
  const handoffStatus = $('#handoffStatus');
  const btnCopyV2TemplateId = $('#btnCopyV2TemplateId');
  const btnCopyV2ExportUrl = $('#btnCopyV2ExportUrl');

  const v2Bridge = window.createTemplateLabV2Bridge({
    storage: window.localStorage,
    fetchImpl: window.fetch.bind(window),
    getApiKey: () => state.apiKey,
    initialBaseUrl: bootstrap.v2BaseUrl || '',
    serverV2Proxy: Boolean(bootstrap.v2ServerProxyEnabled),
  });

  const SESSION_COPY = {
    reference: {
      pill: 'Reference Draft',
      helper: 'Start with a reference image or reference video to create a new template session.',
      title: 'Reference-led draft',
      lead: 'Generate a first pass from a target image or video style, then use the local preview to decide when the draft is ready.',
    },
    v2: {
      pill: 'V2 Improvement',
      helper: 'Load an approved V2 template when you want to improve an existing draft rather than start fresh.',
      title: 'Approved V2 template session',
      lead: 'This session is anchored to a V2 template. Local edits stay in the studio until you explicitly approve them back into V2.',
    },
    json: {
      pill: 'JSON Workbench',
      helper: 'Use advanced JSON mode when you need exact schema-level control and want the preview to confirm the raw edit.',
      title: 'Advanced JSON workbench',
      lead: 'Treat the JSON editor as a precision tool. Re-render after raw edits so the preview still matches the draft you plan to approve.',
    },
  };

  apiKeyInput.value = state.apiKey;
  if (!localStorage.getItem('designer_api_key') && state.apiKey) {
    localStorage.setItem('designer_api_key', state.apiKey);
  }
  v2Bridge.connectInputs({
    baseUrlInput: v2BaseUrlInput,
    fallbackSecretInput: v2AdminSecretInput,
    exportUrlInput: v2ExportUrlInput,
  });

  bindEvents();
  refreshSavedDraftMeta();
  setReferenceInputMode('image');
  setSessionMode('reference');
  renderHistory();
  updateStatus();
  initializeTemplateLabBridge();
  if (bootstrap.renderApiKey || bootstrap.v2BaseUrl) {
    log('Studio defaults loaded automatically from the server.', 'info');
  }

  applyStudioUrlState();
  function bindEvents() {
    if (btnToggleSettings) {
      btnToggleSettings.addEventListener('click', () => {
        toggleSettingsDrawer();
      });
    }

    apiKeyInput.addEventListener('input', () => {
      state.apiKey = apiKeyInput.value.trim();
      localStorage.setItem('designer_api_key', state.apiKey);
      updateStatus();
    });

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', (event) => {
        if (!state.sessionDirty) return;
        event.preventDefault();
        event.returnValue = '';
      });
    }

    if (modeReference) {
      modeReference.addEventListener('click', () => {
        setSessionMode('reference', { focusTarget: state.referenceInputMode === 'video' ? videoFileInput : fileInput });
      });
    }

    if (modeV2) {
      modeV2.addEventListener('click', () => {
        setSessionMode('v2', { focusTarget: v2ExportUrlInput });
      });
    }

    if (modeJson) {
      modeJson.addEventListener('click', () => {
        setSessionMode('json', { focusTarget: jsonEditor, openAdvanced: true });
      });
    }

    if (referenceModeImage) {
      referenceModeImage.addEventListener('click', () => {
        setReferenceInputMode('image');
        setSessionMode('reference', { focusTarget: fileInput });
      });
    }

    if (referenceModeVideo) {
      referenceModeVideo.addEventListener('click', () => {
        setReferenceInputMode('video');
        setSessionMode('reference', { focusTarget: videoFileInput });
      });
    }

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) handleImageFile(file);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleImageFile(file);
    });

    videoUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      videoUploadZone.classList.add('dragover');
    });

    videoUploadZone.addEventListener('dragleave', () => {
      videoUploadZone.classList.remove('dragover');
    });

    videoUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      videoUploadZone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleVideoFile(file);
    });

    videoFileInput.addEventListener('change', () => {
      const file = videoFileInput.files?.[0];
      if (file) handleVideoFile(file);
    });

    uploadClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearReferenceImage();
      renderReferenceState();
      fileInput.value = '';
      if (state.sessionMode === 'reference') {
        setPreviewStatus('Reference removed. Add a new reference before running another refinement pass.', 'warning');
      }
      updateStatus();
      scheduleDraftSave();
    });

    videoUploadClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearReferenceVideo();
      renderReferenceState();
      videoFileInput.value = '';
      if (state.sessionMode === 'reference') {
        setPreviewStatus('Reference video removed. Upload another video when you want to match style from video again.', 'warning');
      }
      updateStatus();
      scheduleDraftSave();
    });

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey && !btnGenerate.disabled) generate();
    });
    promptInput.addEventListener('input', () => {
      if (promptInput.value.trim() && !state.apiKey) {
        openSettingsDrawer({ focusTarget: apiKeyInput });
      }
      updateStatus();
      scheduleDraftSave();
    });

    if (btnOpenSettingsHint) {
      btnOpenSettingsHint.addEventListener('click', () => {
        openSettingsDrawer({ focusTarget: apiKeyInput });
      });
    }

    feedbackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnIterate.disabled) manualIterate();
    });

    btnGenerate.addEventListener('click', generate);
    btnStop.addEventListener('click', () => {
      state.isAutoIterating = false;
      updateStatus();
    });
    btnIterate.addEventListener('click', manualIterate);
    btnNewBlankTemplate.addEventListener('click', () => createBlankTemplateSession('png'));
    if (btnNewReelTemplate) {
      btnNewReelTemplate.addEventListener('click', () => createBlankTemplateSession('mp4'));
    }
    btnLoadV2.addEventListener('click', () => loadApprovedTemplateFromV2());
    btnSaveV2.addEventListener('click', approveTemplateForV2);
    btnOpenV2Admin.addEventListener('click', openV2Admin);
    btnRerender.addEventListener('click', rerenderFromJson);
    previewFrameSelect.addEventListener('input', renderSelectedPreviewFrame);

    btnCopyJson.addEventListener('click', async () => {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        showToast('Clipboard access is unavailable in this browser', 'error');
        return;
      }

      try {
        await navigator.clipboard.writeText(jsonEditor.value);
        showToast('JSON copied to clipboard', 'success');
      } catch (err) {
        showToast(err.message || 'Clipboard copy failed', 'error');
      }
    });

    toggleAutoIterate.addEventListener('click', () => {
      state.autoIterateEnabled = !state.autoIterateEnabled;
      toggleAutoIterate.classList.toggle('active', state.autoIterateEnabled);
      if (typeof toggleAutoIterate.setAttribute === 'function') {
        toggleAutoIterate.setAttribute('aria-pressed', state.autoIterateEnabled ? 'true' : 'false');
      }
      updateStudioStatus();
      scheduleDraftSave();
    });

    saveName.addEventListener('input', () => {
      const nextGeneratedId = slugify(saveName.value.trim());
      if (!state.saveIdTouched || !saveId.value.trim() || saveId.value.trim() === state.generatedSaveId) {
        saveId.value = nextGeneratedId;
        state.generatedSaveId = nextGeneratedId;
      }

      setHandoffStatus('', '');
      updateHandoffCopyButtons();
      updateStudioStatus();
      scheduleDraftSave();
    });

    saveId.addEventListener('input', () => {
      const currentValue = saveId.value.trim();
      state.saveIdTouched = currentValue !== '' && currentValue !== state.generatedSaveId;
      setHandoffStatus('', '');
      updateHandoffCopyButtons();
      updateStudioStatus();
      scheduleDraftSave();
    });

    saveImageCount.addEventListener('input', () => {
      setHandoffStatus('', '');
      updateStudioStatus();
      scheduleDraftSave();
    });

    v2ExportUrlInput.addEventListener('input', () => {
      setHandoffStatus('', '');
      updateHandoffCopyButtons();
      updateStudioStatus();
      scheduleDraftSave();
    });

    jsonEditor.addEventListener('input', () => {
      if (!state.currentTemplate) return;
      state.previewStale = true;
      state.sessionDirty = true;
      setSessionMode('json', { openAdvanced: true });
      setPreviewStatus('Preview is out of date. Re-render from JSON before approving this draft.', 'warning');
      updateStatus();
      scheduleDraftSave();
    });

    btnCopyV2TemplateId.addEventListener('click', () => copyHandoffValue('templateId'));
    btnCopyV2ExportUrl.addEventListener('click', () => copyHandoffValue('exportUrl'));
    btnRestoreDraft.addEventListener('click', restoreSavedDraft);
    btnDiscardDraft.addEventListener('click', discardSavedDraft);
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function serializeTemplate(template) {
    return template ? JSON.stringify(template) : null;
  }

  function focusElement(el) {
    if (el && typeof el.focus === 'function') el.focus();
  }

  function setReferenceInputMode(mode) {
    state.referenceInputMode = mode === 'video' ? 'video' : 'image';
    if (referenceModeImage) referenceModeImage.classList.toggle('active', state.referenceInputMode === 'image');
    if (referenceModeVideo) referenceModeVideo.classList.toggle('active', state.referenceInputMode === 'video');
    if (referenceImagePanel) referenceImagePanel.classList.toggle('active', state.referenceInputMode === 'image');
    if (referenceVideoPanel) referenceVideoPanel.classList.toggle('active', state.referenceInputMode === 'video');
    updateStatus();
  }

  function parseStudioUrlState() {
    const location = window.location || {};
    const pathname = String(location.pathname || '').replace(/\/+$/, '');
    const params = new URLSearchParams(String(location.search || ''));
    const queryMode = String(params.get('mode') || '').trim().toLowerCase();
    const prompt = params.get('prompt');

    let routeMode = '';
    if (pathname.endsWith('/designer/reference-video')) routeMode = 'video';
    else if (pathname.endsWith('/designer/reference-image')) routeMode = 'image';
    else if (pathname.endsWith('/designer/v2')) routeMode = 'v2';
    else if (pathname.endsWith('/designer/json')) routeMode = 'json';

    const normalizedMode = routeMode || queryMode;
    const allowedModes = new Set(['video', 'image', 'v2', 'json', 'reference']);

    return {
      mode: allowedModes.has(normalizedMode) ? normalizedMode : '',
      prompt: typeof prompt === 'string' ? prompt : '',
    };
  }

  function applyStudioUrlState() {
    const urlState = parseStudioUrlState();

    if (urlState.prompt && !promptInput.value.trim()) {
      promptInput.value = urlState.prompt;
    }

    if (urlState.mode === 'video') {
      setReferenceInputMode('video');
      setSessionMode('reference');
    } else if (urlState.mode === 'image' || urlState.mode === 'reference') {
      setReferenceInputMode('image');
      setSessionMode('reference');
    } else if (urlState.mode === 'v2') {
      setSessionMode('v2', { focusTarget: v2ExportUrlInput });
    } else if (urlState.mode === 'json') {
      setSessionMode('json', { focusTarget: jsonEditor, openAdvanced: true });
    }

    if (urlState.mode || urlState.prompt) {
      updateStatus();
    }
  }

  function setSessionMode(mode, { focusTarget = null, openAdvanced = false } = {}) {
    if (!SESSION_COPY[mode]) return;

    state.sessionMode = mode;
    if (body && body.dataset) body.dataset.sessionMode = mode;
    if (modeReference) modeReference.classList.toggle('active', mode === 'reference');
    if (modeV2) modeV2.classList.toggle('active', mode === 'v2');
    if (modeJson) modeJson.classList.toggle('active', mode === 'json');
    if (openAdvanced && advancedJsonPanel) advancedJsonPanel.open = true;

    updateStudioStatus();
    if (hasRecoverableState()) scheduleDraftSave();
    else updateDraftRecoveryUI();
    focusElement(focusTarget);
  }

  function getReferenceSessionDetails() {
    const isVideoMode = state.referenceInputMode === 'video' || !!state.referenceVideoFile;
    return isVideoMode
      ? {
          pill: 'Video Match Draft',
          helper: 'Upload a short reference video to analyze pacing, scene rhythm, overlay treatment, and CTA structure for a slideshow reel.',
          title: 'Reference-video draft',
          lead: 'Match the style and structure of a short reference video within the limits of our MP4 slideshow renderer.',
        }
      : SESSION_COPY.reference;
  }

  function formatTimestamp(value) {
    if (!value) return 'just now';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'recently';

    return new Intl.DateTimeFormat([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }

  function hasRecoverableState() {
    return Boolean(
      state.referenceImage ||
      promptInput.value.trim() ||
      state.currentTemplate ||
      jsonEditor.value.trim() ||
      saveName.value.trim() ||
      saveId.value.trim() ||
      v2ExportUrlInput.value.trim()
    );
  }

  function readSavedDraft() {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
  }

  function refreshSavedDraftMeta() {
    const draft = readSavedDraft();
    state.savedDraftMeta = draft
      ? {
          savedAt: draft.savedAt,
          sessionMode: draft.sessionMode,
          templateName: draft.handoff?.saveName || draft.currentTemplate?.name || draft.currentTemplate?.id || '',
        }
      : null;
    updateDraftRecoveryUI();
  }

  function buildDraftPayload() {
    if (!hasRecoverableState()) return null;

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      sessionMode: state.sessionMode,
      referenceInputMode: state.referenceInputMode,
      referenceImage: state.referenceImage,
      prompt: promptInput.value,
      currentTemplate: state.currentTemplate,
      currentPreview: state.currentPreview,
      currentPreviewKind: state.currentPreviewKind,
      currentPreviewVideoUrl: state.currentPreviewVideoUrl,
      currentVideoAnalysis: state.currentVideoAnalysis,
      previewStale: state.previewStale,
      previewFrameIndex: state.previewFrameIndex,
      lastApprovedSnapshot: state.lastApprovedSnapshot,
      sessionDirty: state.sessionDirty,
      generatedSaveId: state.generatedSaveId,
      saveIdTouched: state.saveIdTouched,
      jsonEditorValue: jsonEditor.value,
      handoff: {
        exportUrl: v2ExportUrlInput.value.trim(),
        saveName: saveName.value,
        saveId: saveId.value,
        saveImageCount: saveImageCount.value,
      },
    };
  }

  function persistDraftNow() {
    const payload = buildDraftPayload();

    if (!payload) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      state.savedDraftMeta = null;
      updateDraftRecoveryUI();
      return;
    }

    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      state.savedDraftMeta = {
        savedAt: payload.savedAt,
        sessionMode: payload.sessionMode,
        templateName: payload.handoff.saveName || payload.currentTemplate?.name || payload.currentTemplate?.id || '',
      };
      updateDraftRecoveryUI();
    } catch (err) {
      autosaveStatus.textContent = 'Autosave could not be written in this browser.';
      log(`Autosave failed: ${err.message || err}`, 'error');
    }
  }

  function scheduleDraftSave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      persistDraftNow();
    }, 250);
  }

  function updateDraftRecoveryUI() {
    const savedMeta = state.savedDraftMeta;
    const hasCurrentDraft = hasRecoverableState();

    if (!savedMeta) {
      autosaveStatus.textContent = hasCurrentDraft
        ? 'This session has changes but no saved recovery snapshot yet.'
        : 'Autosave is idle until this session has something to recover.';
      draftRestore.style.display = 'none';
      return;
    }

    const templateLabel = savedMeta.templateName ? ` for ${savedMeta.templateName}` : '';
    autosaveStatus.textContent = `Last local recovery snapshot saved ${formatTimestamp(savedMeta.savedAt)}${templateLabel}.`;

    if (hasCurrentDraft) {
      draftRestore.style.display = 'none';
      return;
    }

    draftRestoreTitle.textContent = 'Saved draft available';
    draftRestoreMeta.textContent = `A ${savedMeta.sessionMode || 'studio'} session was saved ${formatTimestamp(savedMeta.savedAt)}${templateLabel}. Restore it or discard it before starting a new draft.`;
    draftRestore.style.display = '';
  }

  function confirmAction(message) {
    if (typeof window.confirm !== 'function') return true;
    return window.confirm(message);
  }

  function initializeTemplateLabBridge() {
    const session = v2Bridge.initializeFromQueryParams();
    if (!session.exportUrl) return;

    setSessionMode('v2');

    if (session.shouldAutoLoad) {
      const authLabel = session.authMode === 'session_token'
        ? 'the scoped V2 Template Lab session token'
        : session.authMode === 'server_proxy'
          ? 'the server-managed V2 connection'
          : 'the fallback V2 admin secret';
      log(`Template Lab link detected. Auto-loading the approved V2 template using ${authLabel}.`, 'info');
      loadApprovedTemplateFromV2(session.exportUrl);
      return;
    }

    if (session.needsManualAuth) {
      log('Template Lab link detected. Add the V2 admin secret override in Settings, then click "Load from V2".', 'info');
      updateStudioStatus();
    }
  }

  function updateStatus() {
    const connected = !!state.apiKey;
    statusDot.classList.toggle('connected', connected);

    const hasTemplate = !!state.currentTemplate;
    const hasReferenceImage = !!state.referenceImage;
    const hasReferenceVideo = !!state.referenceVideoFile;
    const hasReference = hasReferenceImage || hasReferenceVideo;
    const hasPrompt = !!promptInput.value.trim();
    const busy = state.isGenerating || state.isApproving;
    const missingApiKey = !connected;
    const missingInput = !hasReference && !hasPrompt;

    btnGenerate.disabled = missingApiKey || missingInput || busy;
    btnStop.disabled = !state.isAutoIterating;
    feedbackInput.disabled = !hasTemplate || !hasReference || busy;
    btnIterate.disabled = !hasTemplate || !hasReference || busy;
    btnRerender.disabled = !hasTemplate || busy;
    btnCopyJson.disabled = !hasTemplate;
    btnSaveV2.disabled = !hasTemplate || busy;
    btnLoadV2.disabled = busy;
    jsonEditor.disabled = !hasTemplate || (busy && !state.previewStale);
    if (previewFrameSelect) previewFrameSelect.disabled = !hasTemplate || busy || previewFrameControls.style.display === 'none';
    if (toggleAutoIterate) toggleAutoIterate.disabled = busy;

    if (btnGenerate) {
      btnGenerate.textContent = hasReferenceVideo ? 'Match Style from Video' : 'Generate';
      btnGenerate.title = missingApiKey
        ? 'Add the Render API Key in Settings to enable Generate.'
        : missingInput
          ? 'Add a prompt or upload a reference image or video to enable Generate.'
          : '';
    }

    if (generateHint) {
      let hintText = '';
      generateHint.classList.remove('is-warning');
      if (busy) {
        hintText = 'Working on the current draft...';
      } else if (missingApiKey && (hasPrompt || hasReference)) {
        hintText = 'Add the Render API Key in Settings to enable Generate.';
        generateHint.classList.add('is-warning');
      } else if (missingApiKey) {
        hintText = 'Open Settings and paste the Render API Key to start generating.';
      } else if (missingInput) {
        hintText = 'Add a prompt or reference image/video to start.';
      } else if (hasReferenceVideo && hasPrompt) {
        hintText = 'Ready to analyze the reference video and match its style with a slideshow reel.';
      } else if (hasReferenceVideo) {
        hintText = 'Reference video ready. Generate will analyze scenes, pacing, and overlays to build an MP4 reel blueprint.';
      } else if (!hasReference && hasPrompt && state.referenceInputMode === 'video') {
        hintText = 'Prompt ready. Upload a short reference video to match style, or generate from prompt only if you want a generic reel draft.';
      } else if (hasReferenceImage && hasPrompt) {
        hintText = 'Ready to generate from the reference image and prompt.';
      } else if (hasReferenceImage) {
        hintText = 'Reference image ready. You can generate now or add a prompt for more control.';
      } else {
        hintText = 'Prompt ready. Generate will create a draft from scratch.';
      }
      generateHint.textContent = hintText;
    }

    if (btnOpenSettingsHint) {
      btnOpenSettingsHint.style.display = missingApiKey ? 'inline-flex' : 'none';
    }

    toggleAutoIterate.classList.toggle('active', state.autoIterateEnabled);
    if (typeof toggleAutoIterate.setAttribute === 'function') {
      toggleAutoIterate.setAttribute('aria-pressed', state.autoIterateEnabled ? 'true' : 'false');
    }

    updateHandoffCopyButtons();
    updateStudioStatus();
    renderVideoInsights();
    updateDraftRecoveryUI();
  }

  function openSettingsDrawer({ focusTarget } = {}) {
    if (!settingsDrawer) return;
    settingsDrawer.classList.add('open');
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  function toggleSettingsDrawer() {
    if (!settingsDrawer) return;
    settingsDrawer.classList.toggle('open');
  }

  function updateStudioStatus() {
    const copy = state.sessionMode === 'reference'
      ? getReferenceSessionDetails()
      : (SESSION_COPY[state.sessionMode] || SESSION_COPY.reference);
    const { linkedTemplateId, exportUrl } = getHandoffContext();
    const hasTemplate = !!state.currentTemplate;
    const hasPreview = !!state.currentPreview || !!state.currentPreviewVideoUrl;
    const currentName = state.currentTemplate?.name || state.currentTemplate?.id || 'Untitled draft';
    const latestEntry = state.history[state.activeHistoryIndex] || null;

    setStatusPill(sessionModePill, copy.pill, 'accent');

    let draftLabel = 'Awaiting Draft';
    let draftTone = '';

    if (state.isApproving) {
      draftLabel = 'Approving';
      draftTone = 'warning';
    } else if (state.isAutoIterating) {
      draftLabel = 'Auto-Refining';
      draftTone = 'accent';
    } else if (state.isGenerating) {
      draftLabel = 'Working';
      draftTone = 'accent';
    } else if (state.previewStale) {
      draftLabel = 'Preview Stale';
      draftTone = 'warning';
    } else if (!hasTemplate) {
      draftLabel = 'Awaiting Draft';
    } else if (!state.sessionDirty && linkedTemplateId) {
      draftLabel = 'V2-Synced';
      draftTone = 'success';
    } else if (state.sessionDirty) {
      draftLabel = 'Draft Updated';
      draftTone = 'warning';
    } else if (hasPreview) {
      draftLabel = 'Preview Current';
      draftTone = 'success';
    }

    setStatusPill(draftStatePill, draftLabel, draftTone);

    sessionSummary.textContent = hasTemplate
      ? `Working on “${currentName}”.`
      : 'Choose a session path and create the first preview.';

    sessionMeta.textContent = linkedTemplateId
      ? `Linked to V2 template ${linkedTemplateId}.${exportUrl ? ` Export URL: ${exportUrl}` : ''}`
      : 'No V2 template is linked yet. Use V2 load when you want to improve an existing approved template.';

    pathHelper.textContent = copy.helper;
    linkedTemplateBadge.textContent = linkedTemplateId ? linkedTemplateId : 'Not linked';
    workspaceLinkedLabel.textContent = linkedTemplateId ? `Linked to ${linkedTemplateId}` : 'Not linked yet';

    previewFreshness.textContent = state.previewStale
      ? 'Preview needs rerender'
      : hasPreview
        ? 'Preview current'
        : hasTemplate
          ? 'Template loaded, no preview yet'
          : 'No preview yet';

    publishSummary.textContent = !hasTemplate
      ? 'Nothing ready to approve yet.'
      : state.previewStale
        ? 'Re-render the edited JSON before approving.'
        : linkedTemplateId
          ? 'Current draft can update the linked V2 template when you approve.'
          : 'Current draft can create or link a V2 template when you approve.';

    workspaceTitle.textContent = hasTemplate ? currentName : copy.title;
    workspaceLead.textContent = !hasTemplate
      ? copy.lead
      : latestEntry
        ? `${latestEntry.label}. ${state.sessionDirty ? 'Local edits are not yet approved back into V2.' : 'This version matches the current clean checkpoint.'}`
        : copy.lead;

    historySummary.textContent = latestEntry
      ? `${latestEntry.label}${latestEntry.score != null ? ` • ${latestEntry.score}/10` : ''}`
      : 'No versions yet. The first render will create the first restorable checkpoint.';

    publishLead.innerHTML = linkedTemplateId
      ? `This session is linked to <strong>${escapeHtml(linkedTemplateId)}</strong>. Approving now updates that V2 record and refreshes the export link.`
      : 'Use <strong>Load from V2</strong> when you want to reopen an approved template. MP4 templates now try to preview here as local videos, with poster-frame fallback when video rendering is unavailable.';
  }

  function setStatusPill(el, label, tone) {
    if (!el) return;
    el.textContent = label;
    el.className = 'status-pill';
    if (tone === 'accent') el.classList.add('is-accent');
    if (tone === 'success') el.classList.add('is-success');
    if (tone === 'warning') el.classList.add('is-warning');
  }

  function clearReferenceImage() {
    state.referenceImage = null;
  }

  function revokeReferenceVideoObjectUrl() {
    if (!state.referenceVideoObjectUrl || !URL || typeof URL.revokeObjectURL !== 'function') return;
    URL.revokeObjectURL(state.referenceVideoObjectUrl);
    state.referenceVideoObjectUrl = '';
  }

  function clearReferenceVideo() {
    revokeReferenceVideoObjectUrl();
    state.referenceVideoFile = null;
    state.referenceVideoMeta = null;
    if (videoUploadPreview) {
      if (typeof videoUploadPreview.pause === 'function') videoUploadPreview.pause();
      videoUploadPreview.removeAttribute?.('src');
      videoUploadPreview.style.display = 'none';
    }
  }

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      resizeImage(reader.result, 1500, (resized) => {
        clearReferenceVideo();
        state.referenceImage = resized;
        setReferenceInputMode('image');
        setSessionMode('reference');
        renderReferenceState();
        updateStatus();
        scheduleDraftSave();
      });
    };
    reader.readAsDataURL(file);
  }

  function formatFileSize(sizeBytes) {
    const numericSize = Number(sizeBytes || 0);
    if (!numericSize) return '';
    if (numericSize >= 1024 * 1024) return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
    if (numericSize >= 1024) return `${Math.round(numericSize / 1024)} KB`;
    return `${numericSize} B`;
  }

  function handleVideoFile(file) {
    const normalizedType = String(file.type || '').toLowerCase();
    const lowerName = String(file.name || '').toLowerCase();
    const isSupportedVideo = normalizedType === 'video/mp4' ||
      normalizedType === 'video/quicktime' ||
      normalizedType === 'video/mov' ||
      lowerName.endsWith('.mp4') ||
      lowerName.endsWith('.mov');

    if (!isSupportedVideo) {
      showToast('Reference video must be an MP4 or MOV file', 'error');
      setPreviewStatus('Reference video must be an MP4 or MOV file.', 'error');
      return;
    }

    clearReferenceImage();
    clearReferenceVideo();

    state.referenceVideoFile = file;
    state.referenceVideoMeta = {
      name: file.name || 'reference-video',
      sizeLabel: formatFileSize(file.size),
    };

    if (URL && typeof URL.createObjectURL === 'function') {
      state.referenceVideoObjectUrl = URL.createObjectURL(file);
    }

    setReferenceInputMode('video');
    setSessionMode('reference');
    renderReferenceState();
    updateStatus();
    scheduleDraftSave();
  }

  function resizeImage(dataUri, maxDim, callback) {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) {
        callback(dataUri);
        return;
      }

      const scale = maxDim / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/png'));
    };
    img.src = dataUri;
  }

  function renderReferenceState() {
    if (state.referenceImage) {
      uploadPreview.src = state.referenceImage;
      uploadPreview.style.display = '';
      uploadPlaceholder.style.display = 'none';
      uploadZone.classList.add('has-image');
      uploadZone.classList.remove('has-video');
      refImage.src = state.referenceImage;
      refImage.style.display = '';
      if (refVideo) {
        if (typeof refVideo.pause === 'function') refVideo.pause();
        refVideo.style.display = 'none';
        if ('src' in refVideo) refVideo.src = '';
      }
      refPlaceholder.style.display = 'none';
      if (videoUploadMeta) videoUploadMeta.textContent = '';
      if (videoUploadPreview) videoUploadPreview.style.display = 'none';
      if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = '';
      if (videoUploadZone) videoUploadZone.classList.remove('has-video');
      return;
    }

    uploadPreview.src = '';
    uploadPreview.style.display = 'none';
    uploadPlaceholder.style.display = '';
    uploadZone.classList.remove('has-image');

    if (state.referenceVideoObjectUrl) {
      if (videoUploadPreview) {
        videoUploadPreview.src = state.referenceVideoObjectUrl;
        videoUploadPreview.style.display = '';
      }
      if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = 'none';
      if (videoUploadZone) videoUploadZone.classList.add('has-video');
      if (videoUploadMeta) {
        const parts = [state.referenceVideoMeta?.name || 'Reference video ready'];
        if (state.referenceVideoMeta?.sizeLabel) parts.push(state.referenceVideoMeta.sizeLabel);
        videoUploadMeta.textContent = parts.join(' • ');
      }

      refImage.src = '';
      refImage.style.display = 'none';
      if (refVideo) {
        refVideo.src = state.referenceVideoObjectUrl;
        refVideo.style.display = '';
      }
      refPlaceholder.style.display = 'none';
      return;
    }

    uploadPreview.src = '';
    uploadPreview.style.display = 'none';
    uploadPlaceholder.style.display = '';
    uploadZone.classList.remove('has-image');
    refImage.src = '';
    refImage.style.display = 'none';
    if (refVideo) {
      if (typeof refVideo.pause === 'function') refVideo.pause();
      refVideo.src = '';
      refVideo.style.display = 'none';
    }
    if (videoUploadPreview) {
      if (typeof videoUploadPreview.pause === 'function') videoUploadPreview.pause();
      videoUploadPreview.src = '';
      videoUploadPreview.style.display = 'none';
    }
    if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = '';
    if (videoUploadMeta) videoUploadMeta.textContent = '';
    if (videoUploadZone) videoUploadZone.classList.remove('has-video');
    refPlaceholder.style.display = '';
  }

  function stopPreviewVideo() {
    if (!previewVideo) return;
    if (typeof previewVideo.pause === 'function') previewVideo.pause();
  }

  function setGenerating(generating, label) {
    state.isGenerating = generating;
    if (generating) {
      previewPlaceholder.style.display = 'none';
      previewImage.style.display = 'none';
      if (previewVideo) previewVideo.style.display = 'none';
      stopPreviewVideo();
      previewLoading.style.display = '';
      previewLoading.querySelector('span').textContent = label || 'Generating draft…';
      setPreviewStatus('', '');
    } else {
      previewLoading.style.display = 'none';
    }
    updateStatus();
  }

  function setApproving(approving) {
    state.isApproving = approving;
    updateStatus();
  }

  function setPreviewStatus(message, tone) {
    previewStatus.textContent = message || '';
    previewStatus.className = 'preview-status';
    if (!message) {
      previewStatus.style.display = 'none';
      return;
    }
    if (tone) previewStatus.classList.add(tone);
    previewStatus.style.display = '';
  }

  function setHandoffStatus(message, tone) {
    handoffStatus.innerHTML = message || '';
    handoffStatus.className = 'handoff-status';
    if (!message) {
      handoffStatus.style.display = 'none';
      return;
    }
    if (tone) handoffStatus.classList.add(tone);
    handoffStatus.style.display = '';
  }

  function clearHistory() {
    state.history = [];
    state.activeHistoryIndex = -1;
    renderHistory();
  }

  function beginFreshSession(mode) {
    clearHistory();
    state.iterationHistory = [];
    state.currentPreview = null;
    state.currentPreviewKind = 'image';
    state.currentPreviewVideoUrl = '';
    state.previewStale = false;
    state.previewFrameIndex = 0;
    state.lastApprovedSnapshot = null;
    state.sessionDirty = false;
    setSessionMode(mode);
  }

  function computeDirty(template) {
    if (!template) return false;
    const snapshot = serializeTemplate(template);
    if (!state.lastApprovedSnapshot) return true;
    return snapshot !== state.lastApprovedSnapshot;
  }

  function syncApprovalFieldsFromTemplate(template, meta = {}) {
    const derivedName = meta.name || template.name || '';
    const derivedReference = meta.reference || template.reference || template.id || '';
    const derivedImageCount = meta.image_count || template.imageCount || 1;

    saveName.value = derivedName;
    saveId.value = derivedReference;
    saveImageCount.value = String(derivedImageCount);

    state.generatedSaveId = derivedReference;
    state.saveIdTouched = false;
    updateHandoffCopyButtons();
  }

  function humanizeInsightValue(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function formatConfidence(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    return `${Math.round(value * 100)}% confidence`;
  }

  function renderVideoInsights() {
    if (!videoInsightsCard) return;

    const latestEntry = state.history[state.activeHistoryIndex] || null;
    const analysis = state.currentVideoAnalysis || latestEntry?.analysis || null;
    const hasVideoContext = state.referenceInputMode === 'video' || !!state.referenceVideoFile || !!analysis;

    if (!hasVideoContext) {
      videoInsightsCard.classList.remove('active');
      videoInsightsCard.style.display = 'none';
      return;
    }

    videoInsightsCard.classList.add('active');
    videoInsightsCard.style.display = '';

    const recommendedFrames = analysis?.slideshowBlueprint?.recommendedFrameCount ?? null;
    const latestScore = latestEntry?.score ?? null;
    const scoreTargetValue = parseInt(scoreTarget?.value, 10) || 8;

    if (!analysis) {
      videoInsightHeadline.textContent = 'Waiting for video analysis';
      videoInsightSummary.textContent = state.isGenerating
        ? 'Analyzing the reference video and mapping its structure into a slideshow reel.'
        : 'Upload a short MP4 or MOV and generate a draft to see how the reference maps into our slideshow reel blueprint.';
      videoInsightMeta.textContent = state.currentTemplate
        ? 'Draft ready • no structured video analysis attached'
        : 'Waiting for video analysis';
      videoInsightMetrics.innerHTML = '';
      videoInsightNotes.innerHTML = '';
      videoInsightNotes.classList.remove('active');
      videoInsightScore.style.display = 'none';
      videoInsightScore.textContent = '--';
      videoInsightScore.className = 'insight-score';
      return;
    }

    videoInsightHeadline.textContent = `Match profile: ${analysis.majorSceneCount} scenes with ${humanizeInsightValue(analysis.pacing)} pacing`;
    videoInsightSummary.textContent = latestEntry?.feedback
      || `Built for a ${humanizeInsightValue(analysis.orientation)} ${analysis.aspectRatio} reference with ${recommendedFrames ?? 'auto'} slideshow frames.`;

    const metaParts = [];
    if (latestScore != null) metaParts.push(`Latest review ${latestScore}/10`);
    const confidenceLabel = formatConfidence(analysis.confidence);
    if (confidenceLabel) metaParts.push(confidenceLabel);
    if (recommendedFrames != null) metaParts.push(`${recommendedFrames} recommended frames`);
    if (latestScore != null) metaParts.push(`Target ${scoreTargetValue}`);
    videoInsightMeta.textContent = metaParts.join(' • ') || 'Initial analysis ready';

    const metricItems = [
      ['Orientation', humanizeInsightValue(analysis.orientation)],
      ['Duration', humanizeInsightValue(analysis.durationBucket)],
      ['Pacing', humanizeInsightValue(analysis.pacing)],
      ['Scenes', String(analysis.majorSceneCount)],
      ['Frames', recommendedFrames != null ? String(recommendedFrames) : 'Auto'],
      ['Overlay', humanizeInsightValue(analysis.overlayTreatment)],
      ['CTA', humanizeInsightValue(analysis.ctaTreatment)],
      ['Palette', analysis.colorDirection?.accentHex || humanizeInsightValue(analysis.colorDirection?.mood)],
    ].filter(([, value]) => value && String(value).trim());

    videoInsightMetrics.innerHTML = metricItems.map(([label, value]) => `
      <span class="insight-chip">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(String(value))}</span>
      </span>
    `).join('');

    const noteLines = [];
    if (latestEntry?.feedback) noteLines.push(`Review: ${latestEntry.feedback}`);
    if (Array.isArray(analysis.notes)) {
      noteLines.push(...analysis.notes.slice(0, 3));
    }

    if (noteLines.length) {
      videoInsightNotes.innerHTML = `<strong>Notes</strong>${noteLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}`;
      videoInsightNotes.classList.add('active');
    } else {
      videoInsightNotes.innerHTML = '';
      videoInsightNotes.classList.remove('active');
    }

    if (latestScore != null) {
      videoInsightScore.textContent = `${latestScore}/10`;
      videoInsightScore.className = 'insight-score';
      if (latestScore >= 9) {
        videoInsightScore.classList.add('is-strong');
      } else if (latestScore >= 7) {
        videoInsightScore.classList.add('is-mid');
      }
      videoInsightScore.style.display = '';
    } else {
      videoInsightScore.textContent = '--';
      videoInsightScore.className = 'insight-score';
      videoInsightScore.style.display = 'none';
    }
  }

  function normalizePreviewResult(preview) {
    if (typeof preview === 'string') {
      return {
        previewBase64: preview,
        previewPosterBase64: preview,
        previewKind: 'image',
        previewUrl: '',
        previewWarning: '',
      };
    }

    return {
      previewBase64: preview?.previewBase64 || preview?.previewPosterBase64 || '',
      previewPosterBase64: preview?.previewPosterBase64 || preview?.previewBase64 || '',
      previewKind: preview?.previewKind || (preview?.previewUrl ? 'video' : 'image'),
      previewUrl: preview?.previewUrl || '',
      previewWarning: preview?.previewWarning || '',
    };
  }

  function buildPreviewStatusMessage(baseMessage, preview) {
    const normalized = normalizePreviewResult(preview);
    return normalized.previewWarning
      ? `${baseMessage} ${normalized.previewWarning}`
      : baseMessage;
  }

  function applyTemplateState(template, preview, options = {}) {
    const {
      score = null,
      feedback = null,
      label = 'Draft Update',
      resetHistory = false,
      syncFields = true,
      cleanCheckpoint = false,
      meta = {},
      frameIndex = 0,
      analysis = null,
    } = options;

    if (resetHistory) clearHistory();

    const normalizedPreview = normalizePreviewResult(preview);

    state.currentTemplate = template;
    state.currentPreview = normalizedPreview.previewBase64;
    state.currentPreviewKind = normalizedPreview.previewKind;
    state.currentPreviewVideoUrl = normalizedPreview.previewUrl;
    if (analysis) state.currentVideoAnalysis = analysis;
    state.previewStale = false;
    state.previewFrameIndex = frameIndex;

    if (cleanCheckpoint) {
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
    } else {
      state.sessionDirty = computeDirty(template);
    }

    showPreview(normalizedPreview);
    showJson(template);
    updatePreviewFrameControls(template);
    if (syncFields) syncApprovalFieldsFromTemplate(template, meta);
    addHistory(template, normalizedPreview, { score, feedback, label });
    updateStatus();
    scheduleDraftSave();
  }

  function getHandoffContext() {
    const context = typeof v2Bridge.getContext === 'function' ? (v2Bridge.getContext() || {}) : {};
    const exportUrl = (context.exportUrl || v2ExportUrlInput.value || '').trim();
    const linkedTemplateId = context.linkedTemplateId || deriveTemplateIdFromExportUrl(exportUrl);
    return { exportUrl, linkedTemplateId };
  }

  function deriveTemplateIdFromExportUrl(exportUrl) {
    const match = exportUrl.match(/\/render-templates\/([^/]+)\/export\/?$/);
    return match ? match[1] : '';
  }

  function updateHandoffCopyButtons() {
    const { linkedTemplateId, exportUrl } = getHandoffContext();
    btnCopyV2TemplateId.disabled = !linkedTemplateId;
    btnCopyV2ExportUrl.disabled = !exportUrl;
  }

  async function copyHandoffValue(kind) {
    const { linkedTemplateId, exportUrl } = getHandoffContext();
    const value = kind === 'templateId' ? linkedTemplateId : exportUrl;

    if (!value) {
      showToast(kind === 'templateId' ? 'No V2 template ID available yet' : 'No V2 export URL available yet', 'error');
      return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      showToast('Clipboard access is unavailable in this browser', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast(kind === 'templateId' ? 'V2 template ID copied' : 'V2 export URL copied', 'success');
    } catch (err) {
      showToast(err.message || 'Clipboard copy failed', 'error');
    }
  }

  async function fetchApi(path, body) {
    const res = await fetch(`/api/design${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': state.apiKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchMultipartApi(path, formData) {
    const res = await fetch(`/api/design${path}`, {
      method: 'POST',
      headers: {
        'X-Api-Key': state.apiKey,
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function buildVideoIterationFormData({
    feedback = '',
    iterationHistory = [],
    iterationNumber = 1,
    maxIterations = 8,
  } = {}) {
    if (!state.referenceVideoFile) {
      throw new Error('Add a reference video before running video review.');
    }
    if (!state.currentTemplate) {
      throw new Error('A current template is required before running video review.');
    }

    const formData = new FormData();
    formData.append('referenceVideo', state.referenceVideoFile);
    formData.append('existingTemplate', JSON.stringify(state.currentTemplate));
    formData.append('iterationHistory', JSON.stringify(iterationHistory));
    formData.append('iterationNumber', String(iterationNumber));
    formData.append('maxIterations', String(maxIterations));
    if (state.currentPreviewVideoUrl) {
      formData.append('previewVideoUrl', state.currentPreviewVideoUrl);
    } else if (state.currentPreview) {
      formData.append('previewImage', state.currentPreview);
    }
    if (promptInput.value.trim()) formData.append('prompt', promptInput.value.trim());
    if (feedback) formData.append('feedback', feedback);
    if (state.currentVideoAnalysis) formData.append('currentAnalysis', JSON.stringify(state.currentVideoAnalysis));
    return formData;
  }

  async function renderPreviewFromTemplate(template, { frameIndex = 0, previewMode = 'poster' } = {}) {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': state.apiKey,
      },
      body: JSON.stringify({ templateJson: template, frameIndex, previewMode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function getTemplateSourceMode() {
    if (state.sessionMode === 'v2') return 'v2_template';
    if (state.referenceVideoFile) return 'reference_video';
    if (state.referenceImage) return 'reference_image';
    if (promptInput.value.trim()) return 'prompt';
    return 'manual_json';
  }

  function buildTemplateFromForm({ forceOutputFormat } = {}) {
    if (!state.currentTemplate) return null;

    const template = { ...state.currentTemplate };
    if (saveName.value.trim()) template.name = saveName.value.trim();
    if (saveId.value.trim()) {
      template.id = saveId.value.trim();
      template.reference = saveId.value.trim();
    }

    const parsedImageCount = parseInt(saveImageCount.value, 10);
    template.imageCount = Number.isInteger(parsedImageCount) && parsedImageCount > 0
      ? parsedImageCount
      : template.imageCount || 1;

    if (forceOutputFormat) {
      template.outputFormat = forceOutputFormat;
    } else if (!template.outputFormat) {
      template.outputFormat = 'png';
    }

    return template;
  }

  function buildBlankTemplate(format = 'png') {
    if (format === 'mp4') {
      return {
        id: 'untitled-reel-template',
        reference: 'untitled-reel-template',
        name: 'Untitled Reel Template',
        outputFormat: 'mp4',
        width: 1080,
        height: 1920,
        imageCount: 4,
        fps: 30,
        transition: { type: 'fade', durationMs: 600 },
        frames: [
          {
            durationMs: 2000,
            background: { type: 'image', source: 'user_image', index: 0 },
            layers: [],
          },
          {
            durationMs: 2000,
            background: { type: 'image', source: 'user_image', index: 1 },
            layers: [],
          },
          {
            durationMs: 2000,
            background: { type: 'image', source: 'user_image', index: 2 },
            layers: [],
          },
          {
            durationMs: 2400,
            background: { type: 'solid', color: '#10151D' },
            layers: [],
          },
        ],
        categoryKeys: ['slideshow', 'reel', 'vertical_video'],
      };
    }

    return {
      id: 'untitled-template',
      reference: 'untitled-template',
      name: 'Untitled Template',
      outputFormat: 'png',
      width: 1080,
      height: 1080,
      imageCount: 1,
      frames: [
        {
          durationMs: 1000,
          background: { type: 'solid', color: '#10151D' },
          layers: [],
        },
      ],
      categoryKeys: [],
    };
  }

  function createBlankTemplateSession(format = 'png') {
    const isReelTemplate = format === 'mp4';
    if (hasRecoverableState() && !confirmAction(`Replace the current studio session with a new blank ${isReelTemplate ? 'reel' : 'template'}?`)) {
      return;
    }

    clearCurrentDraftState();

    const template = buildBlankTemplate(format);
    state.currentTemplate = template;
    state.currentPreview = null;
    state.currentPreviewKind = 'image';
    state.currentPreviewVideoUrl = '';
    state.previewStale = false;
    state.previewFrameIndex = 0;
    state.lastApprovedSnapshot = null;
    state.sessionDirty = true;

    showJson(template);
    syncApprovalFieldsFromTemplate(template);
    updatePreviewFrameControls(template);

    previewImage.src = '';
    previewImage.style.display = 'none';
    if (previewVideo) {
      previewVideo.src = '';
      previewVideo.style.display = 'none';
    }
    previewLoading.style.display = 'none';
    previewPlaceholder.style.display = '';
    previewPlaceholder.textContent = isReelTemplate
      ? 'Blank reel template ready. Re-render from JSON when you want a local video or poster-frame preview.'
      : 'Blank template ready. Re-render from JSON when you want a local preview.';

    setSessionMode('json', { focusTarget: saveName, openAdvanced: true });
    setPreviewStatus(
      isReelTemplate
        ? 'Blank reel draft ready. Approving from this session will create a new V2 video template when the studio connection is configured.'
        : 'Blank draft ready. Approving from this session will create a new V2 template when the studio connection is configured.',
      'info',
    );
    setHandoffStatus(
      isReelTemplate
        ? 'Blank reel draft ready. This session is not linked to an existing V2 template, so approval will create a new V2 video record.'
        : 'Blank draft ready. This session is not linked to an existing V2 template, so approval will create a new V2 record.',
      'info',
    );
    log(
      isReelTemplate
        ? 'Started a new blank reel draft for admin approval into V2.'
        : 'Started a new blank template draft for admin approval into V2.',
      'info',
    );
    updateStatus();
    scheduleDraftSave();
  }

  function openV2Admin() {
    try {
      v2Bridge.openAdmin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function renderLoadedV2Template(template, meta = {}) {
    showJson(template);
    syncApprovalFieldsFromTemplate(template, meta);
    state.previewFrameIndex = 0;
    updatePreviewFrameControls(template);

    const isMp4Template = template.outputFormat === 'mp4';
    if (!state.apiKey) {
      previewImage.src = '';
      previewImage.style.display = 'none';
      if (previewVideo) {
        previewVideo.src = '';
        previewVideo.style.display = 'none';
      }
      previewLoading.style.display = 'none';
      previewPlaceholder.style.display = '';
      previewPlaceholder.textContent = isMp4Template
        ? 'Template loaded. Add the render-engine API key to preview a local reel video or poster frame.'
        : 'Template loaded. Add the render-engine API key to preview it.';
      state.currentTemplate = template;
      state.currentPreview = null;
      state.currentPreviewKind = 'image';
      state.currentPreviewVideoUrl = '';
      state.previewStale = false;
      state.previewFrameIndex = 0;
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
      setPreviewStatus(
        isMp4Template
          ? 'Loaded from V2. Add the render-engine API key to render a local video preview or a poster frame for this MP4 template.'
          : 'Loaded from V2. Add the render-engine API key to render a local preview.',
        'warning',
      );
      updateStatus();
      scheduleDraftSave();
      return;
    }

    setGenerating(true, isMp4Template
      ? 'Loading approved V2 MP4 template preview…'
      : 'Loading approved V2 template preview…');

    try {
      const previewResult = await renderPreviewFromTemplate(template, {
        frameIndex: state.previewFrameIndex,
        previewMode: isMp4Template ? 'video' : 'poster',
      });
      applyTemplateState(template, previewResult, {
        feedback: 'Loaded from V2',
        label: 'Loaded from V2',
        resetHistory: true,
        cleanCheckpoint: true,
        meta,
        frameIndex: state.previewFrameIndex,
      });
      setPreviewStatus(
        buildPreviewStatusMessage(isMp4Template ? 'Loaded from V2 and rendered locally for MP4 authoring review.' : 'Loaded from V2 and rendered locally with sample assets for authoring review.', previewResult),
        'info',
      );
      log('Loaded approved template preview from V2', 'info');
    } catch (err) {
      state.currentTemplate = template;
      state.currentPreview = null;
      state.currentPreviewKind = 'image';
      state.currentPreviewVideoUrl = '';
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
      state.previewStale = false;
      setPreviewStatus(`V2 template loaded, but preview rendering failed: ${err.message}`, 'error');
      log(`Preview load failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
      updateStatus();
    } finally {
      setGenerating(false);
    }
  }

  function clearCurrentDraftState() {
    clearReferenceImage();
    clearReferenceVideo();
    state.currentVideoAnalysis = null;
    state.currentTemplate = null;
    state.currentPreview = null;
    state.currentPreviewKind = 'image';
    state.currentPreviewVideoUrl = '';
    state.history = [];
    state.activeHistoryIndex = -1;
    state.iterationHistory = [];
    state.previewStale = false;
    state.previewFrameIndex = 0;
    state.lastApprovedSnapshot = null;
    state.sessionDirty = false;
    state.generatedSaveId = '';
    state.saveIdTouched = false;

    promptInput.value = '';
    feedbackInput.value = '';
    jsonEditor.value = '';
    jsonEditor.disabled = true;
    saveName.value = '';
    saveId.value = '';
    saveImageCount.value = '1';
    if (fileInput) fileInput.value = '';
    if (videoFileInput) videoFileInput.value = '';
    previewImage.src = '';
    previewImage.style.display = 'none';
    if (previewVideo) {
      previewVideo.src = '';
      previewVideo.style.display = 'none';
    }
    previewPlaceholder.style.display = '';
    previewPlaceholder.textContent = 'No preview yet';
    previewLoading.style.display = 'none';
    setPreviewStatus('', '');
    setHandoffStatus('', '');
    v2Bridge.setExportUrl('');
    setReferenceInputMode('image');
    renderReferenceState();
    updatePreviewFrameControls(null);
    renderHistory();
  }

  function restoreSavedDraft() {
    const draft = readSavedDraft();
    if (!draft) {
      refreshSavedDraftMeta();
      return;
    }

    if (hasRecoverableState() && !confirmAction('Replace the current studio session with the saved draft?')) {
      return;
    }

    clearCurrentDraftState();
    state.referenceImage = draft.referenceImage || null;
    promptInput.value = draft.prompt || '';
    state.lastApprovedSnapshot = draft.lastApprovedSnapshot || null;
    state.sessionDirty = Boolean(draft.sessionDirty);
    state.previewStale = Boolean(draft.previewStale);
    state.previewFrameIndex = Number.isInteger(draft.previewFrameIndex) ? draft.previewFrameIndex : 0;
    state.currentPreviewKind = draft.currentPreviewKind || 'image';
    state.currentPreviewVideoUrl = draft.currentPreviewVideoUrl || '';
    state.currentVideoAnalysis = draft.currentVideoAnalysis || null;
    state.generatedSaveId = draft.generatedSaveId || '';
    state.saveIdTouched = Boolean(draft.saveIdTouched);
    setReferenceInputMode(draft.referenceInputMode || 'image');

    if (draft.handoff?.exportUrl) {
      v2Bridge.setExportUrl(draft.handoff.exportUrl);
    }

    saveName.value = draft.handoff?.saveName || '';
    saveId.value = draft.handoff?.saveId || '';
    saveImageCount.value = draft.handoff?.saveImageCount || '1';
    renderReferenceState();

    if (draft.currentTemplate) {
      state.currentTemplate = draft.currentTemplate;
      state.currentPreview = draft.currentPreview || null;
      showJson(draft.currentTemplate);
      if (draft.jsonEditorValue) jsonEditor.value = draft.jsonEditorValue;
      updatePreviewFrameControls(draft.currentTemplate);

      if (draft.currentPreview || state.currentPreviewVideoUrl) {
        showPreview({
          previewBase64: draft.currentPreview || '',
          previewPosterBase64: draft.currentPreview || '',
          previewKind: state.currentPreviewKind || 'image',
          previewUrl: state.currentPreviewVideoUrl || '',
        });
        addHistory(draft.currentTemplate, {
          previewBase64: draft.currentPreview || '',
          previewPosterBase64: draft.currentPreview || '',
          previewKind: state.currentPreviewKind || 'image',
          previewUrl: state.currentPreviewVideoUrl || '',
        }, { label: 'Restored Draft' });
      } else {
        previewPlaceholder.style.display = '';
        previewPlaceholder.textContent = 'Draft restored. Re-render to verify the current JSON.';
      }
    }

    setSessionMode(draft.sessionMode || 'reference', { openAdvanced: draft.sessionMode === 'json' });

    if (state.previewStale && state.currentTemplate) {
      setPreviewStatus('Draft restored. The preview is stale; re-render before approving.', 'warning');
    } else if (state.currentTemplate) {
      setPreviewStatus('Draft restored from local recovery.', 'info');
    }

    updateStatus();
    scheduleDraftSave();
    showToast('Draft restored', 'success');
  }

  function discardSavedDraft() {
    if (!confirmAction('Discard the saved local recovery snapshot?')) return;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    state.savedDraftMeta = null;
    updateDraftRecoveryUI();
    showToast('Saved draft discarded', 'success');
  }

  async function loadApprovedTemplateFromV2(explicitExportUrl) {
    setSessionMode('v2', { focusTarget: v2ExportUrlInput });

    try {
      const { template, meta } = await v2Bridge.loadTemplate(explicitExportUrl);
      const loadedId = meta.id || template.reference || template.id || 'unknown';
      const { exportUrl } = getHandoffContext();
      clearHistory();

      setHandoffStatus(
        `Loaded V2 template <code>${escapeHtml(loadedId)}</code>.${exportUrl ? ` Export URL: <code>${escapeHtml(exportUrl)}</code>` : ''}`,
        'info',
      );
      updateHandoffCopyButtons();
      await renderLoadedV2Template(template, meta);
    } catch (err) {
      setHandoffStatus(`V2 load failed: ${escapeHtml(err.message)}`, 'error');
      log(`V2 load failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function generate() {
    const trimmedPrompt = promptInput.value.trim();
    const hasReferenceImage = !!state.referenceImage;
    const hasReferenceVideo = !!state.referenceVideoFile;
    const hasReference = hasReferenceImage || hasReferenceVideo;
    if (!hasReference && !trimmedPrompt) return;

    beginFreshSession(hasReference ? 'reference' : state.sessionMode);
    setGenerating(true,
      hasReferenceVideo
        ? 'Analyzing reference video…'
        : hasReferenceImage
          ? 'Analyzing reference image…'
          : 'Generating template from prompt…');
    log(
      hasReferenceVideo
        ? 'Generating reel template from reference video…'
        : hasReferenceImage
          ? 'Generating template from reference image…'
          : 'Generating template from prompt…',
      'info',
    );

    try {
      const result = hasReferenceVideo
        ? await (async () => {
          const formData = new FormData();
          formData.append('referenceVideo', state.referenceVideoFile);
          if (trimmedPrompt) formData.append('prompt', trimmedPrompt);
          return fetchMultipartApi('/video', formData);
        })()
        : hasReferenceImage
          ? await fetchApi('/vision', {
            referenceImage: state.referenceImage,
            prompt: trimmedPrompt || undefined,
          })
          : await fetchApi('', {
            prompt: trimmedPrompt,
          });

      applyTemplateState(result.template, result, {
        label: 'Generated Draft',
        resetHistory: true,
        analysis: result.analysis || null,
      });
      log(`Template generated: "${result.template.name}" (${result.template.imageCount} images)`, 'info');
      if (result.analysis) {
        log(`Video analysis: ${result.analysis.majorSceneCount} scenes, ${result.analysis.pacing} pacing, ${result.analysis.slideshowBlueprint.recommendedFrameCount} recommended frames.`, 'info');
        if (Array.isArray(result.analysis.notes) && result.analysis.notes.length) {
          log(`Notes: ${result.analysis.notes.join(' ')}`, 'info');
        }
        setPreviewStatus(
          `Reference video analyzed. Generated a ${result.template.frames.length}-frame slideshow reel inspired by the source structure.`,
          'info',
        );
      }

      setGenerating(false);

      if (state.autoIterateEnabled && (hasReferenceImage || hasReferenceVideo)) {
        await autoIterate();
      }
    } catch (err) {
      setGenerating(false);
      log(`Generation failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function manualIterate() {
    const feedback = feedbackInput.value.trim();
    if (!feedback || !state.currentTemplate) return;
    if (state.referenceVideoFile) {
      setSessionMode('reference');
      setGenerating(true, 'Reviewing generated reel against reference video…');
      log(`Iterating video draft: "${feedback}"`, 'info');

      try {
        const result = await fetchMultipartApi('/video/compare-iterate', buildVideoIterationFormData({
          feedback,
          iterationHistory: state.iterationHistory,
          iterationNumber: state.iterationHistory.length + 1,
          maxIterations: parseInt(maxIterations.value, 10) || 8,
        }));

        if (result.template) {
          applyTemplateState(result.template, result, {
            feedback: result.feedback || feedback,
            label: 'Manual Video Refinement',
            analysis: result.analysis || null,
          });
          if (result.analysis) {
            log(`Video analysis: ${result.analysis.majorSceneCount} scenes, ${result.analysis.pacing} pacing.`, 'info');
          }
          setPreviewStatus('Reference video review applied. Preview updated to reflect the revised reel blueprint.', 'info');
        }

        feedbackInput.value = '';
        log(`Video iteration complete (${result.score || 'n/a'}/10)`, 'info');
        setGenerating(false);
        return;
      } catch (err) {
        setGenerating(false);
        log(`Video iteration failed: ${err.message}`, 'error');
        showToast(err.message, 'error');
        return;
      }
    }

    if (!state.referenceImage) {
      setPreviewStatus('Add a reference image before running another refinement pass.', 'warning');
      showToast('Add a reference image before refining', 'error');
      return;
    }

    setSessionMode('reference');
    setGenerating(true, 'Iterating template…');
    log(`Iterating: "${feedback}"`, 'info');

    try {
      const result = await fetchApi('/vision/iterate', {
        referenceImage: state.referenceImage,
        previewImage: state.currentPreview,
        feedback,
        existingTemplate: state.currentTemplate,
      });

      applyTemplateState(result.template, result, {
        feedback,
        label: 'Manual Refinement',
      });
      feedbackInput.value = '';
      log('Iteration complete', 'info');
      setGenerating(false);
    } catch (err) {
      setGenerating(false);
      log(`Iteration failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function autoIterate() {
    if ((!state.referenceImage && !state.referenceVideoFile) || !state.currentTemplate) return;

    state.isAutoIterating = true;
    state.iterationHistory = [];
    updateStatus();

    const max = parseInt(maxIterations.value, 10) || 8;
    const target = parseInt(scoreTarget.value, 10) || 8;

    log(`Starting auto-iteration (max ${max}, target score ${target})…`, 'info');

    for (let i = 0; i < max; i++) {
      if (!state.isAutoIterating) {
        log('Auto-iteration stopped by user', 'info');
        break;
      }

      const iterNum = i + 1;
      const phase = iterNum <= 2 ? 'Layout' : iterNum <= 4 ? 'Spacing' : 'Fine-tune';
      const phaseClass = iterNum <= 2 ? 'phase-layout' : iterNum <= 4 ? 'phase-spacing' : 'phase-finetune';

      let plateauWarning = false;
      if (state.iterationHistory.length >= 2) {
        const last = state.iterationHistory[state.iterationHistory.length - 1];
        const prev = state.iterationHistory[state.iterationHistory.length - 2];
        if (last.score <= prev.score) {
          plateauWarning = true;
          log('Plateau detected. Requesting a different refinement approach.', 'plateau');
        }
      }

      setGenerating(true, `Iteration ${iterNum}/${max}: ${phase} pass…`);
      log(`Iteration ${iterNum}/${max} <span class="phase-badge ${phaseClass}">${phase}</span>${plateauWarning ? ' [PLATEAU]' : ''}`, 'info');

      let result;
      try {
        result = state.referenceVideoFile
          ? await fetchMultipartApi('/video/compare-iterate', buildVideoIterationFormData({
              iterationHistory: state.iterationHistory,
              iterationNumber: iterNum,
              maxIterations: max,
              feedback: plateauWarning ? 'Try a meaningfully different slideshow structure for the next revision.' : '',
            }))
          : await fetchApi('/vision/compare-iterate', {
              referenceImage: state.referenceImage,
              previewImage: state.currentPreview,
              existingTemplate: state.currentTemplate,
              iterationHistory: state.iterationHistory,
              iterationNumber: iterNum,
              maxIterations: max,
              plateauWarning,
            });
      } catch (err) {
        log(`Iteration failed: ${err.message}`, 'error');
        break;
      }

      log(`Score: ${result.score}/10`, 'score');
      if (result.feedback) log(`Feedback: ${result.feedback}`, 'info');
      if (result.changesApplied) log(`Changes: ${result.changesApplied}`, 'info');

      state.iterationHistory.push({
        iteration: iterNum,
        score: result.score,
        feedback: result.feedback || '',
        changesApplied: result.changesApplied || '',
      });

      if (result.template && (result.previewBase64 || result.previewUrl)) {
        applyTemplateState(result.template, result, {
          score: result.score,
          feedback: result.feedback,
          label: `Iteration ${iterNum}`,
          analysis: result.analysis || null,
        });
        if (result.analysis) {
          log(`Video analysis: ${result.analysis.majorSceneCount} scenes, ${result.analysis.pacing} pacing.`, 'info');
        }
      }

      if (result.score >= target) {
        log(`Score ${result.score}/10 reached target ${target}. Auto-iteration complete.`, 'info');
        showToast(`Design converged. Score: ${result.score}/10`, 'success');
        break;
      }

      if (!result.shouldContinue) {
        log(`Score ${result.score}/10. Model says no further improvements are likely.`, 'info');
        showToast(`Best achievable: ${result.score}/10`, 'success');
        break;
      }
    }

    state.isAutoIterating = false;
    setGenerating(false);
    log('Auto-iteration ended', 'info');
  }

  async function rerenderFromJson() {
    let template;
    try {
      template = JSON.parse(jsonEditor.value);
    } catch {
      showToast('Invalid JSON', 'error');
      return;
    }

    setSessionMode('json', { openAdvanced: true });
    setGenerating(true, 'Re-rendering JSON draft…');

    try {
      const previewResult = await renderPreviewFromTemplate(template, {
        frameIndex: state.previewFrameIndex,
        previewMode: template.outputFormat === 'mp4' ? 'video' : 'poster',
      });
      applyTemplateState(template, previewResult, {
        label: 'Manual JSON Render',
        frameIndex: state.previewFrameIndex,
      });
      setPreviewStatus(
        buildPreviewStatusMessage(
          template.outputFormat === 'mp4'
            ? 'Re-rendered locally for reel review.'
            : 'Re-rendered locally from edited JSON.',
          previewResult,
        ),
        'info',
      );
      log('Re-rendered from edited JSON', 'info');
      setGenerating(false);
    } catch (err) {
      setGenerating(false);
      log(`Re-render failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function approveTemplateForV2() {
    if (!state.currentTemplate) return;

    if (state.previewStale) {
      setHandoffStatus('Approve for V2 failed: Re-render the edited JSON so the preview matches the draft before approval.', 'error');
      showToast('Re-render the edited JSON before approval', 'error');
      return;
    }

    const trimmedName = saveName.value.trim();
    const trimmedId = saveId.value.trim();
    const parsedImageCount = parseInt(saveImageCount.value, 10);

    if (!trimmedName) {
      setHandoffStatus('Approve for V2 failed: Template name is required.', 'error');
      showToast('Template name is required', 'error');
      return;
    }

    if (!trimmedId) {
      setHandoffStatus('Approve for V2 failed: Template ID is required.', 'error');
      showToast('Template ID is required', 'error');
      return;
    }

    if (!Number.isInteger(parsedImageCount) || parsedImageCount < 1) {
      setHandoffStatus('Approve for V2 failed: Image count must be a whole number of at least 1.', 'error');
      showToast('Image count must be a whole number of at least 1', 'error');
      return;
    }

    const template = buildTemplateFromForm();
    setApproving(true);

    try {
      const { result, exportUrl } = await v2Bridge.approveTemplate({
        template,
        reference: trimmedId || template.reference || template.id,
        name: trimmedName || template.name || template.id,
        imageCount: template.imageCount,
        outputFormat: template.outputFormat,
        sourceMode: getTemplateSourceMode(),
        sourcePrompt: promptInput.value.trim() || undefined,
      });

      state.currentTemplate = template;
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
      state.previewStale = false;

      const approvedId = result.id || template.reference || template.id;
      setHandoffStatus(
        `Approved in V2 as <code>${escapeHtml(String(approvedId))}</code>.${exportUrl ? ` Export URL: <code>${escapeHtml(exportUrl)}</code>` : ''}`,
        'success',
      );
      updateHandoffCopyButtons();
      log(`Approved for V2: ${result.id} (${result.mode})`, 'info');
      showToast(`Approved for V2: ${result.id}`, 'success');
      updateStatus();
      scheduleDraftSave();
    } catch (err) {
      setHandoffStatus(`Approve for V2 failed: ${escapeHtml(err.message)}`, 'error');
      log(`Approve for V2 failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      setApproving(false);
    }
  }

  function showPreview(preview) {
    const normalizedPreview = normalizePreviewResult(preview);
    const shouldShowVideo = normalizedPreview.previewKind === 'video' && normalizedPreview.previewUrl;

    if (shouldShowVideo && previewVideo) {
      previewVideo.src = normalizedPreview.previewUrl;
      previewVideo.poster = normalizedPreview.previewPosterBase64 || normalizedPreview.previewBase64 || '';
      previewVideo.style.display = '';
      previewImage.style.display = 'none';
      if (typeof previewVideo.load === 'function') previewVideo.load();
    } else {
      stopPreviewVideo();
      if (previewVideo) {
        previewVideo.src = '';
        previewVideo.style.display = 'none';
      }
      previewImage.src = normalizedPreview.previewPosterBase64 || normalizedPreview.previewBase64;
      previewImage.style.display = '';
    }

    previewPlaceholder.style.display = 'none';
    previewLoading.style.display = 'none';
  }

  function showJson(template) {
    jsonEditor.value = JSON.stringify(template, null, 2);
    jsonEditor.disabled = false;
  }

  function addHistory(template, preview, options = {}) {
    const normalizedPreview = normalizePreviewResult(preview);
    if (!normalizedPreview.previewBase64 && !normalizedPreview.previewUrl) return;

    const entry = {
      template,
      previewBase64: normalizedPreview.previewBase64,
      previewKind: normalizedPreview.previewKind,
      previewUrl: normalizedPreview.previewUrl,
      analysis: state.currentVideoAnalysis,
      score: options.score ?? null,
      feedback: options.feedback ?? null,
      label: options.label || 'Draft Update',
      frameIndex: state.previewFrameIndex,
    };

    state.history.push(entry);
    state.activeHistoryIndex = state.history.length - 1;
    renderHistory();
  }

  function renderHistory() {
    if (state.history.length === 0) {
      historyStrip.innerHTML = '<div style="color:var(--text-dim); font-size:12px; padding:20px 0;">No iterations yet</div>';
      return;
    }

    historyStrip.innerHTML = state.history.map((entry, index) => `
      <button class="history-card${index === state.activeHistoryIndex ? ' active' : ''}" data-index="${index}" type="button">
        <img src="${entry.previewBase64}" alt="${escapeHtml(entry.label)}">
        <div class="history-meta">
          <strong>${escapeHtml(entry.label)}</strong>
          <span>#${index + 1}${entry.score != null ? ` <span class="score">${entry.score}/10</span>` : ''}</span>
        </div>
      </button>
    `).join('');

    historyStrip.querySelectorAll('.history-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index, 10);
        selectHistory(idx);
      });
    });

    historyStrip.scrollLeft = historyStrip.scrollWidth;
  }

  function selectHistory(idx) {
    const entry = state.history[idx];
    if (!entry) return;

    state.activeHistoryIndex = idx;
    state.currentTemplate = entry.template;
    state.currentPreview = entry.previewBase64;
    state.currentPreviewKind = entry.previewKind || 'image';
    state.currentPreviewVideoUrl = entry.previewUrl || '';
    state.currentVideoAnalysis = entry.analysis || null;
    state.previewStale = false;
    state.previewFrameIndex = entry.frameIndex || 0;
    state.sessionDirty = computeDirty(entry.template);

    showPreview({
      previewBase64: entry.previewBase64,
      previewPosterBase64: entry.previewBase64,
      previewKind: entry.previewKind || 'image',
      previewUrl: entry.previewUrl || '',
    });
    showJson(entry.template);
    updatePreviewFrameControls(entry.template);
    syncApprovalFieldsFromTemplate(entry.template);
    renderHistory();
    updateStatus();
    scheduleDraftSave();
  }

  function formatFrameDuration(frame) {
    const durationMs = Number(frame?.durationMs || 0);
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  function updatePreviewFrameControls(template) {
    if (!previewFrameControls || !previewFrameSelect) return;

    const isMultiFrameMp4 = Boolean(
      template &&
      template.outputFormat === 'mp4' &&
      Array.isArray(template.frames) &&
      template.frames.length > 1,
    );

    if (!isMultiFrameMp4) {
      previewFrameControls.style.display = 'none';
      previewFrameSelect.disabled = true;
      previewFrameSelect.innerHTML = '';
      state.previewFrameIndex = 0;
      return;
    }

    previewFrameControls.style.display = '';
    previewFrameSelect.innerHTML = template.frames.map((frame, index) => {
      return `<option value="${index}">Frame ${index + 1} (${formatFrameDuration(frame)})</option>`;
    }).join('');

    if (state.previewFrameIndex >= template.frames.length) {
      state.previewFrameIndex = 0;
    }

    previewFrameSelect.value = String(state.previewFrameIndex);
    previewFrameSelect.disabled = !state.apiKey || state.isGenerating || state.isApproving;
  }

  async function renderSelectedPreviewFrame() {
    if (!state.currentTemplate || state.currentTemplate.outputFormat !== 'mp4') return;

    const nextFrameIndex = parseInt(previewFrameSelect.value, 10);
    if (!Number.isInteger(nextFrameIndex)) return;

    state.previewFrameIndex = nextFrameIndex;
    updatePreviewFrameControls(state.currentTemplate);

    if (!state.apiKey) {
      setPreviewStatus(`Frame ${nextFrameIndex + 1} selected. Add the render-engine API key to render that poster frame locally.`, 'warning');
      return;
    }

    setGenerating(true, `Rendering frame ${nextFrameIndex + 1} preview…`);

    try {
      const previewResult = await renderPreviewFromTemplate(state.currentTemplate, {
        frameIndex: nextFrameIndex,
        previewMode: 'poster',
      });
      state.currentPreview = previewResult.previewBase64;
      state.currentPreviewKind = previewResult.previewKind || 'image';
      state.currentPreviewVideoUrl = previewResult.previewUrl || '';
      showPreview(previewResult);
      setPreviewStatus(`Showing frame ${nextFrameIndex + 1} of ${state.currentTemplate.frames.length} for local poster-frame review.`, 'info');
      updateStatus();
      scheduleDraftSave();
    } catch (err) {
      setPreviewStatus(`Poster-frame preview failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      setGenerating(false);
      updatePreviewFrameControls(state.currentTemplate);
    }
  }

  function log(msg, type) {
    const cls = type === 'score'
      ? 'log-score'
      : type === 'error'
        ? 'log-error'
        : type === 'plateau'
          ? 'log-plateau'
          : 'log-info';
    const time = new Intl.DateTimeFormat([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
    const div = document.createElement('div');
    div.className = 'log-entry';
    const safeMsg = msg.includes('<span') ? msg : escapeHtml(msg);
    div.innerHTML = `<span style="color:var(--text-dim)">${time}</span> <span class="${cls}">${safeMsg}</span>`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
})();
