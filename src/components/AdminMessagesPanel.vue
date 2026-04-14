<script setup lang="ts">
import { Bell, Delete } from "@element-plus/icons-vue";

import { formatAdminMessageTime, formatMessageData } from "@/shared/format";
import type { AdminMessage } from "@/shared/types";

defineProps<{
  loading?: boolean;
  messages: AdminMessage[];
}>();

const emit = defineEmits<{
  clear: [];
}>();
</script>

<template>
  <el-card class="messages-panel glass-panel" shadow="never">
    <template #header>
      <div class="messages-toolbar">
        <div class="card-title">
          <el-icon><Bell /></el-icon>
          <strong>管理员消息</strong>
        </div>
        <div class="messages-actions">
          <el-tag size="small" effect="light">{{ messages.length }}</el-tag>
          <el-button link type="primary" :icon="Delete" @click="emit('clear')">
            清空全部
          </el-button>
        </div>
      </div>
    </template>

    <el-skeleton v-if="loading" :rows="3" animated />

    <el-empty
      v-else-if="messages.length === 0"
      description="暂未收到管理员消息"
    />

    <div v-else class="messages-list">
      <article v-for="message in messages" :key="message.timestamp" class="message-item">
        <div class="message-time">{{ formatAdminMessageTime(message) }}</div>
        <pre class="message-pre">{{ formatMessageData(message.data) }}</pre>
      </article>
    </div>
  </el-card>
</template>

<style scoped>
.messages-panel {
  border-radius: 14px;
}

.messages-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.messages-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
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
</style>
