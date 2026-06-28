// frontend/src/lib/stores/storage.ts
// 客户端持久化封装。SSR 期返回 fallback，避免 window 未定义崩溃。
// TODO(backend): 这些数据未来由后端持久化；此封装仅用于 Project/Session 的本地存储过渡。
export function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setItem(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满或隐私模式：静默降级 */
  }
}

/** 生成客户端实体 id。仅限客户端调用——服务端语境显式抛错而非隐式崩。 */
export function newId(): string {
  if (typeof window === "undefined" || typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new Error("newId() 仅限客户端调用（Project/Session 创建发生在浏览器）");
  }
  return crypto.randomUUID();
}
