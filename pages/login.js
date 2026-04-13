// 登录页面逻辑
(async function() {
  function loadScript(scriptId, scriptUrl, errorMessage, validator) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(scriptId);
      if (existing && validator()) {
        resolve();
        return;
      }

      const script = existing || document.createElement('script');
      script.id = scriptId;
      script.src = scriptUrl;

      const timer = setTimeout(() => {
        reject(new Error(`${errorMessage} 超时`));
      }, 2000);

      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };

      const handleLoad = () => {
        window.setTimeout(() => {
          if (validator()) {
            cleanup();
            resolve();
          } else {
            cleanup();
            reject(new Error(errorMessage));
          }
        }, 50);
      };

      const handleError = () => {
        cleanup();
        reject(new Error(errorMessage));
      };

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      if (!existing) {
        document.head.appendChild(script);
      }
    });
  }

  await loadScript(
    'yishe-api-config-script',
    chrome.runtime.getURL('config/api.config.js'),
    '加载 api.config.js 失败',
    () => Boolean(window.ApiConfig)
  );

  await loadScript(
    'yishe-api-utils-script',
    chrome.runtime.getURL('utils/api.js'),
    '加载 api.js 失败',
    () => Boolean(window.ApiUtils)
  );
  
  const ApiUtils = window.ApiUtils;
  
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberMeInput = document.getElementById('rememberMe');
  const loginBtn = document.getElementById('login-btn');
  const loginBtnText = document.getElementById('login-btn-text');
  const loginBtnLoading = document.getElementById('login-btn-loading');
  const loginError = document.getElementById('login-error');
  const devModeToggle = document.getElementById('dev-mode-toggle');
  const devModeInfo = document.getElementById('dev-mode-info');
  
  // 加载开发模式状态
  async function loadDevMode() {
    const isDev = await ApiUtils.isDevMode();
    devModeToggle.checked = isDev;
    await updateDevModeInfo();
  }
  
  // 更新开发模式信息显示
  async function updateDevModeInfo() {
    const isDev = devModeToggle.checked;
    devModeInfo.hidden = !isDev;
  }
  
  // 开发模式切换
  devModeToggle.addEventListener('change', async () => {
    await ApiUtils.setDevMode(devModeToggle.checked);
    await updateDevModeInfo();
  });
  
  // 显示错误
  function showError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
    setTimeout(() => {
      loginError.hidden = true;
    }, 5000);
  }
  
  // 设置加载状态
  function setLoading(loading) {
    loginBtn.disabled = loading;
    if (loading) {
      loginBtnText.hidden = true;
      loginBtnLoading.hidden = false;
    } else {
      loginBtnText.hidden = false;
      loginBtnLoading.hidden = true;
    }
  }
  
  // 表单提交
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberMeInput.checked;
    
    if (!username || !password) {
      showError('请输入用户名和密码');
      return;
    }
    
    setLoading(true);
    loginError.hidden = true;
    
    try {
      await ApiUtils.login(username, password, rememberMe);
      
      // 登录成功，跳转到控制页面
      const controlUrl = chrome.runtime.getURL('pages/control.html');
      window.location.href = controlUrl;
    } catch (error) {
      console.error('登录失败:', error);
      showError(error.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  });
  
  // 检查是否已登录
  async function checkLoginStatus() {
    const token = await ApiUtils.getToken();
    if (token) {
      // 已登录，跳转到控制页面
      const controlUrl = chrome.runtime.getURL('pages/control.html');
      window.location.href = controlUrl;
    }
  }
  
  // 初始化
  await loadDevMode();
  await checkLoginStatus();
})();
