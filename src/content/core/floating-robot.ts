// @ts-nocheck
// floating-robot.js: 悬浮机器人组件

// 创建全局悬浮机器人对象
window.CoreFloatingRobot = {
  robotElement: null,
  menuElement: null,
  isMenuOpen: false,
  currentSiteInfo: null,

  // 创建机器人图标
  createRobotIcon() {
    const robot = window.CoreDOMUtils.createElement('div', 'core-floating-robot');
    robot.innerHTML = '🤡';
    robot.setAttribute('title', 'Clown 工具助手');
    return robot;
  },

  // 创建功能菜单
  createMenu() {
    const menu = window.CoreDOMUtils.createElement('div', 'core-robot-menu');
    menu.style.display = 'none';
    return menu;
  },

  // 加载菜单项
  async loadMenuItems() {
    if (!this.menuElement) return;

    // 清空现有菜单项
    this.menuElement.innerHTML = '';

    const header = window.CoreDOMUtils.createElement('div', 'core-menu-item core-menu-header');
    header.textContent = 'YiShe 常用工具';
    this.menuElement.appendChild(header);

    try {
      const commonModule = window.CoreSiteModules?.common;
      if (commonModule?.getMenuItems) {
        const items = await commonModule.getMenuItems(window.CoreSiteDetector?.getCurrentSiteInfo?.() || {});
        if (Array.isArray(items) && items.length > 0) {
          items.forEach((item) => {
            const menuItem = this.createMenuItem(item);
            this.menuElement.appendChild(menuItem);
          });
        } else {
          this.addDefaultMenuItems();
        }
      } else {
        this.addDefaultMenuItems();
      }
    } catch (error) {
      console.error('[Core] 加载通用菜单失败:', error);
      this.addDefaultMenuItems();
    }

    this.addCommonMenuItems();
  },

  // 加载网站模块菜单
  async loadSiteModuleMenu(siteInfo) {
    return new Promise((resolve) => {
      // 如果模块已经加载，直接使用
      if (window.CoreSiteModules && window.CoreSiteModules[siteInfo.module]) {
        this.renderModuleMenu(siteInfo, window.CoreSiteModules[siteInfo.module]);
        resolve();
        return;
      }

      console.warn(`[Core] 模块 ${siteInfo.module} 未注册，回退到默认菜单`);
      this.addDefaultMenuItems();
      resolve();
    });
  },

  // 渲染模块菜单
  async renderModuleMenu(siteInfo, module) {
    if (module.getMenuItems) {
      try {
        const menuItems = await module.getMenuItems(siteInfo);
        if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
          menuItems.forEach(item => {
            const menuItem = this.createMenuItem(item);
            this.menuElement.appendChild(menuItem);
          });
        } else {
          this.addDefaultMenuItems();
        }
      } catch (error) {
        console.error('[Core] 获取菜单项失败:', error);
        this.addDefaultMenuItems();
      }
    } else {
      this.addDefaultMenuItems();
    }
  },

  // 创建菜单项
  createMenuItem(item) {
    const menuItem = window.CoreDOMUtils.createElement('div', 'core-menu-item');
    
    if (item.icon) {
      menuItem.innerHTML = `<span class="core-menu-icon">${item.icon}</span> ${item.label}`;
    } else {
      menuItem.textContent = item.label;
    }

    if (item.action && typeof item.action === 'function') {
      menuItem.addEventListener('click', () => {
        try {
          item.action();
          this.closeMenu();
        } catch (error) {
          console.error('[Core] 执行菜单项操作失败:', error);
          if (window.CoreDOMUtils && window.CoreDOMUtils.showNotification) {
            window.CoreDOMUtils.showNotification('执行失败: ' + error.message, 'error');
          }
        }
      });
    }

    if (item.disabled) {
      menuItem.classList.add('disabled');
    }

    return menuItem;
  },

  // 添加默认菜单项
  addDefaultMenuItems() {
    const defaultItem = window.CoreDOMUtils.createElement('div', 'core-menu-item');
    defaultItem.textContent = '暂无功能';
    defaultItem.classList.add('disabled');
    this.menuElement.appendChild(defaultItem);
  },

  // 添加通用菜单项
  addCommonMenuItems() {
    // 分隔线
    const divider = window.CoreDOMUtils.createElement('div', 'core-menu-divider');
    this.menuElement.appendChild(divider);

    // 刷新页面
    const refreshItem = this.createMenuItem({
      icon: '🔄',
      label: '刷新页面',
      action: () => {
        window.location.reload();
      }
    });
    this.menuElement.appendChild(refreshItem);
  },

  // 打开菜单
  openMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
      return;
    }

    this.isMenuOpen = true;
    this.menuElement.style.display = 'block';
    this.loadMenuItems();

    // 点击外部关闭菜单
    const closeHandler = (e) => {
      if (!this.menuElement.contains(e.target) && !this.robotElement.contains(e.target)) {
        this.closeMenu();
        document.removeEventListener('click', closeHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 100);
  },

  // 关闭菜单
  closeMenu() {
    this.isMenuOpen = false;
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
    }
  },

  // 初始化
  init() {
    // 创建机器人容器
    const container = window.CoreDOMUtils.createElement('div', 'core-robot-container');
    this.robotElement = this.createRobotIcon();
    // 保留悬浮机器人，但移除点击后弹出菜单
    this.menuElement = null;

    container.appendChild(this.robotElement);
    // 不再附加菜单到页面
    document.body.appendChild(container);

    // 不再绑定点击打开菜单事件（保留拖拽等交互）

    // 初始位置（右下角），改为使用 top/left，避免与 bottom/right 冲突
    const setInitialPosition = () => {
      // 先放到可见区域再计算尺寸
      container.style.left = '0px';
      container.style.top = '0px';
      const targetLeft = Math.max(0, window.innerWidth - container.offsetWidth - 20);
      const targetTop = Math.max(0, window.innerHeight - container.offsetHeight - 80);
      container.style.left = targetLeft + 'px';
      container.style.top = targetTop + 'px';
    };
    setTimeout(setInitialPosition, 0);

    // 拖拽功能（Pointer Events + rAF 提升流畅度）
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let pendingAnimationFrame = null;
    let nextLeft = 0;
    let nextTop = 0;

    const updatePosition = () => {
      pendingAnimationFrame = null;
      // 限制在可视区域内
      const maxX = window.innerWidth - container.offsetWidth;
      const maxY = window.innerHeight - container.offsetHeight;
      const clampedLeft = Math.max(0, Math.min(nextLeft, maxX));
      const clampedTop = Math.max(0, Math.min(nextTop, maxY));
      container.style.left = clampedLeft + 'px';
      container.style.top = clampedTop + 'px';
    };

    this.robotElement.addEventListener('pointerdown', (e) => {
      // 忽略非主键
      if (e.button !== 0) return;
      isDragging = true;
      this.robotElement.setPointerCapture(e.pointerId);
      const rect = container.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
    });

    this.robotElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      nextLeft = e.clientX - dragOffsetX;
      nextTop = e.clientY - dragOffsetY;
      if (pendingAnimationFrame === null) {
        pendingAnimationFrame = requestAnimationFrame(updatePosition);
      }
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        this.robotElement.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    this.robotElement.addEventListener('pointerup', endDrag);
    this.robotElement.addEventListener('pointercancel', endDrag);

    // 窗口尺寸变化时，保持在可视区域内
    window.addEventListener('resize', () => {
      const rect = container.getBoundingClientRect();
      nextLeft = rect.left;
      nextTop = rect.top;
      if (pendingAnimationFrame === null) {
        pendingAnimationFrame = requestAnimationFrame(updatePosition);
      }
    });

    console.log('[Core] 悬浮机器人已初始化');
  }
};
