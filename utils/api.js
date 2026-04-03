// API 工具函数
// 用于处理 API 请求、token 管理、数据隔离上下文和 base URL 配置

// 从配置文件获取配置（如果配置文件已加载）
let ApiConfig = null;
if (typeof window !== 'undefined' && window.ApiConfig) {
  ApiConfig = window.ApiConfig;
} else if (typeof self !== 'undefined' && self.ApiConfig) {
  ApiConfig = self.ApiConfig;
} else if (typeof module !== 'undefined' && module.exports && require) {
  try {
    ApiConfig = require('../config/api.config.js');
  } catch (e) {
    console.warn('无法加载 API 配置文件，使用默认配置');
  }
}

const DATA_SCOPE_MODES = {
  SELF: 'self',
  USER: 'user',
  ALL: 'all',
};

const STORAGE_KEYS = {
  TOKEN: 'accessToken',
  USER_INFO: 'userInfo',
  DEV_MODE: 'devMode',
  API_BASE_URL: 'apiBaseUrl',
  WS_BASE_URL: 'wsBaseUrl',
  DEV_API_BASE_URL: 'devApiBaseUrl',
  DEV_WS_BASE_URL: 'devWsBaseUrl',
  DATA_SCOPE_MODE: 'dataScopeMode',
  DATA_SCOPE_USER_ID: 'dataScopeUserId',
};

const DEFAULT_CONFIG = ApiConfig ? {
  PROD_API_BASE_URL: ApiConfig.PROD_CONFIG.API_BASE_URL,
  PROD_WS_BASE_URL: ApiConfig.PROD_CONFIG.WS_BASE_URL,
  DEV_API_BASE_URL: ApiConfig.DEV_CONFIG.API_BASE_URL,
  DEV_WS_BASE_URL: ApiConfig.DEV_CONFIG.WS_BASE_URL,
} : {
  PROD_API_BASE_URL: 'https://1s.design:1520/api',
  PROD_WS_BASE_URL: 'https://1s.design:1520/ws',
  DEV_API_BASE_URL: 'http://localhost:1520/api',
  DEV_WS_BASE_URL: 'http://localhost:1520/ws',
};

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

function normalizeUserId(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function normalizeScopeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === DATA_SCOPE_MODES.ALL || normalized === DATA_SCOPE_MODES.USER) {
    return normalized;
  }
  return DATA_SCOPE_MODES.SELF;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function hasHeader(headers, headerName) {
  const target = String(headerName || '').toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

function getDeviceInfo() {
  const runtimeNavigator = typeof navigator !== 'undefined'
    ? navigator
    : (typeof self !== 'undefined' ? self.navigator : undefined);

  return {
    userAgent: runtimeNavigator?.userAgent,
    platform: runtimeNavigator?.platform,
    language: runtimeNavigator?.language,
    timestamp: new Date().toISOString(),
  };
}

function isAdminUser(userInfo) {
  if (!userInfo) {
    return false;
  }
  if (userInfo.isAdmin === true) {
    return true;
  }
  if (typeof userInfo.isAdmin === 'number') {
    return userInfo.isAdmin > 0;
  }
  if (typeof userInfo.isAdmin === 'string') {
    const normalized = userInfo.isAdmin.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function sanitizeDataScopeSelection(scope, userInfo) {
  if (!isAdminUser(userInfo)) {
    return {
      mode: DATA_SCOPE_MODES.SELF,
      userId: '',
    };
  }

  const mode = normalizeScopeMode(scope?.mode);
  const userId = normalizeUserId(scope?.userId);
  if (mode === DATA_SCOPE_MODES.USER) {
    return {
      mode: userId ? DATA_SCOPE_MODES.USER : DATA_SCOPE_MODES.SELF,
      userId,
    };
  }

  return {
    mode,
    userId: '',
  };
}

function buildDataScopeHeaders(scope) {
  const headers = {};
  const mode = normalizeScopeMode(scope?.mode);
  const userId = normalizeUserId(scope?.userId);

  headers['x-data-scope-mode'] = mode;
  if (mode === DATA_SCOPE_MODES.USER && userId) {
    headers['x-data-scope-user-id'] = userId;
  }

  return headers;
}

function applyOwnershipToBody(body, userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return body;
  }

  if (isFormData(body)) {
    if (!body.get('userId')) {
      body.append('userId', normalizedUserId);
    }
    return body;
  }

  if (isPlainObject(body)) {
    if (body.userId === undefined || body.userId === null || body.userId === '') {
      body.userId = normalizedUserId;
    }
    return body;
  }

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (isPlainObject(parsed)) {
        if (parsed.userId === undefined || parsed.userId === null || parsed.userId === '') {
          parsed.userId = normalizedUserId;
        }
        return JSON.stringify(parsed);
      }
    } catch (error) {
      return body;
    }
  }

  return body;
}

