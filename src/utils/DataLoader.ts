/**
 * 数据加载器 — 加载 data/*.json 并缓存
 *
 * 使用方式：
 *   const units = await DataLoader.load('data/units.json');
 */

class DataLoaderImpl {
  private cache = new Map<string, unknown>();

  /** 加载 JSON 文件（相对 public 根路径） */
  async load<T>(path: string): Promise<T> {
    if (this.cache.has(path)) {
      return this.cache.get(path) as T;
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }

    const data: T = await response.json();
    this.cache.set(path, data);
    return data;
  }

  /** 清除缓存（用于测试或热重载） */
  clearCache(): void {
    this.cache.clear();
  }

  /** 预加载多个文件 */
  async preload(paths: string[]): Promise<void> {
    await Promise.all(paths.map((p) => this.load(p)));
  }
}

/** 全局单例 */
export const DataLoader = new DataLoaderImpl();