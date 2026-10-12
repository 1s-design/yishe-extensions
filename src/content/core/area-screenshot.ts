// @ts-nocheck
// area-screenshot.ts: 网页区域截屏
//
// 流程：进入选区模式 → 拖拽框选 → 松手截屏 → 裁剪 → 预览（下载本地 / 保存到素材 / 取消）
//
// 关键点：
// - content script 无法直接调用 chrome.tabs.captureVisibleTab，必须交给 background 代劳
// - captureVisibleTab 抓的是"当前可见画面"，所以必须先隐藏遮罩再截图，否则蒙层会被截进去
// - 选区坐标是视口坐标（overlay 是 position:fixed），裁剪时乘以 devicePixelRatio 映射到物理像素
// - 不锁 overflow（会导致页面回流、截图内容位移），改为拦截 wheel/touchmove/滚动键

(function initCoreAreaScreenshot() {
  'use strict';

  if (window.CoreAreaScreenshot) {
    return;
  }

  const ROOT_ID = 'yishe-area-screenshot-root';
  const STYLE_ID = 'yishe-area-screenshot-style';
  const MIN_SIZE = 8;
  const Z_INDEX = 2147483646;
  const SCROLL_KEYS = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'PageUp',
    'PageDown',
    'Home',
    'End',
    ' ',
  ];

  // phase: idle | selecting | previewing
  const state = {
    phase: 'idle',
    dragging: false,
    startX: 0,
    startY: 0,
    rect: null,
    root: null,
    mask: null,
    box: null,
    sizeLabel: null,
    hint: null,
  };

  function nextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + ROOT_ID + ' {',
      '  position: fixed !important;',
      '  inset: 0 !important;',
      '  z-index: ' + Z_INDEX + ' !important;',
      '  cursor: crosshair !important;',
      '  user-select: none !important;',
      '  -webkit-user-select: none !important;',
      '  touch-action: none !important;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;',
      '}',
      '#' + ROOT_ID + ' .yshot-mask {',
      '  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35);',
      '}',
      '#' + ROOT_ID + ' .yshot-box {',
      '  position: absolute; display: none; box-sizing: border-box;',
      '  border: 1px solid #4f46e5; background: transparent;',
      '  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);',
      '}',
      '#' + ROOT_ID + ' .yshot-size {',
      '  position: absolute; display: none; pointer-events: none;',
      '  padding: 2px 6px; border-radius: 4px;',
      '  background: rgba(0, 0, 0, 0.75); color: #fff;',
      '  font-size: 11px; line-height: 16px; white-space: nowrap;',
      '}',
      '#' + ROOT_ID + ' .yshot-hint {',
      '  position: absolute; left: 50%; top: 16px; transform: translateX(-50%);',
      '  padding: 7px 14px; border-radius: 8px;',
      '  background: rgba(0, 0, 0, 0.75); color: #fff;',
      '  font-size: 12px; line-height: 18px; white-space: nowrap; pointer-events: none;',
      '}',
      '#' + ROOT_ID + ' .yshot-preview {',
      '  position: absolute; inset: 0; cursor: default;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(0, 0, 0, 0.55);',
      '}',
      '#' + ROOT_ID + ' .yshot-card {',
      '  display: flex; flex-direction: column; align-items: center; gap: 12px;',
      '  max-width: 92vw; max-height: 92vh; padding: 14px;',
      '  background: #fff; border-radius: 12px;',
      '  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);',
      '}',
      '#' + ROOT_ID + ' .yshot-preview-img {',
      '  display: block; max-width: 80vw; max-height: 60vh;',
      '  border: 1px solid #ebeef5; border-radius: 6px; background: #f5f7fa;',
      '}',
      '#' + ROOT_ID + ' .yshot-meta { font-size: 12px; color: #909399; }',
      '#' + ROOT_ID + ' .yshot-actions { display: flex; gap: 10px; }',
      '#' + ROOT_ID + ' .yshot-btn {',
      '  padding: 8px 16px; border-radius: 8px; font-size: 13px; line-height: 18px;',
      '  border: 1px solid #dcdfe6; background: #fff; color: #303133; cursor: pointer;',
      '}',
      '#' + ROOT_ID + ' .yshot-btn:hover:not(:disabled) { background: #f5f7fa; }',
      '#' + ROOT_ID + ' .yshot-btn.is-primary {',
      '  border-color: #4f46e5; background: #4f46e5; color: #fff;',
      '}',
      '#' + ROOT_ID + ' .yshot-btn.is-primary:hover:not(:disabled) { background: #4338ca; }',
      '#' + ROOT_ID + ' .yshot-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
    ].join('\n');
    document.documentElement.appendChild(style);
  }

  function notify(message, type) {
    if (window.CoreDOMUtils && typeof window.CoreDOMUtils.showNotification === 'function') {
      window.CoreDOMUtils.showNotification(message, type || 'info');
      return;
    }
    console.warn('[AreaScreenshot]', message);
  }

  function buildFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());
    return 'yishe-screenshot-' + stamp + '.png';
  }

  // ---------- 选区交互 ----------

  function updateBox(x, y) {
    const left = Math.min(state.startX, x);
    const top = Math.min(state.startY, y);
    const width = Math.abs(x - state.startX);
    const height = Math.abs(y - state.startY);
    state.rect = { left, top, width, height };

    if (state.mask) {
      state.mask.style.display = 'none';
    }
    state.box.style.display = 'block';
    state.box.style.left = left + 'px';
    state.box.style.top = top + 'px';
    state.box.style.width = width + 'px';
    state.box.style.height = height + 'px';

    state.sizeLabel.style.display = 'block';
    state.sizeLabel.textContent = Math.round(width) + ' × ' + Math.round(height);
    state.sizeLabel.style.left = left + 'px';
    state.sizeLabel.style.top = (top - 22 < 0 ? top + 4 : top - 22) + 'px';
  }

  function onMouseDown(event) {
    if (state.phase !== 'selecting') {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    state.dragging = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    updateBox(event.clientX, event.clientY);
  }

  function onMouseMove(event) {
    if (state.phase !== 'selecting' || !state.dragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateBox(event.clientX, event.clientY);
  }

  function onMouseUp(event) {
    if (state.phase !== 'selecting' || !state.dragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    state.dragging = false;
    updateBox(event.clientX, event.clientY);

    const rect = state.rect;
    if (!rect || rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      teardown();
      notify('选区太小，已取消截屏', 'warning');
      return;
    }
    void finishCapture();
  }

  function onContextMenu(event) {
    if (state.phase !== 'selecting' && state.phase !== 'previewing') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (state.phase === 'selecting') {
      teardown();
      notify('已取消截屏', 'info');
    }
  }

  function onKeyDown(event) {
    if (state.phase !== 'selecting' && state.phase !== 'previewing') {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      teardown();
      notify('已取消截屏', 'info');
      return;
    }
    // 选区模式下拦截滚动键，避免页面在拖拽过程中滚动导致选区错位
    if (state.phase === 'selecting' && SCROLL_KEYS.indexOf(event.key) !== -1) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onWheel(event) {
    if (state.phase !== 'selecting') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchMove(event) {
    if (state.phase !== 'selecting') {
      return;
    }
    event.preventDefault();
  }

  function bindEvents() {
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  }

  function unbindEvents() {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('touchmove', onTouchMove, true);
  }

  // ---------- 截屏与裁剪 ----------

  async function finishCapture() {
    const rect = { ...state.rect };
    const dpr = window.devicePixelRatio || 1;
    state.phase = 'busy';

    // 先把整个遮罩藏起来，等两帧让浏览器完成重绘，再抓图
    state.root.style.visibility = 'hidden';
    await nextFrame();

    let shotDataUrl = '';
    try {
      const response = await window.CoreDOMUtils.sendMessage({
        action: 'captureVisibleTab',
      });
      if (!response || !response.success || !response.data || !response.data.dataUrl) {
        throw new Error((response && response.error) || '截屏失败');
      }
      shotDataUrl = response.data.dataUrl;
    } catch (error) {
      teardown();
      notify((error && error.message) || '截屏失败', 'error');
      return;
    }

    let cropped = '';
    try {
      cropped = await cropDataUrl(shotDataUrl, rect, dpr);
    } catch (error) {
      teardown();
      notify((error && error.message) || '裁剪截图失败', 'error');
      return;
    }

    showPreview(cropped, rect);
  }

  function cropDataUrl(dataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let sx = Math.round(rect.left * dpr);
        let sy = Math.round(rect.top * dpr);
        let sw = Math.round(rect.width * dpr);
        let sh = Math.round(rect.height * dpr);

        // 与图像实际边界求交，避免拖到视口外时越界
        if (sx < 0) {
          sw += sx;
          sx = 0;
        }
        if (sy < 0) {
          sh += sy;
          sy = 0;
        }
        if (sx + sw > img.naturalWidth) {
          sw = img.naturalWidth - sx;
        }
        if (sy + sh > img.naturalHeight) {
          sh = img.naturalHeight - sy;
        }
        if (sw <= 0 || sh <= 0) {
          reject(new Error('选区无效，无法裁剪'));
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建画布'));
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(new Error('导出截图失败'));
        }
      };
      img.onerror = () => reject(new Error('截图数据解析失败'));
      img.src = dataUrl;
    });
  }

  // ---------- 预览浮层 ----------

  function createButton(label, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yshot-btn' + (extraClass ? ' ' + extraClass : '');
    button.textContent = label;
    return button;
  }

  function setBusy(buttons, busy, busyLabel, activeButton) {
    buttons.forEach((button) => {
      button.disabled = busy;
    });
    if (!busy) {
      return;
    }
    if (activeButton && busyLabel) {
      activeButton.textContent = busyLabel;
    }
  }

  function showPreview(dataUrl, rect) {
    if (!state.root) {
      return;
    }
    state.phase = 'previewing';
    state.root.style.visibility = 'visible';
    state.root.style.cursor = 'default';
    state.root.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'yshot-preview';

    const card = document.createElement('div');
    card.className = 'yshot-card';

    const preview = document.createElement('img');
    preview.className = 'yshot-preview-img';
    preview.alt = '截图预览';
    preview.src = dataUrl;

    const meta = document.createElement('div');
    meta.className = 'yshot-meta';
    meta.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';

    const actions = document.createElement('div');
    actions.className = 'yshot-actions';

    const cancelBtn = createButton('取消', '');
    const saveBtn = createButton('保存到素材', 'is-primary');
    const downloadBtn = createButton('下载本地', '');

    const buttons = [cancelBtn, saveBtn, downloadBtn];

    cancelBtn.addEventListener('click', () => {
      teardown();
    });

    downloadBtn.addEventListener('click', () => {
      void handleDownload(dataUrl, buttons, downloadBtn);
    });

    saveBtn.addEventListener('click', () => {
      void handleSave(dataUrl, buttons, saveBtn);
    });

    actions.append(cancelBtn, saveBtn, downloadBtn);
    card.append(preview, meta, actions);
    panel.appendChild(card);
    state.root.appendChild(panel);
  }

  async function handleDownload(dataUrl, buttons, activeButton) {
    setBusy(buttons, true, '下载中…', activeButton);
    try {
      const response = await window.CoreDOMUtils.sendMessage({
        action: 'downloadScreenshot',
        dataUrl,
        filename: buildFilename(),
      });
      if (!response || !response.success) {
        throw new Error((response && response.error) || '下载失败');
      }
      teardown();
      notify('截图已开始下载', 'success');
    } catch (error) {
      setBusy(buttons, false);
      notify((error && error.message) || '下载失败', 'error');
    }
  }

  async function handleSave(dataUrl, buttons, activeButton) {
    setBusy(buttons, true, '保存中…', activeButton);
    try {
      const response = await window.CoreDOMUtils.sendMessage({
        action: 'uploadImageToGallery',
        imageUrl: dataUrl,
      });
      if (!response || !response.success) {
        throw new Error((response && response.error) || '保存失败');
      }
      teardown();
      notify('截图已采集到采集素材', 'success');
    } catch (error) {
      setBusy(buttons, false);
      notify((error && error.message) || '保存失败', 'error');
    }
  }

  // ---------- 生命周期 ----------

  function start() {
    if (state.phase !== 'idle') {
      return;
    }

    injectStyle();

    const root = document.createElement('div');
    root.id = ROOT_ID;

    const mask = document.createElement('div');
    mask.className = 'yshot-mask';

    const box = document.createElement('div');
    box.className = 'yshot-box';

    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'yshot-size';

    const hint = document.createElement('div');
    hint.className = 'yshot-hint';
    hint.textContent = '拖动鼠标框选截图区域 · Esc 或右键取消';

    root.append(mask, box, sizeLabel, hint);
    document.documentElement.appendChild(root);

    state.root = root;
    state.mask = mask;
    state.box = box;
    state.sizeLabel = sizeLabel;
    state.hint = hint;
    state.rect = null;
    state.dragging = false;
    state.phase = 'selecting';

    bindEvents();
  }

  function teardown() {
    unbindEvents();
    if (state.root && state.root.parentNode) {
      state.root.parentNode.removeChild(state.root);
    }
    state.root = null;
    state.mask = null;
    state.box = null;
    state.sizeLabel = null;
    state.hint = null;
    state.rect = null;
    state.dragging = false;
    state.phase = 'idle';
  }

  window.CoreAreaScreenshot = {
    start,
    cancel: teardown,
    isActive() {
      return state.phase !== 'idle';
    },
  };
})();
