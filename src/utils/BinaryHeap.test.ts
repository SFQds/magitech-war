/**
 * BinaryHeap 单元测试 - A* open list 用的最小二叉堆
 */
import { describe, it, expect } from 'vitest';
import { BinaryHeap } from './BinaryHeap';

describe('BinaryHeap basics', () => {
  it('a new heap is empty with size 0', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    expect(h.isEmpty).toBe(true);
    expect(h.size).toBe(0);
  });

  it('push then pop returns the single item', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(42);
    expect(h.pop()).toBe(42);
    expect(h.isEmpty).toBe(true);
  });

  it('pop on an empty heap returns undefined', () => {
    expect(new BinaryHeap<number>((a, b) => a - b).pop()).toBeUndefined();
  });

  it('size reflects pushes and decreases on pop', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(1); h.push(2); h.push(3);
    expect(h.size).toBe(3);
    h.pop();
    expect(h.size).toBe(2);
  });
});

describe('BinaryHeap ordering', () => {
  it('pop returns items in ascending order for a min-heap comparator', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [5, 3, 8, 1, 9, 2].forEach(v => h.push(v));
    const popped: number[] = [];
    while (!h.isEmpty) popped.push(h.pop()!);
    expect(popped).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it('preserves heap order regardless of insertion order (descending)', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [9, 8, 7, 6, 5].forEach(v => h.push(v));
    const popped: number[] = [];
    while (!h.isEmpty) popped.push(h.pop()!);
    expect(popped).toEqual([5, 6, 7, 8, 9]);
  });

  it('preserves heap order for ascending input', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [1, 2, 3, 4, 5].forEach(v => h.push(v));
    const popped: number[] = [];
    while (!h.isEmpty) popped.push(h.pop()!);
    expect(popped).toEqual([1, 2, 3, 4, 5]);
  });

  it('a max-heap comparator (b-a) returns items in descending order', () => {
    const h = new BinaryHeap<number>((a, b) => b - a);
    [1, 5, 3].forEach(v => h.push(v));
    expect([h.pop(), h.pop(), h.pop()]).toEqual([5, 3, 1]);
  });

  it('handles duplicate priorities (all equal values pop together)', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [2, 2, 2, 1, 1].forEach(v => h.push(v));
    const popped: number[] = [];
    while (!h.isEmpty) popped.push(h.pop()!);
    expect(popped).toEqual([1, 1, 2, 2, 2]);
  });

  it('popping all items yields fully sorted sequence for shuffled input', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    [7, 2, 9, 4, 1, 6, 3, 8, 5].forEach(v => h.push(v));
    const popped: number[] = [];
    while (!h.isEmpty) popped.push(h.pop()!);
    expect(popped).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('large-N correctness: 1000 reverse-sorted items pop sorted', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    for (let i = 999; i >= 0; i--) h.push(i);
    const first = h.pop();
    expect(first).toBe(0);
    let prev = 0;
    let count = 1;
    while (!h.isEmpty) {
      const v = h.pop()!;
      expect(v).toBeGreaterThan(prev);
      prev = v;
      count++;
    }
    expect(count).toBe(1000);
  });
});

describe('BinaryHeap mixed operations', () => {
  it('heap property is maintained after interleaved push/pop', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(5); h.push(3);
    expect(h.pop()).toBe(3);
    h.push(1); h.push(8);
    expect(h.pop()).toBe(1);
    h.push(2);
    expect(h.pop()).toBe(2);
    expect(h.pop()).toBe(5);
    expect(h.pop()).toBe(8);
    expect(h.isEmpty).toBe(true);
  });

  it('push-pop-same-item leaves heap empty', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(1); h.pop();
    h.push(2); h.pop();
    expect(h.isEmpty).toBe(true);
    expect(h.pop()).toBeUndefined();
  });

  it('does not share state across instances', () => {
    const h1 = new BinaryHeap<number>((a, b) => a - b);
    const h2 = new BinaryHeap<number>((a, b) => a - b);
    h1.push(1);
    expect(h2.isEmpty).toBe(true);
    expect(h1.size).toBe(1);
  });
});

describe('BinaryHeap includes', () => {
  it('returns true for present, false for absent', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(10); h.push(20);
    expect(h.includes(10)).toBe(true);
    expect(h.includes(99)).toBe(false);
  });

  it('returns false after item popped', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(10);
    h.pop();
    expect(h.includes(10)).toBe(false);
  });
});

describe('BinaryHeap decreaseKey', () => {
  type N = { f: number };

  it('re-positions an existing item when its priority improves (by reference)', () => {
    const h = new BinaryHeap<N>((a, b) => a.f - b.f);
    const n5: N = { f: 5 };
    const n3: N = { f: 3 };
    const n8: N = { f: 8 };
    h.push(n5); h.push(n3); h.push(n8);
    n8.f = 1; // simulate f-value decrease in A*
    h.decreaseKey(n8);
    expect(h.pop()).toBe(n8); // now smallest
    expect(h.pop()).toBe(n3);
    expect(h.pop()).toBe(n5);
  });

  it('is a no-op for an item not in the heap', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(5);
    h.decreaseKey(99);
    expect(h.size).toBe(1);
    expect(h.pop()).toBe(5);
  });

  it('on an item already at root is a no-op', () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    h.push(1); h.push(5);
    h.decreaseKey(1);
    expect(h.pop()).toBe(1);
  });

  it('does not relocate based on value-equal but distinct object (reference equality)', () => {
    const h = new BinaryHeap<N>((a, b) => a.f - b.f);
    const n5 = { f: 5 };
    h.push(n5);
    // a distinct object with same value is NOT the same heap entry
    h.decreaseKey({ f: 5 });
    expect(h.pop()).toBe(n5); // original unchanged
  });
});
