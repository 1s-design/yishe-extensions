type HandlerOptions = {
  logFn?: (...args: unknown[]) => void;
  socket?: unknown;
};

type MessageHandler = {
  handle: (data: any, options: HandlerOptions) => Promise<void> | void;
};

const handlers = new Map<string, MessageHandler>();

export async function handleMessage(data: any, options: HandlerOptions = {}) {
  const { logFn = console.log, socket = null } = options;

  if (!data || typeof data !== "object" || !data.command) {
    return {
      handled: false,
      reason: "不是命令消息",
    };
  }

  const command = data.command as string;
  const handler = handlers.get(command);
  if (!handler) {
    logFn(`[MessageHandler] 未找到命令处理器: ${command}`);
    return {
      handled: false,
      reason: `未找到命令处理器: ${command}`,
    };
  }

  try {
    logFn(`[MessageHandler] 开始处理命令: ${command}`);
    await handler.handle(data, { logFn, socket });
    logFn(`[MessageHandler] 命令处理完成: ${command}`);
    return {
      handled: true,
      command,
    };
  } catch (error) {
    logFn(`[MessageHandler] 命令处理失败: ${command}`, error);
    return {
      handled: true,
      command,
      error: error instanceof Error ? error.message : "处理失败",
    };
  }
}

export function registerHandler(command: string, handler: MessageHandler) {
  if (!handler || typeof handler.handle !== "function") {
    throw new Error("处理器必须包含 handle 方法");
  }
  handlers.set(command, handler);
  console.log(`[MessageHandler] 已注册处理器: ${command}`);
}

export function getRegisteredCommands() {
  return Array.from(handlers.keys());
}
