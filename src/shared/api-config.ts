export const OPEN_SOURCE_PROD_DEFAULTS = {
  API_BASE_URL: "http://api.1s.design/api",
  WS_BASE_URL: "http://api.1s.design/ws",
  CLIENT_BASE_URL: "http://localhost:1519",
  FEISHU_WEBHOOK_URL: "",
  LOCATION_ENDPOINT: "http://ipapi.co/json/",
} as const;

export const PROD_CONFIG = {
  API_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.API_BASE_URL,
  WS_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.WS_BASE_URL,
  CLIENT_BASE_URL: OPEN_SOURCE_PROD_DEFAULTS.CLIENT_BASE_URL,
  FEISHU_WEBHOOK_URL: OPEN_SOURCE_PROD_DEFAULTS.FEISHU_WEBHOOK_URL,
  LOCATION_ENDPOINT: OPEN_SOURCE_PROD_DEFAULTS.LOCATION_ENDPOINT,
} as const;

export const DEV_CONFIG = {
  API_BASE_URL: "http://localhost:1520/api",
  WS_BASE_URL: "http://localhost:1520/ws",
  CLIENT_BASE_URL: "http://localhost:1519",
  FEISHU_WEBHOOK_URL: "",
  LOCATION_ENDPOINT: "http://ipapi.co/json/",
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
  },
  USER: {
    GET_USER_INFO: "/user/getUserInfo",
  },
  COMMON_URL: {
    CREATE: "/common-url",
    LIST: "/common-url/page",
    GET: "/common-url/:id",
    UPDATE: "/common-url/:id",
    DELETE: "/common-url/:id",
    GET_BY_CATEGORY: "/common-url/category/:category",
  },
  SENTENCE: {
    CREATE: "/sentences",
    LIST: "/sentences/page",
    GET: "/sentences/:id",
    UPDATE: "/sentences/:id",
    DELETE: "/sentences/:id",
    AI_ANALYZE: "/sentences/ai-analyze",
  },
} as const;

export const CLIENT_ENDPOINTS = {
  MATERIAL_UPLOAD: "/api/material-upload",
  AUTH_SESSION: "/api/auth/session",
} as const;
