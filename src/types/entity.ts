/**
 * 实体运行时接口
 * Entity 是游戏中所有可交互对象的基类
 */

import type { DamageType, ArmorType, FactionId, ResourceType } from './data';

// ============ 实体状态枚举 ============

/** 单位当前行为状态 */
export type UnitState = 'idle' | 'moving' | 'attacking' | 'gathering' | 'building' | 'dead';

/** 建筑当前状态 */
export type BuildingState = 'constructing' | 'idle' | 'producing' | 'researching' | 'destroyed';

// ============ 实体接口 ============

/** 所有实体基类接口 */
export interface IEntity {
  readonly id: string;
  owner: number;           // player index: 0 = 玩家, 1+ = AI
  faction: FactionId;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  armorType: ArmorType;
  isActive: boolean;
  spriteKey: string;
}

/** 可移动战斗单位 */
export interface IUnit extends IEntity {
  category: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
  state: UnitState;
  speed: number;               // tiles/s
  attackDamage: number;
  attackType: DamageType;
  attackRange: number;         // tiles
  attackCooldown: number;      // seconds
  attackTimer: number;         // 当前冷却倒计时
  sight: number;               // tiles 视野
  path: Point[];               // 移动路径
  pathIndex: number;
  targetEntityId: string | null;
  cargo: IUnit[];              // 运输单位专用
  abilities: UnitAbility[];
  abilityCharges: number;      // 奥术充能层数
  maxAbilityCharges: number;
}

/** 建筑 */
export interface IBuilding extends IEntity {
  buildingType: 'production' | 'resource' | 'tech' | 'defense' | 'utility';
  state: BuildingState;
  buildProgress: number;       // 0~1
  rallyPoint: Point | null;
  productionQueue: ProductionItem[];
  providesSupply: number;
  providesIndustry: number;
}

/** 资源采集点 */
export interface IResourceField extends IEntity {
  resourceType: ResourceType;
  amount: number;              // 剩余储量
  maxGatherers: number;        // 同时最大采集数
  currentGatherers: number;
}

/** 投射物 */
export interface IProjectile extends IEntity {
  sourceId: string;
  targetId: string;
  speed: number;
  damage: number;
  damageType: DamageType;
  isHoming: boolean;
}

// ============ 辅助类型 ============

export interface Point {
  x: number;
  y: number;
}

export interface UnitAbility {
  id: string;
  name: string;
  cooldown: number;
  currentCooldown: number;
  isReady: boolean;
  targetType: 'self' | 'ally' | 'enemy' | 'area' | 'ground';
  execute: (target?: unknown) => void;
}

export interface ProductionItem {
  unitDefId: string;
  timeRemaining: number;
  totalTime: number;
}

/** 玩家状态 */
export interface PlayerState {
  index: number;
  faction: FactionId;
  guilds: string[];
  resources: {
    crystal: number;
    industry: number;
    supply: number;
    supplyCap: number;
  };
  isAI: boolean;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
}