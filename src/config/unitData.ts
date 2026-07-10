/**
 * 单位/建筑数据配置 — 唯一事实来源
 *
 * 新增单位或建筑只需在这里加一条记录，
 * UNIT_COSTS、spawnUnit、HUD 按钮、建造成本全部自动同步。
 */
import type { DamageType, ArmorType } from '../types/data';
import type { UnitAbility } from '../types/entity';

// ============================================================
// 单位定义
// ============================================================

export interface UnitDefData {
  displayName: string;
  cost: { crystal: number; supply: number; time: number };
  stats: {
    hp: number; armor: ArmorType; category: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
    speed: number; damage: number; dmgType: DamageType;
    range: number; cooldown: number; sight: number;
  };
  attackEffect: string;
  abilities?: UnitAbility[];
}

/** 单位类别中文名 */
export const CATEGORY_NAMES: Record<string, string> = {
  infantry: '步兵',
  vehicle: '载具',
  aircraft: '空军',
  naval: '海军',
};

/** 单位状态中文名 */
export const STATE_NAMES: Record<string, string> = {
  idle: '空闲',
  moving: '移动中',
  attacking: '攻击中',
  pursuing: '追击中',
  gathering: '采集中',
  building: '建造中',
  dead: '已阵亡',
};

export const UNIT_DEFS: Record<string, UnitDefData> = {
  unit_worker: {
    displayName: '工兵',
    cost: { crystal: 100, supply: 1, time: 8 },
    stats: { hp: 80, armor: 'light', category: 'infantry', speed: 2.0, damage: 5, dmgType: 'physical', range: 3, cooldown: 1.0, sight: 5 },
    attackEffect: 'melee',
  },
  unit_rifleman: {
    displayName: '水晶步枪兵',
    cost: { crystal: 150, supply: 1, time: 10 },
    stats: { hp: 120, armor: 'light', category: 'infantry', speed: 2.2, damage: 14, dmgType: 'physical', range: 5, cooldown: 0.8, sight: 7 },
    attackEffect: 'proj_bullet',
  },
  unit_battle_mage: {
    displayName: '战斗法师',
    cost: { crystal: 240, supply: 2, time: 15 },
    stats: { hp: 150, armor: 'light', category: 'infantry', speed: 2.5, damage: 30, dmgType: 'magic', range: 6, cooldown: 1.0, sight: 6 },
    attackEffect: 'proj_magic_bolt',
  },
  unit_magitech_mech: {
    displayName: '魔导机甲',
    cost: { crystal: 400, supply: 3, time: 25 },
    stats: { hp: 500, armor: 'mechanical', category: 'vehicle', speed: 1.5, damage: 35, dmgType: 'physical', range: 5, cooldown: 1.5, sight: 5 },
    attackEffect: 'proj_cannon',
  },
  unit_arcane_heavy: {
    displayName: '奥术重步',
    cost: { crystal: 600, supply: 3, time: 30 },
    stats: { hp: 400, armor: 'heavy', category: 'infantry', speed: 2.0, damage: 40, dmgType: 'magic', range: 2, cooldown: 0.9, sight: 6 },
    attackEffect: 'melee',
  },
  unit_scout_bike: {
    displayName: '侦察摩托',
    cost: { crystal: 200, supply: 1, time: 10 },
    stats: { hp: 150, armor: 'light', category: 'vehicle', speed: 5.0, damage: 0, dmgType: 'physical', range: 0, cooldown: 0, sight: 12 },
    attackEffect: 'melee',
  },
  unit_transport: {
    displayName: '运输卡车',
    cost: { crystal: 300, supply: 2, time: 15 },
    stats: { hp: 250, armor: 'mechanical', category: 'vehicle', speed: 3.5, damage: 0, dmgType: 'physical', range: 0, cooldown: 0, sight: 6 },
    attackEffect: 'melee',
  },
  unit_basic_turret: {
    displayName: '基础炮塔',
    cost: { crystal: 400, supply: 1, time: 20 },
    stats: { hp: 400, armor: 'structure', category: 'infantry', speed: 0, damage: 25, dmgType: 'physical', range: 6, cooldown: 1.2, sight: 6 },
    attackEffect: 'proj_bullet',
  },
};

// ============================================================
// 建筑定义
// ============================================================

export interface BuildingDefData {
  displayName: string;
  cost: { crystal: number; industry: number; time: number };
  hp: number;
  provides: { supply: number; industry: number };
  produces: string[];
  researches?: string[];
}