async function isDevMode() {
  const result = await storageGet([STORAGE_KEYS.DEV_MODE]);
  return Boolean(result[STORAGE_KEYS.DEV_MODE]);
}

async function getApiBaseUrl() {
  const devMode = await isDevMode();
  if (devMode) {
    const result = await storageGet([STORAGE_KEYS.DEV_API_BASE_URL]);
    return result[STORAGE_KEYS.DEV_API_BASE_URL] || DEFAULT_CONFIG.DEV_API_BASE_URL;
  }
  const result = await storageGet([STORAGE_KEYS.API_BASE_URL]);
  return result[STORAGE_KEYS.API_BASE_URL] || DEFAULT_CONFIG.PROD_API_BASE_URL;
}

async function getWsBaseUrl() {
  const devMode = await isDevMode();
  if (devMode) {
    const result = await storageGet([STORAGE_KEYS.DEV_WS_BASE_URL]);
    return result[STORAGE_KEYS.DEV_WS_BASE_URL] || DEFAULT_CONFIG.DEV_WS_BASE_URL;
  }
  const result = await storageGet([STORAGE_KEYS.WS_BASE_URL]);
  return result[STORAGE_KEYS.WS_BASE_URL] || DEFAULT_CONFIG.PROD_WS_BASE_URL;
}

async function setDevMode(enabled) {
  await storageSet({ [STORAGE_KEYS.DEV_MODE]: enabled });
  chrome.runtime.sendMessage({
    action: 'updateDevMode',
    devMode: enabled,
  }).catch(() => {
    // 忽略错误（service worker 可能未运行）
  });
}

async function setApiBaseUrl(url, isDev = false) {
  const key = isDev ? STORAGE_KEYS.DEV_API_BASE_URL : STORAGE_KEYS.API_BASE_URL;
  await storageSet({ [key]: url });
}

async function setWsBaseUrl(url, isDev = false) {
  const key = isDev ? STORAGE_KEYS.DEV_WS_BASE_URL : STORAGE_KEYS.WS_BASE_URL;
  await storageSet({ [key]: url });
}

async function getToken() {
  const result = await storageGet([STORAGE_KEYS.TOKEN]);
  return result[STORAGE_KEYS.TOKEN] || null;
}

async function setToken(token) {
  await storageSet({ [STORAGE_KEYS.TOKEN]: token });
}

async function clearToken() {
  await storageSet({ [STORAGE_KEYS.TOKEN]: null });
}

async function getUserInfo() {
  const result = await storageGet([STORAGE_KEYS.USER_INFO]);
  return result[STORAGE_KEYS.USER_INFO] || null;
}

async function setUserInfo(userInfo) {
  await storageSet({ [STORAGE_KEYS.USER_INFO]: userInfo });
}

async function clearUserInfo() {
  await storageSet({ [STORAGE_KEYS.USER_INFO]: null });
}

async function getStoredDataScope() {
  const result = await storageGet([
    STORAGE_KEYS.DATA_SCOPE_MODE,
    STORAGE_KEYS.DATA_SCOPE_USER_ID,
  ]);

  return {
    mode: normalizeScopeMode(result[STORAGE_KEYS.DATA_SCOPE_MODE]),
    userId: normalizeUserId(result[STORAGE_KEYS.DATA_SCOPE_USER_ID]),
  };
}

async function getDataScope() {
  const [userInfo, scope] = await Promise.all([
    getUserInfo(),
    getStoredDataScope(),
  ]);
  return sanitizeDataScopeSelection(scope, userInfo);
}

async function setDataScope(mode = DATA_SCOPE_MODES.SELF, userId = '') {
  const normalizedMode = normalizeScopeMode(mode);
  const normalizedUserId = normalizedMode === DATA_SCOPE_MODES.USER ? normalizeUserId(userId) : '';

  await storageSet({
    [STORAGE_KEYS.DATA_SCOPE_MODE]: normalizedMode,
    [STORAGE_KEYS.DATA_SCOPE_USER_ID]: normalizedUserId,
  });
}

async function clearDataScope() {
  await storageSet({
    [STORAGE_KEYS.DATA_SCOPE_MODE]: DATA_SCOPE_MODES.SELF,
    [STORAGE_KEYS.DATA_SCOPE_USER_ID]: '',
  });
}

async function getRequestContext() {
  const [token, userInfo, scope] = await Promise.all([
    getToken(),
    getUserInfo(),
    getStoredDataScope(),
  ]);

  const effectiveScope = sanitizeDataScopeSelection(scope, userInfo);

  return {
    token,
    userInfo,
    isAdmin: isAdminUser(userInfo),
    dataScope: effectiveScope,
  };
}

function normalizeApiResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const hasData = Object.prototype.hasOwnProperty.call(raw, 'data');
  const hasEnvelopeMeta =
    Object.prototype.hasOwnProperty.call(raw, 'code') ||
    Object.prototype.hasOwnProperty.call(raw, 'status') ||
    Object.prototype.hasOwnProperty.call(raw, 'msg') ||
    Object.prototype.hasOwnProperty.call(raw, 'message');
  if (hasData && hasEnvelopeMeta) {
    return raw.data;
  }
  return raw;
}

