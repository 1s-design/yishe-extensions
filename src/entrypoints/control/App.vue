<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  Bell,
  Connection,
  RefreshRight,
  Setting,
  SwitchButton,
  UserFilled,
} from "@element-plus/icons-vue";

import { useAdminMessages } from "@/composables/useAdminMessages";
import { useDevMode } from "@/composables/useDevMode";
import { useUserSession } from "@/composables/useUserSession";
import { useWebsocketStatus } from "@/composables/useWebsocketStatus";
import {
  navigateToExtensionPage,
  openExtensionTab,
} from "@/shared/extension";
import {
  formatAdminMessageTime,
  formatMessageData,
  formatStatusTimestamp,
  getStatusMeta,
} from "@/shared/format";
import type {
  ConnectionStatus,
  UserInfo,
  WebsocketState,
} from "@/shared/types";

type SectionKey = "account" | "connection" | "environment" | "messages";

const activeSection = ref<SectionKey>("account");

const {
  loading: sessionLoading,
  authenticated,
  userInfo,
  displayName,
  refresh: refreshSession,
  logout,
} = useUserSession();

const {
  loading: statusLoading,
  serverState,
  clientState,
  refresh: refreshConnections,
  reconnectServer,
  reconnectClient,
} = useWebsocketStatus();

const {
  loading: devModeLoading,
  devMode,
  apiBaseUrl,
  wsBaseUrl,
  refresh: refreshDevMode,
  toggle,
} = useDevMode();

const {
  loading: messagesLoading,
  messages,
  refresh: refreshMessages,
  clear: clearMessages,
} = useAdminMessages();

const menuItems = computed(() => [
  {
    key: "account" as const,
    label: authenticated.value ? "账户" : "登录",
    icon: UserFilled,
    disabled: false,
  },
  {
    key: "connection" as const,
    label: "连接",
    icon: Connection,
    disabled: !authenticated.value,
  },
  {
    key: "environment" as const,
    label: "环境",
    icon: Setting,
    disabled: false,
  },
  {
    key: "messages" as const,
    label: "消息",
    icon: Bell,
    disabled: false,
  },
]);

const sectionMeta = computed(() => {
  switch (activeSection.value) {
    case "connection":
      return { label: "连接", title: "连接状态" };
    case "environment":
      return { label: "环境", title: "运行环境" };
    case "messages":
      return { label: "消息", title: "管理员消息" };
    case "account":
    default:
      return {
        label: authenticated.value ? "账户" : "登录",
        title: authenticated.value ? "账户信息" : "登录状态",
      };
  }
});

const serverStatusMeta = computed(() => getStatusMeta(serverState.status));
const clientStatusMeta = computed(() => getStatusMeta(clientState.status));

const accountRows = computed(() => {
  const currentUser = userInfo.value;
  return [
    { label: "账号", value: normalizeDisplayValue(displayName.value) },
    { label: "昵称", value: normalizeDisplayValue(currentUser?.nickname) },
    {
      label: "用户 ID",
      value: normalizeDisplayValue(currentUser?.userId ?? currentUser?.id),
      mono: true,
    },
    {
      label: "身份",
      value: getAccountRoleLabel(currentUser),
    },
  ];
});

watch(
  authenticated,
  (nextValue) => {
    if (!nextValue && activeSection.value === "connection") {
      activeSection.value = "account";
    }
  },
  { immediate: true },
);

onMounted(async () => {
  const loggedIn = await refreshSession({ verifyRemote: true });
  if (!loggedIn) {
    navigateToExtensionPage("/login.html");
    return;
  }
  activeSection.value = loggedIn ? "connection" : "account";
  await refreshDevMode();
});

function normalizeDisplayValue(value: unknown) {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "-";
  }

  return "-";
}

function getAccountRoleLabel(currentUser: UserInfo | null) {
  const value = currentUser?.isAdmin;
  const isAdmin =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true";
  return isAdmin ? "管理员" : "用户";
}

function selectSection(nextSection: SectionKey, disabled = false) {
  if (disabled) {
    return;
  }

  activeSection.value = nextSection;
}

function getStatusDotClass(status: ConnectionStatus) {
  if (status === "connected") return "is-connected";
  if (status === "error") return "is-error";
  if (status === "connecting" || status === "reconnecting") {
    return "is-warning";
  }
  return "";
}

