(function initCorePageImageCollector() {
  'use strict';

  if (window.CorePageImageCollector) {
    return;
  }

  const ROOT_ID = 'yishe-page-image-collector-root';
  const STYLE_ID = 'yishe-page-image-collector-style';
  const MAX_BACKGROUND_SCAN_COUNT = 2500;
  const MIN_EDGE_SIZE = 80;
  const MIN_AREA = 6400;
  const IMAGE_URL_ATTRIBUTES = [
    'src',
    'data-src',
    'data-original',
    'data-echo',
    'data-lazy-src',
    'data-lazyload',
    'data-url',
    'data-ks-lazyload'
  ];

  const state = {
    items: [],
    selectedUrls: new Set(),
    itemStatusByUrl: new Map(),
    scanning: false,
    submitting: false,
    statusText: '',
  };

  const refs = {
    root: null,
    summary: null,
    status: null,
    grid: null,
    buttons: {},
    cardMap: new Map(),
  };
  const viewportLockState = {
    htmlOverflow: '',
    bodyOverflow: '',
    locked: false,
  };

  function showToast(message, type) {
    if (!message) {
      return;
    }

    if (window.CoreToast?.show) {
      window.CoreToast.show({
        message,
        type: type || 'info',
        duration: 3200
      });
      return;
    }

    console.log('[YiShe][PageImageCollector]', type || 'info', message);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeImageUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const url = new URL(trimmed, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }
      return url.href;
    } catch (error) {
      return '';
    }
  }

  function extractCssUrls(value) {
    if (!value || value === 'none') {
      return [];
    }

    const results = [];
    const pattern = /url\((['"]?)(.*?)\1\)/gi;
    let match = pattern.exec(value);

    while (match) {
      const normalized = normalizeImageUrl(match[2]);
      if (normalized) {
        results.push(normalized);
      }
      match = pattern.exec(value);
    }

    return results;
  }

  function isUsefulImage(width, height) {
    const safeWidth = Number(width) || 0;
    const safeHeight = Number(height) || 0;
    const longest = Math.max(safeWidth, safeHeight);
    return longest >= MIN_EDGE_SIZE || (safeWidth * safeHeight) >= MIN_AREA;
  }

  function buildImageItem(url, meta) {
    const width = Math.round(Number(meta.width) || 0);
    const height = Math.round(Number(meta.height) || 0);
    const area = width * height;
    let hostname = '';

    try {
      hostname = new URL(url).hostname;
    } catch (error) {
      hostname = '';
    }

    return {
      url,
      width,
      height,
      area,
      source: meta.source || 'img',
      label: meta.label || '',
      hostname,
    };
  }

  function getCandidateImageUrl(img) {
    const candidates = [];

    if (img.currentSrc) {
      candidates.push(img.currentSrc);
    }

    for (const attr of IMAGE_URL_ATTRIBUTES) {
      const attrValue = attr === 'src' ? img.src : img.getAttribute(attr);
      if (attrValue) {
        candidates.push(attrValue);
      }
    }

    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  function collectPageImages() {
    const seen = new Set();
    const results = [];

    function pushItem(url, meta) {
      if (!url || seen.has(url)) {
        return;
      }

      const item = buildImageItem(url, meta);
      if (!isUsefulImage(item.width, item.height)) {
        return;
      }

      seen.add(url);
      results.push(item);
    }

    const imageElements = Array.from(document.images || []);
    for (const img of imageElements) {
      const url = getCandidateImageUrl(img);
      if (!url) {
        continue;
      }

      const width = img.naturalWidth || img.width || img.clientWidth || img.getBoundingClientRect().width;
      const height = img.naturalHeight || img.height || img.clientHeight || img.getBoundingClientRect().height;

      pushItem(url, {
        width,
        height,
        source: 'img',
        label: img.alt || img.title || ''
      });
    }

    const backgroundElements = Array.from(document.body?.querySelectorAll('*') || []).slice(0, MAX_BACKGROUND_SCAN_COUNT);
    for (const element of backgroundElements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const tagName = element.tagName;
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'LINK') {
        continue;
      }

      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      const urls = extractCssUrls(backgroundImage);
      if (!urls.length) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      for (const url of urls) {
        pushItem(url, {
          width: rect.width,
          height: rect.height,
          source: 'background',
          label: element.getAttribute('aria-label') || element.title || ''
        });
      }
    }

    return results.sort((left, right) => {
      if (right.area !== left.area) {
        return right.area - left.area;
      }
      return left.url.localeCompare(right.url);
    });
  }

  function getItemStatusMeta(status) {
    if (status === 'success') {
      return { label: '已采集', className: 'is-success' };
    }
    if (status === 'error') {
      return { label: '失败', className: 'is-error' };
    }
    if (status === 'skipped') {
      return { label: '跳过', className: 'is-skipped' };
    }
    return { label: '', className: '' };
  }

  function updateStatusText(message) {
    state.statusText = message || '';
    if (refs.status) {
      refs.status.textContent = state.statusText || '';
      refs.status.hidden = !state.statusText;
    }
  }

  function updateSummary() {
    if (!refs.summary) {
      return;
    }

    const totalCount = state.items.length;
    const selectedCount = state.selectedUrls.size;
    refs.summary.textContent = totalCount
      ? `${totalCount} 张 · 已选 ${selectedCount} · 爬图库`
      : '未找到图片 · 爬图库';
  }

  function updateButtonStates() {
    const totalCount = state.items.length;
    const selectedCount = state.selectedUrls.size;
    const disabledForSubmit = state.submitting || state.scanning;

    if (refs.buttons.collectAll) {
      refs.buttons.collectAll.disabled = disabledForSubmit || totalCount === 0;
    }
    if (refs.buttons.collectSelected) {
      refs.buttons.collectSelected.disabled = disabledForSubmit || selectedCount === 0;
      refs.buttons.collectSelected.textContent = selectedCount > 0
        ? `采集已选 (${selectedCount})`
        : '采集已选';
    }
    if (refs.buttons.selectAll) {
      refs.buttons.selectAll.disabled = disabledForSubmit || totalCount === 0;
    }
    if (refs.buttons.clearSelection) {
      refs.buttons.clearSelection.disabled = disabledForSubmit || selectedCount === 0;
    }
    if (refs.buttons.rescan) {
      refs.buttons.rescan.disabled = state.submitting;
    }
  }

  function updateCardSelection(url) {
    const card = refs.cardMap.get(url);
    if (!card) {
      return;
    }

    card.classList.toggle('is-selected', state.selectedUrls.has(url));
  }

  function updateCardStatus(url) {
    const card = refs.cardMap.get(url);
    if (!card) {
      return;
    }

    const status = state.itemStatusByUrl.get(url) || '';
    const badge = card.querySelector('[data-role="status-badge"]');
    const { label, className } = getItemStatusMeta(status);

    card.classList.remove('is-success', 'is-error', 'is-skipped');
    if (className) {
      card.classList.add(className);
    }

    if (badge) {
      badge.textContent = label;
      badge.hidden = !label;
    }
  }

  function renderGrid() {
    if (!refs.grid) {
      return;
    }

    refs.cardMap.clear();
    refs.grid.innerHTML = '';

    if (!state.items.length) {
      refs.grid.innerHTML = `
        <div class="yishe-page-image-empty">
          <div class="yishe-page-image-empty-title">未找到图片</div>
          <div class="yishe-page-image-empty-desc">试试重扫</div>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of state.items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'yishe-page-image-card';
      card.dataset.url = item.url;
      card.innerHTML = `
        <span class="yishe-page-image-check">${state.selectedUrls.has(item.url) ? '✓' : ''}</span>
        <span class="yishe-page-image-status" data-role="status-badge" hidden></span>
        <span class="yishe-page-image-thumb">
          <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.label || item.hostname || 'page image')}" loading="lazy" referrerpolicy="no-referrer" />
        </span>
        <span class="yishe-page-image-meta">
          <span class="yishe-page-image-title">${escapeHtml(item.label || item.hostname || '未命名')}</span>
          <span class="yishe-page-image-subtitle">${item.width} x ${item.height}${item.source === 'background' ? ' · 背景' : ''}</span>
        </span>
      `;

      fragment.appendChild(card);
      refs.cardMap.set(item.url, card);
    }

    refs.grid.appendChild(fragment);

    for (const item of state.items) {
      updateCardSelection(item.url);
      updateCardStatus(item.url);
    }
  }

  function refreshView() {
    updateSummary();
    updateButtonStates();
  }

  function clearSelection() {
    state.selectedUrls.clear();
    for (const item of state.items) {
      updateCardSelection(item.url);
      const check = refs.cardMap.get(item.url)?.querySelector('.yishe-page-image-check');
      if (check) {
        check.textContent = '';
      }
    }
    refreshView();
  }

  function selectAll() {
    state.selectedUrls = new Set(state.items.map((item) => item.url));
    for (const item of state.items) {
      updateCardSelection(item.url);
      const check = refs.cardMap.get(item.url)?.querySelector('.yishe-page-image-check');
      if (check) {
        check.textContent = '✓';
      }
    }
    refreshView();
  }

  function toggleSelection(url) {
    if (!url || state.submitting || state.scanning) {
      return;
    }

    if (state.selectedUrls.has(url)) {
      state.selectedUrls.delete(url);
    } else {
      state.selectedUrls.add(url);
    }

    updateCardSelection(url);
    const check = refs.cardMap.get(url)?.querySelector('.yishe-page-image-check');
    if (check) {
      check.textContent = state.selectedUrls.has(url) ? '✓' : '';
    }
    refreshView();
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.success) {
          reject(new Error(response?.error || '操作失败'));
          return;
        }

        resolve(response.data || response);
      });
    });
  }

  async function scanPageImages() {
    state.scanning = true;
    updateStatusText('正在扫描...');
    updateButtonStates();

    try {
      state.items = collectPageImages();
      state.selectedUrls.clear();
      state.itemStatusByUrl.clear();
      renderGrid();

      if (state.items.length) {
        updateStatusText('勾选批量采集。');
      } else {
        updateStatusText('未找到可采集图片。');
      }
    } catch (error) {
      console.error('[YiShe][PageImageCollector] 扫描失败:', error);
      state.items = [];
      state.selectedUrls.clear();
      state.itemStatusByUrl.clear();
      renderGrid();
      updateStatusText('扫描失败，请重试。');
      showToast('扫描失败，请重试', 'error');
    } finally {
      state.scanning = false;
      refreshView();
    }
  }

  async function collectImages(mode) {
    if (state.submitting) {
      return;
    }

    const imageUrls = mode === 'all'
      ? state.items.map((item) => item.url)
      : Array.from(state.selectedUrls);

    if (!imageUrls.length) {
      showToast(mode === 'all' ? '当前没有可采集图片' : '请先选择要采集的图片', 'warning');
      return;
    }

    state.submitting = true;
    state.itemStatusByUrl.clear();
    for (const item of state.items) {
      updateCardStatus(item.url);
    }
    updateStatusText(`准备采集 ${imageUrls.length} 张...`);
    refreshView();

    try {
      const result = await sendMessage({
        action: 'collectPageImagesToCrawler',
        imageUrls,
        pageUrl: window.location.href,
        pageTitle: document.title,
      });

      if (state.submitting) {
        state.submitting = false;
        updateStatusText(result?.message || '批量采集完成');
        refreshView();

        if (result?.message) {
          showToast(result.message, result.level || 'info');
        }
      }
    } catch (error) {
      console.error('[YiShe][PageImageCollector] 批量采集失败:', error);
      state.submitting = false;
      updateStatusText(error.message || '批量采集失败，请稍后重试。');
      refreshView();
      showToast(error.message || '批量采集失败，请稍后重试', 'error');
    }
  }

  function handleProgressMessage(request) {
    if (!request) {
      return;
    }

    if (request.phase === 'start') {
      state.submitting = true;
      updateStatusText(`采集中 0/${request.total || 0}`);
      refreshView();
      return;
    }

    if (request.phase === 'item') {
      if (request.url) {
        state.itemStatusByUrl.set(request.url, request.status || '');
        updateCardStatus(request.url);
      }

      updateStatusText(
        `采集中 ${request.current || 0}/${request.total || 0} · 成功 ${request.successCount || 0} · 失败 ${request.failedCount || 0} · 跳过 ${request.skippedCount || 0}`
      );
      refreshView();
      return;
    }

    if (request.phase === 'complete') {
      state.submitting = false;
      updateStatusText(request.message || '批量采集完成');
      refreshView();

      if (request.message) {
        const toastType = request.failedCount > 0
          ? (request.successCount > 0 ? 'warning' : 'error')
          : 'success';
        showToast(request.message, toastType);
      }
    }
  }

  function setViewportLocked(locked) {
    const html = document.documentElement;
    const body = document.body;

    if (!html || !body) {
      return;
    }

    if (locked) {
      if (!viewportLockState.locked) {
        viewportLockState.htmlOverflow = html.style.overflow || '';
        viewportLockState.bodyOverflow = body.style.overflow || '';
      }
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      viewportLockState.locked = true;
      return;
    }

    html.style.overflow = viewportLockState.htmlOverflow;
    body.style.overflow = viewportLockState.bodyOverflow;
    viewportLockState.locked = false;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    window.CoreUiTheme?.ensureBaseStyles?.();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
      }

      #${ROOT_ID}.is-visible {
        display: block;
      }

      .yishe-page-image-panel {
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
        padding: 22px 24px 24px;
      }

      .yishe-page-image-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }

      .yishe-page-image-header .yishe-page-image-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .yishe-page-image-close {
        flex-shrink: 0;
      }

      .yishe-page-image-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }

      .yishe-page-image-toolbar-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 220px;
      }

      .yishe-page-image-summary {
        font-size: 13px;
        line-height: 1.5;
        color: var(--yishe-ui-text);
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .yishe-page-image-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .yishe-page-image-btn {
        white-space: nowrap;
      }

      .yishe-page-image-status-text {
        font-size: 12px;
        line-height: 1.5;
        color: var(--yishe-ui-text-soft);
        letter-spacing: -0.01em;
      }

      .yishe-page-image-grid {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
        gap: 16px;
        padding: 4px 2px 8px;
        align-content: start;
        overscroll-behavior: contain;
      }

      .yishe-page-image-grid::-webkit-scrollbar {
        width: 10px;
      }

      .yishe-page-image-grid::-webkit-scrollbar-thumb {
        border: 3px solid transparent;
        border-radius: 999px;
        background: rgba(107, 114, 128, 0.22);
        background-clip: padding-box;
      }

      .yishe-page-image-card {
        appearance: none;
        position: relative;
        border: 1px solid var(--yishe-ui-border);
        border-radius: 20px;
        background: var(--yishe-ui-surface);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        cursor: pointer;
        text-align: left;
        font: inherit;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }

      .yishe-page-image-card:hover {
        transform: translateY(-2px);
        border-color: var(--yishe-ui-border-strong);
        background: var(--yishe-ui-surface-strong);
        box-shadow: var(--yishe-ui-shadow-medium);
      }

      .yishe-page-image-card:active {
        transform: translateY(0) scale(0.992);
      }

      .yishe-page-image-card:focus-visible {
        outline: 2px solid rgba(17, 24, 39, 0.24);
        outline-offset: 2px;
      }

      .yishe-page-image-card.is-selected {
        border-color: rgba(17, 24, 39, 1);
        background: #ffffff;
        box-shadow:
          0 0 0 2px rgba(17, 24, 39, 0.22),
          0 24px 46px rgba(17, 24, 39, 0.14);
      }

      .yishe-page-image-card.is-success {
        border-color: rgba(34, 197, 94, 0.46);
      }

      .yishe-page-image-card.is-error {
        border-color: rgba(239, 68, 68, 0.46);
      }

      .yishe-page-image-card.is-skipped {
        border-color: rgba(245, 158, 11, 0.46);
      }

      .yishe-page-image-thumb {
        display: block;
        aspect-ratio: 1 / 1;
        border-radius: 16px;
        overflow: hidden;
        background: #f3f4f6;
      }

      .yishe-page-image-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.24s ease;
      }

      .yishe-page-image-card:hover .yishe-page-image-thumb img {
        transform: scale(1.035);
      }

      .yishe-page-image-meta {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .yishe-page-image-meta .yishe-page-image-title {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.5;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-all;
        color: #111827;
      }

      .yishe-page-image-subtitle {
        font-size: 12px;
        color: var(--yishe-ui-text-soft);
        line-height: 1.5;
      }

      .yishe-page-image-check,
      .yishe-page-image-status {
        position: absolute;
        top: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        z-index: 3;
        pointer-events: none;
        transition: opacity 0.16s ease, transform 0.16s ease, background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
      }

      .yishe-page-image-check {
        left: 14px;
        color: transparent;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(15, 23, 42, 0.12);
        opacity: 0;
        transform: translateY(-2px) scale(0.92);
      }

      .yishe-page-image-card:hover .yishe-page-image-check {
        opacity: 1;
        transform: translateY(0) scale(1);
        border-color: rgba(15, 23, 42, 0.24);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
      }

      .yishe-page-image-card.is-selected .yishe-page-image-check {
        opacity: 1;
        transform: translateY(0) scale(1);
        color: #fff;
        background: var(--yishe-ui-primary);
        border-color: var(--yishe-ui-primary);
        box-shadow: 0 10px 22px rgba(17, 24, 39, 0.18);
      }

      .yishe-page-image-status {
        right: 14px;
        color: #fff;
      }

      .yishe-page-image-card.is-success .yishe-page-image-status {
        background: rgba(34, 197, 94, 0.92);
      }

      .yishe-page-image-card.is-error .yishe-page-image-status {
        background: rgba(239, 68, 68, 0.92);
      }

      .yishe-page-image-card.is-skipped .yishe-page-image-status {
        background: rgba(245, 158, 11, 0.92);
      }

      .yishe-page-image-empty {
        grid-column: 1 / -1;
        min-height: 280px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px dashed rgba(107, 114, 128, 0.26);
        border-radius: 20px;
        color: #6b7280;
        background: rgba(255, 255, 255, 0.52);
      }

      .yishe-page-image-empty-title {
        font-size: 15px;
        font-weight: 700;
        color: #374151;
      }

      .yishe-page-image-empty-desc {
        font-size: 12px;
      }

      @media (max-width: 768px) {
        .yishe-page-image-panel {
          padding: 16px 14px 18px;
          gap: 14px;
        }

        .yishe-page-image-header {
          padding-bottom: 12px;
        }

        .yishe-page-image-toolbar {
          gap: 10px;
        }

        .yishe-page-image-actions {
          width: 100%;
          justify-content: flex-start;
        }

        .yishe-page-image-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureRoot() {
    if (refs.root) {
      return refs.root;
    }

    ensureStyles();

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'yishe-ui-overlay';
    root.innerHTML = `
      <div class="yishe-page-image-panel yishe-ui-surface">
        <div class="yishe-page-image-header">
          <div>
            <h2 class="yishe-page-image-title">当前页图片</h2>
          </div>
          <button type="button" class="yishe-page-image-close yishe-ui-icon-btn" data-action="close">×</button>
        </div>
        <div class="yishe-page-image-toolbar">
          <div class="yishe-page-image-toolbar-meta">
            <div class="yishe-page-image-summary" data-role="summary"></div>
            <div class="yishe-page-image-status-text" data-role="status" hidden></div>
          </div>
          <div class="yishe-page-image-actions">
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--primary" data-action="collect-all">采集全部</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--secondary" data-action="collect-selected">采集已选</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="select-all">全选</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="clear-selection">清空</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="rescan">重扫</button>
          </div>
        </div>
        <div class="yishe-page-image-grid" data-role="grid"></div>
      </div>
    `;

    root.addEventListener('click', (event) => {
      if (event.target === root) {
        close();
        return;
      }

      const actionElement = event.target.closest('[data-action]');
      if (actionElement) {
        const action = actionElement.getAttribute('data-action');

        if (action === 'close') {
          close();
          return;
        }
        if (action === 'select-all') {
          selectAll();
          return;
        }
        if (action === 'clear-selection') {
          clearSelection();
          return;
        }
        if (action === 'rescan') {
          scanPageImages();
          return;
        }
        if (action === 'collect-all') {
          collectImages('all');
          return;
        }
        if (action === 'collect-selected') {
          collectImages('selected');
          return;
        }
      }

      const card = event.target.closest('.yishe-page-image-card');
      if (card) {
        toggleSelection(card.dataset.url || '');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && refs.root?.classList.contains('is-visible')) {
        close();
      }
    });

    document.body.appendChild(root);

    refs.root = root;
    refs.summary = root.querySelector('[data-role="summary"]');
    refs.status = root.querySelector('[data-role="status"]');
    refs.grid = root.querySelector('[data-role="grid"]');
    refs.buttons.collectAll = root.querySelector('[data-action="collect-all"]');
    refs.buttons.collectSelected = root.querySelector('[data-action="collect-selected"]');
    refs.buttons.selectAll = root.querySelector('[data-action="select-all"]');
    refs.buttons.clearSelection = root.querySelector('[data-action="clear-selection"]');
    refs.buttons.rescan = root.querySelector('[data-action="rescan"]');

    renderGrid();
    refreshView();

    return root;
  }

  function open() {
    const root = ensureRoot();
    root.classList.add('is-visible');
    setViewportLocked(true);

    if (state.submitting && state.items.length) {
      refreshView();
      return;
    }

    window.setTimeout(() => {
      scanPageImages();
    }, 0);
  }

  function close() {
    if (refs.root) {
      refs.root.classList.remove('is-visible');
    }
    setViewportLocked(false);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type === 'yishe:page-image-collector:open') {
      open();
      sendResponse && sendResponse({ ok: true });
      return true;
    }

    if (request?.type === 'yishe:page-image-collector:close') {
      close();
      sendResponse && sendResponse({ ok: true });
      return true;
    }

    if (request?.type === 'yishe:page-image-collector:progress') {
      handleProgressMessage(request);
      sendResponse && sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  window.CorePageImageCollector = {
    open,
    close,
    scan: scanPageImages,
    getItems() {
      return state.items.slice();
    }
  };
})();
