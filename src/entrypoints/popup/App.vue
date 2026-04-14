<script setup lang="ts">
import { computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Connection, Lock, SwitchButton } from "@element-plus/icons-vue";

import { useUserSession } from "@/composables/useUserSession";
import { useWebsocketStatus } from "@/composables/useWebsocketStatus";
import { closeCurrentWindow, openExtensionTab } from "@/shared/extension";
import { getStatusMeta } from "@/shared/format";

const {
  loading: sessionLoading,
  authenticated,
  refresh: refreshSession,
  logout,
} = useUserSession();

const {
  serverState,
  clientState,
  loading: statusLoading,
  refresh: refreshConnections,
} = useWebsocketStatus();

const sessionStateText = computed(() =>
  authenticated.value ? "已登录" : "未登录",
);

const serverStatusMeta = computed(() => getStatusMeta(serverState.status));
const clientStatusMeta = computed(() => getStatusMeta(clientState.status));

onMounted(() => {
  void refreshSession({ verifyRemote: true });
  void refreshConnections();
});

async function handleOpenLoginTab() {
  try {
    await openExtensionTab("/login.html");
    closeCurrentWindow();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "打开登录页失败");
  }
}

async function handleOpenControlTab() {
  if (!authenticated.value) {
    await handleOpenLoginTab();
    return;
  }

  try {
    await openExtensionTab("/control.html");
    closeCurrentWindow();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "打开整页失败");
  }
}

async function handleLogout() {
  await logout();
}
</script>

<template>
  <div class="page-shell popup-page">
    <div class="popup-card glass-panel">
      <div class="popup-head">
        <div class="popup-brand">
          <span class="brand-mark">
            <img src="/assets/logo.png" alt="YiShe" />
          </span>
          <strong>YiShe</strong>
        </div>

        <div class="popup-head-meta">
          <el-tag
            size="small"
            :type="authenticated ? 'success' : 'info'"
            effect="light"
          >
            {{ sessionStateText }}
          </el-tag>
        </div>
      </div>

      <template v-if="sessionLoading">
        <div class="popup-content">
          <el-skeleton :rows="4" animated />
        </div>
      </template>

      <template v-else-if="!authenticated">
        <div class="popup-body">
          <div class="popup-content">
            <div class="popup-state surface-inset">
              <span>登录状态</span>
              <strong>未登录</strong>
            </div>

            <div class="popup-actions">
              <el-button
                type="primary"
                class="popup-action"
                @click="handleOpenLoginTab"
              >
                前往登录页
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="popup-body">
          <div v-if="statusLoading" class="popup-status-list">
            <el-skeleton :rows="3" animated />
          </div>

          <div v-else class="popup-content">
            <div class="popup-status-list">
              <article class="status-row">
                <div class="status-row-main">
                  <el-icon><Connection /></el-icon>
                  <span>远程服务</span>
                </div>
                <el-tag size="small" :type="serverStatusMeta.type" effect="light">
                  {{ serverStatusMeta.label }}
                </el-tag>
              </article>

              <div v-if="serverState.lastError" class="status-error">
                {{ serverState.lastError }}
              </div>

              <article class="status-row">
                <div class="status-row-main">
                  <el-icon><Lock /></el-icon>
                  <span>本地客户端</span>
                </div>
                <el-tag size="small" :type="clientStatusMeta.type" effect="light">
                  {{ clientStatusMeta.label }}
                </el-tag>
              </article>

              <div v-if="clientState.lastError" class="status-error">
                {{ clientState.lastError }}
              </div>
            </div>

            <div class="popup-actions">
              <el-button
                type="primary"
                class="popup-action"
                @click="handleOpenControlTab"
              >
                进入整页
              </el-button>
              <el-button
                plain
                type="danger"
                class="popup-action"
                :icon="SwitchButton"
                @click="handleLogout"
              >
                退出
              </el-button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.popup-page {
  width: 320px;
  min-height: 100vh;
  padding: 6px;
}

.popup-card {
  display: flex;
  min-height: 238px;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
}

.popup-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.popup-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-brand .brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.popup-brand strong {
  font-size: 12px;
  letter-spacing: -0.01em;
}

.popup-head-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 34px;
}

.popup-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.popup-content {
  display: flex;
  width: min(100%, 224px);
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.popup-state {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
}

.popup-state span {
  color: #7a8ca1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.popup-state strong {
  font-size: 14px;
  letter-spacing: -0.02em;
}

.popup-actions {
  display: flex;
  width: 100%;
  flex-direction: row;
  gap: 8px;
}

.popup-action {
  flex: 1;
  min-width: 0;
}

.popup-status-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  background: #f7f9fc;
}

.status-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.status-error {
  padding: 0 2px;
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.6;
  word-break: break-word;
  text-align: center;
}
</style>
