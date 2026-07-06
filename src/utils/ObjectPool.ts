/**
 * 通用对象池 — 减少 GC 压力，复用频繁创建/销毁的对象
 *
 * 适用于：投射物、粒子、临时路径点等生命周期短的对象
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (item: T) => void;

  /**
   * @param factory - 创建新对象的工厂函数
   * @param reset - 回收对象时的重置函数
   */
  constructor(factory: () => T, reset: (item: T) => void) {
    this.factory = factory;
    this.reset = reset;
  }

  /** 获取一个可用对象（优先从池中取） */
  get(): T {
    return this.pool.length > 0 ? this.pool.pop()! : this.factory();
  }

  /** 回收对象到池中 */
  release(item: T): void {
    this.reset(item);
    this.pool.push(item);
  }

  /** 预分配对象 */
  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }

  /** 池中可用对象数 */
  get available(): number {
    return this.pool.length;
  }

  /** 清空池 */
  clear(): void {
    this.pool.length = 0;
  }
}