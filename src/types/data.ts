/**
 * 共享类型别名 + 数据契约
 *
 * 设计原则：
 * - 纯类型别名（枚举字符串联合）→ 放这里，全项目共用
 * - 运行时数据结构 → 放 ../config/unitData.ts
 * - JSON 契约接口 → 放这里（与 *.json 结构对齐）
 */

// ============ 类型别名（全项目共用） ============

/** 阵营归属 */
export type FactionId = 'arcane_empire' | 'hammer_federation' | 'frostridge_kingdom' | 'jade_confederation';

/** 伤害类型 */
export type DamageType = 'physical' | 'magic' | 'alchemy' | 'crystal' | 'void';

/** 护甲类型 */
export type ArmorType = 'light' | 'heavy' | 'shield' | 'bio' | 'structure' | 'mechanical';

/** 地形类型 */
export type TerrainType = 'grass' | 'sand' | 'water' | 'mountain' | 'forest';

/** 资源类型 */
export type ResourceType = 'crystal' | 'industry' | 'supply';

// ============ 科技（TechTreeSystem 依赖） ============

/** 科技数据定义（来自 tech_tree.json 契约） */
export interface TechDef {
  id: string;
  name: string;
  description: string;
  cost: { crystal: number; industry: number; supply: number };
  researchTime: number;
  prerequisites: string[];
  unlocks: {
    units?: string[];
    buildings?: string[];
    upgrades?: string[];
    superweapon?: string;
  };
  exclusiveTo?: {
    faction?: FactionId;
    guild?: string;
  };
}

// ============ 地图 JSON 契约 ============

/** 地图数据（来自 maps/*.json） */
export interface MapData {
  name: string;
  width: number;
  height: number;
  players: number;
  tiles: TerrainType[][];
  crystalFields: CrystalFieldDef[];
  startPositions: StartPositionDef[];
  neutralStructures: NeutralStructureDef[];
}

export interface CrystalFieldDef {
  x: number;
  y: number;
  amount: number;
}

export interface StartPositionDef {
  player: number;
  x: number;
  y: number;
}

export interface NeutralStructureDef {
  id: string;
  type: string;
  x: number;
  y: number;
  hp: number;
}