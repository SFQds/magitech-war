/**
 * 存储适配器 — localStorage 的薄封装
 *
 * 桌面浏览器环境直接使用 window.localStorage；
 * Node 测试环境（vitest environment='node'）下无 localStorage，通过 setStorageBackend
 * 注入内存实现，便于单元测试。
 */

/** 存储后端接口（与 localStorage 兼容的最小子集） */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 内存存储后端（测试默认值） */
class MemoryStorage implements StorageBackend {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  /** 测试用：清空全部 */
  clear(): void {
    this.store.clear();
  }
}

let backend: StorageBackend | null = null;

/** 获取当前后端（惰性初始化：优先 window.localStorage，否则用内存） */
function getBackend(): StorageBackend {
  if (backend) return backend;
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as { localStorage?: StorageBackend };
    if (g.localStorage) {
      backend = g.localStorage;
      return backend;
    }
  }
  backend = new MemoryStorage();
  return backend;
}

/** 显式注入后端（测试用） */
export function setStorageBackend(b: StorageBackend | null): void {
  backend = b;
}

export { MemoryStorage };
export { getBackend as _getBackend };
