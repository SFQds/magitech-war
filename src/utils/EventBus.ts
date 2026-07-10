/**
 * 事件总线 — 发布/订阅模式，解耦模块间通信
 *
 * 使用方式：
 *   EventBus.on(GameEvent.UNIT_KILLED, (data) => { ... });
 *   EventBus.emit(GameEvent.UNIT_KILLED, { unitId: 'xxx', ... });
 */

type EventCallback = (data: unknown) => void;

class EventBusImpl {
  private listeners = new Map<string, Set<EventCallback>>();

  /** 订阅事件 */
  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /** 取消订阅 */
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /** 取消某个事件的所有监听器 */
  offAll(event: string): void {
    this.listeners.delete(event);
  }

  /** 触发事件 */
  emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      cb(data);
    }
  }

  /** 清除所有监听器（用于场景切换） */
  clear(): void {
    this.listeners.clear();
  }
}

/** 全局单例 */
export const EventBus = new EventBusImpl();