/**
 * JSON 数据 Schema 接口
 * 与 GAME_DATA.md 条目ID命名空间一致
 * 这是代码与数据之间的契约——data/*.json 按此 Schema 填充
 */

// ============ 基础枚举 ============

/** 阵营归属 */
export type FactionId = 'arcane_empire' | 'hammer_federation' | 'frostridge_kingdom' | 'jade_confederation';

/** 行会归属 */
export type GuildId = 'mages_guild' | 'mechanists_guild' | 'alchemists_society' | 'void_institute';

/** 单位大类 */
export type UnitCategory = 'infantry' | 'vehicle' | 'aircraft' | 'naval';

/** 伤害类型 */
export type DamageType = 'physical' | 'magic' | 'alchemy' | 'crystal' | 'void';

/** 护甲类型 */
export type ArmorType = 'light' | 'heavy' | 'shield' | 'bio' | 'structure' | 'mechanical';

/** 建筑类型 */
export type BuildingType = 'production' | 'resource' | 'tech' | 'defense' | 'utility';

/** 资源类型 */
export type ResourceType = 'crystal' | 'industry' | 'supply';

/** 地形类型 */
export type TerrainType = 'grass' | 'sand' | 'water' | 'mountain' | 'forest';

// ============ 单位数据 ============

/** 单位属性 */
export interface UnitStats {
  hp: number;
  armor: number;
  armorType: ArmorType;
  speed: number;           // tiles per second
  attackDamage: number;
  attackType: DamageType;
  attackRange: number;     // tiles
  attackCooldown: number;  // seconds
  sight: number;           // tiles (视野)
}

/** 资源消耗 */
export interface Cost {
  crystal: number;
  industry: number;
  supply: number;
}

/** 兵种等级 */
export type UnitTier = 'L1' | 'L2' | 'L3';

/** 单位数据定义（来自 units.json） */
export interface UnitDef {
  id: string;                    // 如 "arcane_guard"
  name: string;                  // 显示名
  tier: UnitTier;
  category: UnitCategory;
  stats: UnitStats;
  cost: Cost;
  buildTime: number;             // 秒
  techReq: string[];             // 需要的科技 ID
  /** L2 倾向兵种：在此阵营中享受加成 */
  favoredBy?: string[];          // FactionId | GuildId
  /** L3 专属兵种：仅此阵营可制造 */
  exclusiveTo?: {
    faction?: FactionId;
    guild?: GuildId;
  };
  abilities: UnitAbilityDef[];
  spriteSheet: string;           // 资源路径
}

/** 单位特殊能力 */
export interface UnitAbilityDef {
  id: string;
  name: string;
  description: string;
  cooldown: number;              // 秒
  targetType: 'self' | 'ally' | 'enemy' | 'area' | 'ground';
  effects: AbilityEffect[];
}

/** 技能效果 */
export interface AbilityEffect {
  type: 'damage' | 'heal' | 'shield' | 'buff' | 'debuff' | 'summon' | 'teleport';
  value: number;
  duration?: number;             // 秒（buff/debuff）
  damageType?: DamageType;
}

// ============ 建筑数据 ============

/** 建筑数据定义（来自 buildings.json） */
export interface BuildingDef {
  id: string;                    // 如 "command_center"
  name: string;
  type: BuildingType;
  hp: number;
  armorType: ArmorType;
  cost: Cost;
  buildTime: number;             // 秒
  techReq: string[];
  produces?: string[];           // 可制造的单位 ID 列表
  provides?: {
    resource?: ResourceType;
    amount?: number;             // 如工业车间 +50 industry
    supply?: number;             // 如民居 +10 supply
  };
  exclusiveTo?: {
    faction?: FactionId;
    guild?: GuildId;
  };
}

// ============ 科技数据 ============

/** 科技数据定义（来自 tech_tree.json） */
export interface TechDef {
  id: string;                    // 如 "arcane_legacy"
  name: string;
  description: string;
  cost: Cost;
  researchTime: number;          // 秒
  prerequisites: string[];       // 前置科技 ID
  unlocks: {
    units?: string[];
    buildings?: string[];
    upgrades?: string[];
    superweapon?: string;
  };
  exclusiveTo?: {
    faction?: FactionId;
    guild?: GuildId;
  };
}

// ============ 英雄数据 ============

/** 英雄技能 */
export interface HeroSkillDef {
  id: string;
  name: string;
  unlockLevel: number;           // 1-5
  cooldown: number;              // 秒
  isPassive: boolean;
  description: string;
  effects: AbilityEffect[];
}

/** 英雄数据定义（来自 heroes.json） */
export interface HeroDef {
  id: string;                    // 如 "hero:isabelle"
  name: string;
  title: string;
  faction: FactionId;
  guilds: GuildId[];             // 2个行会
  stats: {
    hp: number;
    armor: number;
    armorType: ArmorType;
    speed: number;
    attackDamage: number;
    attackType: DamageType;
    attackRange: number;
    attackCooldown: number;
  };
  cost: Cost;
  reviveCooldown: number;       // 死亡后复活冷却（秒）
  reviveCostMultiplier: number; // 复活资源倍率
  skills: HeroSkillDef[];
}

// ============ 阵营数据 ============

/** 阵营被动加成 */
export interface FactionPassive {
  economic: string;              // 如 "法术研究速度 +15%"
  military: string;              // 如 "法师类单位伤害 +10%"
}

/** 王国数据定义（来自 factions.json） */
export interface FactionDef {
  id: FactionId;
  name: string;
  color: string;                 // hex 如 "#FFD700"
  capital: string;
  population: number;
  passives: FactionPassive;
  startingResources: {
    crystal: number;
    industry: number;
    supply: number;
  };
  startingUnits: string[];       // 起始单位 ID 列表
  exclusiveUnits: string[];      // 独有单位 ID
  exclusiveBuildings: string[];  // 独有建筑 ID
}

/** 行会数据定义 */
export interface GuildDef {
  id: GuildId;
  name: string;
  color: string;
  headquarters: string;
  members: number;
  description: string;
  hostileTo: GuildId[];          // 敌对行会
  exclusiveUnits: string[];
  exclusiveTechs: string[];
  superweapon: string;
}

// ============ 地图数据 ============

/** 地图数据（来自 maps/*.json） */
export interface MapData {
  name: string;
  width: number;                 // tiles
  height: number;
  players: number;
  tiles: TerrainType[][];       // [y][x]
  crystalFields: CrystalFieldDef[];
  startPositions: StartPositionDef[];
  neutralStructures: NeutralStructureDef[];
}

export interface CrystalFieldDef {
  x: number;
  y: number;
  amount: number;               // 初始储量
}

export interface StartPositionDef {
  player: number;               // 0 = 玩家, 1+ = AI
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