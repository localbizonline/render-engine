(function(global) {
  'use strict';

  const DEFAULT_TEXT_VARIABLES = {
    title: 'Professional Service Completed',
    subtitle: 'Quality workmanship delivered on time and within budget',
    body: 'Sample post body text for preview purposes.',
    phone: '(021) 555-1234',
    company_name: 'Sample Company',
    service_areas: 'Cape Town • Northern Suburbs • Southern Suburbs',
    website: 'https://example.co.za',
    primary_colour: '#235BAA',
    secondary_colour: '#4582D0',
  };

  const DEFAULT_ASSETS = {
    userImages: [
      '/designer-assets/user_image_1.jpg',
      '/designer-assets/user_image_2.jpg',
    ],
    logo: '/designer-assets/test-reference.png',
    ctaLandscape: '/designer-assets/landscape_cta.png',
  };

  function createTemplateLabCanvasEditor(options = {}) {
    const Konva = global.Konva;
    const {
      stageHost,
      emptyState,
      summary,
      layerList,
      status,
      layerActions = {},
      historyActions = {},
      fields = {},
      assetPicker = {},
      onTemplateChange,
    } = options;

    const state = {
      template: null,
      frameIndex: 0,
      selectedLayerId: '',
      stage: null,
      guideLayer: null,
      canvasLayer: null,
      transformer: null,
      imageCache: new Map(),
      imagePromises: new Map(),
      activeTextEditor: null,
    };

    bindInspectorFields();
    bindAssetControls();
    bindLayerActions();
    bindKeyboardShortcuts();

    if (!Konva) {
      setStatus('Visual editor unavailable because Konva did not load.');
      setEmptyState('Visual editor unavailable. Refresh the page to reload the editor assets.');
      return {
        setDocument() {},
        clear() {},
        refresh() {},
      };
    }

    return {
      setDocument(template, { frameIndex = 0 } = {}) {
        state.template = template || null;
        state.frameIndex = Number.isInteger(frameIndex) ? Math.max(frameIndex, 0) : 0;
        if (!state.template) {
          clear();
          return;
        }
        render();
      },
      clear,
      refresh() {
        render();
      },
    };

    function bindInspectorFields() {
      bindNumericField(fields.x, (layer, value) => {
        layer.x = value;
        return true;
      }, 'Updated x in the visual editor.');
      bindNumericField(fields.y, (layer, value) => {
        layer.y = value;
        return true;
      }, 'Updated y in the visual editor.');
      bindNumericField(fields.width, (layer, value) => {
        layer.width = Math.max(1, value);
        return true;
      }, 'Updated width in the visual editor.');
      bindNumericField(fields.height, (layer, value) => {
        layer.height = Math.max(1, value);
        return true;
      }, 'Updated height in the visual editor.');
      bindNumericField(fields.opacity, (layer, value) => {
        layer.opacity = clamp(value, 0, 1);
        return true;
      }, 'Updated opacity in the visual editor.');
      bindNumericField(fields.borderRadius, (layer, value) => {
        layer.borderRadius = Math.max(0, value);
        return true;
      }, 'Updated borderRadius in the visual editor.');
      bindNumericField(fields.fontSize, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.fontSize = Math.max(1, value);
        return true;
      }, 'Updated fontSize in the visual editor.');
      bindNumericField(fields.lineHeight, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.lineHeight = Math.max(0.5, value);
        return true;
      }, 'Updated lineHeight in the visual editor.');
      bindNumericField(fields.letterSpacing, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.letterSpacing = value;
        return true;
      }, 'Updated letterSpacing in the visual editor.');
      bindNumericField(fields.shadowBlur, (layer, value) => {
        if (!supportsShadow(layer)) return false;
        const nextShadow = layer.shadow || { blur: 0, offsetX: 0, offsetY: 0, color: 'rgba(0,0,0,0.25)' };
        nextShadow.blur = Math.max(0, value);
        layer.shadow = nextShadow;
        return true;
      }, 'Updated shadow blur in the visual editor.');

      bindStringField(fields.align, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.align = value === 'center' || value === 'right' ? value : 'left';
        return true;
      }, 'Updated text alignment in the visual editor.');
      bindStringField(fields.fit, (layer, value) => {
        if (!isImageLikeLayer(layer)) return false;
        layer.fit = value === 'contain' || value === 'fill' ? value : 'cover';
        return true;
      }, 'Updated image fit in the visual editor.');
      bindStringField(fields.fontFamily, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.fontFamily = value || layer.fontFamily;
        return true;
      }, 'Updated the text font family in the visual editor.');
      bindStringField(fields.textColor, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.color = value || layer.color;
        return true;
      }, 'Updated the text color in the visual editor.');
      bindStringField(fields.fillColor, (layer, value) => {
        if (layer.type === 'rect') {
          layer.fill = value || layer.fill;
          return true;
        }
        if (layer.type === 'accent_bar') {
          layer.color = value || layer.color;
          return true;
        }
        if (layer.type === 'asset_image' || layer.type === 'logo' || layer.type === 'cta_image') {
          layer.background = value || undefined;
          return true;
        }
        return false;
      }, 'Updated the fill or background color in the visual editor.');
      bindStringField(fields.content, (layer, value) => {
        if (layer.type !== 'text') return false;
        layer.content = value;
        return true;
      }, 'Updated text content in the visual editor.');
    }

    function bindNumericField(input, updater, message) {
      if (!input) return;
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        updateSelectedLayer((layer) => updater(layer, value), message);
      });
    }

    function bindStringField(input, updater, message) {
      if (!input) return;
      input.addEventListener('input', () => {
        updateSelectedLayer((layer) => updater(layer, String(input.value || '').trim()), message);
      });
    }

    function bindAssetControls() {
      if (assetPicker.addButton) {
        assetPicker.addButton.addEventListener('click', () => {
          if (!state.template) return;
          const assetUrl = String(assetPicker.select?.value || '').trim();
          if (!assetUrl) return;
          addAssetLayer(assetUrl, assetUrl.split('/').pop() || 'decorative-asset');
        });
      }

      if (assetPicker.uploadButton && assetPicker.uploadInput) {
        assetPicker.uploadButton.addEventListener('click', () => {
          assetPicker.uploadInput.click();
        });

        assetPicker.uploadInput.addEventListener('change', () => {
          const file = assetPicker.uploadInput.files?.[0];
          if (!file) return;

          const reader = new global.FileReader();
          reader.onload = () => {
            const assetUrl = String(reader.result || '');
            if (!assetUrl) return;
            appendAssetOption(file.name || 'Uploaded PNG', assetUrl);
            addAssetLayer(assetUrl, file.name || 'Uploaded PNG');
            assetPicker.uploadInput.value = '';
          };
          reader.readAsDataURL(file);
        });
      }
    }

    function bindLayerActions() {
      if (layerActions.moveUpButton) {
        layerActions.moveUpButton.addEventListener('click', () => reorderSelectedLayer(-1));
      }
      if (layerActions.moveDownButton) {
        layerActions.moveDownButton.addEventListener('click', () => reorderSelectedLayer(1));
      }
      if (layerActions.toggleVisibilityButton) {
        layerActions.toggleVisibilityButton.addEventListener('click', () => {
          updateSelectedLayer((layer) => {
            layer.visible = layer.visible === false ? true : false;
            return true;
          }, 'Toggled layer visibility in the visual editor.');
        });
      }
      if (layerActions.toggleLockButton) {
        layerActions.toggleLockButton.addEventListener('click', () => {
          updateSelectedLayer((layer) => {
            layer.locked = layer.locked === true ? false : true;
            return true;
          }, 'Toggled layer locking in the visual editor.');
        });
      }
    }

    function bindKeyboardShortcuts() {
      if (!global.document || typeof global.document.addEventListener !== 'function') return;
      global.document.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();

        if ((event.metaKey || event.ctrlKey) && key === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            if (typeof historyActions.onRedoRequest === 'function') historyActions.onRedoRequest();
          } else if (typeof historyActions.onUndoRequest === 'function') {
            historyActions.onUndoRequest();
          }
          return;
        }

        if ((event.metaKey || event.ctrlKey) && key === 'y') {
          if (typeof historyActions.onRedoRequest === 'function') {
            event.preventDefault();
            historyActions.onRedoRequest();
          }
          return;
        }

        if (state.activeTextEditor || isEditableTarget(event.target) || !state.template || !state.selectedLayerId) {
          return;
        }

        if ((event.metaKey || event.ctrlKey) && key === 'd') {
          event.preventDefault();
          duplicateSelectedLayer();
          return;
        }

        if (key === 'delete' || key === 'backspace') {
          event.preventDefault();
          deleteSelectedLayer();
          return;
        }

        const step = event.shiftKey ? 10 : 1;
        if (key === 'arrowleft') {
          event.preventDefault();
          nudgeSelectedLayer(-step, 0);
        } else if (key === 'arrowright') {
          event.preventDefault();
          nudgeSelectedLayer(step, 0);
        } else if (key === 'arrowup') {
          event.preventDefault();
          nudgeSelectedLayer(0, -step);
        } else if (key === 'arrowdown') {
          event.preventDefault();
          nudgeSelectedLayer(0, step);
        }
      });
    }

    function clear() {
      closeActiveTextEditor({ commit: false, rerender: false });
      if (state.stage) {
        state.stage.destroy();
        state.stage = null;
        state.guideLayer = null;
        state.canvasLayer = null;
        state.transformer = null;
      }
      if (stageHost) stageHost.innerHTML = '';
      if (layerList) layerList.innerHTML = '';
      state.template = null;
      state.selectedLayerId = '';
      setSummary('No editable frame loaded.');
      setStatus('Load or generate a draft to start visually editing layers.');
      setEmptyState('Load or generate a draft to start visually editing layers.');
      updateInspector(null);
      updateLayerActionButtons(null);
    }

    function render() {
      const template = state.template;
      const frame = getCurrentFrame();

      if (!template || !frame || !stageHost) {
        clear();
        return;
      }

      closeActiveTextEditor({ commit: false, rerender: false });
      ensureStage(template);
      clearGuides();

      const existingChildren = state.canvasLayer.getChildren().toArray();
      existingChildren.forEach((child) => {
        if (child !== state.transformer) {
          child.destroy();
        }
      });

      renderBackground(template, frame);

      frame.layers.forEach((layer) => {
        const node = createLayerNode(layer);
        if (!node) return;
        node.id(layer.id || '');
        state.canvasLayer.add(node);
      });

      if (state.selectedLayerId) {
        const selectedNode = state.canvasLayer.findOne(`#${state.selectedLayerId}`);
        if (selectedNode) {
          state.transformer.nodes([selectedNode]);
          state.transformer.moveToTop();
        } else {
          state.selectedLayerId = '';
          state.transformer.nodes([]);
        }
      } else {
        state.transformer.nodes([]);
      }

      state.canvasLayer.draw();
      renderLayerList(frame.layers);
      const selectedLayer = findSelectedLayer(template);
      updateInspector(selectedLayer);
      updateLayerActionButtons(selectedLayer);
      setEmptyState('');
      setSummary(template.outputFormat === 'mp4'
        ? `Editing frame ${state.frameIndex + 1} of ${template.frames.length} on a ${template.width}x${template.height} reel.`
        : `Editing a ${template.width}x${template.height} PNG template frame.`);
      setStatus(state.selectedLayerId
        ? 'Drag, resize, nudge with arrow keys, or double-click text to edit directly on the canvas.'
        : 'Select a layer to edit its bounds, styling, and decorative asset settings.');
    }

    function ensureStage(template) {
      const hostWidth = Math.max((stageHost.clientWidth || 640) - 2, 320);
      const scale = Math.min(1, hostWidth / template.width);
      const stageWidth = Math.round(template.width * scale);
      const stageHeight = Math.round(template.height * scale);

      if (!state.stage) {
        if (typeof stageHost.setAttribute === 'function') {
          stageHost.setAttribute('tabindex', '0');
        }
        state.stage = new Konva.Stage({
          container: stageHost,
          width: stageWidth,
          height: stageHeight,
        });
        state.guideLayer = new Konva.Layer({ listening: false });
        state.canvasLayer = new Konva.Layer();
        state.transformer = new Konva.Transformer({
          rotateEnabled: false,
          borderStroke: '#5da8ff',
          anchorFill: '#ecf4ff',
          anchorStroke: '#2f7dde',
          anchorSize: 8,
          keepRatio: false,
          enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
        });
        state.canvasLayer.add(state.transformer);
        state.stage.add(state.guideLayer);
        state.stage.add(state.canvasLayer);
        state.stage.on('mousedown touchstart', (event) => {
          if (event.target === state.stage) {
            state.selectedLayerId = '';
            render();
          }
        });
      } else {
        state.stage.width(stageWidth);
        state.stage.height(stageHeight);
      }

      state.stage.scale({ x: scale, y: scale });
      stageHost.style.height = `${stageHeight}px`;
    }

    function renderBackground(template, frame) {
      if (frame.background.type === 'solid') {
        state.canvasLayer.add(new Konva.Rect({
          x: 0,
          y: 0,
          width: template.width,
          height: template.height,
          fill: resolveColor(frame.background.color),
          listening: false,
        }));
        return;
      }

      if (frame.background.type === 'gradient') {
        state.canvasLayer.add(new Konva.Rect({
          x: 0,
          y: 0,
          width: template.width,
          height: template.height,
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: polarGradientPoint(template.width, template.height, frame.background.angle),
          fillLinearGradientColorStops: buildGradientStops(frame.background.colors),
          listening: false,
        }));
        return;
      }

      const imageUrl = DEFAULT_ASSETS.userImages[Number(frame.background.index || 0) % DEFAULT_ASSETS.userImages.length];
      const node = new Konva.Rect({
        x: 0,
        y: 0,
        width: template.width,
        height: template.height,
        fill: '#182234',
        listening: false,
      });
      state.canvasLayer.add(node);
      applyImageFill(node, imageUrl, 'cover');
    }

    function createLayerNode(layer) {
      if (!layer || layer.visible === false) return null;

      let node = null;

      if (layer.type === 'text') {
        node = new Konva.Text({
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          text: resolveTemplateText(layer.content),
          fontSize: layer.fontSize,
          fontFamily: layer.fontFamily,
          fontStyle: mapFontWeight(layer.fontWeight),
          fill: resolveColor(layer.color),
          align: layer.align,
          verticalAlign: layer.verticalAlign === 'middle' ? 'middle' : layer.verticalAlign === 'bottom' ? 'bottom' : 'top',
          padding: Number(layer.padding || 0),
          lineHeight: Number(layer.lineHeight || 1.3),
          letterSpacing: Number(layer.letterSpacing || 0),
          opacity: layer.opacity == null ? 1 : layer.opacity,
          draggable: layer.locked !== true,
        });
        node.on('dblclick dbltap', () => {
          if (layer.locked === true) return;
          openTextEditor(node, layer);
        });
      } else if (layer.type === 'rect' || layer.type === 'accent_bar') {
        node = new Konva.Rect({
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          fill: resolveColor(layer.type === 'rect' ? layer.fill : layer.color),
          stroke: layer.type === 'rect' && layer.stroke ? resolveColor(layer.stroke.color) : undefined,
          strokeWidth: layer.type === 'rect' && layer.stroke ? layer.stroke.width : 0,
          cornerRadius: Number(layer.borderRadius || 0),
          opacity: layer.opacity == null ? 1 : layer.opacity,
          draggable: layer.locked !== true,
        });
      } else {
        const imageUrl = resolveLayerImageUrl(layer);
        node = new Konva.Rect({
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          fill: layer.background ? resolveColor(layer.background) : 'rgba(255,255,255,0.05)',
          cornerRadius: Number(layer.borderRadius || 0),
          opacity: layer.opacity == null ? 1 : layer.opacity,
          draggable: layer.locked !== true,
          stroke: 'rgba(255,255,255,0.12)',
          strokeWidth: 1,
          shadowBlur: Number(layer.shadow?.blur || 0),
          shadowOffsetX: Number(layer.shadow?.offsetX || 0),
          shadowOffsetY: Number(layer.shadow?.offsetY || 0),
          shadowColor: layer.shadow?.color || undefined,
        });
        if (imageUrl) {
          applyImageFill(node, imageUrl, layer.fit || 'contain');
        }
      }

      node.on('mousedown touchstart', () => {
        state.selectedLayerId = layer.id || '';
        render();
      });

      node.on('dragmove', () => {
        applySnapping(node, layer.id || '');
      });

      node.on('dragend', () => {
        clearGuides();
        applyNodeGeometry(node, layer.id || '');
      });

      node.on('transformend', () => {
        clearGuides();
        const nextWidth = Math.max(1, node.width() * node.scaleX());
        const nextHeight = Math.max(1, node.height() * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        node.width(nextWidth);
        node.height(nextHeight);
        applyNodeGeometry(node, layer.id || '');
      });

      return node;
    }

    function addAssetLayer(assetUrl, label) {
      if (!state.template) return;
      const nextTemplate = cloneTemplate(state.template);
      const frame = nextTemplate.frames?.[state.frameIndex];
      if (!frame) return;

      const layer = {
        id: `layer_asset_${Date.now().toString(36)}`,
        name: label || 'Decorative Asset',
        type: 'asset_image',
        assetId: label || assetUrl.split('/').pop() || 'decorative-asset',
        assetUrl,
        fit: 'contain',
        x: Math.round(nextTemplate.width * 0.15),
        y: Math.round(nextTemplate.height * 0.15),
        width: Math.round(nextTemplate.width * 0.26),
        height: Math.round(nextTemplate.height * 0.26),
        opacity: 1,
        borderRadius: 0,
        visible: true,
      };

      frame.layers.push(layer);
      state.selectedLayerId = layer.id;
      commitTemplate(nextTemplate, assetUrl.startsWith('data:')
        ? 'Uploaded a decorative transparent PNG asset to the frame.'
        : 'Added a decorative PNG asset to the frame.');
    }

    function appendAssetOption(label, assetUrl) {
      if (!assetPicker.select || !assetUrl || !global.document?.createElement) return;
      const existingOptions = Array.from(assetPicker.select.options || []);
      if (!existingOptions.some((option) => option.value === assetUrl)) {
        const option = global.document.createElement('option');
        option.value = assetUrl;
        option.textContent = label;
        assetPicker.select.appendChild(option);
      }
      assetPicker.select.value = assetUrl;
    }

    function applyNodeGeometry(node, layerId) {
      updateSelectedLayer((layer) => {
        if (layer.id !== layerId) return false;
        layer.x = Math.round(node.x());
        layer.y = Math.round(node.y());
        layer.width = Math.max(1, Math.round(node.width()));
        layer.height = Math.max(1, Math.round(node.height()));
        return true;
      }, 'Updated layer bounds in the visual editor.');
    }

    function renderLayerList(layers) {
      if (!layerList) return;
      if (!Array.isArray(layers) || !layers.length) {
        layerList.innerHTML = '<div class="canvas-layer-empty">No layers on this frame yet.</div>';
        updateLayerActionButtons(null);
        return;
      }

      layerList.innerHTML = layers.map((layer, index) => {
        const selected = state.selectedLayerId && state.selectedLayerId === layer.id;
        const label = escapeHtml(layer.name || `${layer.type.replace(/_/g, ' ')} ${index + 1}`);
        const chips = [];
        if (layer.visible === false) chips.push('<span class="canvas-layer-chip">Hidden</span>');
        if (layer.locked === true) chips.push('<span class="canvas-layer-chip">Locked</span>');
        return `<button class="canvas-layer-item${selected ? ' active' : ''}" type="button" data-layer-id="${escapeHtml(layer.id || '')}">
          <strong>${label}</strong>
          <span>${escapeHtml(layer.type)}</span>
          ${chips.length ? `<div class="canvas-layer-chip-row">${chips.join('')}</div>` : ''}
        </button>`;
      }).join('');

      layerList.querySelectorAll('[data-layer-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedLayerId = button.getAttribute('data-layer-id') || '';
          render();
        });
      });
    }

    function updateSelectedLayer(mutator, statusMessage) {
      if (!state.template || !state.selectedLayerId) return;

      const nextTemplate = cloneTemplate(state.template);
      const selectedLayer = findLayerById(nextTemplate, state.selectedLayerId);
      if (!selectedLayer) return;
      const changed = mutator(selectedLayer);
      if (!changed) return;
      commitTemplate(nextTemplate, statusMessage);
    }

    function reorderSelectedLayer(direction) {
      if (!state.template || !state.selectedLayerId) return;
      const nextTemplate = cloneTemplate(state.template);
      const frame = nextTemplate.frames?.[state.frameIndex];
      if (!frame || !Array.isArray(frame.layers)) return;

      const currentIndex = frame.layers.findIndex((layer) => layer.id === state.selectedLayerId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= frame.layers.length) return;

      const moved = frame.layers.splice(currentIndex, 1)[0];
      frame.layers.splice(nextIndex, 0, moved);
      commitTemplate(nextTemplate, direction < 0
        ? 'Moved the selected layer earlier in the layer list.'
        : 'Moved the selected layer later in the layer list.');
    }

    function deleteSelectedLayer() {
      if (!state.template || !state.selectedLayerId) return;
      const nextTemplate = cloneTemplate(state.template);
      const frame = nextTemplate.frames?.[state.frameIndex];
      if (!frame || !Array.isArray(frame.layers)) return;

      const currentIndex = frame.layers.findIndex((layer) => layer.id === state.selectedLayerId);
      if (currentIndex < 0) return;
      frame.layers.splice(currentIndex, 1);
      state.selectedLayerId = frame.layers[currentIndex]?.id || frame.layers[currentIndex - 1]?.id || '';
      commitTemplate(nextTemplate, 'Removed the selected layer from the frame.');
    }

    function duplicateSelectedLayer() {
      if (!state.template || !state.selectedLayerId) return;
      const nextTemplate = cloneTemplate(state.template);
      const frame = nextTemplate.frames?.[state.frameIndex];
      const original = findLayerById(nextTemplate, state.selectedLayerId);
      if (!frame || !original) return;

      const clone = cloneTemplate(original);
      clone.id = `${original.id || 'layer'}_${Math.random().toString(36).slice(2, 7)}`;
      clone.name = `${original.name || original.type} Copy`;
      clone.x = Math.min((clone.x || 0) + 20, Math.max(0, nextTemplate.width - clone.width));
      clone.y = Math.min((clone.y || 0) + 20, Math.max(0, nextTemplate.height - clone.height));

      const currentIndex = frame.layers.findIndex((layer) => layer.id === state.selectedLayerId);
      frame.layers.splice(currentIndex + 1, 0, clone);
      state.selectedLayerId = clone.id;
      commitTemplate(nextTemplate, 'Duplicated the selected layer.');
    }

    function nudgeSelectedLayer(deltaX, deltaY) {
      updateSelectedLayer((layer) => {
        layer.x = Math.max(0, Math.round((layer.x || 0) + deltaX));
        layer.y = Math.max(0, Math.round((layer.y || 0) + deltaY));
        return true;
      }, 'Nudged the selected layer on the canvas.');
    }

    function commitTemplate(nextTemplate, statusMessage) {
      state.template = nextTemplate;
      if (typeof onTemplateChange === 'function') {
        onTemplateChange(nextTemplate, {
          frameIndex: state.frameIndex,
          selectedLayerId: state.selectedLayerId,
          message: statusMessage || '',
        });
      }
      render();
    }

    function getCurrentFrame() {
      return state.template?.frames?.[state.frameIndex] || null;
    }

    function findSelectedLayer(template) {
      return state.selectedLayerId ? findLayerById(template, state.selectedLayerId) : null;
    }

    function updateInspector(layer) {
      setFieldValue(fields.x, layer?.x);
      setFieldValue(fields.y, layer?.y);
      setFieldValue(fields.width, layer?.width);
      setFieldValue(fields.height, layer?.height);
      setFieldValue(fields.opacity, layer?.opacity == null ? 1 : layer.opacity);
      setFieldValue(fields.borderRadius, layer?.borderRadius || 0);
      setFieldValue(fields.fontSize, layer?.type === 'text' ? layer.fontSize : '');
      setFieldValue(fields.lineHeight, layer?.type === 'text' ? (layer.lineHeight || 1.3) : '');
      setFieldValue(fields.letterSpacing, layer?.type === 'text' ? (layer.letterSpacing || 0) : '');
      setFieldValue(fields.align, layer?.type === 'text' ? layer.align : '');
      setFieldValue(fields.fit, isImageLikeLayer(layer) ? layer.fit : '');
      setFieldValue(fields.shadowBlur, supportsShadow(layer) ? (layer.shadow?.blur || 0) : '');
      setFieldValue(fields.fontFamily, layer?.type === 'text' ? layer.fontFamily : '');
      setFieldValue(fields.textColor, layer?.type === 'text' ? layer.color : '');
      setFieldValue(fields.fillColor, resolveFillFieldValue(layer));
      setFieldValue(fields.content, layer?.type === 'text' ? layer.content : '');

      toggleField(fields.fontSize, layer?.type === 'text');
      toggleField(fields.lineHeight, layer?.type === 'text');
      toggleField(fields.letterSpacing, layer?.type === 'text');
      toggleField(fields.align, layer?.type === 'text');
      toggleField(fields.fontFamily, layer?.type === 'text');
      toggleField(fields.textColor, layer?.type === 'text');
      toggleField(fields.content, layer?.type === 'text');
      toggleField(fields.fit, isImageLikeLayer(layer));
      toggleField(fields.shadowBlur, supportsShadow(layer));
      toggleField(fields.fillColor, supportsFillField(layer));
      toggleField(fields.borderRadius, Boolean(layer && layer.type !== 'text'));
      toggleField(fields.opacity, Boolean(layer));
      toggleField(fields.x, Boolean(layer));
      toggleField(fields.y, Boolean(layer));
      toggleField(fields.width, Boolean(layer));
      toggleField(fields.height, Boolean(layer));
    }

    function updateLayerActionButtons(layer) {
      const layers = Array.isArray(getCurrentFrame()?.layers) ? getCurrentFrame().layers : [];
      const selectedIndex = layer ? layers.findIndex((entry) => entry.id === layer.id) : -1;

      if (layerActions.moveUpButton) layerActions.moveUpButton.disabled = !layer || selectedIndex <= 0;
      if (layerActions.moveDownButton) layerActions.moveDownButton.disabled = !layer || selectedIndex < 0 || selectedIndex >= layers.length - 1;
      if (layerActions.toggleVisibilityButton) {
        layerActions.toggleVisibilityButton.disabled = !layer;
        layerActions.toggleVisibilityButton.textContent = layer?.visible === false ? 'Show Layer' : 'Hide Layer';
      }
      if (layerActions.toggleLockButton) {
        layerActions.toggleLockButton.disabled = !layer;
        layerActions.toggleLockButton.textContent = layer?.locked === true ? 'Unlock Layer' : 'Lock Layer';
      }
    }

    function setFieldValue(field, value) {
      if (!field) return;
      field.value = value == null ? '' : String(value);
    }

    function toggleField(field, enabled) {
      if (!field) return;
      field.disabled = !enabled;
    }

    function applyImageFill(node, imageUrl, fitMode) {
      const cachedImage = state.imageCache.get(imageUrl);
      if (cachedImage) {
        node.fillPatternImage(cachedImage);
        node.fillPatternRepeat('no-repeat');
        applyPatternSizing(node, cachedImage, fitMode);
        state.canvasLayer.draw();
        return;
      }

      if (!state.imagePromises.has(imageUrl)) {
        const image = new global.Image();
        image.crossOrigin = 'anonymous';
        state.imagePromises.set(imageUrl, new Promise((resolve) => {
          image.onload = () => {
            state.imageCache.set(imageUrl, image);
            resolve(image);
          };
          image.onerror = () => resolve(null);
          image.src = imageUrl;
        }).then(() => {
          state.imagePromises.delete(imageUrl);
          render();
        }));
      }
    }

    function applyPatternSizing(node, image, fitMode) {
      const width = node.width();
      const height = node.height();
      const scale = fitMode === 'cover'
        ? Math.max(width / image.width, height / image.height)
        : fitMode === 'fill'
          ? null
          : Math.min(width / image.width, height / image.height);

      if (scale == null) {
        node.fillPatternScale({ x: width / image.width, y: height / image.height });
        node.fillPatternOffset({ x: 0, y: 0 });
        return;
      }

      node.fillPatternScale({ x: scale, y: scale });
      node.fillPatternOffset({
        x: Math.max(0, (image.width - width / scale) / 2),
        y: Math.max(0, (image.height - height / scale) / 2),
      });
    }

    function resolveLayerImageUrl(layer) {
      if (layer.type === 'image') {
        return DEFAULT_ASSETS.userImages[Number(layer.index || 0) % DEFAULT_ASSETS.userImages.length];
      }
      if (layer.type === 'asset_image') {
        return layer.assetUrl;
      }
      if (layer.type === 'logo') {
        return DEFAULT_ASSETS.logo;
      }
      if (layer.type === 'cta_image') {
        return DEFAULT_ASSETS.ctaLandscape;
      }
      return '';
    }

    function resolveFillFieldValue(layer) {
      if (!layer) return '';
      if (layer.type === 'rect') return layer.fill || '';
      if (layer.type === 'accent_bar') return layer.color || '';
      if (layer.type === 'asset_image' || layer.type === 'logo' || layer.type === 'cta_image') {
        return layer.background || '';
      }
      return '';
    }

    function resolveTemplateText(content) {
      return String(content || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => DEFAULT_TEXT_VARIABLES[key] || '');
    }

    function mapFontWeight(fontWeight) {
      if (fontWeight === 'bold' || fontWeight === 'semibold') return 'bold';
      if (fontWeight === 'medium') return '600';
      return 'normal';
    }

    function resolveColor(value) {
      return String(value || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => DEFAULT_TEXT_VARIABLES[key] || '#ffffff');
    }

    function findLayerById(template, layerId) {
      for (const frame of template?.frames || []) {
        for (const layer of frame.layers || []) {
          if (layer.id === layerId) return layer;
        }
      }
      return null;
    }

    function cloneTemplate(template) {
      return JSON.parse(JSON.stringify(template));
    }

    function isImageLikeLayer(layer) {
      return Boolean(layer && (layer.type === 'image' || layer.type === 'asset_image' || layer.type === 'logo' || layer.type === 'cta_image'));
    }

    function supportsShadow(layer) {
      return Boolean(layer && (layer.type === 'image' || layer.type === 'asset_image'));
    }

    function supportsFillField(layer) {
      return Boolean(layer && (layer.type === 'rect' || layer.type === 'accent_bar' || layer.type === 'asset_image' || layer.type === 'logo' || layer.type === 'cta_image'));
    }

    function openTextEditor(node, layer) {
      if (!stageHost || !state.stage || !layer || layer.type !== 'text' || !global.document?.createElement) return;

      closeActiveTextEditor({ commit: false, rerender: false });

      const stageRect = state.stage.container().getBoundingClientRect();
      const stageScale = state.stage.scaleX() || 1;
      const absolutePosition = node.absolutePosition();
      const textarea = global.document.createElement('textarea');
      textarea.value = layer.content || '';
      textarea.style.position = 'fixed';
      textarea.style.left = `${stageRect.left + absolutePosition.x * stageScale}px`;
      textarea.style.top = `${stageRect.top + absolutePosition.y * stageScale}px`;
      textarea.style.width = `${Math.max(80, layer.width * stageScale)}px`;
      textarea.style.height = `${Math.max(56, layer.height * stageScale)}px`;
      textarea.style.padding = `${Math.max(0, Number(layer.padding || 0) * stageScale)}px`;
      textarea.style.margin = '0';
      textarea.style.border = '1px solid rgba(93, 168, 255, 0.55)';
      textarea.style.borderRadius = `${Math.max(8, Number(layer.borderRadius || 0) * stageScale)}px`;
      textarea.style.background = 'rgba(6, 10, 18, 0.96)';
      textarea.style.color = resolveColor(layer.color);
      textarea.style.fontFamily = layer.fontFamily || 'Avenir Next, sans-serif';
      textarea.style.fontSize = `${Math.max(12, Number(layer.fontSize || 16) * stageScale)}px`;
      textarea.style.lineHeight = String(layer.lineHeight || 1.3);
      textarea.style.textAlign = layer.align || 'left';
      textarea.style.resize = 'none';
      textarea.style.outline = 'none';
      textarea.style.zIndex = '2000';
      textarea.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.35)';
      textarea.style.overflow = 'hidden';
      textarea.setAttribute('aria-label', 'Canvas text editor');

      global.document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      node.hide();
      state.transformer.nodes([]);
      state.canvasLayer.draw();

      const commit = () => {
        updateSelectedLayer((selectedLayer) => {
          if (selectedLayer.id !== layer.id || selectedLayer.type !== 'text') return false;
          selectedLayer.content = textarea.value;
          return true;
        }, 'Edited text directly on the canvas.');
      };

      const cancel = () => {
        node.show();
        state.canvasLayer.draw();
      };

      const handleBlur = () => {
        closeActiveTextEditor({ commit: true });
      };

      const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeActiveTextEditor({ commit: false, rerender: true });
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          closeActiveTextEditor({ commit: true });
        }
      };

      textarea.addEventListener('blur', handleBlur);
      textarea.addEventListener('keydown', handleKeyDown);

      state.activeTextEditor = {
        cleanup() {
          textarea.removeEventListener('blur', handleBlur);
          textarea.removeEventListener('keydown', handleKeyDown);
          textarea.remove();
        },
        commit,
        cancel,
      };
    }

    function closeActiveTextEditor({ commit, rerender } = { commit: false, rerender: true }) {
      if (!state.activeTextEditor) return;
      const activeEditor = state.activeTextEditor;
      state.activeTextEditor = null;
      if (commit) {
        activeEditor.commit();
      } else {
        activeEditor.cancel();
      }
      activeEditor.cleanup();
      if (!commit && rerender) {
        render();
      }
    }

    function applySnapping(node, layerId) {
      if (!state.template || !state.stage) return;

      const threshold = 8 / (state.stage.scaleX() || 1);
      const snapTargets = getSnapTargets(layerId);
      const nodeBox = getNodeBox(node);
      const verticalSnap = findBestSnapMatch(nodeBox.x, nodeBox.width, snapTargets.vertical, threshold);
      const horizontalSnap = findBestSnapMatch(nodeBox.y, nodeBox.height, snapTargets.horizontal, threshold);

      clearGuides();
      if (verticalSnap) {
        node.x(verticalSnap.guide - verticalSnap.offset);
        drawGuide('vertical', verticalSnap.guide);
      }
      if (horizontalSnap) {
        node.y(horizontalSnap.guide - horizontalSnap.offset);
        drawGuide('horizontal', horizontalSnap.guide);
      }
    }

    function getSnapTargets(activeLayerId) {
      const frame = getCurrentFrame();
      const vertical = [0, state.template.width / 2, state.template.width];
      const horizontal = [0, state.template.height / 2, state.template.height];

      for (const layer of frame?.layers || []) {
        if (!layer || layer.id === activeLayerId || layer.visible === false) continue;
        vertical.push(layer.x, layer.x + layer.width / 2, layer.x + layer.width);
        horizontal.push(layer.y, layer.y + layer.height / 2, layer.y + layer.height);
      }

      return { vertical, horizontal };
    }

    function getNodeBox(node) {
      return {
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
      };
    }

    function findBestSnapMatch(start, size, guides, threshold) {
      const edges = [
        { guide: start, offset: 0 },
        { guide: start + size / 2, offset: size / 2 },
        { guide: start + size, offset: size },
      ];

      let bestMatch = null;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const edge of edges) {
        for (const guide of guides) {
          const distance = Math.abs(guide - edge.guide);
          if (distance <= threshold && distance < minDistance) {
            minDistance = distance;
            bestMatch = { guide, offset: edge.offset };
          }
        }
      }

      return bestMatch;
    }

    function drawGuide(direction, guide) {
      if (!state.guideLayer || !state.template) return;
      const points = direction === 'vertical'
        ? [guide, 0, guide, state.template.height]
        : [0, guide, state.template.width, guide];
      state.guideLayer.add(new Konva.Line({
        points,
        stroke: '#5da8ff',
        strokeWidth: 1,
        dash: [6, 4],
        listening: false,
      }));
      state.guideLayer.draw();
    }

    function clearGuides() {
      if (!state.guideLayer) return;
      state.guideLayer.destroyChildren();
      state.guideLayer.draw();
    }

    function isEditableTarget(target) {
      const tagName = String(target?.tagName || '').toUpperCase();
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || Boolean(target?.isContentEditable);
    }

    function setSummary(message) {
      if (summary) summary.textContent = message || '';
    }

    function setStatus(message) {
      if (status) status.textContent = message || '';
    }

    function setEmptyState(message) {
      if (!emptyState) return;
      emptyState.textContent = message || '';
      emptyState.style.display = message ? '' : 'none';
    }

    function polarGradientPoint(width, height, angle) {
      const radians = (Number(angle || 0) * Math.PI) / 180;
      return {
        x: Math.cos(radians) * width,
        y: Math.sin(radians) * height,
      };
    }

    function buildGradientStops(colors) {
      if (!Array.isArray(colors) || !colors.length) {
        return [0, '#10151D', 1, '#1B2A40'];
      }
      if (colors.length === 1) {
        return [0, resolveColor(colors[0]), 1, resolveColor(colors[0])];
      }

      const stops = [];
      colors.forEach((color, index) => {
        const ratio = colors.length === 1 ? 1 : index / (colors.length - 1);
        stops.push(ratio, resolveColor(color));
      });
      return stops;
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  global.createTemplateLabCanvasEditor = createTemplateLabCanvasEditor;
})(window);