function getConnectionEndpointText(state: WebsocketState, fallback: string) {
  return state.endpoint || fallback;
}

function getConnectionTimeText(state: WebsocketState) {
  return (
    formatStatusTimestamp(state.lastPongAt || state.connectedAt || state.lastPingAt) ||
    "-"
  );
}

function getConnectionMetrics(state: WebsocketState) {
  const metrics: string[] = [];

  if (state.connectedAt) {
    metrics.push(`连接 ${formatStatusTimestamp(state.connectedAt)}`);
  }

  if (state.lastPongAt) {
    metrics.push(`Pong ${formatStatusTimestamp(state.lastPongAt)}`);
  }

  if (state.lastLatencyMs !== null) {
    metrics.push(`延迟 ${state.lastLatencyMs} ms`);
  }

  if (state.retryCount > 0) {
    metrics.push(`重试 ${state.retryCount}`);
  }

  return metrics;
}

async function handleOpenLoginTab() {
  try {
    await openExtensionTab("/login.html");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "打开登录页失败");
  }
}

async function handleLogout() {
  await logout("/login.html");
}

async function handleRefreshSession() {
  await refreshSession({ verifyRemote: true });
  ElMessage.success("账户状态已刷新");
}

async function handleRefreshConnections() {
  await refreshConnections();
  ElMessage.success("连接状态已刷新");
}

async function handleRefreshMessages() {
  await refreshMessages();
  ElMessage.success("消息已刷新");
}

async function handleRefreshEnvironment() {
  await refreshDevMode();
  ElMessage.success("环境信息已刷新");
}

async function handleReconnectServer() {
  try {
    await reconnectServer();
    ElMessage.success("已触发远程服务重连");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "重连失败");
  }
}

async function handleReconnectClient() {
  try {
    await reconnectClient();
    ElMessage.success("已触发本地客户端重连");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "重连失败");
  }
}

async function handleClearMessages() {
  await clearMessages();
  ElMessage.success("消息已清空");
}

async function handleDevModeChange(nextValue: boolean | string | number) {
  try {
    await toggle(Boolean(nextValue));
    await refreshConnections();
    ElMessage.success(Boolean(nextValue) ? "已切换到开发模式" : "已切换到生产模式");
  } catch (error) {
    await refreshDevMode();
    ElMessage.error(error instanceof Error ? error.message : "切换失败");
  }
}
</script>

