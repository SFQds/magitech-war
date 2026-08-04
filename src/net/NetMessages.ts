/**
 * 联机协议消息定义 — 局域网 1v1 状态同步
 *
 * 消息流:
 *  大厅: client →[hello]→ host →[lobby_state]→ client (双向同步选阵营/行会)
 *  开局: host →[start]→ client (带 GameInitData, 双方各自 scene.start('GameScene'))
 *  对战: client →[cmd]→ host (客户端发命令); host →[snapshot]→ client (主机广播快照)
 *  结束: host →[gameover]→ client
 *  断开: 任一方 →[disconnect]→ 对方
 *
 * 所有消息为纯数据 (JSON 可序列化), 不含 Phaser/函数引用。
 */

import type { AnyCommand } from '../types/commands';
import type { SaveData } from '../save/SaveData';

/** 玩家在大厅的信息 */
export interface PlayerLobbyInfo {
  name: string;
  faction: string;
  guilds: string[];
  ready: boolean;
}

/** 开局初始化数据 (主机发给客户端, 双方据此启动 GameScene) */
export interface GameInitData {
  /** 地图 id */
  map: string;
  /** 主机局域网 IP (客户端据此连中继; 主机本地用 localhost) */
  hostIP: string;
  /** 主机玩家(owner 0)阵营 */
  hostFaction: string;
  /** 主机玩家行会 */
  hostGuilds: string[];
  /** 客户端玩家(owner 1)阵营 */
  clientFaction: string;
  /** 客户端玩家行会 */
  clientGuilds: string[];
}

/** 联机模式 */
export type NetMode = 'single' | 'host' | 'client';

/** 协议消息联合类型 */
export type NetMessage =
  // === 大厅阶段 ===
  | { t: 'hello'; role: 'host' | 'client'; name: string }
  | { t: 'client_joined'; name: string }            // 中继→主机: 客户端连入
  | { t: 'lobby_state'; host: PlayerLobbyInfo; client: PlayerLobbyInfo | null }
  | { t: 'lobby_update'; sender: 'host' | 'client'; info: PlayerLobbyInfo }
  | { t: 'start'; init: GameInitData }
  // === 对战阶段 ===
  | { t: 'cmd'; playerIndex: 0 | 1; frame: number; command: AnyCommand }
  | { t: 'snapshot'; frame: number; data: SaveData }
  | { t: 'gameover'; winner: number }
  // === 通用 ===
  | { t: 'disconnect'; reason?: string }
  | { t: 'peer_disconnect' };                       // 中继→对方: 对端断开

/** 将消息序列化为 JSON 字符串 (WebSocket 传输) */
export function encodeMsg(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/** 从 JSON 字符串解析消息 */
export function decodeMsg(raw: string): NetMessage | null {
  try {
    const parsed = JSON.parse(raw) as NetMessage;
    if (parsed && typeof parsed.t === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}
