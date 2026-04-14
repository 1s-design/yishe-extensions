import { onMounted, onUnmounted, reactive, ref } from "vue";

import {
  addRuntimeMessageListener,
  sendRuntimeMessage,
} from "@/shared/extension";
import type { RuntimeResponse, WebsocketState } from "@/shared/types";

function createDefaultState(endpoint = ""): WebsocketState {
  return {
    status: "disconnected",
    endpoint,
    connectedAt: null,
    lastPingAt: null,
    lastPongAt: null,
    lastLatencyMs: null,
    lastError: null,
    retryCount: 0,
  };
}

function applyState(target: WebsocketState, next?: Partial<WebsocketState>) {
  Object.assign(target, createDefaultState(target.endpoint), next || {});
}

export function useWebsocketStatus() {
  const loading = ref(true);
  const serverState = reactive<WebsocketState>(createDefaultState());
  const clientState = reactive<WebsocketState>(createDefaultState("localhost:1519"));

  async function refresh() {
    try {
      const [serverResponse, clientResponse] = await Promise.all([
        sendRuntimeMessage<RuntimeResponse<WebsocketState>>({
          action: "getWebsocketStatus",
        }),
        sendRuntimeMessage<RuntimeResponse<WebsocketState>>({
          action: "getClientWebsocketStatus",
        }),
      ]);

      if (serverResponse?.success && serverResponse.data) {
        applyState(serverState, serverResponse.data);
      }

      if (clientResponse?.success && clientResponse.data) {
        applyState(clientState, clientResponse.data);
      }
    } finally {
      loading.value = false;
    }
  }

  async function reconnectServer() {
    const response = await sendRuntimeMessage<RuntimeResponse>({
      action: "reconnectWebsocket",
    });

    if (!response?.success) {
      throw new Error(response?.error || "重新连接失败");
    }

    await refresh();
  }

  async function reconnectClient() {
    const response = await sendRuntimeMessage<RuntimeResponse>({
      action: "reconnectClientWebsocket",
    });

    if (!response?.success) {
      throw new Error(response?.error || "重新连接失败");
    }

    await refresh();
  }

  const removeMessageListener = addRuntimeMessageListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }

    const candidate = message as {
      type?: string;
      payload?: Partial<WebsocketState>;
    };

    if (candidate.type === "wsStatus:update") {
      applyState(serverState, candidate.payload);
    }

    if (candidate.type === "clientWsStatus:update") {
      applyState(clientState, candidate.payload);
    }
  });

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    removeMessageListener();
  });

  return {
    loading,
    serverState,
    clientState,
    refresh,
    reconnectServer,
    reconnectClient,
  };
}
