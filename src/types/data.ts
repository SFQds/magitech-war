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

/** 行会 ID */
export type GuildId = 'mages_guild' | 'mechanists_guild' | 'alchemists_society' | 'void_institute';

/** 行会敌对矩阵：mages↔mechanists 互斥，其余可共存 */
export const GUILD_HOSTILITY: Record<GuildId, GuildId[]> = {
  mages_guild: ['mechanists_guild'],
  mechanists_guild: ['mages_guild'],
  alchemists_society: [],
  void_institute: [],
};

/** 有效行会组合（5种） */
export const VALID_GUILD_PAIRS: [GuildId, GuildId][] = [
  ['mages_guild', 'alchemists_society'],
  ['mages_guild', 'void_institute'],
  ['mechanists_guild', 'alchemists_society'],
  ['mechanists_guild', 'void_institute'],
  ['alchemists_society', 'void_institute'],
];

/** 行会中文名 */
export const GUILD_NAMES: Record<GuildId, string> = {
  mages_guild: '法师公会',
  mechanists_guild: '机械行会',
  alchemists_society: '炼金协会',
  void_institute: '虚空研究院',
};

/** 行会一句话描述 */
export const GUILD_DESC: Record<GuildId, string> = {
  mages_guild: '奥术充能：每30秒充能一层，消耗充能释放强力技能',
  mechanists_guild: '流水线协议：兵营/工厂可并行训练3个单位',
  alchemists_society: '炼金调制：消耗水晶给单位施加战斗药剂',
  void_institute: '水晶过载：30秒全属性+50%，单位过载后损毁',
};

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