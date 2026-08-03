/**
 * NetClient — 客户端 WebSocket 连接 (浏览器原生 WebSocket)
 *
 * 职责:
 *  - 连接主机 ws://<hostIP>:3000/lan
 *  - 发送协议消息 (hello / lobby_update / cmd)
 *  - 接收主机消息 (lobby_state / start / snapshot / gameover) 并回调
 *  - 基础自动重连
 *
 * 浏览器端不依赖 ws 库, 用原生 WebSocket。
 */

import type { NetMessage, PlayerLobbyInfo } from './NetMessages';
import { encodeMsg, decodeMsg } from './NetMessages';

export interface NetClientCallbacks {
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
  onError?: (err: unknown) => void;
  onLobbyState?: (host: PlayerLobbyInfo, client: PlayerLobbyInfo | null) => void;
  onStart?: (init: import('./NetMessages').GameInitData) => void;
  onSnapshot?: (frame: number, data: import('../save/SaveData').SaveData) => void;
  onGameOver?: (winner: number) => void;
  onDisconnect?: (reason?: string) => void;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: NetClientCallbacks = {};
  private shouldReconnect = false;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000;

  constructor(hostIP: string, port = 3000) {
    this.url = `ws://${hostIP}:${port}/lan`;
  }

  /** 建立连接 */
  connect(name: string): void {
    this.shouldReconnect = true;
    this.openSocket(name);
  }

  private openSocket(name: string): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // 重置退避
      this.send({ t: 'hello', role: 'client', name });
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (ev) => {
      const msg = decodeMsg(String(ev.data));
      if (!msg) return;
      this.handleServerMessage(msg);
    };

    this.ws.onclose = (ev) => {
      this.callbacks.onClose?.(ev.reason);
      if (this.shouldReconnect) {
        this.scheduleReconnect(name);
      }
    };

    this.ws.onerror = (err) => {
      this.callbacks.onError?.(err);
    };
  }

  private handleServerMessage(msg: NetMessage): void {
    switch (msg.t) {
      case 'lobby_state':
        this.callbacks.onLobbyState?.(msg.host, msg.client);
        break;
      case 'start':
        this.callbacks.onStart?.(msg.init);
        break;
      case 'snapshot':
        this.callbacks.onSnapshot?.(msg.frame, msg.data);
        break;
      case 'gameover':
        this.callbacks.onGameOver?.(msg.winner);
        break;
      case 'disconnect':
        this.shouldReconnect = false;
        this.callbacks.onDisconnect?.(msg.reason);
        break;
      case 'peer_disconnect':
        this.shouldReconnect = false;
        this.callbacks.onDisconnect?.('主机已断开');
        break;
      default:
        break;
    }
  }

  private scheduleReconnect(name: string): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this.openSocket(name);
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 5000); // 退避到 5s 上限
  }

  /** 发送消息 */
  send(msg: NetMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg(msg));
      return true;
    }
    return false;
  }

  /** 连接是否就绪 */
  get isConnected(): boolean {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  /** 注册回调 */
  on(cbs: NetClientCallbacks): void {
    Object.assign(this.callbacks, cbs);
  }

  /** 主动断开 (不再重连) */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
