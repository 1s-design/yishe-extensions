export function serializeError(error: unknown) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function guessExtension(url: string, contentType?: string | null) {
  const fromUrl = (() => {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.(avif|webp|png|jpg|jpeg|gif|svg)$/i);
      return match ? `.${match[1].toLowerCase()}` : "";
    } catch {
      return "";
    }
  })();

  if (fromUrl) return fromUrl;
  if (!contentType) return ".jpg";
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";
  if (contentType.includes("image/svg")) return ".svg";
  if (contentType.includes("image/avif")) return ".avif";
  return ".jpg";
}

export async function createTabAndWait(url: string, timeoutMs = 45000) {
  if (!chrome?.tabs?.create) {
    throw new Error("当前环境不支持创建标签页");
  }

  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (createdTab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "创建标签页失败"));
        return;
      }
      resolve(createdTab);
    });
  });

  await waitForTabComplete(tab.id, timeoutMs);
  return tab;
}

export function waitForTabComplete(tabId?: number, timeoutMs = 45000) {
  return new Promise<chrome.tabs.Tab | undefined>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("等待页面加载超时，可能网络较慢或链接不可达"));
    }, timeoutMs);

    function listener(
      updatedTabId: number,
      changeInfo: { status?: string },
      tab: chrome.tabs.Tab,
    ) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve(tab);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function executeScript<T>(
  tabId: number,
  func: (...args: any[]) => T,
  args: any[] = [],
) {
  if (!chrome?.scripting?.executeScript) {
    throw new Error("当前环境不支持脚本注入，请检查扩展权限");
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });

  const first = Array.isArray(results) ? results[0] : null;
  return first?.result as T | undefined;
}

export function storageGet<T = Record<string, unknown>>(
  keys: string | string[] | Record<string, unknown>,
) {
  return new Promise<T>((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve((result || {}) as T);
    });
  });
}

export function storageSet(data: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}
