(function(global) {
  'use strict';

  function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function parseTemplateIdFromExportUrl(url) {
    const match = String(url || '').match(/\/api\/admin\/render-templates\/([^/?#]+)\/export(?:[?#]|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function createTemplateLabV2Bridge(options = {}) {
    const storage = options.storage || null;
    const fetchImpl = options.fetchImpl || global.fetch.bind(global);

    const state = {
      baseUrl: normalizeBaseUrl(storage?.getItem('designer_v2_base_url') || ''),
      fallbackAdminSecret: String(storage?.getItem('designer_v2_admin_secret') || '').trim(),
      sessionToken: '',
      exportUrl: '',
      linkedTemplateId: null,
    };

    const inputs = {
      baseUrlInput: null,
      fallbackSecretInput: null,
      exportUrlInput: null,
    };

    function persist(key, value) {
      if (!storage) return;
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    }

    function syncInput(name, value) {
      if (inputs[name]) inputs[name].value = value;
    }

    function setBaseUrl(value, { persistValue = true } = {}) {
      state.baseUrl = normalizeBaseUrl(value);
      syncInput('baseUrlInput', state.baseUrl);
      if (persistValue) persist('designer_v2_base_url', state.baseUrl);
      return state.baseUrl;
    }

    function setFallbackAdminSecret(value, { persistValue = true } = {}) {
      state.fallbackAdminSecret = String(value || '').trim();
      syncInput('fallbackSecretInput', state.fallbackAdminSecret);
      if (persistValue) persist('designer_v2_admin_secret', state.fallbackAdminSecret);
      return state.fallbackAdminSecret;
    }

    function setSessionToken(value) {
      state.sessionToken = String(value || '').trim();
      return state.sessionToken;
    }

    function setLinkedTemplateId(value) {
      state.linkedTemplateId = value ? String(value).trim() : null;
      return state.linkedTemplateId;
    }

    function setExportUrl(value) {
      state.exportUrl = String(value || '').trim();
      syncInput('exportUrlInput', state.exportUrl);
      const derivedTemplateId = parseTemplateIdFromExportUrl(state.exportUrl);
      setLinkedTemplateId(derivedTemplateId);
      if (!state.baseUrl && state.exportUrl) {
        try {
          setBaseUrl(new URL(state.exportUrl).origin);
        } catch {}
      }
      return state.exportUrl;
    }

    function getActiveAuthMode() {
      if (state.sessionToken) return 'session_token';
      if (state.fallbackAdminSecret) return 'admin_secret';
      return null;
    }

    function getActiveAuthToken() {
      return state.sessionToken || state.fallbackAdminSecret || '';
    }

    function requireAuthToken() {
      const token = getActiveAuthToken();
      if (!token) throw new Error('V2 auth is required');
      return token;
    }

    function connectInputs({ baseUrlInput, fallbackSecretInput, exportUrlInput } = {}) {
      if (baseUrlInput) {
        inputs.baseUrlInput = baseUrlInput;
        syncInput('baseUrlInput', state.baseUrl);
        baseUrlInput.addEventListener('input', () => setBaseUrl(baseUrlInput.value));
      }

      if (fallbackSecretInput) {
        inputs.fallbackSecretInput = fallbackSecretInput;
        syncInput('fallbackSecretInput', state.fallbackAdminSecret);
        fallbackSecretInput.addEventListener('input', () => setFallbackAdminSecret(fallbackSecretInput.value));
      }

      if (exportUrlInput) {
        inputs.exportUrlInput = exportUrlInput;
        syncInput('exportUrlInput', state.exportUrl);
        exportUrlInput.addEventListener('input', () => setExportUrl(exportUrlInput.value));
      }
    }

    function initializeFromQueryParams(search = global.location?.search || '') {
      const params = new URLSearchParams(search);
      const exportUrl = params.get('v2ExportUrl');
      const sessionToken = params.get('v2Token');

      if (sessionToken) setSessionToken(sessionToken);
      if (exportUrl) setExportUrl(exportUrl);

      if ((sessionToken || exportUrl) && global.history?.replaceState && global.location?.href) {
        try {
          const scrubbedUrl = new URL(global.location.href);
          scrubbedUrl.searchParams.delete('v2ExportUrl');
          scrubbedUrl.searchParams.delete('v2Token');
          global.history.replaceState({}, '', scrubbedUrl.toString());
        } catch {}
      }

      return {
        baseUrl: state.baseUrl,
        exportUrl: state.exportUrl,
        linkedTemplateId: state.linkedTemplateId,
        authMode: getActiveAuthMode(),
        hasAuth: Boolean(getActiveAuthToken()),
        hasScopedSession: Boolean(state.sessionToken),
        shouldAutoLoad: Boolean(state.exportUrl && getActiveAuthToken()),
        needsManualAuth: Boolean(state.exportUrl && !getActiveAuthToken()),
      };
    }

    async function fetchJson(url, options = {}) {
      const authToken = requireAuthToken();
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${authToken}`,
      };

      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetchImpl(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    function normalizeExportResponse(data) {
      const exported = data?.template || {};
      const templateJson = exported.template_json && typeof exported.template_json === 'object'
        ? exported.template_json
        : {};
      const reference = exported.reference || templateJson.reference || templateJson.id || '';
      const name = exported.name || templateJson.name || reference || '';
      const imageCount = exported.image_count || templateJson.imageCount || 1;
      const outputFormat = exported.output_format || templateJson.outputFormat || 'png';

      return {
        exported,
        templateLab: data?.template_lab || {},
        template: {
          ...templateJson,
          id: reference || templateJson.id,
          reference,
          name,
          imageCount,
          outputFormat,
        },
        meta: {
          id: exported.id || null,
          reference,
          name,
          image_count: imageCount,
          output_format: outputFormat,
        },
      };
    }

    async function loadTemplate(explicitExportUrl) {
      const exportUrl = setExportUrl(explicitExportUrl || state.exportUrl);
      if (!exportUrl) throw new Error('Add a V2 export URL first');

      const data = await fetchJson(exportUrl, { method: 'GET' });
      const normalized = normalizeExportResponse(data);

      if (normalized.templateLab.export_url) setExportUrl(normalized.templateLab.export_url);
      if (normalized.meta.id) setLinkedTemplateId(normalized.meta.id);

      return normalized;
    }

    function buildApprovalPayload({
      template,
      reference,
      name,
      imageCount,
      outputFormat,
      sourceMode,
      sourcePrompt,
      generationNotes,
      createdBy,
    }) {
      if (!template) throw new Error('A template is required');

      const resolvedReference = String(reference || template.reference || template.id || '').trim();
      const resolvedName = String(name || template.name || resolvedReference).trim();
      const resolvedImageCount = Math.max(1, Number(imageCount || template.imageCount || 1));
      const resolvedOutputFormat = outputFormat === 'mp4' || template.outputFormat === 'mp4' ? 'mp4' : 'png';

      return {
        render_template_id: state.linkedTemplateId || undefined,
        reference: resolvedReference,
        name: resolvedName,
        output_format: resolvedOutputFormat,
        image_count: resolvedImageCount,
        template_json: template,
        source_mode: sourceMode || 'manual_json',
        source_prompt: sourcePrompt || undefined,
        generation_notes: generationNotes || `Approved from render-engine Template Lab on ${new Date().toISOString()}`,
        created_by: createdBy || 'render-engine-template-lab',
      };
    }

    async function approveTemplate(args) {
      if (!state.baseUrl) throw new Error('V2 base URL is required');

      const payload = buildApprovalPayload(args);
      const result = await fetchJson(`${state.baseUrl}/api/admin/render-templates/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (result.id) {
        setLinkedTemplateId(result.id);
        setExportUrl(`${state.baseUrl}/api/admin/render-templates/${result.id}/export`);
      }

      return {
        result,
        payload,
        exportUrl: state.exportUrl,
      };
    }

    function openAdmin() {
      if (!state.baseUrl) throw new Error('V2 base URL is required');
      global.open(`${state.baseUrl}/admin#video-templates`, '_blank', 'noopener,noreferrer');
    }

    function getContext() {
      return {
        baseUrl: state.baseUrl,
        exportUrl: state.exportUrl,
        linkedTemplateId: state.linkedTemplateId,
        authMode: getActiveAuthMode(),
        hasAuth: Boolean(getActiveAuthToken()),
        hasScopedSession: Boolean(state.sessionToken),
      };
    }

    return {
      approveTemplate,
      connectInputs,
      getContext,
      initializeFromQueryParams,
      loadTemplate,
      openAdmin,
      setBaseUrl,
      setExportUrl,
      setFallbackAdminSecret,
      setLinkedTemplateId,
    };
  }

  global.createTemplateLabV2Bridge = createTemplateLabV2Bridge;
})(window);
