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
  /** P2-N2 修复：重入深度计数，防止监听器内 emit 导致栈溢出 */
  private emitDepth = 0;
  /** P2-质疑29: 超出深度时入队延迟派发，不再丢弃 */
  private static MAX_EMIT_DEPTH = 16;
  private pendingQueue: { event: string; data: unknown }[] = [];

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

  /** 触发事件（单个回调异常不阻断后续回调）— P2-N2 修复：重入深度保护 */
  emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    if (this.emitDepth >= EventBusImpl.MAX_EMIT_DEPTH) {
      // P2-质疑29: 入队延迟派发，不再静默丢弃
      this.pendingQueue.push({ event, data });
      return;
    }
    this.emitDepth++;
    // P1-EVT1: snapshot callbacks to avoid Set iterator invalidation when a handler calls on/off/offAll during iteration.
    const snapshot = Array.from(callbacks);
    for (const cb of snapshot) {
      try {
        cb(data);
      } catch (e) {
        console.error(`[EventBus] ${event} handler error:`, e);
      }
    }
    this.emitDepth--;
    // 栈底时 flush 延迟队列
    if (this.emitDepth === 0 && this.pendingQueue.length > 0) {
      const queued = this.pendingQueue;
      this.pendingQueue = [];
      for (const item of queued) {
        this.emit(item.event, item.data);
      }
    }
  }

  /** 清除所有监听器（用于场景切换） */
  clear(): void {
    this.listeners.clear();
    this.pendingQueue = [];
  }
}

/** 全局单例 */
export const EventBus = new EventBusImpl();