<template>
  <div class="page-shell control-page">
    <div class="page-container workbench-layout control-layout">
      <aside class="workbench-sidebar glass-panel">
        <div class="workbench-brand">
          <span class="brand-mark">
            <img src="/assets/logo.png" alt="YiShe" />
          </span>
          <div class="workbench-brand-copy">
            <strong>YiShe Extension</strong>
            <span>控制台</span>
          </div>
        </div>

        <div class="workbench-summary surface-inset control-summary">
          <span>账户</span>
          <strong>{{ authenticated ? displayName : "未登录" }}</strong>
          <div class="control-summary-footer">
            <small>{{ authenticated ? normalizeDisplayValue(userInfo?.nickname) : "未登录时不会建立连接" }}</small>
            <el-tag
              size="small"
              :type="authenticated ? 'success' : 'info'"
              effect="light"
            >
              {{ authenticated ? "已登录" : "未登录" }}
            </el-tag>
          </div>
        </div>

        <nav class="workbench-menu">
          <button
            v-for="item in menuItems"
            :key="item.key"
            class="workbench-menu-button"
            :class="{
              'is-active': activeSection === item.key,
              'is-disabled': item.disabled,
            }"
            type="button"
            @click="selectSection(item.key, item.disabled)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="workbench-sidebar-footer">
          <el-button
            v-if="!authenticated"
            type="primary"
            @click="handleOpenLoginTab"
          >
            前往登录页
          </el-button>
          <template v-else>
            <el-button plain @click="handleOpenLoginTab">打开登录页</el-button>
            <el-button
              plain
              type="danger"
              :icon="SwitchButton"
              @click="handleLogout"
            >
              退出
            </el-button>
          </template>
        </div>
      </aside>

      <main class="workbench-main">
        <header class="workbench-header">
          <div class="workbench-header-copy">
            <span>{{ sectionMeta.label }}</span>
            <h1>{{ sectionMeta.title }}</h1>
          </div>

          <div class="workbench-header-actions">
            <el-tag
              v-if="activeSection === 'environment'"
              size="small"
              effect="light"
              :type="devMode ? 'warning' : 'success'"
            >
              {{ devMode ? "开发" : "生产" }}
            </el-tag>

            <el-button
              v-if="activeSection === 'account'"
              plain
              :icon="RefreshRight"
              @click="handleRefreshSession"
            >
              刷新
            </el-button>

            <el-button
              v-if="activeSection === 'connection'"
              plain
              :icon="RefreshRight"
              @click="handleRefreshConnections"
            >
              刷新
            </el-button>

            <el-button
              v-if="activeSection === 'environment'"
              plain
              :icon="RefreshRight"
              @click="handleRefreshEnvironment"
            >
              刷新
            </el-button>

            <el-button
              v-if="activeSection === 'messages'"
              plain
              :icon="RefreshRight"
              @click="handleRefreshMessages"
            >
              刷新
            </el-button>

            <el-button
              v-if="activeSection === 'messages' && messages.length"
              plain
              type="danger"
              @click="handleClearMessages"
            >
              清空
            </el-button>
          </div>
        </header>

        <section
          v-if="activeSection === 'account'"
          class="workbench-panel glass-panel"
        >
          <div class="workbench-panel-head">
            <div class="workbench-panel-title">
              <el-icon><UserFilled /></el-icon>
              <strong>账户</strong>
            </div>
            <el-tag
              size="small"
              :type="authenticated ? 'success' : 'info'"
              effect="light"
            >
              {{ authenticated ? "已登录" : "未登录" }}
            </el-tag>
          </div>

          <el-skeleton v-if="sessionLoading" :rows="4" animated />

          <template v-else>
            <div v-if="authenticated" class="info-grid">
              <article
                v-for="row in accountRows"
                :key="row.label"
                class="info-item surface-inset"
              >
                <span>{{ row.label }}</span>
                <strong :class="{ 'mono-text': row.mono }">{{ row.value }}</strong>
              </article>
            </div>

            <div v-else class="empty-state">
              <strong>未登录</strong>
              <span>未登录时不会建立任何连接。</span>
              <el-button type="primary" @click="handleOpenLoginTab">
                前往登录页
              </el-button>
            </div>
          </template>
        </section>

        <section
          v-else-if="activeSection === 'connection'"
          class="workbench-panel glass-panel"
        >
          <div class="workbench-panel-head">
            <div class="workbench-panel-title">
              <el-icon><Connection /></el-icon>
              <strong>连接</strong>
            </div>
          </div>

          <div v-if="!authenticated" class="empty-state">
            <strong>未登录</strong>
            <span>登录后才允许连接远程服务和本地客户端。</span>
            <el-button type="primary" @click="handleOpenLoginTab">
              前往登录页
            </el-button>
          </div>

          <el-skeleton v-else-if="statusLoading" :rows="6" animated />

          <div v-else class="connection-grid">
            <article class="surface-inset connection-card">
              <div class="connection-card-head">
                <div class="connection-card-title">
                  <span
                    class="status-dot"
                    :class="getStatusDotClass(serverState.status)"
                  />
                  <strong>远程服务</strong>
                </div>

                <div class="connection-card-actions">
                  <el-tag size="small" :type="serverStatusMeta.type" effect="light">
                    {{ serverStatusMeta.label }}
                  </el-tag>
                  <el-button plain @click="handleReconnectServer">重连</el-button>
                </div>
              </div>

              <div class="info-grid">
                <div class="info-item">
                  <span>端点</span>
                  <strong class="mono-text">
                    {{ getConnectionEndpointText(serverState, "远程服务端点") }}
                  </strong>
                </div>
                <div class="info-item">
                  <span>最近响应</span>
                  <strong>{{ getConnectionTimeText(serverState) }}</strong>
                </div>
              </div>

              <div
                v-if="getConnectionMetrics(serverState).length"
                class="connection-metrics"
              >
                <span
                  v-for="metric in getConnectionMetrics(serverState)"
                  :key="metric"
                  class="metric-chip"
                >
                  {{ metric }}
                </span>
              </div>

              <div v-if="serverState.lastError" class="connection-error">
                {{ serverState.lastError }}
              </div>
            </article>

            <article class="surface-inset connection-card">
              <div class="connection-card-head">
                <div class="connection-card-title">
                  <span
                    class="status-dot"
                    :class="getStatusDotClass(clientState.status)"
                  />
                  <strong>本地客户端</strong>
                </div>

                <div class="connection-card-actions">
                  <el-tag size="small" :type="clientStatusMeta.type" effect="light">
                    {{ clientStatusMeta.label }}
                  </el-tag>
                  <el-button plain @click="handleReconnectClient">重连</el-button>
                </div>
              </div>

              <div class="info-grid">
                <div class="info-item">
                  <span>端点</span>
                  <strong class="mono-text">
                    {{ getConnectionEndpointText(clientState, "localhost:1519") }}
                  </strong>
                </div>
                <div class="info-item">
                  <span>最近响应</span>
                  <strong>{{ getConnectionTimeText(clientState) }}</strong>
                </div>
              </div>

              <div
                v-if="getConnectionMetrics(clientState).length"
                class="connection-metrics"
              >
                <span
                  v-for="metric in getConnectionMetrics(clientState)"
                  :key="metric"
                  class="metric-chip"
                >
                  {{ metric }}
                </span>
              </div>

              <div v-if="clientState.lastError" class="connection-error">
                {{ clientState.lastError }}
              </div>
            </article>
          </div>
        </section>

        <section
          v-else-if="activeSection === 'environment'"
          class="workbench-panel glass-panel"
        >
          <div class="workbench-panel-head">
            <div class="workbench-panel-title">
              <el-icon><Setting /></el-icon>
              <strong>环境</strong>
            </div>
          </div>

          <div class="environment-stack">
            <article class="surface-inset mode-card">
              <div class="mode-card-copy">
                <span>运行模式</span>
                <strong>{{ devMode ? "开发模式" : "生产模式" }}</strong>
              </div>

              <el-switch
                :model-value="devMode"
                :loading="devModeLoading"
                inline-prompt
                active-text="开发"
                inactive-text="生产"
                @change="handleDevModeChange"
              />
            </article>

            <div class="info-grid">
              <article class="info-item surface-inset">
                <span>API</span>
                <strong class="mono-text">{{ apiBaseUrl }}</strong>
              </article>
              <article class="info-item surface-inset">
                <span>WebSocket</span>
                <strong class="mono-text">{{ wsBaseUrl }}</strong>
              </article>
            </div>
          </div>
        </section>

        <section v-else class="workbench-panel glass-panel">
          <div class="workbench-panel-head">
            <div class="workbench-panel-title">
              <el-icon><Bell /></el-icon>
              <strong>管理员消息</strong>
            </div>
            <el-tag size="small" effect="light">{{ messages.length }}</el-tag>
          </div>

          <el-skeleton v-if="messagesLoading" :rows="4" animated />

          <div v-else-if="messages.length === 0" class="empty-state">
            <strong>暂无消息</strong>
          </div>

          <div v-else class="messages-list">
            <article
              v-for="message in messages"
              :key="message.timestamp"
              class="message-item"
            >
              <div class="message-time">
                {{ formatAdminMessageTime(message) }}
              </div>
              <pre class="message-pre">{{ formatMessageData(message.data) }}</pre>
            </article>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.control-page {
  padding: 0;
}

.control-layout {
  align-items: start;
}

.control-summary {
  gap: 10px;
}

.control-summary-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.connection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.connection-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.connection-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.connection-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.connection-card-title strong {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.connection-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.connection-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.connection-error {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.14);
  color: #b42318;
  font-size: 11px;
  line-height: 1.6;
  word-break: break-word;
}

.environment-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mode-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
}

.mode-card-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-card-copy span {
  color: #7a8ca1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mode-card-copy strong {
  font-size: 13px;
  letter-spacing: -0.02em;
}

.messages-list {
  display: flex;
  max-height: 480px;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-right: 4px;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #f7f9fc;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.message-time {
  color: #6b7f93;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 900px) {
  .connection-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .control-page {
    padding: 0;
  }
}

@media (max-width: 640px) {
  .control-summary-footer,
  .connection-card-head,
  .mode-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .connection-card-actions {
    justify-content: flex-start;
  }
}
</style>
