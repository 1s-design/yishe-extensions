// @ts-nocheck
(function initCorePageImageCollector() {
  'use strict';

  if (window.CorePageImageCollector) {
    return;
  }

  const ROOT_ID = 'yishe-page-image-collector-root';
  const STYLE_ID = 'yishe-page-image-collector-style';
  const MAX_BACKGROUND_SCAN_COUNT = 4000;
  const MAX_PSEUDO_SCAN_COUNT = 600;
  const MAX_WALK_NODES = 20000;
  const MAX_STYLE_READ_COUNT = 12000;
  const MAX_DIAG_SAMPLES = 24;
  const MAX_SCAN_ROOTS = 60;
  const MAX_SHADOW_DEPTH = 4;
  const MAX_IFRAME_DEPTH = 2;
  const SCROLL_PRELOAD_MAX_STEPS = 90;
  const SCROLL_PRELOAD_STEP_MS = 110;
  const SCROLL_PRELOAD_TIMEOUT_MS = 15000;
  const MERGE_SCAN_DEBOUNCE_MS = 900;
  const MAX_MERGE_SCANS = 40;
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
    targetQueue: [],
    scanning: false,
    scrollPreloading: false,
    submitting: false,
    mergeCount: 0,
    statusText: '',
    lastDiag: null,
  };

  // 页面级临时记录：本页已经成功采集过的地址。刷新/换页即失效，不落 storage、不跨标签页共享
  const collectedUrls = new Set();

  const scanTimers = {
    mergeTimer: null,
  };
  let domObserver = null;

  const refs = {
    root: null,
    summary: null,
    status: null,
    progress: null,
    progressFill: null,
    progressText: null,
    grid: null,
    confirm: null,
    confirmCount: null,
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

  // 卡片角标用的后缀：从 URL 路径尾段取真实扩展名，取不到就不显示
  const IMAGE_EXTENSION_ALIASES = {
    jpeg: 'JPG',
    svgz: 'SVG',
  };

  function getImageExtensionLabel(url) {
    try {
      const matched = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (!matched) {
        return '';
      }
      const ext = matched[1].toUpperCase();
      return IMAGE_EXTENSION_ALIASES[ext.toLowerCase()] || ext;
    } catch (error) {
      return '';
    }
  }

  // 判断已解码的那张图是不是真图（而不是 1x1 间隔图/模糊占位），只用来决定该不该改采 srcset/data-src，不筛列表
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
      extension: getImageExtensionLabel(url),
      source: meta.source || 'img',
      label: meta.label || '',
      hostname,
      sizeUnknown: !!meta.sizeUnknown,
      // 矢量图没有像素尺寸可言：logo 站上 40x40 显示的 SVG 素材照样是高清原图，不能按小图标挡掉
      vector: getImageExtensionLabel(url) === 'SVG',
    };
  }

  // srcset 里挑最大的一条：`640w` 按声明宽度比，`2x` 只在没有 w 描述符时按倍率比
  function pickLargestSrcset(srcset) {
    const entries = String(srcset || '')
      .split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    let bestWidth = { url: '', width: 0 };
    let bestDpr = { url: '', dpr: 0 };

    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      const url = normalizeImageUrl(parts[0]);
      if (!url) {
        continue;
      }

      for (const token of parts.slice(1)) {
        const widthMatch = /^(\d+(?:\.\d+)?)w$/i.exec(token);
        if (widthMatch) {
          const width = Number(widthMatch[1]);
          if (width > bestWidth.width) {
            bestWidth = { url, width };
          }
          continue;
        }
        const dprMatch = /^(\d+(?:\.\d+)?)x$/i.exec(token);
        if (dprMatch) {
          const dpr = Number(dprMatch[1]);
          if (dpr > bestDpr.dpr) {
            bestDpr = { url, dpr };
          }
        }
      }

      if (parts.length === 1 && !bestWidth.url) {
        bestWidth = { url, width: 0 };
      }
    }

    return bestWidth.url ? bestWidth : bestDpr.url ? { url: bestDpr.url, width: 0 } : { url: '', width: 0 };
  }

  function getPictureSrcset(img) {
    const picture = img.parentElement;
    if (!picture || picture.tagName !== 'PICTURE') {
      return { url: '', width: 0 };
    }

    let best = { url: '', width: 0 };
    for (const source of Array.from(picture.querySelectorAll('source') || [])) {
      const picked = pickLargestSrcset(source.getAttribute('srcset') || '');
      if (picked.url && picked.width >= best.width) {
        best = picked;
      }
    }

    return best;
  }

  /**
   * 图片条目的地址与尺寸。
   * 地址可能是还没加载、或被占位图顶掉的真图，这时 naturalWidth 量到的是占位图，
   * 只有写给真图的 width/height 属性、srcset 的 w 描述符，以及本来就够大的 CSS 盒子能用来判尺寸；
   * 三者都读不到就标 sizeUnknown 保留 —— 拿占位图的 1x1 去过尺寸闸会漏掉真图。
   */
  function pickImageEntry(img) {
    const natural = {
      width: Number(img.naturalWidth) || 0,
      height: Number(img.naturalHeight) || 0,
    };
    // src="" 会被浏览器解析成当前页面地址，不能当成图片收进来
    const srcAttr = String(img.getAttribute('src') || '').trim();
    const loadedUrl = normalizeImageUrl(img.currentSrc || (srcAttr ? img.src : ''));
    const loadedIsRealImage = isUsefulImage(natural.width, natural.height);
    const attrSrcset = pickLargestSrcset(img.getAttribute('srcset') || '');
    const chosenSrcset = attrSrcset.url ? attrSrcset : getPictureSrcset(img);
    const srcsetUrl = chosenSrcset.url;
    const lazyUrl = (() => {
      for (const attr of IMAGE_URL_ATTRIBUTES) {
        if (attr === 'src') {
          continue;
        }
        const normalized = normalizeImageUrl(img.getAttribute(attr));
        if (normalized) {
          return normalized;
        }
      }
      return '';
    })();

    let url = '';
    // 还没加载，或已加载的只是占位小图：优先懒加载属性里的真图地址
    if (!loadedIsRealImage) {
      url = lazyUrl || srcsetUrl || loadedUrl;
    } else if (srcsetUrl && srcsetUrl !== loadedUrl && chosenSrcset.width > natural.width) {
      // 已加载真图：srcset 声明宽度更大时取更大的原图倍图
      url = srcsetUrl;
    } else {
      url = loadedUrl;
    }

    if (!url) {
      return { url: '', width: 0, height: 0, sizeUnknown: false };
    }

    const declared = getDeclaredBoxSize(img);

    // 地址就是 src 上那张已解码的图：声明盒子和 natural 取更大的一方（1x1 占位图在这里被尺寸闸挡掉）
    if (url === loadedUrl && img.complete) {
      const size = declared.width * declared.height >= natural.width * natural.height ? declared : natural;
      return { url, width: size.width, height: size.height, sizeUnknown: false };
    }

    const authored = getAuthoredSize(img);
    // w 描述符写的是它自己那条地址，比 width/height 属性更准，两者都有时取更大的
    const srcsetSize = url === srcsetUrl && chosenSrcset.width > 0
      ? {
        width: chosenSrcset.width,
        height: Math.round(chosenSrcset.width * (natural.width > 0 ? natural.height / natural.width : declared.height / (declared.width || 1))),
      }
      : null;

    if (authored && (!srcsetSize || authored.width >= srcsetSize.width)) {
      return { url, width: authored.width, height: authored.height, sizeUnknown: false };
    }

    if (srcsetSize) {
      return { url, width: srcsetSize.width, height: srcsetSize.height, sizeUnknown: false };
    }

    // 盒子如果只是占位图自己的大小（1x1 的 1x1），那它描述的不是这张真图
    const boxBeatsPlaceholder = (declared.width > 0 || declared.height > 0)
      && (declared.width > natural.width || declared.height > natural.height);
    if (boxBeatsPlaceholder) {
      return { url, width: declared.width, height: declared.height, sizeUnknown: false };
    }

    return { url, width: 0, height: 0, sizeUnknown: true };
  }

  // 未加载/占位图：只认 width/height 属性与 CSS 盒子，别用 naturalWidth
  function getDeclaredBoxSize(el) {
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const attrWidth = Number(el.getAttribute && el.getAttribute('width')) || 0;
    const attrHeight = Number(el.getAttribute && el.getAttribute('height')) || 0;
    return {
      width: attrWidth || Number(el.clientWidth || 0) || Number((rect && rect.width) || 0),
      height: attrHeight || Number(el.clientHeight || 0) || Number((rect && rect.height) || 0),
    };
  }

  // 作者显式写给这张图的尺寸；懒加载占位图也能靠它判大小
  function getAuthoredSize(img) {
    const width = Number(img.getAttribute('width')) || 0;
    const height = Number(img.getAttribute('height')) || 0;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  function getRectSize(el) {
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    return {
      width: Number((rect && rect.width) || el.clientWidth || 0),
      height: Number((rect && rect.height) || el.clientHeight || 0),
    };
  }

  // iframe / shadow root 里的元素要用自己 document 的 view，顶层 window 取不到样式
  function computedStyleOf(element, pseudo) {
    const view = element && element.ownerDocument ? element.ownerDocument.defaultView : null;
    if (!view || typeof view.getComputedStyle !== 'function') {
      return null;
    }

    try {
      return pseudo ? view.getComputedStyle(element, pseudo) : view.getComputedStyle(element);
    } catch (error) {
      return null;
    }
  }

  /**
   * 扫描面：主文档 + 所有 open shadow root + 同源 iframe。
   * 闭 shadow root 与跨域 iframe 浏览器不允许读，属于能力边界，不是漏实现。
   */
  function collectScanRoots() {
    const roots = [];
    const queue = [{ scope: document, depth: 0 }];
    let visited = 0;

    while (queue.length) {
      if (roots.length >= MAX_SCAN_ROOTS) {
        break;
      }

      const current = queue.shift();
      let elements = [];

      try {
        elements = Array.from(current.scope.querySelectorAll('*') || []);
      } catch (error) {
        continue;
      }

      roots.push({ scope: current.scope, elements, depth: current.depth });

      for (const element of elements) {
        visited += 1;
        if (visited >= MAX_WALK_NODES) {
          return roots;
        }

        if (element.shadowRoot && current.depth < MAX_SHADOW_DEPTH) {
          queue.push({ scope: element.shadowRoot, depth: current.depth + 1 });
          continue;
        }

        if (element.tagName === 'IFRAME' && current.depth < MAX_IFRAME_DEPTH) {
          try {
            const innerDoc = element.contentDocument;
            if (innerDoc && innerDoc.documentElement) {
              queue.push({ scope: innerDoc, depth: current.depth + 1 });
            }
          } catch (error) {
            // 跨域 iframe 读不到，跳过
          }
        }
      }
    }

    return roots;
  }

  function collectElementImages(scope, pushItem) {
    for (const img of Array.from(scope.querySelectorAll('img') || [])) {
      const entry = pickImageEntry(img);
      pushItem(entry.url, {
        width: entry.width,
        height: entry.height,
        sizeUnknown: entry.sizeUnknown,
        source: 'img',
        label: img.alt || img.title || '',
      });
    }

    // <picture> 里没有 <img> 兜底时，source 的 srcset 是唯一地址；有 img 的走上面那条
    for (const source of Array.from(scope.querySelectorAll('picture > source') || [])) {
      const picture = source.parentElement;
      if (!picture || picture.querySelector('img')) {
        continue;
      }

      const picked = pickLargestSrcset(source.getAttribute('srcset') || '');
      if (!picked.url) {
        continue;
      }

      const size = getRectSize(picture);
      pushItem(picked.url, {
        width: size.width > 0 ? size.width : picked.width,
        height: size.height > 0 ? size.height : 0,
        sizeUnknown: size.width <= 0 && size.height <= 0 && !picked.width,
        source: 'img',
        label: picture.getAttribute('aria-label') || '',
      });
    }

    for (const video of Array.from(scope.querySelectorAll('video[poster]') || [])) {
      const url = normalizeImageUrl(video.getAttribute('poster'));
      if (!url) {
        continue;
      }
      const size = getRectSize(video);
      pushItem(url, {
        width: size.width,
        height: size.height,
        source: 'poster',
        label: video.getAttribute('aria-label') || '',
      });
    }

    for (const input of Array.from(scope.querySelectorAll('input[type="image"]') || [])) {
      const url = normalizeImageUrl(input.getAttribute('src'));
      if (!url) {
        continue;
      }
      const size = getRectSize(input);
      pushItem(url, {
        width: size.width,
        height: size.height,
        source: 'img',
        label: input.getAttribute('alt') || '',
      });
    }

    // 内联 SVG 里引用的位图
    for (const svgImage of Array.from(scope.querySelectorAll('image')) || []) {
      const href = svgImage.getAttribute('href') || svgImage.getAttribute('xlink:href');
      const url = normalizeImageUrl(href);
      if (!url) {
        continue;
      }
      const size = getRectSize(svgImage);
      pushItem(url, {
        width: size.width,
        height: size.height,
        source: 'img',
        label: '',
      });
    }
  }

  // SVG 元素的 .title 是 SVGAnimatedString 对象，直接当文案会渲染成 [object Object]
  function getElementLabel(element) {
    const aria = element.getAttribute ? element.getAttribute('aria-label') : '';
    if (aria) {
      return aria;
    }
    return typeof element.title === 'string' ? element.title : '';
  }

  // budget 跨扫描面共用：组件化站点可能有上百个 shadow root，逐面各读一遍会拖死主线程
  function collectBackgroundImages(elements, pushItem, budget) {
    const limited = elements.slice(0, MAX_BACKGROUND_SCAN_COUNT);

    for (let index = 0; index < limited.length; index += 1) {
      if (budget.left <= 0) {
        return;
      }
      budget.left -= 1;

      const element = limited[index];
      const tagName = element.tagName;
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'LINK') {
        continue;
      }

      const style = computedStyleOf(element);
      if (!style) {
        continue;
      }

      const urls = extractCssUrls(style.backgroundImage);
      if (urls.length) {
        const rect = element.getBoundingClientRect();
        for (const url of urls) {
          pushItem(url, {
            width: rect.width,
            height: rect.height,
            source: 'background',
            label: getElementLabel(element),
          });
        }
      }

      // 伪元素背景图（装饰图、sprite 常挂在这里）；只探测前 MAX_PSEUDO_SCAN_COUNT 个元素
      if (index >= MAX_PSEUDO_SCAN_COUNT) {
        continue;
      }

      for (const pseudo of ['::before', '::after']) {
        budget.left -= 1;
        const pseudoStyle = computedStyleOf(element, pseudo);
        if (!pseudoStyle) {
          continue;
        }
        const content = pseudoStyle.content;
        if (!content || content === 'none' || content === 'normal' || pseudoStyle.backgroundImage === 'none') {
          continue;
        }

        const pseudoUrls = extractCssUrls(pseudoStyle.backgroundImage);
        if (!pseudoUrls.length) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        for (const url of pseudoUrls) {
          pushItem(url, {
            width: rect.width,
            height: rect.height,
            source: 'background',
            label: getElementLabel(element),
          });
        }
      }
    }
  }

  function collectPageImages() {
    const seen = new Set();
    const byUrl = new Map();
    const results = [];
    const diag = { roots: 0, nodes: 0, imgEls: 0, badUrl: 0, dup: 0, candidates: 0, unknownSize: 0, vector: 0, kept: 0, dropped: [] };
    const dropKinds = new Map();

    // 只进控制台，用来回答「页面有 N 张图为什么只显示 M 张」：漏掉的长什么样，看一眼就知道是不是真图
    function diagSample(url, meta) {
      const info = meta || {};
      const name = url ? url.split('/').pop().split('?')[0].slice(0, 30) : '无地址';
      const key = [`${info.width || 0}x${info.height || 0}`, name, info.label || ''].filter(Boolean).join(' ');
      const count = dropKinds.get(key) || 0;
      if (count || dropKinds.size < MAX_DIAG_SAMPLES) {
        dropKinds.set(key, count + 1);
      }
    }

    function sampleList() {
      return Array.from(dropKinds.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, MAX_DIAG_SAMPLES)
        .map(([key, count]) => (count > 1 ? `${count}× ${key}` : key));
    }

    function pushItem(url, meta) {
      if (!url) {
        diag.badUrl += 1;
        diagSample('', meta);
        return;
      }
      if (seen.has(url)) {
        diag.dup += 1;
        // 同一张图在页面里既有隐藏副本（量不出尺寸）又有可见副本时，用后者把尺寸补上
        const prev = byUrl.get(url);
        if (prev && prev.sizeUnknown && meta && !meta.sizeUnknown && (Number(meta.width) > 0 || Number(meta.height) > 0)) {
          prev.width = Math.round(Number(meta.width) || 0);
          prev.height = Math.round(Number(meta.height) || 0);
          prev.area = prev.width * prev.height;
          prev.sizeUnknown = false;
        }
        return;
      }

      // 不按像素尺寸过滤：图标、小图都要，同一张间隔图在页面里重复几十次也只算一条（dup）
      diag.candidates += 1;
      const item = buildImageItem(url, meta);
      if (item.vector) {
        diag.vector += 1;
      } else if (item.sizeUnknown) {
        diag.unknownSize += 1;
      }

      seen.add(url);
      byUrl.set(url, item);
      diag.kept += 1;
      results.push(item);
    }

    const roots = collectScanRoots();
    const budget = { left: MAX_STYLE_READ_COUNT };
    diag.roots = roots.length;
    for (const root of roots) {
      try {
        diag.nodes += root.elements.length;
        diag.imgEls += root.scope.querySelectorAll('img').length;
        collectElementImages(root.scope, pushItem);
        collectBackgroundImages(root.elements, pushItem, budget);
      } catch (error) {
        // 单个作用域（shadow root / iframe）读失败不影响其他来源
        console.warn('[YiShe][PageImageCollector] 局部扫描失败:', error);
      }
    }

    diag.dropped = sampleList();
    state.lastDiag = diag;
    return results.sort((left, right) => {
      if (right.area !== left.area) {
        return right.area - left.area;
      }
      return left.url.localeCompare(right.url);
    });
  }

  function getItemStatusMeta(status) {
    if (status === 'success' || status === 'collected') {
      return { label: '已采集', className: 'is-success' };
    }
    if (status === 'error') {
      return { label: '失败', className: 'is-error' };
    }
    if (status === 'skipped') {
      return { label: '跳过', className: 'is-skipped' };
    }
    if (status === 'uploading') {
      return { label: '上传中', className: 'is-uploading' };
    }
    if (status === 'pending') {
      return { label: '待上传', className: 'is-pending' };
    }
    return { label: '', className: '' };
  }

  function isTerminalStatus(status) {
    return status === 'success' || status === 'error' || status === 'skipped';
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
    const collectedCount = state.items.reduce((count, item) => count + (collectedUrls.has(item.url) ? 1 : 0), 0);
    refs.summary.textContent = totalCount
      ? `${totalCount} 张 · 已选 ${selectedCount}${collectedCount ? ` · 已采集 ${collectedCount}` : ''} · 采集素材`
      : '未找到图片 · 采集素材';
  }

  function updateButtonStates() {
    const selectedCount = state.selectedUrls.size;
    const pendingCount = state.items.reduce((count, item) => count + (collectedUrls.has(item.url) ? 0 : 1), 0);
    const disabledForSubmit = state.submitting || state.scanning || state.scrollPreloading;

    if (refs.buttons.collectAll) {
      refs.buttons.collectAll.disabled = disabledForSubmit || pendingCount === 0;
    }
    if (refs.buttons.collectSelected) {
      refs.buttons.collectSelected.disabled = disabledForSubmit || selectedCount === 0;
      refs.buttons.collectSelected.textContent = selectedCount > 0
        ? `采集已选 (${selectedCount})`
        : '采集已选';
    }
    if (refs.buttons.selectAll) {
      refs.buttons.selectAll.disabled = disabledForSubmit || pendingCount === 0;
    }
    if (refs.buttons.clearSelection) {
      refs.buttons.clearSelection.disabled = disabledForSubmit || selectedCount === 0;
    }
    if (refs.buttons.scrollScan) {
      refs.buttons.scrollScan.disabled = disabledForSubmit;
      refs.buttons.scrollScan.textContent = state.scrollPreloading ? '滚动中...' : '滚到底再扫';
    }
    if (refs.buttons.rescan) {
      refs.buttons.rescan.disabled = disabledForSubmit;
    }
  }

  function updateCardSelection(url) {
    const card = refs.cardMap.get(url);
    if (!card) {
      return;
    }

    const selected = state.selectedUrls.has(url);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }

  function updateCardStatus(url) {
    const card = refs.cardMap.get(url);
    if (!card) {
      return;
    }

    // 本次没跑过上传、但之前已经采过：状态回落到页面级记录，卡片照样显示「已采集」
    const status = state.itemStatusByUrl.get(url) || (collectedUrls.has(url) ? 'collected' : '');
    const badge = card.querySelector('[data-role="status-badge"]');
    const { label, className } = getItemStatusMeta(status);

    card.classList.remove('is-success', 'is-error', 'is-skipped', 'is-pending', 'is-uploading');
    card.classList.toggle('is-collected', collectedUrls.has(url));
    if (className) {
      card.classList.add(className);
    }

    if (badge) {
      badge.textContent = label;
      badge.hidden = !label;
    }
  }

  function applyTargetStatuses(statusesByUrl) {
    for (const [url, status] of statusesByUrl) {
      if (refs.cardMap.has(url)) {
        state.itemStatusByUrl.set(url, status);
      }
    }
    refreshTargetCardStates();
  }

  function refreshTargetCardStates() {
    // 依据目标队列顺序推导“上传中 / 待上传”：队列里第一张未完成的标为上传中
    let activeAssigned = false;

    for (const url of state.targetQueue) {
      const status = state.itemStatusByUrl.get(url) || '';
      if (isTerminalStatus(status)) {
        continue;
      }

      state.itemStatusByUrl.set(url, activeAssigned ? 'pending' : 'uploading');
      activeAssigned = true;
      updateCardStatus(url);
    }
  }

  function updateProgressDisplay(current, total, hasError) {
    if (!refs.progress) {
      return;
    }

    const safeTotal = Number(total) || 0;
    const safeCurrent = Math.min(Number(current) || 0, safeTotal);
    const percent = safeTotal ? Math.round((safeCurrent / safeTotal) * 100) : 0;

    refs.progress.hidden = false;
    refs.progress.classList.toggle('is-error', Boolean(hasError));
    if (refs.progressFill) {
      refs.progressFill.style.width = `${percent}%`;
      refs.progressFill.classList.toggle('has-error', Boolean(hasError));
    }
    if (refs.progressText) {
      refs.progressText.textContent = `${percent}%`;
    }
  }

  function resetProgressDisplay() {
    if (refs.progress) {
      refs.progress.hidden = true;
      refs.progress.classList.remove('is-error');
    }
    if (refs.progressFill) {
      refs.progressFill.style.width = '0%';
      refs.progressFill.classList.remove('has-error');
    }
  }

  function renderGrid() {
    if (!refs.grid) {
      return;
    }

    refs.cardMap.clear();
    refs.grid.innerHTML = '';

    if (!state.items.length) {
      const scanning = state.scanning || state.scrollPreloading;
      const diag = state.lastDiag;
      const desc = scanning
        ? '正在读取整页图片'
        : diag
          ? `扫描面 ${diag.roots} · 图元素 ${diag.imgEls} · 候选 ${diag.candidates}`
            + `${diag.badUrl ? ` · 无地址 ${diag.badUrl}` : ''}`
          : '试试重扫';
      refs.grid.innerHTML = `
        <div class="yishe-page-image-empty">
          <div class="yishe-page-image-empty-title">${scanning ? '扫描中' : '未找到图片'}</div>
          <div class="yishe-page-image-empty-desc">${escapeHtml(desc)}</div>
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
          ${item.extension ? `<span class="yishe-page-image-ext">${item.extension}</span>` : ''}
        </span>
        <span class="yishe-page-image-meta">
          <span class="yishe-page-image-title">${escapeHtml(item.label || item.hostname || '未命名')}</span>
          <span class="yishe-page-image-subtitle">${item.width && item.height ? `${item.width} x ${item.height}` : '尺寸未知'}${item.vector ? ' · 矢量' : ''}${item.source === 'background' ? ' · 背景' : (item.source === 'poster' ? ' · 封面' : '')}</span>
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
    state.selectedUrls = new Set(state.items.filter((item) => !collectedUrls.has(item.url)).map((item) => item.url));
    for (const item of state.items) {
      updateCardSelection(item.url);
      const check = refs.cardMap.get(item.url)?.querySelector('.yishe-page-image-check');
      if (check) {
        check.textContent = state.selectedUrls.has(item.url) ? '✓' : '';
      }
    }
    refreshView();
  }

  function toggleSelection(url) {
    if (!url || state.submitting || state.scanning) {
      return;
    }

    // 已采集的不让再勾选，避免「勾了却没上传」的困惑
    if (collectedUrls.has(url)) {
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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getScrollerMetrics(scroller) {
    if (scroller === window) {
      const el = document.scrollingElement || document.documentElement;
      return {
        top: Number(window.scrollY || el.scrollTop || 0),
        client: Number(window.innerHeight || el.clientHeight || 0),
        content: Number(el.scrollHeight || 0),
      };
    }

    return {
      top: Number(scroller.scrollTop || 0),
      client: Number(scroller.clientHeight || 0),
      content: Number(scroller.scrollHeight || 0),
    };
  }

  function setScrollerTop(scroller, value) {
    if (scroller === window) {
      window.scrollTo(0, value);
      return;
    }
    scroller.scrollTop = value;
  }

  // 窗口之外，很多站点把滚动放在内部容器里（瀑布流、相册），只滚 window 触发不了懒加载
  function findScrollScopes() {
    const scopes = [window];
    const candidates = [];
    const elements = Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, MAX_BACKGROUND_SCAN_COUNT);

    for (const element of elements) {
      if (element === document.scrollingElement || element === document.body || element === document.documentElement) {
        continue;
      }

      const metrics = getScrollerMetrics(element);
      if (metrics.content - metrics.client <= 300) {
        continue;
      }

      const style = computedStyleOf(element);
      if (!style || !/(auto|scroll)/.test(style.overflowY)) {
        continue;
      }

      candidates.push({ element, area: metrics.client * (element.clientWidth || 0) });
    }

    candidates.sort((left, right) => right.area - left.area);
    for (const candidate of candidates.slice(0, 3)) {
      scopes.push(candidate.element);
    }

    return scopes;
  }

  async function scanAfterAutoScroll() {
    if (state.scrollPreloading || state.scanning || state.submitting) {
      return;
    }

    state.scrollPreloading = true;
    updateButtonStates();
    updateStatusText('滚动加载整页图片...');

    const wasLocked = viewportLockState.locked;
    if (wasLocked) {
      setViewportLocked(false);
    }

    const restoreList = [];
    const deadline = Date.now() + SCROLL_PRELOAD_TIMEOUT_MS;

    try {
      for (const scroller of findScrollScopes()) {
        restoreList.push({ scroller, top: getScrollerMetrics(scroller).top });

        for (let step = 0; step < SCROLL_PRELOAD_MAX_STEPS; step += 1) {
          if (Date.now() > deadline) {
            break;
          }

          const before = getScrollerMetrics(scroller);
          setScrollerTop(scroller, before.top + Math.max(240, before.client * 0.9));
          await sleep(SCROLL_PRELOAD_STEP_MS);

          const after = getScrollerMetrics(scroller);
          const reachedBottom = after.top + after.client >= after.content - 2;
          if (reachedBottom && after.content <= before.content + 1) {
            break;
          }
        }
      }

      // 最后一屏的图片还要时间解码，否则 naturalWidth 仍是 0 会被尺寸闸挡掉
      await sleep(500);
    } catch (error) {
      console.warn('[YiShe][PageImageCollector] 滚动预加载失败:', error);
    }

    for (const entry of restoreList) {
      try {
        setScrollerTop(entry.scroller, entry.top);
      } catch (error) {
        // 容器可能已被 SPA 移除
      }
    }

    if (wasLocked) {
      setViewportLocked(true);
    }

    state.scrollPreloading = false;
    await scanPageImages();
  }

  function scheduleMergeScan() {
    if (scanTimers.mergeTimer) {
      window.clearTimeout(scanTimers.mergeTimer);
    }

    scanTimers.mergeTimer = window.setTimeout(() => {
      scanTimers.mergeTimer = null;
      mergeScan();
    }, MERGE_SCAN_DEBOUNCE_MS);
  }

  // 增量补扫：SPA 新加载 / 懒加载刚换上的图直接追加进列表，不清勾选、不清状态
  function mergeScan() {
    if (!refs.root || !refs.root.classList.contains('is-visible')) {
      return;
    }
    if (state.scanning || state.submitting || state.scrollPreloading) {
      return;
    }
    if (state.mergeCount >= MAX_MERGE_SCANS) {
      return;
    }

    let fresh = [];
    try {
      fresh = collectPageImages();
    } catch (error) {
      return;
    }

    const known = new Set(state.items.map((item) => item.url));
    const added = fresh.filter((item) => !known.has(item.url));
    if (!added.length) {
      return;
    }

    state.mergeCount += 1;
    state.items = state.items.concat(added);
    renderGrid();
    refreshView();
    updateStatusText(`新加载 ${added.length} 张，已补进列表。`);
  }

  async function scanPageImages() {
    state.scanning = true;
    state.mergeCount = 0;
    state.lastDiag = null;
    updateStatusText('正在扫描...');
    updateButtonStates();

    let scanError = null;
    try {
      state.items = collectPageImages();
    } catch (error) {
      scanError = error;
      state.items = [];
    }

    // 渲染前必须落回 scanning：空态文案按它区分「扫描中」和「真没找到」
    state.scanning = false;
    state.selectedUrls.clear();
    state.itemStatusByUrl.clear();
    state.targetQueue = [];
    resetProgressDisplay();
    renderGrid();

    if (scanError) {
      console.error('[YiShe][PageImageCollector] 扫描失败:', scanError);
      updateStatusText('扫描失败，请重试。');
      showToast('扫描失败，请重试', 'error');
    } else if (state.items.length) {
      updateStatusText('勾选批量采集。');
    } else {
      updateStatusText('未找到可采集图片。');
    }

    // 每次扫描都打漏斗：页面 img 元素数 → 去重/尺寸闸 → 列表条数，缺图时一眼看出卡在哪一步
    console.info('[YiShe][PageImageCollector] 扫描漏斗', JSON.stringify({
      ...(state.lastDiag || {}),
      shown: state.items.length,
      documentImages: (document.images && document.images.length) || 0,
      href: location.href
    }));

    refreshView();
  }

  function openConfirm(count) {
    if (!refs.confirm) {
      return;
    }

    if (refs.confirmCount) {
      refs.confirmCount.textContent = String(count);
    }
    refs.confirm.hidden = false;
  }

  function closeConfirm() {
    if (refs.confirm) {
      refs.confirm.hidden = true;
    }
  }

  // 采集全部是批量写库操作，先让数量露个面再动手
  function askCollectAll() {
    if (!state.items.length) {
      showToast('当前没有可采集图片', 'warning');
      return;
    }

    const pendingCount = state.items.filter((item) => !collectedUrls.has(item.url)).length;
    if (!pendingCount) {
      showToast('这些图片都已经采集过了', 'warning');
      return;
    }

    openConfirm(pendingCount);
  }

  async function collectImages(mode) {
    if (state.submitting) {
      return;
    }

    const requestedUrls = mode === 'all'
      ? state.items.map((item) => item.url)
      : Array.from(state.selectedUrls);
    // 页面里已经采过的不再重复上传（页面级临时记录）
    const imageUrls = requestedUrls.filter((url) => !collectedUrls.has(url));

    if (!imageUrls.length) {
      if (requestedUrls.length) {
        showToast('这些图片都已经采集过了', 'warning');
      } else {
        showToast(mode === 'all' ? '当前没有可采集图片' : '请先选择要采集的图片', 'warning');
      }
      return;
    }

    state.submitting = true;
    state.targetQueue = imageUrls.slice();
    state.itemStatusByUrl.clear();
    for (const item of state.items) {
      updateCardStatus(item.url);
    }
    applyTargetStatuses(new Map(imageUrls.map((url) => [url, 'pending'])));
    updateProgressDisplay(0, imageUrls.length, false);
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

      // 以 background 下发的规范 url 队列为准（已去重/过滤非法地址）
      if (Array.isArray(request.urls) && request.urls.length) {
        state.targetQueue = request.urls.slice();
        applyTargetStatuses(new Map(state.targetQueue.map((url) => [url, 'pending'])));
      }

      resetProgressDisplay();
      updateProgressDisplay(0, request.total || 0, false);
      updateStatusText(`采集中 0/${request.total || 0}`);
      refreshView();
      return;
    }

    if (request.phase === 'item') {
      if (request.url) {
        // 只有真正上传成功才算「已采集」，失败/跳过下次还能再试
        if (request.status === 'success') {
          collectedUrls.add(request.url);
          state.selectedUrls.delete(request.url);
          updateCardSelection(request.url);
          const check = refs.cardMap.get(request.url)?.querySelector('.yishe-page-image-check');
          if (check) {
            check.textContent = '';
          }
        }
        state.itemStatusByUrl.set(request.url, request.status || '');
        updateCardStatus(request.url);
        refreshTargetCardStates();
      }

      updateStatusText(
        `采集中 ${request.current || 0}/${request.total || 0} · 成功 ${request.successCount || 0} · 失败 ${request.failedCount || 0} · 跳过 ${request.skippedCount || 0}`
      );
      updateProgressDisplay(request.current, request.total, (request.failedCount || 0) > 0);
      refreshView();
      return;
    }

    if (request.phase === 'complete') {
      state.submitting = false;

      // 中止/未推送结果的图片统一收敛为“跳过”，避免队列里留pending
      for (const url of state.targetQueue) {
        const status = state.itemStatusByUrl.get(url) || '';
        if (!isTerminalStatus(status) && refs.cardMap.has(url)) {
          state.itemStatusByUrl.set(url, 'skipped');
          updateCardStatus(url);
        }
      }

      const hasError = (request.failedCount || 0) + (request.abortedCount || 0) > 0;
      updateProgressDisplay(request.total || 0, request.total || 0, hasError);
      window.setTimeout(() => {
        if (!state.submitting) {
          resetProgressDisplay();
        }
      }, 1800);

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
        --yipc-accent: #2563eb;
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

      .yishe-page-image-progress {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 2px;
      }

      .yishe-page-image-progress[hidden] {
        display: none;
      }

      .yishe-page-image-progress-track {
        flex: 1;
        min-width: 140px;
        height: 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.1);
        overflow: hidden;
      }

      .yishe-page-image-progress-fill {
        width: 0%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(37, 99, 235, 0.68), var(--yipc-accent));
        transition: width 0.32s ease, background 0.3s ease;
      }

      .yishe-page-image-progress-fill.has-error {
        background: linear-gradient(90deg, rgba(239, 68, 68, 0.65), rgba(239, 68, 68, 0.95));
      }

      .yishe-page-image-progress-text {
        flex-shrink: 0;
        min-width: 38px;
        text-align: right;
        font-size: 11px;
        font-weight: 700;
        color: var(--yipc-accent);
        font-variant-numeric: tabular-nums;
      }

      .yishe-page-image-progress.is-error .yishe-page-image-progress-text {
        color: var(--yishe-ui-error);
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
        border-color: var(--yipc-accent);
        background: #ffffff;
        animation: yipc-select-pop 0.22s ease;
        box-shadow:
          0 0 0 3px rgba(37, 99, 235, 0.24),
          0 24px 46px rgba(37, 99, 235, 0.16);
      }

      .yishe-page-image-card.is-selected .yishe-page-image-thumb {
        box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.38);
      }

      .yishe-page-image-card.is-selected .yishe-page-image-title {
        color: var(--yipc-accent);
      }

      @keyframes yipc-select-pop {
        0% {
          transform: scale(0.965);
        }

        60% {
          transform: scale(1.012);
        }

        100% {
          transform: scale(1);
        }
      }

      .yishe-page-image-card.is-success {
        border-color: rgba(34, 197, 94, 0.46);
      }

      .yishe-page-image-card.is-collected {
        cursor: default;
      }

      .yishe-page-image-card.is-error {
        border-color: rgba(239, 68, 68, 0.46);
      }

      .yishe-page-image-card.is-skipped {
        border-color: rgba(245, 158, 11, 0.46);
      }

      .yishe-page-image-card.is-pending .yishe-page-image-thumb img {
        opacity: 0.55;
      }

      .yishe-page-image-card.is-pending .yishe-page-image-status {
        background: rgba(37, 99, 235, 0.55);
      }

      .yishe-page-image-card.is-uploading .yishe-page-image-thumb img {
        opacity: 0.42;
      }

      .yishe-page-image-card.is-uploading .yishe-page-image-status {
        background: var(--yipc-accent);
        animation: yipc-pulse 1.2s ease-in-out infinite;
      }

      @keyframes yipc-pulse {
        0%,
        100% {
          opacity: 1;
        }

        50% {
          opacity: 0.55;
        }
      }

      @keyframes yipc-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .yishe-page-image-thumb {
        position: relative;
        display: block;
        aspect-ratio: 1 / 1;
        border-radius: 16px;
        overflow: hidden;
        background: #f3f4f6;
      }

      .yishe-page-image-thumb img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        transition: transform 0.24s ease;
      }

      .yishe-page-image-card:hover .yishe-page-image-thumb img {
        transform: scale(1.035);
      }

      .yishe-page-image-ext {
        position: absolute;
        right: 8px;
        bottom: 8px;
        z-index: 2;
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(17, 24, 39, 0.62);
        color: #fff;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.7;
        letter-spacing: 0.04em;
        pointer-events: none;
      }

      .yishe-page-image-confirm {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.42);
        animation: yipc-confirm-in 0.16s ease;
      }

      .yishe-page-image-confirm[hidden] {
        display: none;
      }

      @keyframes yipc-confirm-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .yishe-page-image-confirm-card {
        width: min(380px, 100%);
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 20px 20px 16px;
        border-radius: 18px;
        box-sizing: border-box;
        background: #ffffff;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
      }

      .yishe-page-image-confirm-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.4;
        letter-spacing: -0.01em;
        color: #111827;
      }

      .yishe-page-image-confirm-title [data-role="confirm-count"] {
        color: var(--yipc-accent);
      }

      .yishe-page-image-confirm-desc {
        font-size: 13px;
        line-height: 1.6;
        color: var(--yishe-ui-text-soft);
      }

      .yishe-page-image-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .yishe-page-image-card.is-uploading .yishe-page-image-thumb::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border: 2px solid rgba(255, 255, 255, 0.38);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: yipc-spin 0.8s linear infinite;
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

      .yishe-page-image-card.is-selected .yishe-page-image-check {
        opacity: 1;
        transform: translateY(0) scale(1);
        color: #fff;
        background: var(--yipc-accent);
        border-color: var(--yipc-accent);
        box-shadow: 0 10px 22px rgba(37, 99, 235, 0.32);
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
            <div class="yishe-page-image-progress" data-role="progress" hidden>
              <div class="yishe-page-image-progress-track">
                <div class="yishe-page-image-progress-fill" data-role="progress-fill"></div>
              </div>
              <span class="yishe-page-image-progress-text" data-role="progress-text">0%</span>
            </div>
          </div>
          <div class="yishe-page-image-actions">
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--primary" data-action="collect-all">采集全部</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--secondary" data-action="collect-selected">采集已选</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="select-all">全选</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="clear-selection">清空</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="scroll-scan">滚到底再扫</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="rescan">重扫</button>
          </div>
        </div>
        <div class="yishe-page-image-grid" data-role="grid"></div>
      </div>
      <div class="yishe-page-image-confirm" data-role="confirm" hidden>
        <div class="yishe-page-image-confirm-card">
          <div class="yishe-page-image-confirm-title">采集全部 <span data-role="confirm-count"></span> 张？</div>
          <div class="yishe-page-image-confirm-desc">PNG / WebP 抠图会自动裁掉四周多余空白。</div>
          <div class="yishe-page-image-confirm-actions">
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--ghost" data-action="confirm-cancel">取消</button>
            <button type="button" class="yishe-page-image-btn yishe-ui-chip yishe-ui-chip--primary" data-action="confirm-collect-all">采集</button>
          </div>
        </div>
      </div>
    `;

    root.addEventListener('click', (event) => {
      if (refs.confirm && !refs.confirm.hidden) {
        if (event.target === refs.confirm) {
          closeConfirm();
          return;
        }

        const confirmAction = event.target.closest('[data-action]');
        const action = confirmAction && confirmAction.getAttribute('data-action');
        if (action === 'confirm-cancel') {
          closeConfirm();
          return;
        }
        if (action === 'confirm-collect-all') {
          closeConfirm();
          collectImages('all');
          return;
        }
        // 确认层盖在面板上，此时面板里的按钮一律不响应
        return;
      }

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
        if (action === 'scroll-scan') {
          scanAfterAutoScroll();
          return;
        }
        if (action === 'collect-all') {
          askCollectAll();
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
      if (event.key !== 'Escape' || !refs.root?.classList.contains('is-visible')) {
        return;
      }
      // 确认层开着时，Esc 只关确认层，不关整个面板
      if (refs.confirm && !refs.confirm.hidden) {
        closeConfirm();
        return;
      }
      close();
    });

    document.body.appendChild(root);

    refs.root = root;
    refs.summary = root.querySelector('[data-role="summary"]');
    refs.status = root.querySelector('[data-role="status"]');
    refs.progress = root.querySelector('[data-role="progress"]');
    refs.progressFill = root.querySelector('[data-role="progress-fill"]');
    refs.progressText = root.querySelector('[data-role="progress-text"]');
    refs.grid = root.querySelector('[data-role="grid"]');
    refs.confirm = root.querySelector('[data-role="confirm"]');
    refs.confirmCount = root.querySelector('[data-role="confirm-count"]');
    refs.buttons.collectAll = root.querySelector('[data-action="collect-all"]');
    refs.buttons.collectSelected = root.querySelector('[data-action="collect-selected"]');
    refs.buttons.selectAll = root.querySelector('[data-action="select-all"]');
    refs.buttons.clearSelection = root.querySelector('[data-action="clear-selection"]');
    refs.buttons.scrollScan = root.querySelector('[data-action="scroll-scan"]');
    refs.buttons.rescan = root.querySelector('[data-action="rescan"]');

    // 增量监听：新插入的节点 / 懒加载换上的 src 都触发一次防抖补扫
    if (!domObserver && document.documentElement) {
      const watchedAttributes = ['src', 'srcset', 'poster'].concat(
        IMAGE_URL_ATTRIBUTES.filter((attr) => attr !== 'src'),
      );

      domObserver = new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target;
          // 面板自身的 DOM 变化不算页面变化，否则 renderGrid 会把自己触发成下一轮扫描
          if (target && target.nodeType === 1 && typeof target.closest === 'function' && target.closest(`#${ROOT_ID}`)) {
            continue;
          }
          if ((record.addedNodes && record.addedNodes.length) || record.type === 'attributes') {
            scheduleMergeScan();
            return;
          }
        }
      });

      domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: watchedAttributes,
      });
    }

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

    // 先占住「扫描中」再让出一帧：否则慢页面上第一帧就是「未找到图片」，看着像坏了
    state.scanning = true;
    renderGrid();
    updateButtonStates();
    window.setTimeout(() => {
      scanPageImages();
    }, 0);
  }

  function close() {
    closeConfirm();
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
