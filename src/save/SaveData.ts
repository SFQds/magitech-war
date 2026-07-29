/**
 * 存档数据契约 — 序列化/反序列化层
 *
 * 设计原则：
 *  - 纯逻辑，零 Phaser 依赖（可在 node 测试环境验证往返一致性）
 *  - SaveData 是 JSON 可直接序列化的纯数据结构（无方法、无循环引用、无 Map/Set）
 *  - 单位/建筑/资源/英雄保留运行时类型在序列化时不参与（如 sprite 引用、ability.execute）
 *  - cargo 用 ID 列表表示（避免重复序列化嵌套单位 + 循环引用）
 *  - 已枯竭资源点也保存（amount=0），读档时按 isActive 重建
 *
 * 版本策略：SAVE_VERSION 单调递增；读档时若 version 不符则拒绝（不做迁移，简单粗暴）。
 */

import type { FactionId, TerrainType, ResourceType } from '../types/data';
import type { UnitState, BuildingState, ProductionItem, Point } from '../types/entity';
import type { ArmorType, DamageType } from '../types/data';
import type { SuperWeaponState } from '../systems/SuperWeaponSystem';

/** 当前存档格式版本（每次破坏性变更后 +1） */
export const SAVE_VERSION = 1;

// ============ 元数据 ============

export interface SaveMeta {
  /** 地图 ID（如 'map_valley'） */
  mapId: string;
  /** 地图尺寸（瓦片） */
  mapWidth: number;
  mapHeight: number;
  /** 玩家 0 阵营 */
  playerFaction: FactionId;
  /** AI 阵营（玩家 1） */
  aiFaction: FactionId;
  /** AI 难度 */
  aiDifficulty: 'easy' | 'normal' | 'hard';
  /** 玩家 0 行会列表 */
  playerGuilds: string[];
  /** AI 行会列表 */
  aiGuilds: string[];
}

// ============ 实体序列化结构 ============

/** Entity 基类的可序列化字段 */
export interface SerializedEntity {
  id: string;
  owner: number;
  faction: FactionId;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  armorType: ArmorType;
  armor: number;
  shieldHp: number;
  maxShieldHp: number;
  isActive: boolean;
  spriteKey: string;
}

/** Unit 的可序列化字段（除继承自 Entity 外） */
export interface SerializedUnit extends SerializedEntity {
  kind: 'unit';
  /** 'hero' | 'unit'，用于反序列化时区分构造器 */
  subtype: 'hero' | 'unit';
  category: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
  state: UnitState;
  speed: number;
  attackDamage: number;
  attackType: DamageType;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  sight: number;
  path: Point[];
  pathIndex: number;
  targetEntityId: string | null;
  targetResourceId: string | null;
  /** cargo 单位的 ID 列表（避免循环引用，反序列化时按 ID 重新挂载） */
  cargoIds: string[];
  abilityCharges: number;
  maxAbilityCharges: number;
  holdPosition: boolean;
  aiLockedAction: 'retreat' | 'defend' | 'attack' | 'recover' | 'building' | null;
  supplyCost: number;
  gatherTimer: number;
  unloadTarget: { x: number; y: number } | null;
  isCargo: boolean;
  baseArmor: number;
  baseAttackDamage: number;
  hadIronskin: boolean;
  pursueFailTimer: number;
  pursueRetickTimer: number;
  // 行会 buff 状态
  alchemyBuffTimer: number;
  alchemyBuffType: 'none' | 'strength' | 'ironskin' | 'swift' | 'corrosion';
  alchemyBuffValue: number;
  isVoidOvercharged: boolean;
  voidOverloadTimer: number;
  isVoidOptimized: boolean;
  // 英雄专属（subtype='hero' 时才有意义）
  heroName?: string;
  title?: string;
  level?: number;
  xp?: number;
  skillCooldown?: number;
  skillCooldowns?: number[];
  reviveTimer?: number;
  auraRadius?: number;
}

/** Building 的可序列化字段 */
export interface SerializedBuilding extends SerializedEntity {
  kind: 'building';
  buildingType: 'production' | 'resource' | 'tech' | 'defense' | 'utility';
  state: BuildingState;
  buildProgress: number;
  rallyPoint: Point | null;
  productionQueue: ProductionItem[];
  maxQueueSize: number;
  providesSupply: number;
  providesIndustry: number;
  researchingTechId: string | null;
  researchProgress: number;
  researchTotalTime: number;
  builderId: string | null;
  sight: number;
  productionSpeedBonus: number;
  _aiBuildTime: number;
  // 防御建筑战斗属性
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  attackType: string;
  attackTimer: number;
  targetEntityId: string | null;
}

/** ResourceField 的可序列化字段 */
export interface SerializedField extends SerializedEntity {
  kind: 'field';
  resourceType: 'crystal';
  amount: number;
  maxGatherers: number;
  currentGatherers: number;
}

// ============ 玩家/科技/超武 ============

export interface SerializedPlayer {
  index: number;
  faction: FactionId;
  guilds: string[];
  resources: {
    crystal: number;
    industry: number;
    supply: number;
    supplyCap: number;
    industryCap: number;
  };
  _industryTimer: number;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
}

export interface SerializedTechTree {
  /** 玩家 index */
  playerIndex: number;
  /** 已研究的科技 ID */
  researched: string[];
}

export interface SerializedArcaneCharge {
  playerIndex: number;
  timer: number;
}

// ============ 完整存档结构 ============

export interface SaveData {
  /** 存档格式版本（== SAVE_VERSION 才能读） */
  version: number;
  /** 存档创建时间戳（ms） */
  createdAt: number;
  /** 元数据：地图、阵营、行会、难度 */
  meta: SaveMeta;
  /** 游戏计时器（秒，来自 GameOverController._gameTimer） */
  gameTimer: number;
  /** 建筑全失宽限期计时器（每玩家秒） */
  graceTimers: [number, number];
  /** 玩家状态列表 */
  players: SerializedPlayer[];
  /** 单位列表（含英雄，按 subtype 区分） */
  units: SerializedUnit[];
  /** 建筑列表 */
  buildings: SerializedBuilding[];
  /** 资源点列表 */
  fields: SerializedField[];
  /** 每玩家已研究科技 */
  techTrees: SerializedTechTree[];
  /** 超武状态（玩家 index → SuperWeaponState[]） */
  superWeapons: Record<number, SuperWeaponState[]>;
  /** 法师公会充能计时器 */
  arcaneChargeTimers: SerializedArcaneCharge[];
  /** 地形数据：每行一个 TerrainType 数组（仅保存非默认地形以减小体积；读档时默认全 grass，再覆盖） */
  terrain?: TerrainType[][];
}