function resolveOwnershipUserId(context, ownershipMode) {
  if (!context) {
    return '';
  }

  if (ownershipMode === 'current-user') {
    return normalizeUserId(context.userInfo?.id || context.userInfo?.userId);
  }

  if (ownershipMode === 'scope-user') {
    if (context.dataScope?.mode === DATA_SCOPE_MODES.USER && context.dataScope?.userId) {
      return normalizeUserId(context.dataScope.userId);
    }
    return normalizeUserId(context.userInfo?.id || context.userInfo?.userId);
  }

  return '';
}

async function apiRequest(url, options = {}) {
  const {
    headers: customHeaders = {},
    dataScope = 'auto',
    ownership = 'server-managed',
    body: rawBody,
    ...fetchOptions
  } = options;

  const [baseUrl, context] = await Promise.all([
    getApiBaseUrl(),
    getRequestContext(),
  ]);

  let fullUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    fullUrl = url;
  } else {
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    fullUrl = `${normalizedBase}${normalizedUrl}`;
  }

  const headers = {
    ...customHeaders,
  };

  let body = rawBody;
  const ownershipUserId = resolveOwnershipUserId(context, ownership);
  if (ownership !== 'server-managed' && ownershipUserId) {
    body = applyOwnershipToBody(body, ownershipUserId);
  }

  if (context.token) {
    headers['Authorization'] = `Bearer ${context.token}`;
  }

  if (dataScope !== 'skip' && context.isAdmin) {
    Object.assign(headers, buildDataScopeHeaders(context.dataScope));
  }

  if (!isFormData(body) && body !== undefined && body !== null && !hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '请求失败');
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText || `HTTP ${response.status}` };
    }
    const error = new Error(errorData.message || errorData.msg || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const json = await response.json();
    return normalizeApiResponse(json);
  }

  return await response.text();
}

async function login(username, password, rememberMe = false) {
  const apiBaseUrl = await getApiBaseUrl();
  const loginPath = ApiConfig?.API_ENDPOINTS?.AUTH?.LOGIN || '/auth/login';
  const url = `${apiBaseUrl}${loginPath}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
      deviceInfo: getDeviceInfo(),
      rememberMe,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '登录失败');
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText || `HTTP ${response.status}` };
    }
    throw new Error(errorData.message || errorData.msg || `登录失败: HTTP ${response.status}`);
  }

  const data = normalizeApiResponse(await response.json());

  if (!data || !data.token) {
    throw new Error('登录响应中未找到 token');
  }

  await setToken(data.token);
  await fetchUserInfo();

  return data;
}

async function fetchUserInfo() {
  try {
    const userInfoPath = ApiConfig?.API_ENDPOINTS?.USER?.GET_USER_INFO || '/user/getUserInfo';
    const data = await apiRequest(userInfoPath, {
      method: 'POST',
      body: JSON.stringify({}),
      dataScope: 'skip',
    });

    if (data) {
      await setUserInfo(data);
      return data;
    }

    throw new Error('获取用户信息失败：响应为空');
  } catch (error) {
    console.error('获取用户信息失败:', error);
    if (error.status === 401 || (error.message && error.message.includes('401'))) {
      await clearToken();
      await clearUserInfo();
      await clearDataScope();
    }
    throw error;
  }
}

async function logout() {
  try {
    const logoutPath = ApiConfig?.API_ENDPOINTS?.AUTH?.LOGOUT || '/auth/logout';
    await apiRequest(logoutPath, {
      method: 'POST',
    });
  } catch (error) {
    console.error('登出请求失败:', error);
  } finally {
    await clearToken();
    await clearUserInfo();
    await clearDataScope();
  }
}

async function createCommonUrl(commonUrlData) {
  const createPath = ApiConfig?.API_ENDPOINTS?.COMMON_URL?.CREATE || '/common-url';
  return await apiRequest(createPath, {
    method: 'POST',
    body: JSON.stringify(commonUrlData),
  });
}

const exportedApiUtils = {
  login,
  logout,
  fetchUserInfo,
  apiRequest,
  getToken,
  setToken,
  clearToken,
  getUserInfo,
  setUserInfo,
  clearUserInfo,
  isDevMode,
  setDevMode,
  getApiBaseUrl,
  getWsBaseUrl,
  setApiBaseUrl,
  setWsBaseUrl,
  getDataScope,
  setDataScope,
  clearDataScope,
  getRequestContext,
  buildDataScopeHeaders,
  createCommonUrl,
  DEFAULT_CONFIG,
  STORAGE_KEYS,
  DATA_SCOPE_MODES,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportedApiUtils;
}

if (typeof window !== 'undefined') {
  window.ApiUtils = exportedApiUtils;
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.ApiUtils = exportedApiUtils;
}
