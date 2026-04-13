/**
 * API 配置文件
 * 统一管理服务地址、接口路径等配置信息
 * 便于维护和修改，实现低耦合
 * 注意：开源仓库默认不包含真实生产地址和真实 Webhook，
 * 如需连接私有服务，请自行替换下方生产环境配置。
 */

const OPEN_SOURCE_PROD_DEFAULTS = {
  // 远程后端服务地址
  API_BASE_URL: 'http://api.1s.design/api',
  WS_BASE_URL: 'http://api.1s.design/ws',
  // 插件与本地客户端的桥接固定走本机 Electron 服务
  CLIENT_BASE_URL: 'http://localhost:1519',
  FEISHU_WEBHOOK_URL: '',
  LOCATION_ENDPOINT: 'http://ipapi.co/json/',
};

// 生产环境配置
const PROD_CONFIG = {
  // API 基础地址
  API_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.API_BASE_URL,
  // WebSocket 基础地址
  WS_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.WS_BASE_URL,
  // 本地客户端地址（Electron）
  CLIENT_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.CLIENT_BASE_URL,
  // 飞书 Webhook（可选）
  FEISHU_WEBHOOK_URL: OPEN_SOURCE_PROD_DEFAULTS.FEISHU_WEBHOOK_URL,
  // 位置信息接口
  LOCATION_ENDPOINT: OPEN_SOURCE_PROD_DEFAULTS.LOCATION_ENDPOINT,
};

// 开发环境配置
const DEV_CONFIG = {
  // API 基础地址
  API_BASE_URL: 'http://localhost:1520/api',
  // WebSocket 基础地址
  WS_BASE_URL: 'http://localhost:1520/ws',
  // 本地客户端地址（Electron）
  CLIENT_BASE_URL: 'http://localhost:1519',
  // 飞书 Webhook（可选）
  FEISHU_WEBHOOK_URL: '',
  // 位置信息接口
  LOCATION_ENDPOINT: 'http://ipapi.co/json/',
};

// API 接口路径（相对路径，会与 API_BASE_URL 拼接）
const API_ENDPOINTS = {
  // 认证相关
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
  },
  // 用户相关
  USER: {
    GET_USER_INFO: '/user/getUserInfo',
  },
  // 公共链接相关
  COMMON_URL: {
    // 创建/分页默认依赖服务端根据 token 和 x-data-scope-* 头做数据隔离，
    // 不再推荐通过 /user/:userId 这类路径在插件端显式拼接 owner。
    CREATE: '/common-url',
    LIST: '/common-url/page',
    GET: '/common-url/:id',
    UPDATE: '/common-url/:id',
    DELETE: '/common-url/:id',
    GET_BY_CATEGORY: '/common-url/category/:category',
  },
  // 句子管理相关
  SENTENCE: {
    CREATE: '/sentences',
    LIST: '/sentences/page',
    GET: '/sentences/:id',
    UPDATE: '/sentences/:id',
    DELETE: '/sentences/:id',
    AI_ANALYZE: '/sentences/ai-analyze',
  },
};

// 本地客户端接口路径（相对路径，会与 CLIENT_BASE_URL 拼接）
const CLIENT_ENDPOINTS = {
  // 通用图片上传到本地客户端，由客户端按 target 决定落图库或爬图库
  MATERIAL_UPLOAD: '/api/material-upload',
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROD_CONFIG,
    DEV_CONFIG,
    API_ENDPOINTS,
    CLIENT_ENDPOINTS,
  };
}

// 如果在浏览器环境中，挂载到 window
if (typeof window !== 'undefined') {
  window.ApiConfig = {
    PROD_CONFIG,
    DEV_CONFIG,
    API_ENDPOINTS,
    CLIENT_ENDPOINTS,
  };
}

// 如果在 Service Worker 环境中，挂载到 self
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.ApiConfig = {
    PROD_CONFIG,
    DEV_CONFIG,
    API_ENDPOINTS,
    CLIENT_ENDPOINTS,
  };
}