export const BUILDING_DEFS: Record<string, BuildingDefData> = {
  bld_cc_empire: {
    displayName: '帝国指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 50 },
    produces: ['unit_worker'],
    researches: ['tech:advanced_mining', 'tech:infantry_armor', 'tech:structure_reinforce'],
  },
  bld_cc_federation: {
    displayName: '联邦指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 80 },
    produces: ['unit_worker'],
    researches: ['tech:advanced_mining', 'tech:infantry_armor', 'tech:structure_reinforce'],
  },
  bld_barracks: {
    displayName: '兵营',
    cost: { crystal: 300, industry: 0, time: 15 },
    hp: 800,
    provides: { supply: 20, industry: 0 },
    produces: ['unit_rifleman', 'unit_battle_mage'],
  },
  bld_factory: {
    displayName: '工厂',
    cost: { crystal: 500, industry: 40, time: 30 },
    hp: 1000,
    provides: { supply: 20, industry: 30 },
    produces: ['unit_magitech_mech', 'unit_scout_bike', 'unit_transport'],
  },
  bld_refinery: {
    displayName: '采矿场',
    cost: { crystal: 400, industry: 0, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: [],
  },
  bld_power_plant: {
    displayName: '工业车间',
    cost: { crystal: 250, industry: 0, time: 18 },
    hp: 500,
    provides: { supply: 0, industry: 50 },
    produces: [],
  },
  bld_wall: {
    displayName: '城墙',
    cost: { crystal: 50, industry: 0, time: 5 },
    hp: 300,
    provides: { supply: 0, industry: 0 },
    produces: [],
  },
  bld_turret: {
    displayName: '炮塔',
    cost: { crystal: 400, industry: 30, time: 20 },
    hp: 400,
    provides: { supply: 0, industry: 0 },
    produces: [],
  },
};

// ============================================================
// 查询工具
// ============================================================

/** 获取建筑的建造成本（用于建造系统，含阵营被动） */
export function getBuildingCost(buildingDefId: string, factionId?: string) {
  const def = BUILDING_DEFS[buildingDefId];
  if (!def) return null;
  const bonuses = factionId ? getFactionBonuses(factionId) : { buildCostMult: 1 };
  return {
    crystal: Math.round(def.cost.crystal * bonuses.buildCostMult),
    industry: Math.round(def.cost.industry * bonuses.buildCostMult),
    time: def.cost.time,
    providesSupply: def.provides.supply,
    providesIndustry: def.provides.industry,
  };
}

/** 获取建筑可训练的单位列表 */
export function getBuildingProduces(buildingDefId: string): string[] {
  return BUILDING_DEFS[buildingDefId]?.produces ?? [];
}

/** 获取单位/建筑的中文显示名 */
export function getDisplayName(defId: string): string {
  return UNIT_DEFS[defId]?.displayName ?? BUILDING_DEFS[defId]?.displayName ?? defId;
}

/** 获取阵营被动加成 */
export function getFactionBonuses(factionId: string) {
  return FACTION_DEFS[factionId]?.bonuses ?? {
    buildCostMult: 1, productionSpeedMult: 1, researchSpeedMult: 1, magicDmgMult: 1,
  };
}

// ============================================================
// 阵营定义
// ============================================================

export interface FactionDefData {
  name: string;
  /** 经济被动描述 */
  econPassive: string;
  /** 军事被动描述 */
  milPassive: string;
  /** 起始资源 */
  startingCrystal: number;
  startingIndustry: number;
  /** 起始单位 [unitDefId, count] */
  startingUnits: [string, number][];
  /** 被动效果（运行时查询） */
  bonuses: {
    /** 建筑造价倍率 (联邦 0.8) */
    buildCostMult: number;
    /** 生产速度倍率 (联邦 0.85 = 快15%) */
    productionSpeedMult: number;
    /** 研究速度倍率 (帝国 0.85 = 快15%) */
    researchSpeedMult: number;
    /** 魔法伤害倍率 (帝国 1.1) */
    magicDmgMult: number;
  };
}

export const FACTION_DEFS: Record<string, FactionDefData> = {
  arcane_empire: {
    name: '奥术帝国',
    econPassive: '研究速度 +15%',
    milPassive: '魔法伤害 +10%',
    startingCrystal: 2000,
    startingIndustry: 50,
    startingUnits: [['unit_worker', 3], ['unit_arcane_heavy', 1]],
    bonuses: {
      buildCostMult: 1.0,
      productionSpeedMult: 1.0,
      researchSpeedMult: 0.85,
      magicDmgMult: 1.1,
    },
  },
  hammer_federation: {
    name: '铁锤联邦',
    econPassive: '建筑造价 -20%',
    milPassive: '生产速度 +15%',
    startingCrystal: 2000,
    startingIndustry: 80,
    startingUnits: [['unit_worker', 4], ['unit_rifleman', 2]],
    bonuses: {
      buildCostMult: 0.8,
      productionSpeedMult: 0.85,
      researchSpeedMult: 1.0,
      magicDmgMult: 1.0,
    },
  },
};

// ============================================================
// 科技定义
// ============================================================

export interface TechDefData {
  name: string;
  crystal: number;
  time: number;
  desc: string;
  prerequisites?: string[];
}

export const TECH_DEFS: Record<string, TechDefData> = {
  'tech:advanced_mining': {
    name: '高级采集 L1',
    crystal: 200,
    time: 30,
    desc: '工人采集 +20%',
  },
  'tech:infantry_armor': {
    name: '步兵护甲 L1',
    crystal: 250,
    time: 35,
    desc: '步兵 +5 护甲',
  },
  'tech:structure_reinforce': {
    name: '建筑加固 L1',
    crystal: 300,
    time: 40,
    desc: '建筑 HP +20%',
  },
};