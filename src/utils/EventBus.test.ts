/**
 * EventBus 单元测试 - 全局单例发布/订阅总线
 *
 * 注意：EventBus 是模块单例，跨测试泄漏状态。
 * beforeEach/afterEach 必须调用 EventBus.clear()。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus on/off/emit', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('on + emit invokes the listener with the payload', () => {
    const spy = vi.fn();
    EventBus.on('e', spy);
    EventBus.emit('e', { a: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ a: 1 });
  });

  it('emit with no listeners is a no-op (does not throw)', () => {
    expect(() => EventBus.emit('nobody', {})).not.toThrow();
  });

  it('multiple listeners on the same event are all invoked', () => {
    const s1 = vi.fn(), s2 = vi.fn();
    EventBus.on('e', s1);
    EventBus.on('e', s2);
    EventBus.emit('e', null);
    expect(s1).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(1);
  });

  it('off removes a specific listener but leaves others', () => {
    const s1 = vi.fn(), s2 = vi.fn();
    EventBus.on('e', s1);
    EventBus.on('e', s2);
    EventBus.off('e', s1);
    EventBus.emit('e', null);
    expect(s1).not.toHaveBeenCalled();
    expect(s2).toHaveBeenCalledTimes(1);
  });

  it('off for a non-subscribed callback is a no-op', () => {
    expect(() => EventBus.off('e', vi.fn())).not.toThrow();
  });

  it('off for an event with no listeners is a no-op', () => {
    expect(() => EventBus.off('never', vi.fn())).not.toThrow();
  });

  it('offAll removes every listener for an event', () => {
    const s1 = vi.fn(), s2 = vi.fn();
    EventBus.on('e', s1);
    EventBus.on('e', s2);
    EventBus.offAll('e');
    EventBus.emit('e', null);
    expect(s1).not.toHaveBeenCalled();
    expect(s2).not.toHaveBeenCalled();
  });

  it('offAll for an absent event is a no-op', () => {
    expect(() => EventBus.offAll('absent')).not.toThrow();
  });

  it('the same callback registered twice is deduplicated (Set semantics)', () => {
    const fn = vi.fn();
    EventBus.on('e', fn);
    EventBus.on('e', fn);
    EventBus.emit('e', null);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-registering after offAll re-enables the callback', () => {
    const fn = vi.fn();
    EventBus.on('e', fn);
    EventBus.offAll('e');
    EventBus.on('e', fn);
    EventBus.emit('e', null);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('EventBus payload', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('payload is passed by reference (same object identity)', () => {
    const payload = { x: 1 };
    const spy = vi.fn();
    EventBus.on('e', spy);
    EventBus.emit('e', payload);
    expect(spy.mock.calls[0][0]).toBe(payload);
  });

  it('passes undefined explicitly when data is undefined', () => {
    const spy = vi.fn();
    EventBus.on('e', spy);
    EventBus.emit('e', undefined);
    expect(spy).toHaveBeenCalledWith(undefined);
  });
});

describe('EventBus error isolation', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('an exception in one listener does not block subsequent listeners', () => {
    const s2 = vi.fn();
    EventBus.on('e', () => { throw new Error('boom'); });
    EventBus.on('e', s2);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    EventBus.emit('e', null);
    expect(s2).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});

describe('EventBus reentrancy guard', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('a listener that emits during emit terminates without stack overflow', () => {
    let count = 0;
    const self = (data: unknown) => {
      if (count < 3) {
        count++;
        EventBus.emit('self', data);
      }
    };
    EventBus.on('self', self);
    expect(() => EventBus.emit('self', null)).not.toThrow();
    expect(count).toBe(3);
  });

  it('queued overflow events flush at depth 0 (deep chain reaches listener)', () => {
    // Build a chain of 20 distinct events; the 17th+ are queued then flushed.
    const reached: number[] = [];
    for (let i = 0; i < 20; i++) {
      const next = i + 1;
      EventBus.on(`chain_${i}`, () => {
        reached.push(i);
        if (next < 20) EventBus.emit(`chain_${next}`, null);
      });
    }
    expect(() => EventBus.emit('chain_0', null)).not.toThrow();
    // The 20th listener (index 19) must have been called via the queue flush.
    expect(reached).toContain(19);
  });
});

describe('EventBus snapshot semantics', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('a listener can call off on itself during emit without throwing', () => {
    const fn = vi.fn((() => EventBus.off('e', fn)) as () => void);
    const s2 = vi.fn();
    EventBus.on('e', fn as unknown as (data: unknown) => void);
    EventBus.on('e', s2);
    EventBus.emit('e', null);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(1);
    // second emit: fn removed, only s2 fires
    EventBus.emit('e', null);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(2);
  });

  it('a listener can call offAll on its own event; remaining snapshot still fires this round', () => {
    const s2 = vi.fn();
    EventBus.on('e', () => EventBus.offAll('e'));
    EventBus.on('e', s2);
    EventBus.emit('e', null);
    expect(s2).toHaveBeenCalledTimes(1);
  });

  it('a listener added during emit does NOT fire in the current emit (snapshot)', () => {
    const later = vi.fn();
    EventBus.on('e', () => EventBus.on('e', later));
    EventBus.emit('e', null);
    expect(later).not.toHaveBeenCalled();
    // subsequent emit fires the newly-added listener
    EventBus.emit('e', null);
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe('EventBus clear', () => {
  afterEach(() => EventBus.clear());

  it('removes all listeners across all events', () => {
    const s1 = vi.fn(), s2 = vi.fn();
    EventBus.on('a', s1);
    EventBus.on('b', s2);
    EventBus.clear();
    EventBus.emit('a', null);
    EventBus.emit('b', null);
    expect(s1).not.toHaveBeenCalled();
    expect(s2).not.toHaveBeenCalled();
  });
});
