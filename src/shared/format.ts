import type { AdminMessage, ConnectionStatus } from "@/shared/types";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatStatusTimestamp(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return timeFormatter.format(date);
}

export function formatAdminMessageTime(message: AdminMessage) {
  const date = new Date(message.timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return dateTimeFormatter.format(date);
}

export function formatMessageData(data: unknown) {
  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object") {
    if ("message" in data && typeof data.message === "string") {
      return data.message;
    }

    if ("text" in data && typeof data.text === "string") {
      return data.text;
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  return String(data ?? "");
}

export function getStatusMeta(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return { label: "已连接", type: "success" as const };
    case "connecting":
      return { label: "连接中", type: "warning" as const };
    case "reconnecting":
      return { label: "重连中", type: "warning" as const };
    case "error":
      return { label: "连接失败", type: "danger" as const };
    case "disconnected":
    default:
      return { label: "已断开", type: "info" as const };
  }
}
