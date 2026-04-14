<script setup lang="ts">
import { computed } from "vue";
import { Connection, RefreshRight } from "@element-plus/icons-vue";

import { formatStatusTimestamp, getStatusMeta } from "@/shared/format";
import type { WebsocketState } from "@/shared/types";

const props = defineProps<{
  title: string;
  state: WebsocketState;
  loading?: boolean;
  endpointHint?: string;
}>();

const emit = defineEmits<{
  reconnect: [];
}>();

const statusMeta = computed(() => getStatusMeta(props.state.status));
const dotClass = computed(() => {
  if (props.state.status === "connected") return "is-connected";
  if (props.state.status === "error") return "is-error";
  if (
    props.state.status === "connecting" ||
    props.state.status === "reconnecting"
  ) {
    return "is-warning";
  }
  return "";
});

const metrics = computed(() =>
  [
    props.state.lastPingAt
      ? `Ping ${formatStatusTimestamp(props.state.lastPingAt)}`
      : "",
    props.state.lastPongAt
      ? `Pong ${formatStatusTimestamp(props.state.lastPongAt)}`
      : "",
    props.state.lastLatencyMs !== null
      ? `延迟 ${props.state.lastLatencyMs}ms`
      : "",
  ].filter(Boolean),
);

const endpointText = computed(() => {
  if (props.endpointHint) return props.endpointHint;
  return props.state.endpoint ? "端点已配置" : "端点未配置";
});
</script>

<template>
  <el-card class="connection-card glass-panel" shadow="never">
    <template #header>
      <div class="card-toolbar">
        <div class="card-title">
          <el-icon><Connection /></el-icon>
          <strong>{{ title }}</strong>
        </div>
        <el-button
          link
          type="primary"
          :icon="RefreshRight"
          :disabled="
            loading ||
            state.status === 'connecting' ||
            state.status === 'reconnecting'
          "
          @click="emit('reconnect')"
        >
          重新连接
        </el-button>
      </div>
    </template>

    <div class="connection-stack">
      <div class="connection-status-row">
        <div class="connection-status-main">
          <span class="status-dot" :class="dotClass" />
          <div class="connection-status-copy">
            <span>连接状态</span>
            <strong>{{ statusMeta.label }}</strong>
          </div>
        </div>
      </div>

      <div class="connection-endpoint surface-inset">
        <span>当前端点</span>
        <strong class="mono-text">{{ state.endpoint || endpointText }}</strong>
      </div>

      <div v-if="metrics.length" class="connection-metrics">
        <span v-for="metric in metrics" :key="metric" class="metric-chip">
          {{ metric }}
        </span>
      </div>

      <el-alert
        v-if="state.lastError"
        class="connection-alert"
        type="error"
        :closable="false"
        show-icon
      >
        {{ state.lastError }}
      </el-alert>
    </div>
  </el-card>
</template>

<style scoped>
.connection-card {
  border-radius: 14px;
}

.card-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.connection-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.connection-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.connection-status-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.connection-status-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.connection-status-copy span {
  color: #7a8ca1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.connection-status-copy strong {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.connection-endpoint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.connection-endpoint span {
  color: #7a8ca1;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.connection-endpoint strong {
  font-size: 11px;
  line-height: 1.6;
  color: #23384f;
  word-break: break-all;
}

.connection-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.connection-alert {
  margin-top: 2px;
}
</style>
