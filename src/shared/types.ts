export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface WebsocketState {
  status: ConnectionStatus;
  endpoint: string;
  connectedAt?: string | null;
  lastPingAt: string | null;
  lastPongAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  retryCount: number;
  lastPayload?: unknown;
  clientInfo?: unknown;
}

export interface UserInfo {
  id?: string | number;
  userId?: string | number;
  name?: string;
  nickname?: string;
  isAdmin?: boolean | number | string;
  [key: string]: unknown;
}

export interface AdminMessage {
  timestamp: string;
  data: unknown;
}

export interface RuntimeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
