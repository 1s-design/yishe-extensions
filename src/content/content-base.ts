// @ts-nocheck
// content-base.js: 基础 content script，负责初始化悬浮机器人和加载对应网站的功能模块

(function() {
  'use strict';

  // 防止重复加载
  if (window.coreExtensionLoaded) {
    return;
  }
  window.coreExtensionLoaded = true;

  // 初始化悬浮机器人
  function initFloatingRobot() {
    if (window.CoreFloatingRobot && window.CoreFloatingRobot.init) {
      try {
        window.CoreFloatingRobot.init();
      } catch (error) {
        console.error('[Core] 初始化悬浮机器人失败:', error);
      }
    } else {
      console.error('[Core] 悬浮机器人组件未加载');
    }
  }

  // 全站点解锁右键菜单（拦截页面自定义 contextmenu 处理）
  function enableContextMenu() {
    try {
      window.addEventListener('contextmenu', (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
        // 不调用 preventDefault，保留浏览器原生右键菜单
      }, true);

      document.addEventListener('contextmenu', (event) => {
        const target = event.target;
        if (target && target.oncontextmenu) {
          target.oncontextmenu = null;
        }
      }, true);

      document.oncontextmenu = null;
    } catch (error) {
      console.error('[Core] 解除右键限制失败:', error);
    }
  }

  // 加载基础功能模块
  function loadSiteModule() {
    loadModule('common');
  }

  // 模块现在由 WXT 在 content script 中静态导入
  function loadModule(moduleName) {
    const module = window.CoreSiteModules?.[moduleName];
    if (!module) {
      console.warn(`[Core] 模块 ${moduleName} 未注册`);
      return;
    }

    if (module.init && typeof module.init === 'function') {
      try {
        const siteInfo = window.CoreSiteDetector?.getCurrentSiteInfo?.() || {};
        module.init(siteInfo);
        console.log(`[Core] 已初始化 ${moduleName} 模块`);
      } catch (error) {
        console.error(`[Core] 初始化 ${moduleName} 模块失败:`, error);
      }
    }
  }

  // 初始化
  enableContextMenu();

  // 初始化
  function init() {
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          initFloatingRobot();
          loadSiteModule();
        }, 200);
      });
    } else {
      setTimeout(() => {
        initFloatingRobot();
        loadSiteModule();
      }, 200);
    }
  }

  // 启动
  init();
})();
