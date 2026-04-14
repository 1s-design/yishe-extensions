// @ts-nocheck
// site1/index.js: 网站1的功能模块

// 创建全局网站模块对象（如果不存在）
if (!window.CoreSiteModules) {
  window.CoreSiteModules = {};
}

window.CoreSiteModules.site1 = {
  // 初始化网站1的功能
  init(siteInfo) {
    console.log('[Core Site1] 网站1功能模块已加载', siteInfo);
    // 在这里添加网站1特定的功能
  },

  // 获取菜单项
  async getMenuItems(siteInfo) {
    return [
      {
        icon: '📥',
        label: '爬取数据',
        action: () => {
          this.crawlSite1Data();
        }
      },
      {
        icon: '🔍',
        label: '搜索功能',
        action: () => {
          this.showSearchDialog();
        }
      },
      {
        icon: '📊',
        label: '数据分析',
        action: () => {
          this.analyzeData();
        }
      }
    ];
  },

  // 爬取数据
  crawlSite1Data() {
    console.log('[Core Site1] 开始爬取数据');
    
    // 这里实现网站1的数据爬取逻辑
    const data = {
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      // 添加更多需要爬取的数据
    };
    
    console.log('[Core Site1] 爬取的数据:', data);
    
    // 发送数据到 background script
    chrome.runtime.sendMessage({
      action: 'saveData',
      site: 'site1',
      data: data
    }, (response) => {
      if (response && response.success) {
        window.CoreDOMUtils.showNotification('数据爬取完成', 'success');
      } else {
        window.CoreDOMUtils.showNotification('数据爬取失败', 'error');
      }
    });
  },

  // 显示搜索对话框
  showSearchDialog() {
    const keyword = prompt('请输入搜索关键词:');
    if (keyword) {
      console.log('[Core Site1] 搜索关键词:', keyword);
      window.CoreDOMUtils.showNotification(`搜索: ${keyword}`, 'info');
    }
  },

  // 分析数据
  analyzeData() {
    console.log('[Core Site1] 分析数据');
    window.CoreDOMUtils.showNotification('数据分析完成', 'success');
  }
};

