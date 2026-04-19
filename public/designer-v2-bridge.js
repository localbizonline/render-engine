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
    const getApiKey = typeof options.getApiKey === 'function' ? options.getApiKey : () => String(options.apiKey || '').trim();
    const initialBaseUrl = normalizeBaseUrl(options.initialBaseUrl || '');
    const proxyBasePath = String(options.proxyBasePath || '/api/designer/v2').replace(/\/+$/, '');
    const serverV2Proxy = Boolean(options.serverV2Proxy);

    const state = {
      baseUrl: normalizeBaseUrl(storage?.getItem('designer_v2_base_url') || initialBaseUrl || ''),
      fallbackAdminSecret: String(storage?.getItem('designer_v2_admin_secret') || '').trim(),
      sessionToken: '',
      exportUrl: '',
      linkedTemplateId: null,
      serverV2Proxy,
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
      if (state.serverV2Proxy) return 'server_proxy';
      if (state.fallbackAdminSecret) return 'admin_secret';
      return null;
    }

    function getActiveAuthToken() {
      if (state.serverV2Proxy) return 'server_proxy';
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
      const outputFormat = exported.output_format || templateJson.outputFormat || 'mp4';

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

      const data = state.sessionToken
        ? await fetchJson(exportUrl, { method: 'GET' })
        : state.serverV2Proxy
          ? await fetchProxyJson(`${proxyBasePath}/export?url=${encodeURIComponent(exportUrl)}`, { method: 'GET' })
          : await fetchJson(exportUrl, { method: 'GET' });
      const normalized = normalizeExportResponse(data);
      if (normalized.template.outputFormat !== 'mp4') {
        throw new Error('Static image templates are no longer supported in Reel Template Studio.');
      }

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
      if (template.outputFormat && template.outputFormat !== 'mp4') {
        throw new Error('Static image templates are no longer supported in Reel Template Studio.');
      }

      const normalizedTemplate = {
        ...template,
        outputFormat: 'mp4',
      };

      const resolvedReference = String(reference || normalizedTemplate.reference || normalizedTemplate.id || '').trim();
      const resolvedName = String(name || normalizedTemplate.name || resolvedReference).trim();
      const resolvedImageCount = Math.max(1, Number(imageCount || normalizedTemplate.imageCount || 1));
      const resolvedOutputFormat = 'mp4';

      return {
        render_template_id: state.linkedTemplateId || undefined,
        reference: resolvedReference,
        name: resolvedName,
        output_format: resolvedOutputFormat,
        image_count: resolvedImageCount,
        template_json: normalizedTemplate,
        source_mode: sourceMode || 'manual_json',
        source_prompt: sourcePrompt || undefined,
        generation_notes: generationNotes || `Approved from Reel Template Studio on ${new Date().toISOString()}`,
        created_by: createdBy || 'render-engine-template-lab',
      };
    }

    async function approveTemplate(args) {
      if (!state.baseUrl) throw new Error('V2 base URL is required');

      const payload = buildApprovalPayload(args);
      const result = state.sessionToken
        ? await fetchJson(`${state.baseUrl}/api/admin/render-templates/import`, {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : state.serverV2Proxy
          ? await fetchProxyJson(`${proxyBasePath}/import`, {
              method: 'POST',
              body: JSON.stringify(payload),
            })
          : await fetchJson(`${state.baseUrl}/api/admin/render-templates/import`, {
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

    async function loadExperimentPost(postId) {
      const resolvedPostId = String(postId || '').trim();
      if (!resolvedPostId) throw new Error('Post ID is required');

      if (state.serverV2Proxy) {
        return fetchProxyJson(`${proxyBasePath}/post?id=${encodeURIComponent(resolvedPostId)}`, {
          method: 'GET',
        });
      }

      if (!state.baseUrl) throw new Error('V2 base URL is required');

      return fetchJson(`${state.baseUrl}/api/admin/experiment-posts/${encodeURIComponent(resolvedPostId)}`, {
        method: 'GET',
      });
    }

    async function listExperimentPosts(options = {}) {
      const limit = Math.max(1, Math.min(Number.parseInt(String(options.limit || '12'), 10) || 12, 50));
      const status = String(options.status || 'ready').trim();

      if (state.serverV2Proxy) {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        return fetchProxyJson(`${proxyBasePath}/posts/recent?${params.toString()}`, {
          method: 'GET',
        });
      }

      if (!state.baseUrl) throw new Error('V2 base URL is required');

      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set('status', status);
      return fetchJson(`${state.baseUrl}/api/admin/experiment-posts?${params.toString()}`, {
        method: 'GET',
      });
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
        usingServerProxy: state.serverV2Proxy,
      };
    }

    async function fetchProxyJson(url, options = {}) {
      const apiKey = String(getApiKey() || '').trim();
      const headers = {
        ...(options.headers || {}),
      };

      if (apiKey) {
        headers['X-Api-Key'] = apiKey;
      }

      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetchImpl(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    return {
      approveTemplate,
      connectInputs,
      getContext,
      initializeFromQueryParams,
      listExperimentPosts,
      loadExperimentPost,
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
