/**
 * 事件系统类型定义
 * EventBus 解耦模块间通信
 */

// ============ 事件枚举 ============

/** 所有游戏事件类型 */
export enum GameEvent {
  // ---- 单位事件 ----
  /** 单位被创建 { unitId, playerIndex, unitDefId, position } */
  UNIT_CREATED = 'unit:created',
  /** 单位被击杀 { unitId, killerId, playerIndex } */
  UNIT_KILLED = 'unit:killed',
  /** 单位到达目的地 { unitId, position } — TODO: Phase 2 补发射 */
  UNIT_ARRIVED = 'unit:arrived',
  /** 单位开始攻击 { unitId, targetId } */
  UNIT_ATTACK_START = 'unit:attack_start',

  // ---- 建筑事件 ----
  BUILDING_COMPLETE = 'building:complete',
  /** 建筑被摧毁 — 已由 BuildController.emit；HUDScene 暂未消费（异步通知用预留） */
  BUILDING_DESTROYED = 'building:destroyed',
  PRODUCTION_STARTED = 'production:started',
  PRODUCTION_COMPLETE = 'production:complete',
  RESEARCH_COMPLETE = 'research:complete',
  /** 科技研究被取消 { buildingId, playerIndex, techDefId, refundAmount } */
  RESEARCH_CANCELED = 'research:canceled',
  /** 寻路失败 { unitId, playerIndex, reason } */
  PATH_FAILED = 'path:failed',
  /** 建筑全失宽限期警告 { playerIndex, secondsLeft } */
  GRACE_WARNING = 'grace:warning',

  // ---- 资源事件 ----
  RESOURCE_CHANGED = 'resource:changed',
  /** 资源枯竭 — TODO: Phase 2 补发射 */
  RESOURCE_DEPLETED = 'resource:depleted',
  RESOURCE_GATHERED = 'resource:gathered',

  // ---- 选择/输入事件 ----
  SELECTION_CHANGED = 'selection:changed',
  BUILDING_SELECTED = 'building:selected',
  /** 命令发出 — TODO: Phase 2 补发射 */
  COMMAND_ISSUED = 'command:issued',
  /** 右键点击 — TODO: Phase 2 补发射 */
  RIGHT_CLICK = 'input:right_click',

  // ---- 游戏状态事件 ----
  GAME_STARTED = 'game:started',
  /** 暂停 — TODO: Phase 2 */
  GAME_PAUSED = 'game:paused',
  /** 恢复 — TODO: Phase 2 */
  GAME_RESUMED = 'game:resumed',
  GAME_OVER = 'game:over',

  // ---- 战争迷雾 ----
  /** 迷雾更新 — TODO: Phase 2 补发射 */
  FOG_UPDATED = 'fog:updated',

  // ---- 英雄 ----
  HERO_LEVELED = 'hero:leveled',
  /** 英雄死亡 — 已由 GameScene._onUnitKilled 集中 emit；SoundBindings/HUDScene 应消费 */
  HERO_DIED = 'hero:died',
  HERO_REVIVED = 'hero:revived',

  // ---- 输入/模式 ----
  ATTACK_MOVE_TOGGLE = 'attackmove:toggle',

  // ---- 行会技能 ----
  ABILITY_USED = 'ability:used',
  UNIT_DESTROYED = 'unit:destroyed',

  // ---- AI ----
  /** AI tick — TODO: Phase 2 补发射 */
  AI_TICK = 'ai:tick',
}

// ============ 事件数据接口 ============

export interface UnitCreatedData {
  unitId: string;
  playerIndex: number;
  unitDefId: string;
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

export interface ProductionStartedData {
  buildingId: string;
  playerIndex: number;
  unitDefId: string;
  totalTime: number;
}

export interface ResourceGatheredData {
  fieldId: string;
  workerId: string;
  playerIndex: number;
  amount: number;
}

export interface ResearchCompleteData {
  buildingId: string;
  playerIndex: number;
  techDefId: string;
}

export interface ResearchCanceledData {
  buildingId: string;
  playerIndex: number;
  techDefId: string;
  refundAmount: number;
}

export interface PathFailedData {
  unitId: string;
  playerIndex: number;
  reason: 'target_unreachable' | 'start_blocked' | 'no_path';
}

export interface GraceWarningData {
  playerIndex: number;
  secondsLeft: number;
}

export interface SelectionData {
  unitIds: string[];
  playerIndex: number;
}

export interface GameOverData {
  winnerIndex: number;
  reason: 'annihilated' | 'surrendered' | 'timeout';
}