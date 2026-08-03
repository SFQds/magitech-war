/**
 * NetServer — 主机端网络连接器 (浏览器原生 WebSocket)
 *
 * 架构: Vite dev server 内置 ws 中继服务 (vite.config.ts setupLanServer),
 * 主机和客户端都作为浏览器 WebSocket 连入 ws://<hostIP>:3000/lan,
 * 用 hello 消息声明 role。中继在两者间转发消息。
 *
 * 主机职责:
 *  - 连入中继, 声明 role='host'
 *  - 收客户端命令 (cmd) → 喂给 CommandExecutor
 *  - 收客户端大厅更新 (lobby_update)
 *  - 广播快照 (snapshot) / 大厅状态 (lobby_state) / 开局 (start) / 结束 (gameover) 给客户端
 */

import type { NetMessage, PlayerLobbyInfo, GameInitData } from './NetMessages';
import { encodeMsg, decodeMsg } from './NetMessages';

export interface NetHostCallbacks {
  onClientJoin?: (name: string) => void;
  onClientLeave?: () => void;
  onLobbyUpdate?: (info: PlayerLobbyInfo) => void;
  onCommand?: (playerIndex: 0 | 1, frame: number, command: unknown) => void;
  onPeerDisconnect?: () => void;
}

export class NetHost {
  private ws: WebSocket | null = null;
  private url: string;
  private name: string;
  private callbacks: NetHostCallbacks = {};

  constructor(name: string, hostIP = 'localhost', port = 3000) {
    this.name = name;
    this.url = `ws://${hostIP}:${port}/lan`;
  }

  /** 连接中继 (主机本地连自己) */
  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.send({ t: 'hello', role: 'host', name: this.name });
      this.callbacks.onClientJoin; // 占位, 实际连入由 client_joined 通知
    };

    this.ws.onmessage = (ev) => {
      const msg = decodeMsg(String(ev.data));
      if (!msg) return;
      this.handleRelayMessage(msg);
    };

    this.ws.onclose = () => {
      this.callbacks.onPeerDisconnect?.();
    };

    this.ws.onerror = () => {};
  }

  private handleRelayMessage(msg: NetMessage): void {
    switch (msg.t) {
      case 'client_joined':
        // 中继通知: 客户端到了
        this.callbacks.onClientJoin?.((msg as any).name ?? 'client');
        break;
      case 'lobby_update':
        this.callbacks.onLobbyUpdate?.(msg.info);
        break;
      case 'cmd':
        this.callbacks.onCommand?.(msg.playerIndex, msg.frame, msg.command);
        break;
      case 'peer_disconnect':
        this.callbacks.onPeerDisconnect?.();
        break;
      default:
        break;
    }
  }

  /** 发送消息给客户端 (经中继转发) */
  send(msg: NetMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg(msg));
      return true;
    }
    return false;
  }

  get isConnected(): boolean {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  on(cbs: NetHostCallbacks): void {
    Object.assign(this.callbacks, cbs);
  }

  disconnect(): void {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
