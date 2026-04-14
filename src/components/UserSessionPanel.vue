<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, SwitchButton, UserFilled } from "@element-plus/icons-vue";

import type { UserInfo } from "@/shared/types";

const props = defineProps<{
  loading?: boolean;
  authenticated: boolean;
  userInfo: UserInfo | null;
  displayName: string;
  displayRole: string;
  avatarText: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  login: [];
  logout: [];
}>();

const cardClass = computed(() => ({
  compact: Boolean(props.compact),
}));
</script>

<template>
  <el-card class="user-panel glass-panel" :class="cardClass" shadow="never">
    <template #header>
      <div class="panel-toolbar">
        <div class="card-title">
          <el-icon><UserFilled /></el-icon>
          <strong>账户状态</strong>
        </div>
        <el-tag
          size="small"
          :type="authenticated ? 'success' : 'info'"
          effect="light"
        >
          {{ authenticated ? "已登录" : "未登录" }}
        </el-tag>
      </div>
    </template>

    <el-skeleton v-if="loading" :rows="2" animated />

    <template v-else>
      <div v-if="authenticated" class="user-state is-authenticated">
        <div class="user-identity">
          <el-avatar class="user-avatar" :size="34">
            {{ avatarText }}
          </el-avatar>
          <div class="user-meta">
            <strong>{{ displayName }}</strong>
            <span>{{ displayRole }}</span>
          </div>
        </div>
        <el-button
          link
          type="danger"
          :icon="SwitchButton"
          @click="emit('logout')"
        >
          退出
        </el-button>
      </div>

      <div v-else class="user-state is-guest">
        <div class="user-meta">
          <strong>尚未登录</strong>
          <span>登录后可使用完整能力与管理面板。</span>
        </div>
        <el-button type="primary" plain :icon="ArrowRight" @click="emit('login')">
          前往登录
        </el-button>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.user-panel {
  border-radius: 14px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.user-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.user-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.user-meta {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.user-meta strong {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.user-meta span {
  color: #6a7e92;
  font-size: 11px;
  line-height: 1.55;
}

.user-avatar {
  background: linear-gradient(135deg, #2166b5, #1f9d66);
  color: #fff;
  font-weight: 700;
}

.compact .user-state {
  align-items: flex-start;
}

.compact .user-identity {
  align-items: flex-start;
}

@media (max-width: 560px) {
  .user-state {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-identity {
    width: 100%;
  }
}
</style>
