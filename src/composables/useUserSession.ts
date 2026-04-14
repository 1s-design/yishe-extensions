import { computed, ref } from "vue";

import { ApiUtils } from "@/shared/api-utils";
import { navigateToExtensionPage } from "@/shared/extension";
import type { UserInfo } from "@/shared/types";

interface RefreshOptions {
  verifyRemote?: boolean;
}

export function useUserSession() {
  const loading = ref(true);
  const authenticated = ref(false);
  const userInfo = ref<UserInfo | null>(null);

  const displayName = computed(() => userInfo.value?.name || "未登录用户");
  const displayRole = computed(() => userInfo.value?.nickname || "未登录");
  const avatarText = computed(() =>
    (userInfo.value?.name || "Y").trim().charAt(0).toUpperCase(),
  );

  async function refresh(options: RefreshOptions = {}) {
    loading.value = true;

    try {
      const token = await ApiUtils.getToken();
      if (!token) {
        authenticated.value = false;
        userInfo.value = null;
        return false;
      }

      const storedUser = await ApiUtils.getUserInfo();
      if (!options.verifyRemote && storedUser) {
        authenticated.value = true;
        userInfo.value = storedUser;
        return true;
      }

      const remoteUser = await ApiUtils.fetchUserInfo();
      authenticated.value = true;
      userInfo.value = remoteUser;
      return true;
    } catch {
      authenticated.value = false;
      userInfo.value = null;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function logout(redirectPath?: string) {
    await ApiUtils.logout();
    authenticated.value = false;
    userInfo.value = null;

    if (redirectPath) {
      navigateToExtensionPage(redirectPath);
    }
  }

  return {
    loading,
    authenticated,
    userInfo,
    displayName,
    displayRole,
    avatarText,
    refresh,
    logout,
  };
}
