(function() {
  'use strict';

  const bootstrap = window.__TEMPLATE_LAB_BOOTSTRAP__ || {};

  const state = {
    apiKey: localStorage.getItem('designer_api_key') || String(bootstrap.renderApiKey || '').trim(),
    referenceInputMode: 'video',
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
    appWorkspace: 'studio',
    providerLabProviders: [],
    providerLabTemplateId: '',
    providerLabSnapshot: null,
    providerLabPreview: null,
    providerLabRecentPosts: [],
    providerLabRuns: [],
    providerLabBusy: false,
    providerLabRecentBusy: false,
    providerLabProvidersBusy: false,
    providerLabComparePrimaryRunId: '',
    providerLabCompareSecondaryRunId: '',
    lastApprovedSnapshot: null,
    sessionDirty: false,
    previewStale: false,
    previewFrameIndex: 0,
    generatedSaveId: '',
    saveIdTouched: false,
    savedDraftMeta: null,
    chatSessionId: '',
    chatMessages: [],
    isChatSending: false,
    visualUndoStack: [],
    visualRedoStack: [],
    previewMode: localStorage.getItem('designer_preview_mode') || 'view',
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
  const progressStepReference = $('#progressStepReference');
  const progressStepGenerate = $('#progressStepGenerate');
  const progressStepApprove = $('#progressStepApprove');
  const apiKeyBanner = $('#apiKeyBanner');
  const btnBannerOpenSettings = $('#btnBannerOpenSettings');
  const draftRestore = $('#draftRestore');
  const draftRestoreTitle = $('#draftRestoreTitle');
  const draftRestoreMeta = $('#draftRestoreMeta');
  const btnRestoreDraft = $('#btnRestoreDraft');
  const btnDiscardDraft = $('#btnDiscardDraft');
  const btnAppTabStudio = $('#btnAppTabStudio');
  const btnAppTabProviderLab = $('#btnAppTabProviderLab');
  const studioLayout = $('#studioLayout');
  const providerLabSection = $('#providerLabSection');
  const workspaceTitle = $('#workspaceTitle');
  const workspaceLinkedLabel = $('#workspaceLinkedLabel');
  const advancedJsonPanel = $('#advancedJsonPanel');
  const previewTabView = $('#previewTabView');
  const previewTabEdit = $('#previewTabEdit');
  const previewTabCompare = $('#previewTabCompare');
  const previewLive = $('#previewLive');
  const previewEdit = $('#previewEdit');
  const approveFooter = $('#approveFooter');
  const previewGeneratedLabel = $('#previewGeneratedLabel');
  const approveFooterName = $('#approveFooterName');
  const approveFooterDetails = $('#approveFooterDetails');

  const referenceModeVideo = $('#referenceModeVideo');
  const referenceModePrompt = $('#referenceModePrompt');
  const referenceModeBlank = $('#referenceModeBlank');
  const referenceModeV2 = $('#referenceModeV2');
  const referenceVideoPanel = $('#referenceVideoPanel');
  const referencePromptPanel = $('#referencePromptPanel');
  const referenceBlankPanel = $('#referenceBlankPanel');
  const referenceV2Panel = $('#referenceV2Panel');
  const sourceGenerateRegion = $('#sourceGenerateRegion');
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
  const btnNewReelTemplate = $('#btnNewReelTemplate');
  const historyStrip = $('#historyStrip');
  const videoInsightsCard = $('#videoInsightsCard');
  const videoInsightHeadline = $('#videoInsightHeadline');
  const videoInsightSummary = $('#videoInsightSummary');
  const videoInsightScore = $('#videoInsightScore');
  const videoInsightMeta = $('#videoInsightMeta');
  const videoInsightMetrics = $('#videoInsightMetrics');
  const videoInsightNotes = $('#videoInsightNotes');
  const refPlaceholder = $('#refPlaceholder');
  const refVideo = $('#refVideo');
  const previewPlaceholder = $('#previewPlaceholder');
  const previewLoading = $('#previewLoading');
  const previewImage = $('#previewImage');
  const previewVideo = $('#previewVideo');
  const previewFrameControls = $('#previewFrameControls');
  const previewFrameSelect = $('#previewFrameSelect');
  const previewStatus = $('#previewStatus');
  const canvasEditorHost = $('#canvasEditorHost');
  const canvasEditorEmpty = $('#canvasEditorEmpty');
  const canvasEditorSummary = $('#canvasEditorSummary');
  const canvasEditorStatus = $('#canvasEditorStatus');
  const canvasLayerList = $('#canvasLayerList');
  const btnCanvasLayerUp = $('#btnCanvasLayerUp');
  const btnCanvasLayerDown = $('#btnCanvasLayerDown');
  const btnCanvasLayerHide = $('#btnCanvasLayerHide');
  const btnCanvasLayerLock = $('#btnCanvasLayerLock');
  const btnCanvasUndo = $('#btnCanvasUndo');
  const btnCanvasRedo = $('#btnCanvasRedo');
  const canvasFieldX = $('#canvasFieldX');
  const canvasFieldY = $('#canvasFieldY');
  const canvasFieldWidth = $('#canvasFieldWidth');
  const canvasFieldHeight = $('#canvasFieldHeight');
  const canvasFieldOpacity = $('#canvasFieldOpacity');
  const canvasFieldBorderRadius = $('#canvasFieldBorderRadius');
  const canvasFieldFontSize = $('#canvasFieldFontSize');
  const canvasFieldLineHeight = $('#canvasFieldLineHeight');
  const canvasFieldLetterSpacing = $('#canvasFieldLetterSpacing');
  const canvasFieldAlign = $('#canvasFieldAlign');
  const canvasFieldFit = $('#canvasFieldFit');
  const canvasFieldShadowBlur = $('#canvasFieldShadowBlur');
  const canvasFieldFontFamily = $('#canvasFieldFontFamily');
  const canvasFieldTextColor = $('#canvasFieldTextColor');
  const canvasFieldFillColor = $('#canvasFieldFillColor');
  const canvasFieldContent = $('#canvasFieldContent');
  const canvasAssetSelect = $('#canvasAssetSelect');
  const btnAddCanvasAsset = $('#btnAddCanvasAsset');
  const canvasAssetUploadInput = $('#canvasAssetUploadInput');
  const btnUploadCanvasAsset = $('#btnUploadCanvasAsset');
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
  const chatThread = $('#chatThread');
  const chatEmptyState = $('#chatEmptyState');
  const chatInput = $('#chatInput');
  const btnSendChat = $('#btnSendChat');
  const chatStatus = $('#chatStatus');
  const providerLabProvider = $('#providerLabProvider');
  const providerLabTemplate = $('#providerLabTemplate');
  const providerLabPostId = $('#providerLabPostId');
  const btnRefreshProviderLabRecent = $('#btnRefreshProviderLabRecent');
  const btnPreviewProviderLab = $('#btnPreviewProviderLab');
  const btnRenderProviderLab = $('#btnRenderProviderLab');
  const btnLoadProviderLabPost = $('#btnLoadProviderLabPost');
  const providerLabStatus = $('#providerLabStatus');
  const providerLabPreviewMeta = $('#providerLabPreviewMeta');
  const providerLabRecentList = $('#providerLabRecentList');
  const providerLabSnapshotPreview = $('#providerLabSnapshotPreview');
  const providerLabPreviewVideo = $('#providerLabPreviewVideo');
  const providerLabPreviewPoster = $('#providerLabPreviewPoster');
  const providerLabRunList = $('#providerLabRunList');
  const providerLabComparePrimaryMeta = $('#providerLabComparePrimaryMeta');
  const providerLabComparePrimaryVideo = $('#providerLabComparePrimaryVideo');
  const providerLabComparePrimaryPoster = $('#providerLabComparePrimaryPoster');
  const providerLabCompareSecondaryMeta = $('#providerLabCompareSecondaryMeta');
  const providerLabCompareSecondaryVideo = $('#providerLabCompareSecondaryVideo');
  const providerLabCompareSecondaryPoster = $('#providerLabCompareSecondaryPoster');

  const v2Bridge = window.createTemplateLabV2Bridge({
    storage: window.localStorage,
    fetchImpl: window.fetch.bind(window),
    getApiKey: () => state.apiKey,
    initialBaseUrl: bootstrap.v2BaseUrl || '',
    serverV2Proxy: Boolean(bootstrap.v2ServerProxyEnabled),
  });

  const STUDIO_DECORATIVE_ASSETS = [
    { label: 'Reference Badge', assetUrl: '/designer-assets/test-reference.png' },
    { label: 'Landscape CTA', assetUrl: '/designer-assets/landscape_cta.png' },
  ];

  if (canvasAssetSelect && !canvasAssetSelect.innerHTML.trim()) {
    canvasAssetSelect.innerHTML = STUDIO_DECORATIVE_ASSETS.map((asset) => {
      return `<option value="${asset.assetUrl}">${asset.label}</option>`;
    }).join('');
  }

  const canvasEditor = typeof window.createTemplateLabCanvasEditor === 'function'
    ? window.createTemplateLabCanvasEditor({
        stageHost: canvasEditorHost,
        emptyState: canvasEditorEmpty,
        summary: canvasEditorSummary,
        layerList: canvasLayerList,
        status: canvasEditorStatus,
        layerActions: {
          moveUpButton: btnCanvasLayerUp,
          moveDownButton: btnCanvasLayerDown,
          toggleVisibilityButton: btnCanvasLayerHide,
          toggleLockButton: btnCanvasLayerLock,
        },
        historyActions: {
          onUndoRequest: undoVisualEdit,
          onRedoRequest: redoVisualEdit,
        },
        fields: {
          x: canvasFieldX,
          y: canvasFieldY,
          width: canvasFieldWidth,
          height: canvasFieldHeight,
          opacity: canvasFieldOpacity,
          borderRadius: canvasFieldBorderRadius,
          fontSize: canvasFieldFontSize,
          lineHeight: canvasFieldLineHeight,
          letterSpacing: canvasFieldLetterSpacing,
          align: canvasFieldAlign,
          fit: canvasFieldFit,
          shadowBlur: canvasFieldShadowBlur,
          fontFamily: canvasFieldFontFamily,
          textColor: canvasFieldTextColor,
          fillColor: canvasFieldFillColor,
          content: canvasFieldContent,
        },
        assetPicker: {
          select: canvasAssetSelect,
          addButton: btnAddCanvasAsset,
          uploadInput: canvasAssetUploadInput,
          uploadButton: btnUploadCanvasAsset,
        },
        onTemplateChange: handleCanvasTemplateChange,
      })
    : null;

  const SESSION_COPY = {
    reference: {
      pill: 'Reel Draft',
      helper: 'Start with a reference video to create a new reel template session.',
      title: 'Reference-led draft',
      lead: 'Generate a first pass from a target reel style, then use the local preview to decide when the draft is ready.',
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
  setAppWorkspace('studio');
  setReferenceInputMode('video');
  setSessionMode('reference');
  setPreviewMode(state.previewMode);
  renderHistory();
  renderChatMessages();
  updateStatus();
  initializeTemplateLabBridge();
  if (bootstrap.renderApiKey || bootstrap.v2BaseUrl) {
    log('Studio defaults loaded automatically from the server.', 'info');
  }

  applyStudioUrlState();
  function bindEvents() {
    if (btnAppTabStudio) {
      btnAppTabStudio.addEventListener('click', () => {
        setAppWorkspace('studio');
        syncAppWorkspaceRoute();
      });
    }

    if (btnAppTabProviderLab) {
      btnAppTabProviderLab.addEventListener('click', () => {
        setAppWorkspace('provider-lab');
        syncAppWorkspaceRoute();
      });
    }

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
        const focusTarget = state.referenceInputMode === 'prompt'
          ? promptInput
          : state.referenceInputMode === 'v2'
            ? v2ExportUrlInput
            : videoFileInput;
        setSessionMode('reference', { focusTarget });
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

    if (referenceModeVideo) {
      referenceModeVideo.addEventListener('click', () => {
        setReferenceInputMode('video');
        setSessionMode('reference', { focusTarget: videoFileInput });
      });
    }

    if (referenceModePrompt) {
      referenceModePrompt.addEventListener('click', () => {
        clearReferenceVideo();
        if (videoFileInput) videoFileInput.value = '';
        setReferenceInputMode('prompt');
        setSessionMode('reference', { focusTarget: promptInput });
        renderReferenceState();
        if (state.sessionMode === 'reference') {
          setPreviewStatus('Prompt-only input selected. Add a prompt to generate without a visual reference.', 'info');
        }
        scheduleDraftSave();
      });
    }

    if (referenceModeBlank) {
      referenceModeBlank.addEventListener('click', () => {
        setReferenceInputMode('blank');
        renderReferenceState();
      });
    }

    if (referenceModeV2) {
      referenceModeV2.addEventListener('click', () => {
        setReferenceInputMode('v2');
        setSessionMode('v2', { focusTarget: v2ExportUrlInput });
        renderReferenceState();
      });
    }

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

    if (btnBannerOpenSettings) {
      btnBannerOpenSettings.addEventListener('click', () => {
        openSettingsDrawer({ focusTarget: apiKeyInput });
      });
    }

    if (previewTabView) {
      previewTabView.addEventListener('click', () => setPreviewMode('view'));
    }
    if (previewTabEdit) {
      previewTabEdit.addEventListener('click', () => setPreviewMode('edit'));
    }
    if (previewTabCompare) {
      previewTabCompare.addEventListener('click', () => setPreviewMode('compare'));
    }

    btnGenerate.addEventListener('click', generate);
    btnStop.addEventListener('click', () => {
      state.isAutoIterating = false;
      updateStatus();
    });
    if (btnNewReelTemplate) {
      btnNewReelTemplate.addEventListener('click', () => createBlankTemplateSession());
    }
    btnLoadV2.addEventListener('click', () => loadApprovedTemplateFromV2());
    btnSaveV2.addEventListener('click', approveTemplateForV2);
    btnOpenV2Admin.addEventListener('click', openV2Admin);
    if (btnLoadProviderLabPost) {
      btnLoadProviderLabPost.addEventListener('click', () => loadProviderLabPostSnapshot());
    }
    if (btnRefreshProviderLabRecent) {
      btnRefreshProviderLabRecent.addEventListener('click', () => loadProviderLabRecentPosts());
    }
    if (btnPreviewProviderLab) {
      btnPreviewProviderLab.addEventListener('click', () => previewProviderLabRun());
    }
    if (btnRenderProviderLab) {
      btnRenderProviderLab.addEventListener('click', () => renderProviderLabRun());
    }
    if (providerLabProvider) {
      providerLabProvider.addEventListener('change', () => {
        const provider = getProviderLabSelectedProviderId();
        renderProviderLabTemplateOptions();
        const template = getProviderLabTemplateMeta(provider, getProviderLabSelectedTemplateId());
        if (provider === 'remotion') {
          showProviderLabStatus('Remotion stays scaffold-only in this MVP. Hyperframes is the first implementation target.', 'info');
        } else {
          showProviderLabStatus(`Hyperframes is ready. Selected template: ${template?.label || 'unknown template'}.`, 'info');
        }
      });
    }
    if (providerLabTemplate) {
      providerLabTemplate.addEventListener('change', () => {
        state.providerLabTemplateId = getProviderLabSelectedTemplateId();
        const provider = getProviderLabSelectedProviderId();
        const template = getProviderLabTemplateMeta(provider, state.providerLabTemplateId);
        if (template) {
          showProviderLabStatus(`Selected ${template.label}. ${template.description}`, 'info');
        }
      });
    }

    Array.from(document.querySelectorAll?.('.plab-tab[data-plab-tab]') || []).forEach((btn) => {
      btn.addEventListener('click', () => setPlabTab(btn.getAttribute('data-plab-tab')));
    });

    Array.from(document.querySelectorAll?.('.plab-rail-tab[data-rail-tab]') || []).forEach((btn) => {
      btn.addEventListener('click', () => setPlabRailTab(btn.getAttribute('data-rail-tab')));
    });

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
    if (btnCanvasUndo) btnCanvasUndo.addEventListener('click', undoVisualEdit);
    if (btnCanvasRedo) btnCanvasRedo.addEventListener('click', redoVisualEdit);
    btnRestoreDraft.addEventListener('click', restoreSavedDraft);
    btnDiscardDraft.addEventListener('click', discardSavedDraft);

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
      chatInput.addEventListener('input', () => {
        if (chatStatus && chatStatus.classList.contains('error')) {
          setChatStatus('', '');
        }
        updateStatus();
      });
    }

    if (btnSendChat) {
      btnSendChat.addEventListener('click', sendChatMessage);
    }
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function serializeTemplate(template) {
    return template ? JSON.stringify(template) : null;
  }

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function generateStudioLayerId(frameIndex, layerIndex) {
    return `layer_${frameIndex + 1}_${layerIndex + 1}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function ensureTemplateLayerIds(template) {
    if (!template || !Array.isArray(template.frames)) return template;

    template.frames.forEach((frame, frameIndex) => {
      if (!Array.isArray(frame.layers)) return;
      frame.layers.forEach((layer, layerIndex) => {
        if (!layer.id) {
          layer.id = generateStudioLayerId(frameIndex, layerIndex);
        }
      });
    });

    return template;
  }

  function syncCanvasEditor() {
    if (!canvasEditor) return;
    if (!state.currentTemplate) {
      canvasEditor.clear();
      return;
    }

    canvasEditor.setDocument(state.currentTemplate, {
      frameIndex: state.previewFrameIndex,
    });
  }

  function pushVisualUndoSnapshot(template) {
    if (!template) return;
    state.visualUndoStack.push(cloneJson(template));
    if (state.visualUndoStack.length > 60) {
      state.visualUndoStack.shift();
    }
    state.visualRedoStack = [];
  }

  function updateVisualHistoryControls() {
    if (btnCanvasUndo) btnCanvasUndo.disabled = state.visualUndoStack.length === 0;
    if (btnCanvasRedo) btnCanvasRedo.disabled = state.visualRedoStack.length === 0;
  }

  function applyVisualHistoryTemplate(template, message) {
    if (!template) return;
    ensureTemplateLayerIds(template);
    state.currentTemplate = template;
    state.previewStale = true;
    state.sessionDirty = computeDirty(template);
    showJson(template);
    updatePreviewFrameControls(template);
    setPreviewStatus(message, 'warning');
    updateStatus();
    scheduleDraftSave();
  }

  function undoVisualEdit() {
    if (!state.visualUndoStack.length || !state.currentTemplate) return;
    state.visualRedoStack.push(cloneJson(state.currentTemplate));
    const previousTemplate = state.visualUndoStack.pop();
    applyVisualHistoryTemplate(previousTemplate, 'Undid the latest visual edit. Re-render the preview before approving this draft.');
  }

  function redoVisualEdit() {
    if (!state.visualRedoStack.length || !state.currentTemplate) return;
    state.visualUndoStack.push(cloneJson(state.currentTemplate));
    const nextTemplate = state.visualRedoStack.pop();
    applyVisualHistoryTemplate(nextTemplate, 'Redid the visual edit. Re-render the preview before approving this draft.');
  }

  function handleCanvasTemplateChange(nextTemplate, details = {}) {
    if (!nextTemplate) return;

    if (state.currentTemplate && serializeTemplate(state.currentTemplate) !== serializeTemplate(nextTemplate)) {
      pushVisualUndoSnapshot(state.currentTemplate);
    }
    ensureTemplateLayerIds(nextTemplate);
    state.currentTemplate = nextTemplate;
    state.previewFrameIndex = Number.isInteger(details.frameIndex) ? details.frameIndex : state.previewFrameIndex;
    state.previewStale = true;
    state.sessionDirty = computeDirty(nextTemplate);
    showJson(nextTemplate);
    updatePreviewFrameControls(nextTemplate);
    setPreviewStatus(
      details.message || 'Visual edits changed the layer JSON. Re-render the preview before approving this draft.',
      'warning',
    );
    updateStatus();
    scheduleDraftSave();
  }

  function focusElement(el) {
    if (el && typeof el.focus === 'function') el.focus();
  }

  function setAppWorkspace(workspace) {
    const resolved = workspace === 'provider-lab' ? 'provider-lab' : 'studio';
    state.appWorkspace = resolved;

    if (body && body.dataset) body.dataset.appWorkspace = resolved;
    if (btnAppTabStudio) {
      btnAppTabStudio.classList.toggle('active', resolved === 'studio');
      btnAppTabStudio.setAttribute('aria-selected', resolved === 'studio' ? 'true' : 'false');
    }
    if (btnAppTabProviderLab) {
      btnAppTabProviderLab.classList.toggle('active', resolved === 'provider-lab');
      btnAppTabProviderLab.setAttribute('aria-selected', resolved === 'provider-lab' ? 'true' : 'false');
    }
    if (studioLayout) studioLayout.hidden = resolved !== 'studio';
    if (providerLabSection) providerLabSection.hidden = resolved !== 'provider-lab';
    if (approveFooter) approveFooter.hidden = resolved !== 'studio';
    if (resolved === 'provider-lab' && !state.providerLabProviders.length) {
      loadProviderLabProviders();
    }
    if (resolved === 'provider-lab' && !state.providerLabRuns.length) {
      loadProviderLabRuns();
    }
    if (resolved === 'provider-lab' && !state.providerLabRecentPosts.length) {
      loadProviderLabRecentPosts();
    }
  }

  function syncAppWorkspaceRoute() {
    if (!window.history || typeof window.history.replaceState !== 'function' || !window.location?.href) return;

    try {
      const url = new URL(window.location.href);
      url.pathname = state.appWorkspace === 'provider-lab' ? '/designer/provider-lab' : '/designer';
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }

  function showProviderLabStatus(message, kind = 'info') {
    if (!providerLabStatus) return;
    providerLabStatus.textContent = message;
    providerLabStatus.classList.toggle('is-error', kind === 'error');
    providerLabStatus.classList.toggle('is-success', kind === 'success');
  }

  function setPlabTab(name) {
    Array.from(document.querySelectorAll?.('.plab-tab[data-plab-tab]') || []).forEach((btn) => {
      const isActive = btn.getAttribute('data-plab-tab') === name;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    Array.from(document.querySelectorAll?.('.plab-panel[data-plab-panel]') || []).forEach((panel) => {
      panel.hidden = panel.getAttribute('data-plab-panel') !== name;
    });
  }

  function setPlabRailTab(name) {
    const resolved = name === 'runs' ? 'runs' : 'posts';
    Array.from(document.querySelectorAll?.('.plab-rail-tab[data-rail-tab]') || []).forEach((btn) => {
      const isActive = btn.getAttribute('data-rail-tab') === resolved;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    Array.from(document.querySelectorAll?.('.plab-rail-panel[data-rail-panel]') || []).forEach((panel) => {
      panel.hidden = panel.getAttribute('data-rail-panel') !== resolved;
    });
  }

  function getProviderLabProviderMeta(providerId) {
    const providers = Array.isArray(state.providerLabProviders) ? state.providerLabProviders : [];
    return providers.find((provider) => provider.id === providerId) || null;
  }

  function getProviderLabTemplateMeta(providerId, templateId) {
    const provider = getProviderLabProviderMeta(providerId);
    if (!provider || !Array.isArray(provider.templates)) return null;
    return provider.templates.find((template) => template.id === templateId) || null;
  }

  function getProviderLabSelectedProviderId() {
    return String(providerLabProvider?.value || 'hyperframes').trim();
  }

  function getProviderLabSelectedTemplateId() {
    return String(providerLabTemplate?.value || state.providerLabTemplateId || '').trim();
  }

  function renderProviderLabTemplateOptions() {
    if (!providerLabTemplate) return;

    const providerId = getProviderLabSelectedProviderId();
    const provider = getProviderLabProviderMeta(providerId);
    const templates = Array.isArray(provider?.templates) ? provider.templates : [];
    const previousValue = getProviderLabSelectedTemplateId();
    const fallbackValue = provider?.defaultTemplateId || templates[0]?.id || '';
    const selectedValue = templates.some((template) => template.id === previousValue)
      ? previousValue
      : fallbackValue;

    providerLabTemplate.innerHTML = templates.length
      ? templates.map((template) => {
          const suffix = template.status === 'coming-soon' ? ' (coming soon)' : '';
          return `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}${suffix}</option>`;
        }).join('')
      : '<option value="">No templates available</option>';

    providerLabTemplate.value = selectedValue;
    state.providerLabTemplateId = selectedValue;
  }

  function renderProviderLabPreviewMeta(result) {
    if (!providerLabPreviewMeta) return;
    if (!result) {
      providerLabPreviewMeta.textContent = 'No preview rendered yet.';
      providerLabPreviewMeta.classList.remove('is-error', 'is-success');
      return;
    }

    const duration = Number(result.durationMs || 0) > 0
      ? `${(Number(result.durationMs) / 1000).toFixed(1)}s`
      : 'Unknown duration';
    providerLabPreviewMeta.textContent = `${result.providerLabel || result.provider} · ${result.templateLabel || result.templateId} · ${duration} · ${result.width}×${result.height}`;
    providerLabPreviewMeta.classList.remove('is-error');
    providerLabPreviewMeta.classList.add('is-success');
  }

  function renderProviderLabSnapshot(snapshot) {
    if (!providerLabSnapshotPreview) return;
    providerLabSnapshotPreview.textContent = snapshot
      ? JSON.stringify(snapshot, null, 2)
      : 'No V2 post snapshot loaded yet.';
  }

  function renderProviderLabRecentPosts() {
    if (!providerLabRecentList) return;

    const posts = Array.isArray(state.providerLabRecentPosts) ? state.providerLabRecentPosts : [];
    if (!posts.length) {
      providerLabRecentList.innerHTML = '<div style="color:var(--text-dim); font-size:12px;">No recent experiment posts matched the current filter.</div>';
      return;
    }

    providerLabRecentList.innerHTML = posts.map((post) => {
      const platforms = Array.isArray(post.platform_context?.platforms) ? post.platform_context.platforms.join(', ') : '';
      const categoryLabel = post.category_name ? escapeHtml(post.category_name) : '';
      const variantLabel = post.platform_context?.variant ? escapeHtml(post.platform_context.variant) : '';

      return `
        <div class="plab-recent-item">
          <strong>${escapeHtml(post.title || post.id || 'Untitled Post')}</strong>
          <div class="plab-recent-meta">
            ${post.org_name ? `<span>${escapeHtml(post.org_name)}</span>` : ''}
            ${categoryLabel ? `<span>${categoryLabel}</span>` : ''}
            ${variantLabel ? `<span>${variantLabel}</span>` : ''}
            ${platforms ? `<span>${escapeHtml(platforms)}</span>` : ''}
          </div>
          <div class="plab-recent-foot">
            <span class="plab-recent-id">${escapeHtml(post.id || '')} &middot; ${Number(post.image_count || 0)} img</span>
            <button class="btn btn-secondary btn-sm" type="button" data-provider-lab-post-id="${escapeHtml(post.id || '')}">Load</button>
          </div>
        </div>
      `;
    }).join('');

    providerLabRecentList.querySelectorAll('[data-provider-lab-post-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const postId = button.getAttribute('data-provider-lab-post-id') || '';
        if (providerLabPostId) providerLabPostId.value = postId;
        loadProviderLabPostSnapshot(postId);
      });
    });
  }

  function renderProviderLabPreview(result) {
    state.providerLabPreview = result || null;
    const emptyEl = document.getElementById('plabPreviewEmpty');
    if (providerLabPreviewVideo) {
      if (result?.previewUrl) {
        providerLabPreviewVideo.src = result.previewUrl;
        providerLabPreviewVideo.poster = result.posterUrl || '';
        providerLabPreviewVideo.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';
        setPlabTab('preview');
      } else {
        providerLabPreviewVideo.pause?.();
        providerLabPreviewVideo.removeAttribute('src');
        providerLabPreviewVideo.style.display = 'none';
        if (emptyEl) emptyEl.style.display = '';
      }
    }
    if (providerLabPreviewPoster) {
      if (result?.posterUrl) {
        providerLabPreviewPoster.src = result.posterUrl;
        providerLabPreviewPoster.style.display = '';
      } else {
        providerLabPreviewPoster.removeAttribute('src');
        providerLabPreviewPoster.style.display = 'none';
      }
    }
    renderProviderLabPreviewMeta(result);
  }

  function buildProviderLabCompareMeta(run, slotLabel) {
    if (!run) return `Choose a saved run below for ${slotLabel}.`;
    const createdAt = run.createdAt ? new Date(run.createdAt).toLocaleString() : 'Unknown time';
    return [
      `${run.providerLabel || run.provider} · ${run.templateLabel || run.templateId}`,
      `Post ${run.postId || 'unknown'} · ${createdAt}`,
      `${run.width || '?'}×${run.height || '?'} · ${Math.round(Number(run.durationMs || 0) / 100) / 10 || '?'}s`,
    ].join('\n');
  }

  function renderProviderLabCompareSlot(slot) {
    const isPrimary = slot === 'primary';
    const runId = isPrimary ? state.providerLabComparePrimaryRunId : state.providerLabCompareSecondaryRunId;
    const runs = Array.isArray(state.providerLabRuns) ? state.providerLabRuns : [];
    const run = runs.find((entry) => entry.runId === runId) || null;
    const metaEl = isPrimary ? providerLabComparePrimaryMeta : providerLabCompareSecondaryMeta;
    const videoEl = isPrimary ? providerLabComparePrimaryVideo : providerLabCompareSecondaryVideo;
    const posterEl = isPrimary ? providerLabComparePrimaryPoster : providerLabCompareSecondaryPoster;

    if (metaEl) metaEl.textContent = buildProviderLabCompareMeta(run, isPrimary ? 'Compare A' : 'Compare B');
    if (videoEl) {
      if (run?.videoUrl) {
        videoEl.src = run.videoUrl;
        videoEl.poster = run.posterUrl || '';
        videoEl.style.display = '';
      } else {
        videoEl.pause?.();
        videoEl.removeAttribute('src');
        videoEl.style.display = 'none';
      }
    }
    if (posterEl) {
      if (!run?.videoUrl && run?.posterUrl) {
        posterEl.src = run.posterUrl;
        posterEl.style.display = '';
      } else {
        posterEl.removeAttribute('src');
        posterEl.style.display = 'none';
      }
    }
  }

  function renderProviderLabCompare() {
    renderProviderLabCompareSlot('primary');
    renderProviderLabCompareSlot('secondary');
  }

  function renderProviderLabRuns() {
    if (!providerLabRunList) return;

    const runs = Array.isArray(state.providerLabRuns) ? state.providerLabRuns : [];
    if (!runs.length) {
      providerLabRunList.innerHTML = '<div style="color:var(--text-dim); font-size:12px;">No saved runs yet.</div>';
      renderProviderLabCompare();
      return;
    }

    providerLabRunList.innerHTML = runs.map((run) => {
      const createdAt = run.createdAt ? new Date(run.createdAt).toLocaleString() : 'Unknown time';
      const duration = Number(run.durationMs) > 0 ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : '';
      return `
        <div class="plab-run-item">
          <strong>${escapeHtml(run.providerLabel || run.provider || 'Provider')} · ${escapeHtml(run.templateLabel || run.templateId || 'template')}</strong>
          <span>${escapeHtml(run.postId || 'post')} · ${escapeHtml(createdAt)}${duration}</span>
          <span class="plab-run-links">
            <a href="${escapeHtml(run.videoUrl)}" target="_blank" rel="noopener noreferrer">Video</a> ·
            <a href="${escapeHtml(run.posterUrl)}" target="_blank" rel="noopener noreferrer">Poster</a> ·
            <a href="${escapeHtml(run.manifestUrl)}" target="_blank" rel="noopener noreferrer">Manifest</a>
          </span>
          <div class="plab-run-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-provider-lab-compare-slot="primary" data-provider-lab-run-id="${escapeHtml(run.runId || '')}">Use as A</button>
            <button class="btn btn-secondary btn-sm" type="button" data-provider-lab-compare-slot="secondary" data-provider-lab-run-id="${escapeHtml(run.runId || '')}">Use as B</button>
          </div>
        </div>
      `;
    }).join('');

    if (!state.providerLabComparePrimaryRunId && runs[0]?.runId) {
      state.providerLabComparePrimaryRunId = runs[0].runId;
    }
    if (!state.providerLabCompareSecondaryRunId && runs[1]?.runId) {
      state.providerLabCompareSecondaryRunId = runs[1].runId;
    }

    providerLabRunList.querySelectorAll('[data-provider-lab-run-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const runId = button.getAttribute('data-provider-lab-run-id') || '';
        const slot = button.getAttribute('data-provider-lab-compare-slot') || 'primary';
        if (slot === 'secondary') state.providerLabCompareSecondaryRunId = runId;
        else state.providerLabComparePrimaryRunId = runId;
        renderProviderLabCompare();
      });
    });

    renderProviderLabCompare();
  }

  async function fetchDesignerJson(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
    };
    if (state.apiKey) headers['X-Api-Key'] = state.apiKey;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    const res = await fetch(`/api/designer${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function setReferenceInputMode(mode) {
    const validModes = new Set(['video', 'prompt', 'blank', 'v2']);
    state.referenceInputMode = validModes.has(mode) ? mode : 'video';
    const current = state.referenceInputMode;

    if (referenceModeVideo) referenceModeVideo.classList.toggle('active', current === 'video');
    if (referenceModePrompt) referenceModePrompt.classList.toggle('active', current === 'prompt');
    if (referenceModeBlank) referenceModeBlank.classList.toggle('active', current === 'blank');
    if (referenceModeV2) referenceModeV2.classList.toggle('active', current === 'v2');

    if (referenceVideoPanel) referenceVideoPanel.classList.toggle('active', current === 'video');
    if (referencePromptPanel) referencePromptPanel.classList.toggle('active', current === 'prompt');
    if (referenceBlankPanel) referenceBlankPanel.classList.toggle('active', current === 'blank');
    if (referenceV2Panel) referenceV2Panel.classList.toggle('active', current === 'v2');

    const showGenerate = current === 'video' || current === 'prompt';
    if (sourceGenerateRegion) sourceGenerateRegion.classList.toggle('is-hidden', !showGenerate);

    renderReferenceState();
    updateStatus();
  }

  function parseStudioUrlState() {
    const location = window.location || {};
    const pathname = String(location.pathname || '').replace(/\/+$/, '');
    const params = new URLSearchParams(String(location.search || ''));
    const queryMode = String(params.get('mode') || '').trim().toLowerCase();
    const prompt = params.get('prompt');

    let routeMode = '';
    if (pathname.endsWith('/designer/prompt')) routeMode = 'prompt';
    else if (pathname.endsWith('/designer/provider-lab')) routeMode = 'provider-lab';
    else if (pathname.endsWith('/designer/reference-video')) routeMode = 'video';
    else if (pathname.endsWith('/designer/v2')) routeMode = 'v2';
    else if (pathname.endsWith('/designer/json')) routeMode = 'json';

    const normalizedMode = routeMode || queryMode;
    const allowedModes = new Set(['prompt', 'video', 'v2', 'json', 'reference', 'provider-lab']);

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

    if (urlState.mode === 'prompt') {
      setAppWorkspace('studio');
      setReferenceInputMode('prompt');
      setSessionMode('reference', { focusTarget: promptInput });
    } else if (urlState.mode === 'video') {
      setAppWorkspace('studio');
      setReferenceInputMode('video');
      setSessionMode('reference');
    } else if (urlState.mode === 'reference') {
      setAppWorkspace('studio');
      setReferenceInputMode('video');
      setSessionMode('reference');
    } else if (urlState.mode === 'provider-lab') {
      setAppWorkspace('provider-lab');
    } else if (urlState.mode === 'v2') {
      setAppWorkspace('studio');
      setReferenceInputMode('v2');
      setSessionMode('v2', { focusTarget: v2ExportUrlInput });
    } else if (urlState.mode === 'json') {
      setAppWorkspace('studio');
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
    if (state.referenceInputMode === 'prompt' && !state.referenceVideoFile) {
      return {
        pill: 'Prompt Draft',
        helper: 'Start with a text prompt when you want the first template pass to come from description alone.',
        title: 'Prompt-led draft',
        lead: 'Describe the structure, tone, offer, and pacing you want, then refine the generated draft with more text or raw JSON edits.',
      };
    }

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
      chatSessionId: state.chatSessionId,
      chatMessages: state.chatMessages,
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
      draftRestore.style.display = 'none';
      return;
    }

    if (hasCurrentDraft) {
      draftRestore.style.display = 'none';
      return;
    }

    const templateLabel = savedMeta.templateName ? ` for ${savedMeta.templateName}` : '';
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
    const hasReferenceVideo = !!state.referenceVideoFile;
    const hasReference = hasReferenceVideo;
    const hasPrompt = !!promptInput.value.trim();
    const busy = state.isGenerating || state.isApproving;
    const missingApiKey = !connected;
    const missingInput = !hasReference && !hasPrompt;
    const hasProviderTemplate = Boolean(getProviderLabSelectedTemplateId());

    btnGenerate.disabled = missingApiKey || missingInput || busy;
    btnStop.disabled = !state.isAutoIterating;
    btnRerender.disabled = !hasTemplate || busy;
    btnCopyJson.disabled = !hasTemplate;
    btnSaveV2.disabled = !hasTemplate || busy;
    btnLoadV2.disabled = busy;
    if (providerLabProvider) providerLabProvider.disabled = busy || state.providerLabProvidersBusy;
    if (providerLabTemplate) providerLabTemplate.disabled = busy || state.providerLabProvidersBusy;
    if (btnLoadProviderLabPost) btnLoadProviderLabPost.disabled = busy || state.providerLabBusy;
    if (btnRefreshProviderLabRecent) btnRefreshProviderLabRecent.disabled = busy || state.providerLabRecentBusy;
    if (btnPreviewProviderLab) btnPreviewProviderLab.disabled = busy || state.providerLabBusy || !state.providerLabSnapshot || !hasProviderTemplate;
    if (btnRenderProviderLab) btnRenderProviderLab.disabled = busy || state.providerLabBusy || !state.providerLabSnapshot || !hasProviderTemplate;
    jsonEditor.disabled = !hasTemplate || (busy && !state.previewStale);
    if (previewFrameSelect) previewFrameSelect.disabled = !hasTemplate || busy || previewFrameControls.style.display === 'none';
    if (toggleAutoIterate) toggleAutoIterate.disabled = busy;
    if (btnSendChat) btnSendChat.disabled = state.isChatSending || !chatInput || !chatInput.value.trim();

    if (btnGenerate) {
      btnGenerate.textContent = hasReferenceVideo
        ? 'Match Style from Video'
        : state.referenceInputMode === 'prompt' || (!hasReference && hasPrompt)
          ? 'Generate from Prompt'
          : 'Generate';
      btnGenerate.title = missingApiKey
        ? 'Add the Render API Key in Settings to enable Generate.'
        : missingInput
          ? state.referenceInputMode === 'prompt'
            ? 'Add a prompt to enable prompt-only generation.'
            : 'Add a prompt or upload a reference video to enable Generate.'
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
        hintText = state.referenceInputMode === 'prompt'
          ? 'Add a prompt to start a prompt-only draft.'
          : 'Add a prompt or reference video to start.';
      } else if (hasReferenceVideo && hasPrompt) {
        hintText = 'Ready to analyze the reference video and match its style with a slideshow reel.';
      } else if (hasReferenceVideo) {
        hintText = 'Reference video ready. Generate will analyze scenes, pacing, and overlays to build an MP4 reel blueprint.';
      } else if (!hasReference && hasPrompt && state.referenceInputMode === 'video') {
        hintText = 'Prompt ready. Upload a short reference video to match style, or generate from prompt only if you want a generic reel draft.';
      } else if (!hasReference && hasPrompt && state.referenceInputMode === 'prompt') {
        hintText = 'Prompt ready. Generate will create a draft from scratch without needing a visual reference.';
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
    updateVisualHistoryControls();
    syncCanvasEditor();
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
    const { linkedTemplateId } = getHandoffContext();
    const hasTemplate = !!state.currentTemplate;
    const hasPreview = !!state.currentPreview || !!state.currentPreviewVideoUrl;
    const currentName = state.currentTemplate?.name || state.currentTemplate?.id || 'Untitled draft';
    const hasReference = !!state.referenceVideoFile
      || state.referenceInputMode === 'prompt' || state.referenceInputMode === 'blank'
      || state.referenceInputMode === 'v2';
    const hasPrompt = !!promptInput?.value?.trim();

    // Progress step states
    const refDone = hasReference || hasPrompt || hasTemplate;
    const genActive = refDone && !hasTemplate;
    const genDone = hasTemplate && !state.previewStale;
    const approveReady = hasTemplate && !state.previewStale;
    const approveDone = !!linkedTemplateId && !state.sessionDirty;

    setProgressStep(progressStepReference,
      refDone ? 'done' : 'active');
    setProgressStep(progressStepGenerate,
      approveDone ? 'done' : genDone ? 'done' : genActive ? 'active' : 'pending');
    setProgressStep(progressStepApprove,
      approveDone ? 'done' : approveReady ? 'active' : 'pending');

    workspaceLinkedLabel.textContent = linkedTemplateId ? `Linked to ${linkedTemplateId}` : 'Not linked yet';
    workspaceTitle.textContent = hasTemplate ? currentName : copy.title;

    // Sticky approve footer summary
    if (approveFooterName) {
      approveFooterName.textContent = hasTemplate ? currentName : 'No draft yet';
    }
    if (approveFooterDetails) {
      if (!hasTemplate) {
        approveFooterDetails.textContent = 'Generate or load a template to enable approval.';
      } else {
        const imageCount = parseInt(saveImageCount?.value, 10);
        const imageLabel = Number.isFinite(imageCount) && imageCount > 0
          ? `${imageCount} photo${imageCount === 1 ? '' : 's'}`
          : '5 photos';
        const idLabel = saveId?.value?.trim() ? ` · ${saveId.value.trim()}` : '';
        const linkedLabel = linkedTemplateId ? ` · V2: ${linkedTemplateId}` : '';
        approveFooterDetails.textContent = `${imageLabel}${idLabel}${linkedLabel}`;
      }
    }

    // API key banner
    if (apiKeyBanner) {
      apiKeyBanner.classList.toggle('is-visible', !state.apiKey);
    }
  }

  function setProgressStep(el, stateValue) {
    if (!el) return;
    el.setAttribute('data-state', stateValue);
  }

  function setPreviewMode(mode) {
    const validModes = ['view', 'edit', 'compare'];
    state.previewMode = validModes.includes(mode) ? mode : 'view';
    try {
      localStorage.setItem('designer_preview_mode', state.previewMode);
    } catch (_err) {
      // ignore storage errors
    }
    if (previewTabView) {
      previewTabView.classList.toggle('active', state.previewMode === 'view');
      previewTabView.setAttribute('aria-selected', state.previewMode === 'view' ? 'true' : 'false');
    }
    if (previewTabEdit) {
      previewTabEdit.classList.toggle('active', state.previewMode === 'edit');
      previewTabEdit.setAttribute('aria-selected', state.previewMode === 'edit' ? 'true' : 'false');
    }
    if (previewTabCompare) {
      previewTabCompare.classList.toggle('active', state.previewMode === 'compare');
      previewTabCompare.setAttribute('aria-selected', state.previewMode === 'compare' ? 'true' : 'false');
    }
    if (previewLive) {
      previewLive.setAttribute('data-mode', state.previewMode === 'compare' ? 'compare' : 'view');
      previewLive.classList.toggle('is-hidden', state.previewMode === 'edit');
    }
    if (previewEdit) {
      previewEdit.classList.toggle('active', state.previewMode === 'edit');
    }
    if (previewGeneratedLabel) {
      previewGeneratedLabel.textContent = state.previewMode === 'compare' ? 'Generated Preview' : 'Preview';
    }
    if (state.previewMode === 'edit') {
      syncCanvasEditor();
    }
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

  function renderReferenceState() {
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

      if (refVideo) {
        refVideo.src = state.referenceVideoObjectUrl;
        refVideo.style.display = '';
      }
      refPlaceholder.style.display = 'none';
      return;
    }

    if (state.referenceInputMode === 'prompt') {
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
      refPlaceholder.textContent = 'Prompt-only session. Add a prompt to generate a reel from scratch, or switch modes if you want reference-video guidance.';
      refPlaceholder.style.display = '';
      return;
    }

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
    if (state.referenceInputMode === 'v2') {
      refPlaceholder.textContent = 'Load a V2 export URL to reopen an approved reel template.';
      refPlaceholder.style.display = '';
      return;
    }
    if (state.referenceInputMode === 'blank') {
      refPlaceholder.textContent = 'Blank reel session. Start a new empty template, then shape the layout in the JSON and canvas editors.';
      refPlaceholder.style.display = '';
      return;
    }
    refPlaceholder.textContent = 'Upload a reference video or switch to Prompt mode to start from text.';
    refPlaceholder.style.display = '';
  }

  function normalizeReferenceInputMode(mode) {
    return ['video', 'prompt', 'blank', 'v2'].includes(mode) ? mode : 'video';
  }

  function normalizeSavedImageCount(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '5';
  }

  function getDraftRestoreWarnings(draft) {
    const warnings = [];
    if (draft?.referenceImage) {
      warnings.push('Legacy reference-image input is no longer supported, so that source was dropped.');
    }
    if (draft?.referenceInputMode === 'image') {
      warnings.push('The saved session used the retired image workflow and was moved to the default video-first mode.');
    }
    return warnings;
  }

  function formatDraftRestoreWarning(warnings) {
    if (!warnings.length) return '';
    return ` ${warnings.join(' ')}`;
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
    const derivedImageCount = meta.image_count || template.imageCount || 5;

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
    ensureTemplateLayerIds(template);

    const normalizedPreview = normalizePreviewResult(preview);

    state.currentTemplate = template;
    state.currentPreview = normalizedPreview.previewBase64;
    state.currentPreviewKind = normalizedPreview.previewKind;
    state.currentPreviewVideoUrl = normalizedPreview.previewUrl;
    if (analysis) state.currentVideoAnalysis = analysis;
    state.previewStale = false;
    state.previewFrameIndex = frameIndex;
    state.visualUndoStack = [];
    state.visualRedoStack = [];

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

  function setChatStatus(message, tone) {
    if (!chatStatus) return;
    chatStatus.textContent = message || '';
    chatStatus.className = 'chat-status';
    if (tone) chatStatus.classList.add(tone);
  }

  function renderChatMessages() {
    if (!chatThread) return;

    if (!state.chatMessages.length) {
      chatThread.innerHTML = '';
      if (chatEmptyState) {
        chatThread.appendChild(chatEmptyState);
        chatEmptyState.style.display = '';
      }
      return;
    }

    const html = state.chatMessages.map((message) => `
      <div class="chat-message ${message.role}">
        <div class="chat-role">${message.role === 'assistant' ? 'Template Chat' : 'You'}</div>
        <div class="chat-content">${escapeHtml(message.content)}</div>
      </div>
    `).join('');
    chatThread.innerHTML = html;
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  function setChatSending(isSending, message) {
    state.isChatSending = isSending;
    if (chatInput) chatInput.disabled = isSending;
    if (isSending) {
      setChatStatus(message || 'Working on your draft…', '');
    }
    updateStatus();
  }

  function buildChatDraftContext() {
    return {
      prompt: promptInput.value.trim(),
      referenceInputMode: state.referenceInputMode,
      referenceVideoActive: Boolean(state.referenceVideoFile),
      currentTemplate: state.currentTemplate,
      currentPreview: state.currentPreview,
      currentPreviewKind: state.currentPreviewKind,
      currentPreviewVideoUrl: state.currentPreviewVideoUrl,
      currentVideoAnalysis: state.currentVideoAnalysis,
      previewFrameIndex: state.previewFrameIndex,
      handoff: {
        exportUrl: v2ExportUrlInput.value.trim(),
        saveName: saveName.value.trim(),
        saveId: saveId.value.trim(),
        saveImageCount: saveImageCount.value,
      },
    };
  }

  async function sendChatMessage() {
    const message = chatInput ? chatInput.value.trim() : '';
    if (!message || state.isChatSending) return;

    const localUserMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };

    state.chatMessages = [...state.chatMessages, localUserMessage];
    renderChatMessages();
    if (chatInput) chatInput.value = '';
    updateStatus();
    setChatSending(true, state.currentTemplate ? 'Applying your adjustment…' : 'Generating from chat…');

    try {
      const res = await fetch('/api/designer/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': state.apiKey,
        },
        body: JSON.stringify({
          sessionId: state.chatSessionId || undefined,
          message,
          draftContext: buildChatDraftContext(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      state.chatSessionId = data.sessionId || state.chatSessionId;
      state.chatMessages = Array.isArray(data.messages) ? data.messages : state.chatMessages;
      renderChatMessages();

      if (!promptInput.value.trim() && !state.currentTemplate) {
        promptInput.value = message;
      }

      if (data.template) {
        applyTemplateState(data.template, data, {
          label: data.action === 'generated' ? 'Chat Draft' : 'Chat Revision',
          feedback: message,
          analysis: data.analysis || null,
        });
        setPreviewStatus(
          buildPreviewStatusMessage(
            data.action === 'generated'
              ? 'Generated a draft from chat.'
              : 'Applied the latest chat adjustment.',
            data,
          ),
          'info',
        );
        log(data.action === 'generated' ? 'Generated a draft from chat.' : 'Applied a chat-driven draft update.', 'info');
      } else if (data.assistantMessage?.content) {
        setPreviewStatus(data.assistantMessage.content, 'info');
      }

      scheduleDraftSave();
      setChatSending(false);
      setChatStatus('', '');
    } catch (err) {
      state.chatMessages = state.chatMessages.filter((entry) => entry.id !== localUserMessage.id);
      renderChatMessages();
      setChatSending(false);
      setChatStatus(err.message || 'Chat request failed.', 'error');
      showToast(err.message || 'Chat request failed.', 'error');
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
    if (promptInput.value.trim()) return 'prompt';
    return 'manual_json';
  }

  function buildTemplateFromForm({ forceOutputFormat } = {}) {
    if (!state.currentTemplate) return null;

    const template = cloneJson(state.currentTemplate);
    ensureTemplateLayerIds(template);
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
      template.outputFormat = 'mp4';
    }

    return template;
  }

  function buildBlankTemplate() {
    const photoCount = 5;
    return {
      id: 'untitled-reel-template',
      reference: 'untitled-reel-template',
      name: 'Untitled Reel Template',
      outputFormat: 'mp4',
      width: 1080,
      height: 1920,
      imageCount: photoCount,
      fps: 30,
      transition: { type: 'fade', durationMs: 600 },
      frames: Array.from({ length: photoCount }, (_, index) => ({
        durationMs: index === 0 ? 1800 : 2000,
        background: { type: 'image', source: 'user_image', index },
        layers: [],
      })).concat([
        {
          durationMs: 2400,
          background: { type: 'solid', color: '#10151D' },
          layers: [],
        },
      ]),
      categoryKeys: ['slideshow', 'reel', 'vertical_video'],
    };
  }

  function createBlankTemplateSession() {
    if (hasRecoverableState() && !confirmAction('Replace the current studio session with a new blank reel?')) {
      return;
    }

    clearCurrentDraftState();

    const template = ensureTemplateLayerIds(buildBlankTemplate());
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
    previewPlaceholder.textContent = 'Blank reel template ready. Re-render from JSON when you want a local video or poster-frame preview.';

    setSessionMode('json', { focusTarget: saveName, openAdvanced: true });
    setPreviewStatus('Blank reel draft ready. Approving from this session will create a new V2 video template when the studio connection is configured.', 'info');
    setHandoffStatus('Blank reel draft ready. This session is not linked to an existing V2 template, so approval will create a new V2 video record.', 'info');
    log('Started a new blank reel draft for admin approval into V2.', 'info');
    updateStatus();
    scheduleDraftSave();
  }

  async function loadProviderLabProviders() {
    state.providerLabProvidersBusy = true;
    updateStatus();

    try {
      const data = await fetchDesignerJson('/provider-lab/providers');
      state.providerLabProviders = Array.isArray(data.providers) ? data.providers : [];

      if (providerLabProvider) {
        const currentProviderId = getProviderLabSelectedProviderId();
        const fallbackProviderId = state.providerLabProviders[0]?.id || 'hyperframes';
        const selectedProviderId = state.providerLabProviders.some((provider) => provider.id === currentProviderId)
          ? currentProviderId
          : fallbackProviderId;
        providerLabProvider.innerHTML = state.providerLabProviders.map((provider) => {
          return `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`;
        }).join('');
        providerLabProvider.value = selectedProviderId;
      }

      renderProviderLabTemplateOptions();
      const template = getProviderLabTemplateMeta(getProviderLabSelectedProviderId(), getProviderLabSelectedTemplateId());
      if (template) {
        showProviderLabStatus(`Template registry loaded. Selected ${template.label}. ${template.description}`, 'success');
      }
    } catch (err) {
      showProviderLabStatus(`Provider templates failed to load: ${err.message}`, 'error');
    } finally {
      state.providerLabProvidersBusy = false;
      updateStatus();
    }
  }

  async function loadProviderLabPostSnapshot(explicitPostId) {
    const postId = String(explicitPostId || providerLabPostId?.value || '').trim();
    if (!postId) {
      showProviderLabStatus('Add a V2 post ID first.', 'error');
      return;
    }

    if (providerLabPostId) providerLabPostId.value = postId;

    showProviderLabStatus(`Loading V2 post snapshot for ${postId}…`, 'info');

    try {
      const snapshot = await v2Bridge.loadExperimentPost(postId);
      state.providerLabSnapshot = snapshot;
      renderProviderLabSnapshot(snapshot);
      renderProviderLabPreview(null);
      const providerLabel = String(providerLabProvider?.selectedOptions?.[0]?.textContent || getProviderLabSelectedProviderId()).trim();
      const template = getProviderLabTemplateMeta(getProviderLabSelectedProviderId(), getProviderLabSelectedTemplateId());
      showProviderLabStatus(`Loaded ${postId} for ${providerLabel} · ${template?.label || getProviderLabSelectedTemplateId()}. Preview or render when you’re ready.`, 'success');
    } catch (err) {
      state.providerLabSnapshot = null;
      renderProviderLabSnapshot(null);
      showProviderLabStatus(`Provider Lab load failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function loadProviderLabRecentPosts() {
    state.providerLabRecentBusy = true;
    updateStatus();
    if (providerLabRecentList) {
      providerLabRecentList.innerHTML = '<div style="color:var(--text-dim); font-size:12px;">Loading recent V2 experiment posts…</div>';
    }

    try {
      const data = await v2Bridge.listExperimentPosts({ limit: 8, status: 'ready' });
      state.providerLabRecentPosts = Array.isArray(data.posts) ? data.posts : [];
      renderProviderLabRecentPosts();
      if (state.providerLabRecentPosts.length) {
        showProviderLabStatus('Recent ready posts loaded from V2. Pick one to load its full snapshot.', 'success');
      } else {
        showProviderLabStatus('No recent ready posts were returned from V2.', 'info');
      }
    } catch (err) {
      state.providerLabRecentPosts = [];
      renderProviderLabRecentPosts();
      showProviderLabStatus(`Recent post browse failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      state.providerLabRecentBusy = false;
      updateStatus();
    }
  }

  async function loadProviderLabRuns() {
    try {
      const data = await fetchDesignerJson('/provider-lab/runs');
      state.providerLabRuns = Array.isArray(data.runs) ? data.runs : [];
      renderProviderLabRuns();
    } catch (err) {
      showProviderLabStatus(`Provider Lab runs failed to load: ${err.message}`, 'error');
    }
  }

  async function previewProviderLabRun() {
    if (!state.providerLabSnapshot) {
      showProviderLabStatus('Load a V2 post snapshot before previewing.', 'error');
      return;
    }

    state.providerLabBusy = true;
    updateStatus();
    const provider = String(providerLabProvider?.value || 'hyperframes').trim();
    const templateId = getProviderLabSelectedTemplateId();
    const template = getProviderLabTemplateMeta(provider, templateId);
    showProviderLabStatus(`Rendering ${provider} preview for ${template?.label || templateId}…`, 'info');

    try {
      const result = await fetchDesignerJson('/provider-lab/preview', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          templateId,
          snapshot: state.providerLabSnapshot,
        }),
      });
      renderProviderLabPreview(result);
      showProviderLabStatus(`Preview ready for ${template?.label || templateId}.`, 'success');
    } catch (err) {
      renderProviderLabPreview(null);
      showProviderLabStatus(`Provider preview failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      state.providerLabBusy = false;
      updateStatus();
    }
  }

  async function renderProviderLabRun() {
    if (!state.providerLabSnapshot) {
      showProviderLabStatus('Load a V2 post snapshot before rendering a final run.', 'error');
      return;
    }

    state.providerLabBusy = true;
    updateStatus();
    const provider = String(providerLabProvider?.value || 'hyperframes').trim();
    const templateId = getProviderLabSelectedTemplateId();
    const template = getProviderLabTemplateMeta(provider, templateId);
    showProviderLabStatus(`Saving final ${provider} render for ${template?.label || templateId}…`, 'info');

    try {
      const data = await fetchDesignerJson('/provider-lab/render', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          templateId,
          snapshot: state.providerLabSnapshot,
        }),
      });
      if (data.run) {
        state.providerLabRuns = [data.run, ...(state.providerLabRuns || [])].slice(0, 12);
        state.providerLabCompareSecondaryRunId = state.providerLabComparePrimaryRunId || state.providerLabCompareSecondaryRunId;
        state.providerLabComparePrimaryRunId = data.run.runId || state.providerLabComparePrimaryRunId;
        renderProviderLabRuns();
        setPlabTab('runs');
      }
      showProviderLabStatus(`Saved final ${template?.label || templateId} render with manifest JSON.`, 'success');
    } catch (err) {
      showProviderLabStatus(`Final render failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    } finally {
      state.providerLabBusy = false;
      updateStatus();
    }
  }

  function openV2Admin() {
    try {
      v2Bridge.openAdmin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function renderLoadedV2Template(template, meta = {}) {
    ensureTemplateLayerIds(template);
    showJson(template);
    syncApprovalFieldsFromTemplate(template, meta);
    state.previewFrameIndex = 0;
    updatePreviewFrameControls(template);

    if (template.outputFormat !== 'mp4') {
      throw new Error('Static image templates are no longer supported in Reel Template Studio.');
    }

    if (!state.apiKey) {
      previewImage.src = '';
      previewImage.style.display = 'none';
      if (previewVideo) {
        previewVideo.src = '';
        previewVideo.style.display = 'none';
      }
      previewLoading.style.display = 'none';
      previewPlaceholder.style.display = '';
      previewPlaceholder.textContent = 'Template loaded. Add the render-engine API key to preview a local reel video or poster frame.';
      state.currentTemplate = template;
      state.currentPreview = null;
      state.currentPreviewKind = 'image';
      state.currentPreviewVideoUrl = '';
      state.previewStale = false;
      state.previewFrameIndex = 0;
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
      setPreviewStatus('Loaded from V2. Add the render-engine API key to render a local video preview or a poster frame for this MP4 template.', 'warning');
      updateStatus();
      scheduleDraftSave();
      return;
    }

    setGenerating(true, 'Loading approved V2 MP4 template preview…');

    try {
      const previewResult = await renderPreviewFromTemplate(template, {
        frameIndex: state.previewFrameIndex,
        previewMode: 'video',
      });
      applyTemplateState(template, previewResult, {
        feedback: 'Loaded from V2',
        label: 'Loaded from V2',
        resetHistory: true,
        cleanCheckpoint: true,
        meta,
        frameIndex: state.previewFrameIndex,
      });
      setPreviewStatus(buildPreviewStatusMessage('Loaded from V2 and rendered locally for MP4 authoring review.', previewResult), 'info');
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
    state.chatSessionId = '';
    state.chatMessages = [];
    state.isChatSending = false;
    state.visualUndoStack = [];
    state.visualRedoStack = [];

    promptInput.value = '';
    if (chatInput) chatInput.value = '';
    jsonEditor.value = '';
    jsonEditor.disabled = true;
    saveName.value = '';
    saveId.value = '';
    saveImageCount.value = '5';
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
    setReferenceInputMode('video');
    renderReferenceState();
    updatePreviewFrameControls(null);
    renderHistory();
    renderChatMessages();
    setChatStatus('', '');
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
    state.chatSessionId = draft.chatSessionId || '';
    state.chatMessages = Array.isArray(draft.chatMessages) ? draft.chatMessages : [];
    const restoreWarnings = getDraftRestoreWarnings(draft);
    setReferenceInputMode(normalizeReferenceInputMode(draft.referenceInputMode));

    if (draft.handoff?.exportUrl) {
      v2Bridge.setExportUrl(draft.handoff.exportUrl);
    }

    saveName.value = draft.handoff?.saveName || '';
    saveId.value = draft.handoff?.saveId || '';
    saveImageCount.value = normalizeSavedImageCount(draft.handoff?.saveImageCount);
    renderReferenceState();

    if (draft.currentTemplate) {
      ensureTemplateLayerIds(draft.currentTemplate);
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

    renderChatMessages();
    setSessionMode(draft.sessionMode || 'reference', { openAdvanced: draft.sessionMode === 'json' });

    if (state.previewStale && state.currentTemplate) {
      setPreviewStatus(`Draft restored. The preview is stale; re-render before approving.${formatDraftRestoreWarning(restoreWarnings)}`, 'warning');
    } else if (state.currentTemplate) {
      setPreviewStatus(`Draft restored from local recovery.${formatDraftRestoreWarning(restoreWarnings)}`, 'info');
    } else if (restoreWarnings.length) {
      setPreviewStatus(`Draft restored.${formatDraftRestoreWarning(restoreWarnings)}`, 'warning');
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
    const hasReferenceVideo = !!state.referenceVideoFile;
    if (!hasReferenceVideo && !trimmedPrompt) return;

    beginFreshSession(hasReferenceVideo ? 'reference' : state.sessionMode);
    setGenerating(true,
      hasReferenceVideo
        ? 'Analyzing reference video…'
        : 'Generating template from prompt…');
    log(
      hasReferenceVideo
        ? 'Generating reel template from reference video…'
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

      if (state.autoIterateEnabled && hasReferenceVideo) {
        await autoIterate();
      }
    } catch (err) {
      setGenerating(false);
      log(`Generation failed: ${err.message}`, 'error');
      showToast(err.message, 'error');
    }
  }

  async function autoIterate() {
    if (!state.referenceVideoFile || !state.currentTemplate) return;

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
        result = await fetchMultipartApi('/video/compare-iterate', buildVideoIterationFormData({
          iterationHistory: state.iterationHistory,
          iterationNumber: iterNum,
          maxIterations: max,
          feedback: plateauWarning ? 'Try a meaningfully different slideshow structure for the next revision.' : '',
        }));
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

    ensureTemplateLayerIds(template);

    setSessionMode('json', { openAdvanced: true });
    setGenerating(true, 'Re-rendering JSON draft…');

    try {
      const previewResult = await renderPreviewFromTemplate(template, {
        frameIndex: state.previewFrameIndex,
        previewMode: 'video',
      });
      applyTemplateState(template, previewResult, {
        label: 'Manual JSON Render',
        frameIndex: state.previewFrameIndex,
      });
      setPreviewStatus(
        buildPreviewStatusMessage(
          'Re-rendered locally for reel review.',
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
      setHandoffStatus('Approve for V2 failed: Photo count must be a whole number of at least 1.', 'error');
      showToast('Photo count must be a whole number of at least 1', 'error');
      return;
    }

    const template = buildTemplateFromForm();
    const approvalTarget = (v2BaseUrlInput?.value || '').trim()
      || (() => {
        const { exportUrl } = getHandoffContext();
        try {
          return exportUrl ? new URL(exportUrl).origin : '';
        } catch {
          return '';
        }
      })()
      || 'the configured V2 admin';

    if (!confirmAction([
      'Approve this reel template to V2?',
      `Name: ${trimmedName}`,
      `Reference ID: ${trimmedId}`,
      `Photos: ${parsedImageCount}`,
      `Target: ${approvalTarget}`,
    ].join('\n'))) {
      setHandoffStatus('Approval cancelled. Review the draft and try again when you are ready.', 'warning');
      return;
    }

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
    ensureTemplateLayerIds(template);
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
    ensureTemplateLayerIds(entry.template);
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
    syncCanvasEditor();

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
    if (typeof console === 'undefined') return;
    const text = String(msg).replace(/<[^>]+>/g, '');
    if (type === 'error') {
      console.error(`[designer] ${text}`);
    } else {
      console.info(`[designer] ${text}`);
    }
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
