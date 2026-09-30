<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Monitor, Refresh, Picture } from "@element-plus/icons-vue";

import { useActiveTab } from "@/composables/useActiveTab";
import { useUserSession } from "@/composables/useUserSession";
import { useWebsocketStatus } from "@/composables/useWebsocketStatus";
import { useDevMode } from "@/composables/useDevMode";
import { useImageHoverSetting } from "@/composables/useImageHoverSetting";
import { navigateToExtensionPage, openExtensionTab } from "@/shared/extension";
import type { SiteAction } from "@/shared/site-adapter/types";

// 活跃页面感知与站点模块匹配
const { currentTab, matchedModule, refreshTab } = useActiveTab();

// 图片悬停工具开关
const {
  loading: hoverSettingLoading,
  imageHoverEnabled,
  setEnabled: setImageHoverEnabled,
} = useImageHoverSetting();

async function handleToggleHover(val: boolean | string | number) {
  const next = Boolean(val);
  await setImageHoverEnabled(next);
  ElMessage.success(next ? "已开启图片悬浮保存" : "已关闭图片悬浮保存");
}


// 会话与连接状态
const { authenticated, userInfo, refresh: refreshSession } = useUserSession();
const { clientState, refresh: refreshConnections } = useWebsocketStatus();

onMounted(async () => {
  const loggedIn = await refreshSession();
  if (!loggedIn) {
    await navigateToExtensionPage("/login.html");
  }
});
const { devMode } = useDevMode();

const isInternalPage = computed(() => {
  const url = currentTab.value.url;
  return (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  );
});

// 正在执行的操作
const executingActionId = ref<string | null>(null);

async function handleExecuteAction(action: SiteAction) {
  if (!currentTab.value.id || isInternalPage.value) {
    ElMessage.warning("请在普通网页中使用本功能");
    return;
  }

  executingActionId.value = action.id;
  try {
    await action.handler({
      tabId: currentTab.value.id,
      url: currentTab.value.url,
      hostname: currentTab.value.hostname,
      title: currentTab.value.title,
    });
    ElMessage.success(`已执行：${action.label}`);
  } catch (error: any) {
    ElMessage.error(error?.message || `执行「${action.label}」失败`);
  } finally {
    executingActionId.value = null;
  }
}

// 打开完整控制台
async function handleOpenControl() {
  try {
    await openExtensionTab("/control.html");
  } catch (err: any) {
    ElMessage.error(err?.message || "打开控制台失败");
  }
}

// 刷新状态
async function handleRefreshAll() {
  await Promise.all([refreshTab(), refreshConnections(), refreshSession()]);
  ElMessage.success("已刷新");
}
</script>

<template>
  <div class="sidepanel-app">
    <!-- 顶部栏：纯文字，无边框无阴影 -->
    <header class="sp-navbar">
      <span class="navbar-title">YiShe</span>
      <div class="navbar-actions">
        <button
          class="nav-btn"
          :class="{ 'is-active': imageHoverEnabled }"
          :title="imageHoverEnabled ? '图片悬浮保存已开启' : '图片悬浮保存已关闭'"
          @click="handleToggleHover(!imageHoverEnabled)"
        >
          <el-icon :size="14"><Picture /></el-icon>
        </button>
        <button class="nav-btn" title="刷新" @click="handleRefreshAll">
          <el-icon :size="14"><Refresh /></el-icon>
        </button>
        <button class="nav-btn" title="控制台" @click="handleOpenControl">
          <el-icon :size="14"><Monitor /></el-icon>
        </button>
      </div>
    </header>

    <!-- 当前页面信息：纯文字行 -->
    <div class="site-bar">
      <span class="site-host">{{ isInternalPage ? "系统页" : currentTab.hostname }}</span>
      <span class="site-title">{{ currentTab.title || "就绪" }}</span>
    </div>

    <!-- 图片悬浮保存快捷开关 -->
    <div class="hover-toggle">
      <span class="hover-label">图片悬浮保存</span>
      <el-switch
        :model-value="imageHoverEnabled"
        :loading="hoverSettingLoading"
        size="small"
        inline-prompt
        active-text="开"
        inactive-text="关"
        @change="handleToggleHover"
      />
    </div>

    <!-- 操作列表 -->
    <main class="actions-container">
      <div v-if="isInternalPage" class="internal-tip">
        在普通网页上浏览时将自动激活对应功能
      </div>

      <template v-else>
        <div v-if="!matchedModule.actions.length" class="empty-tip">
          当前站点暂无专属适配功能
        </div>

        <ul v-else class="action-list">
          <li
            v-for="action in matchedModule.actions"
            :key="action.id"
            class="action-item"
            :class="{ 'is-primary': action.primary, 'is-loading': executingActionId === action.id }"
            @click="handleExecuteAction(action)"
          >
            <span class="action-label">{{ action.label }}</span>
            <span class="action-arrow">→</span>
          </li>
        </ul>
      </template>
    </main>

    <!-- 底栏：纯文字状态 -->
    <footer class="sp-bottombar">
      <span class="bottom-status">
        <i class="status-dot" :class="authenticated ? 'online' : 'offline'" />
        {{ authenticated ? (userInfo?.account || "已登录") : "未登录" }}
      </span>
      <span class="bottom-status">
        <i class="status-dot" :class="clientState.status === 'connected' ? 'online' : 'offline'" />
        客户端
      </span>
    </footer>
  </div>
</template>

<style scoped>
.sidepanel-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

/* 顶部栏 — 纯文字，无背景无边框 */
.sp-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
}

.navbar-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 0.5px;
}

.navbar-actions {
  display: flex;
  gap: 2px;
}

.nav-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
}

.nav-btn:hover {
  color: #333;
  background: #f5f5f5;
}

.nav-btn.is-active {
  color: #4f46e5;
}

/* 当前页面 — 纯文字行 */
.site-bar {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 14px;
}

.site-host {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  flex-shrink: 0;
}

.site-title {
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 悬浮保存开关 — 无边框扁平 */
.hover-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid #f0f0f0;
}

.hover-label {
  font-size: 12px;
  color: #666;
}

/* 操作列表 — 纯文字列表，无卡片 */
.actions-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  border-top: 1px solid #f0f0f0;
}

.internal-tip,
.empty-tip {
  padding: 24px 14px;
  font-size: 12px;
  color: #bbb;
  text-align: center;
}

.action-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
}

.action-item:hover {
  background: #f7f7f7;
}

.action-item.is-primary {
  color: #4f46e5;
}

.action-item.is-loading {
  opacity: 0.5;
  pointer-events: none;
}

.action-arrow {
  font-size: 12px;
  color: #ccc;
}

.action-item:hover .action-arrow {
  color: #999;
}

/* 底栏 — 纯文字 */
.sp-bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid #f0f0f0;
  font-size: 11px;
  color: #999;
}

.bottom-status {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ccc;
}

.status-dot.online {
  background: #52c41a;
}

.status-dot.offline {
  background: #ccc;
}
</style>
