/**
 * 最小二叉堆 — A* open list 优化
 *
 * 实现 O(log N) push/pop，替代原来的 O(N) 线性扫描。
 */
export class BinaryHeap<T> {
  private items: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number { return this.items.length; }
  get isEmpty(): boolean { return this.items.length === 0; }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** 若 item 的优先级提高（f 值减小），上浮 */
  decreaseKey(item: T): void {
    const idx = this.items.indexOf(item);
    if (idx !== -1) this.siftUp(idx);
  }

  includes(item: T): boolean {
    return this.items.includes(item);
  }

  private siftUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.compare(this.items[idx], this.items[parent]) >= 0) break;
      [this.items[idx], this.items[parent]] = [this.items[parent], this.items[idx]];
      idx = parent;
    }
  }

  private siftDown(idx: number): void {
    const n = this.items.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = (idx << 1) + 2;
      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      [this.items[idx], this.items[smallest]] = [this.items[smallest], this.items[idx]];
      idx = smallest;
    }
  }
}