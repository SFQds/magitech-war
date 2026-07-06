/**
 * 事件系统类型定义
 * EventBus 解耦模块间通信
 */

// ============ 事件枚举 ============

/** 所有游戏事件类型 */
export enum GameEvent {
  // ---- 单位事件 ----
  /** 单位被创建 { unitId, playerIndex } */
  UNIT_CREATED = 'unit:created',
  /** 单位被击杀 { unitId, killerId, playerIndex } */
  UNIT_KILLED = 'unit:killed',
  /** 单位到达目的地 { unitId, position } */
  UNIT_ARRIVED = 'unit:arrived',
  /** 单位开始攻击 { unitId, targetId } */
  UNIT_ATTACK_START = 'unit:attack_start',
  /** 单位死亡 { unitId } */
  UNIT_DIED = 'unit:died',

  // ---- 建筑事件 ----
  BUILDING_COMPLETE = 'building:complete',
  BUILDING_DESTROYED = 'building:destroyed',
  PRODUCTION_COMPLETE = 'production:complete',
  RESEARCH_COMPLETE = 'research:complete',

  // ---- 资源事件 ----
  RESOURCE_CHANGED = 'resource:changed',
  RESOURCE_DEPLETED = 'resource:depleted',

  // ---- 选择/输入事件 ----
  SELECTION_CHANGED = 'selection:changed',
  COMMAND_ISSUED = 'command:issued',
  RIGHT_CLICK = 'input:right_click',

  // ---- 游戏状态事件 ----
  GAME_STARTED = 'game:started',
  GAME_PAUSED = 'game:paused',
  GAME_RESUMED = 'game:resumed',
  GAME_OVER = 'game:over',

  // ---- 战争迷雾 ----
  FOG_UPDATED = 'fog:updated',

  // ---- 英雄 ----
  HERO_LEVELED = 'hero:leveled',
  HERO_DIED = 'hero:died',
  HERO_REVIVED = 'hero:revived',

  // ---- AI ----
  AI_TICK = 'ai:tick',
}

// ============ 事件数据接口 ============

export interface UnitCreatedData {
  unitId: string;
  playerIndex: number;
  defId: string;
  position: { x: number; y: number };
}

export interface UnitKilledData {
  unitId: string;
  killerId: string;
  playerIndex: number;
}

export interface UnitArrivedData {
  unitId: string;
  position: { x: number; y: number };
}

export interface CombatData {
  attackerId: string;
  targetId: string;
}

export interface ResourceChangedData {
  playerIndex: number;
  resource: 'crystal' | 'industry' | 'supply';
  newValue: number;
  delta: number;
}

export interface ProductionCompleteData {
  buildingId: string;
  playerIndex: number;
  unitDefId: string;
}

export interface ResearchCompleteData {
  buildingId: string;
  playerIndex: number;
  techDefId: string;
}

export interface SelectionData {
  unitIds: string[];
  playerIndex: number;
}

export interface GameOverData {
  winnerIndex: number;
  reason: 'annihilated' | 'surrendered' | 'timeout';
}