import { onMounted, onUnmounted, ref } from "vue";

import {
  addRuntimeMessageListener,
  addStorageListener,
  storageGet,
  storageSet,
} from "@/shared/extension";
import type { AdminMessage } from "@/shared/types";

export function useAdminMessages() {
  const loading = ref(true);
  const messages = ref<AdminMessage[]>([]);

  async function refresh() {
    const result = await storageGet<Record<string, unknown>>(["adminMessages"]);
    messages.value = Array.isArray(result.adminMessages)
      ? (result.adminMessages as AdminMessage[]).slice(0, 10)
      : [];
    loading.value = false;
  }

  async function clear() {
    await storageSet({ adminMessages: [] });
    messages.value = [];
  }

  const removeRuntimeListener = addRuntimeMessageListener((message) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "adminMessage:received"
    ) {
      void refresh();
    }
  });

  const removeStorageListener = addStorageListener((changes, areaName) => {
    if (areaName === "local" && changes.adminMessages) {
      const nextValue = changes.adminMessages.newValue;
      messages.value = Array.isArray(nextValue)
        ? (nextValue as AdminMessage[]).slice(0, 10)
        : [];
      loading.value = false;
    }
  });

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    removeRuntimeListener();
    removeStorageListener();
  });

  return {
    loading,
    messages,
    refresh,
    clear,
  };
}
