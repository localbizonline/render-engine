(function() {
  'use strict';

  const state = {
    apiKey: localStorage.getItem('designer_api_key') || '',
    referenceImage: null,
    currentTemplate: null,
    currentPreview: null,
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

  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  const uploadClear = $('#uploadClear');
  const uploadPlaceholder = $('#uploadPlaceholder');
  const uploadPreview = $('#uploadPreview');
  const promptInput = $('#promptInput');
  const btnGenerate = $('#btnGenerate');
  const btnStop = $('#btnStop');
  const toggleAutoIterate = $('#toggleAutoIterate');
  const maxIterations = $('#maxIterations');
  const scoreTarget = $('#scoreTarget');
  const feedbackInput = $('#feedbackInput');
  const btnIterate = $('#btnIterate');
  const historyStrip = $('#historyStrip');
  const logArea = $('#logArea');
  const refPlaceholder = $('#refPlaceholder');
  const refImage = $('#refImage');
  const previewPlaceholder = $('#previewPlaceholder');
  const previewLoading = $('#previewLoading');
  const previewImage = $('#previewImage');
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
  });

  const SESSION_COPY = {
    reference: {
      pill: 'Reference Draft',
      helper: 'Start with a reference image to create a new template session.',
      title: 'Reference-led draft',
      lead: 'Generate a first pass from the target design, then keep refining until the local preview feels trustworthy.',
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
  v2Bridge.connectInputs({
    baseUrlInput: v2BaseUrlInput,
    fallbackSecretInput: v2AdminSecretInput,
    exportUrlInput: v2ExportUrlInput,
  });

  bindEvents();
  refreshSavedDraftMeta();
  setSessionMode('reference');
  renderHistory();
  updateStatus();
  initializeTemplateLabBridge();

  function bindEvents() {
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
        setSessionMode('reference', { focusTarget: fileInput });
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
      if (file && file.type.startsWith('image/')) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });

    uploadClear.addEventListener('click', (e) => {
      e.stopPropagation();
      state.referenceImage = null;
      renderReferenceState();
      fileInput.value = '';
      if (state.sessionMode === 'reference') {
        setPreviewStatus('Reference removed. Add a new reference before running another refinement pass.', 'warning');
      }
      updateStatus();
      scheduleDraftSave();
    });

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey && !btnGenerate.disabled) generate();
    });
    promptInput.addEventListener('input', scheduleDraftSave);

    feedbackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnIterate.disabled) manualIterate();
    });

    btnGenerate.addEventListener('click', generate);
    btnStop.addEventListener('click', () => {
      state.isAutoIterating = false;
      updateStatus();
    });
    btnIterate.addEventListener('click', manualIterate);
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
      referenceImage: state.referenceImage,
      prompt: promptInput.value,
      currentTemplate: state.currentTemplate,
      currentPreview: state.currentPreview,
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
        : 'the fallback V2 admin secret';
      log(`Template Lab link detected. Auto-loading the approved V2 template using ${authLabel}.`, 'info');
      loadApprovedTemplateFromV2(session.exportUrl);
      return;
    }

    if (session.needsManualAuth) {
      log('Template Lab link detected. Enter the V2 admin secret fallback, then click "Load from V2".', 'info');
      updateStudioStatus();
    }
  }

  function updateStatus() {
    const connected = !!state.apiKey;
    statusDot.classList.toggle('connected', connected);

    const hasTemplate = !!state.currentTemplate;
    const hasReference = !!state.referenceImage;
    const busy = state.isGenerating || state.isApproving;

    btnGenerate.disabled = !connected || !hasReference || busy;
    btnStop.disabled = !state.isAutoIterating;
    feedbackInput.disabled = !hasTemplate || !hasReference || busy;
    btnIterate.disabled = !hasTemplate || !hasReference || busy;
    btnRerender.disabled = !hasTemplate || busy;
    btnCopyJson.disabled = !hasTemplate;
    btnSaveV2.disabled = !hasTemplate || busy;
    btnLoadV2.disabled = busy;
    jsonEditor.disabled = !hasTemplate || (busy && !state.previewStale);
    if (previewFrameSelect) previewFrameSelect.disabled = !hasTemplate || busy || previewFrameControls.style.display === 'none';

    toggleAutoIterate.classList.toggle('active', state.autoIterateEnabled);
    if (typeof toggleAutoIterate.setAttribute === 'function') {
      toggleAutoIterate.setAttribute('aria-pressed', state.autoIterateEnabled ? 'true' : 'false');
    }

    updateHandoffCopyButtons();
    updateStudioStatus();
    updateDraftRecoveryUI();
  }

  function updateStudioStatus() {
    const copy = SESSION_COPY[state.sessionMode] || SESSION_COPY.reference;
    const { linkedTemplateId, exportUrl } = getHandoffContext();
    const hasTemplate = !!state.currentTemplate;
    const hasPreview = !!state.currentPreview;
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
      : 'Use <strong>Load from V2</strong> when you want to reopen an approved template. MP4 templates still preview here as a local poster frame while the queue-side rollout remains in place.';
  }

  function setStatusPill(el, label, tone) {
    if (!el) return;
    el.textContent = label;
    el.className = 'status-pill';
    if (tone === 'accent') el.classList.add('is-accent');
    if (tone === 'success') el.classList.add('is-success');
    if (tone === 'warning') el.classList.add('is-warning');
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      resizeImage(reader.result, 1500, (resized) => {
        state.referenceImage = resized;
        setSessionMode('reference');
        renderReferenceState();
        updateStatus();
        scheduleDraftSave();
      });
    };
    reader.readAsDataURL(file);
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
      refImage.src = state.referenceImage;
      refImage.style.display = '';
      refPlaceholder.style.display = 'none';
      return;
    }

    uploadPreview.src = '';
    uploadPreview.style.display = 'none';
    uploadPlaceholder.style.display = '';
    uploadZone.classList.remove('has-image');
    refImage.src = '';
    refImage.style.display = 'none';
    refPlaceholder.style.display = '';
  }

  function setGenerating(generating, label) {
    state.isGenerating = generating;
    if (generating) {
      previewPlaceholder.style.display = 'none';
      previewImage.style.display = 'none';
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

  function applyTemplateState(template, previewBase64, options = {}) {
    const {
      score = null,
      feedback = null,
      label = 'Draft Update',
      resetHistory = false,
      syncFields = true,
      cleanCheckpoint = false,
      meta = {},
      frameIndex = 0,
    } = options;

    if (resetHistory) clearHistory();

    state.currentTemplate = template;
    state.currentPreview = previewBase64;
    state.previewStale = false;
    state.previewFrameIndex = frameIndex;

    if (cleanCheckpoint) {
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
    } else {
      state.sessionDirty = computeDirty(template);
    }

    showPreview(previewBase64);
    showJson(template);
    updatePreviewFrameControls(template);
    if (syncFields) syncApprovalFieldsFromTemplate(template, meta);
    addHistory(template, previewBase64, { score, feedback, label });
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

  async function renderPreviewFromTemplate(template, frameIndex = 0) {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': state.apiKey,
      },
      body: JSON.stringify({ templateJson: template, frameIndex }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.previewBase64;
  }

  function getTemplateSourceMode() {
    if (state.sessionMode === 'v2') return 'v2_template';
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
      previewLoading.style.display = 'none';
      previewPlaceholder.style.display = '';
      previewPlaceholder.textContent = isMp4Template
        ? 'Template loaded. Add the render-engine API key to preview a local poster frame.'
        : 'Template loaded. Add the render-engine API key to preview it.';
      state.currentTemplate = template;
      state.currentPreview = null;
      state.previewStale = false;
      state.previewFrameIndex = 0;
      state.lastApprovedSnapshot = serializeTemplate(template);
      state.sessionDirty = false;
      setPreviewStatus(
        isMp4Template
          ? 'Loaded from V2. Add the render-engine API key to render a local poster-frame preview for this MP4 template.'
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
      const previewBase64 = await renderPreviewFromTemplate(template, state.previewFrameIndex);
      applyTemplateState(template, previewBase64, {
        feedback: 'Loaded from V2',
        label: 'Loaded from V2',
        resetHistory: true,
        cleanCheckpoint: true,
        meta,
        frameIndex: state.previewFrameIndex,
      });
      setPreviewStatus(
        isMp4Template
          ? 'Loaded from V2 and rendered locally as a poster-frame preview with sample assets for MP4 authoring review.'
          : 'Loaded from V2 and rendered locally with sample assets for authoring review.',
        'info',
      );
      log('Loaded approved template preview from V2', 'info');
    } catch (err) {
      state.currentTemplate = template;
      state.currentPreview = null;
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
    state.referenceImage = null;
    state.currentTemplate = null;
    state.currentPreview = null;
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
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewPlaceholder.style.display = '';
    previewPlaceholder.textContent = 'No preview yet';
    previewLoading.style.display = 'none';
    setPreviewStatus('', '');
    setHandoffStatus('', '');
    v2Bridge.setExportUrl('');
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
    state.generatedSaveId = draft.generatedSaveId || '';
    state.saveIdTouched = Boolean(draft.saveIdTouched);

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

      if (draft.currentPreview) {
        showPreview(draft.currentPreview);
        addHistory(draft.currentTemplate, draft.currentPreview, { label: 'Restored Draft' });
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
    if (!state.referenceImage) return;

    beginFreshSession('reference');
    setGenerating(true, 'Analyzing reference image…');
    log('Generating template from reference image…', 'info');

    try {
      const result = await fetchApi('/vision', {
        referenceImage: state.referenceImage,
        prompt: promptInput.value.trim() || undefined,
      });

      applyTemplateState(result.template, result.previewBase64, {
        label: 'Generated Draft',
        resetHistory: true,
      });
      log(`Template generated: "${result.template.name}" (${result.template.imageCount} images)`, 'info');

      setGenerating(false);

      if (state.autoIterateEnabled) {
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

      applyTemplateState(result.template, result.previewBase64, {
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
    if (!state.referenceImage || !state.currentTemplate) return;

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
        result = await fetchApi('/vision/compare-iterate', {
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

      if (result.template && result.previewBase64) {
        applyTemplateState(result.template, result.previewBase64, {
          score: result.score,
          feedback: result.feedback,
          label: `Iteration ${iterNum}`,
        });
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
      const previewBase64 = await renderPreviewFromTemplate(template, state.previewFrameIndex);
      applyTemplateState(template, previewBase64, {
        label: 'Manual JSON Render',
        frameIndex: state.previewFrameIndex,
      });
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

  function showPreview(base64) {
    previewImage.src = base64;
    previewImage.style.display = '';
    previewPlaceholder.style.display = 'none';
    previewLoading.style.display = 'none';
  }

  function showJson(template) {
    jsonEditor.value = JSON.stringify(template, null, 2);
    jsonEditor.disabled = false;
  }

  function addHistory(template, previewBase64, options = {}) {
    if (!previewBase64) return;

    const entry = {
      template,
      previewBase64,
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
    state.previewStale = false;
    state.previewFrameIndex = entry.frameIndex || 0;
    state.sessionDirty = computeDirty(entry.template);

    showPreview(entry.previewBase64);
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
      const previewBase64 = await renderPreviewFromTemplate(state.currentTemplate, nextFrameIndex);
      state.currentPreview = previewBase64;
      showPreview(previewBase64);
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
