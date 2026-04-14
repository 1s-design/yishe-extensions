import { ref } from "vue";

import { ApiUtils } from "@/shared/api-utils";

export function useDevMode() {
  const loading = ref(true);
  const devMode = ref(false);
  const apiBaseUrl = ref("-");
  const wsBaseUrl = ref("-");

  async function refresh() {
    loading.value = true;

    try {
      devMode.value = await ApiUtils.isDevMode();
      apiBaseUrl.value = ApiUtils.formatServiceUrlForDisplay(
        await ApiUtils.getApiBaseUrl(),
      );
      wsBaseUrl.value = ApiUtils.formatServiceUrlForDisplay(
        await ApiUtils.getWsBaseUrl(),
      );
    } finally {
      loading.value = false;
    }
  }

  async function toggle(nextValue: boolean) {
    await ApiUtils.setDevMode(nextValue);
    await refresh();
  }

  return {
    loading,
    devMode,
    apiBaseUrl,
    wsBaseUrl,
    refresh,
    toggle,
  };
}
