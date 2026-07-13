/**
 * 单位/建筑数据配置 — 唯一事实来源
 *
 * 新增单位或建筑只需在这里加一条记录，
 * UNIT_COSTS、spawnUnit、HUD 按钮、建造成本全部自动同步。
 */
import type { DamageType, ArmorType } from '../types/data';
import type { UnitAbility } from '../types/entity';
import { Building } from '../entities/Building';
import type { BuildingCategory } from '../entities/Building';

// ============================================================
// 单位定义
// ============================================================

export interface UnitDefData {
  displayName: string;
  tier?: 'L1' | 'L2' | 'L3';
  cost: { crystal: number; supply: number; time: number };
  stats: {
    hp: number; armor: ArmorType; armorValue: number;
    category: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
    speed: number; damage: number; dmgType: DamageType;
    range: number; cooldown: number; sight: number;
  };
  attackEffect: string;
  /** 训练所需科技（空=无限制） */
  techReq?: string[];
  /** L2倾向兵种：在此阵营/行会享受加成 */
  favoredBy?: string[];
  /** L3专属兵种：仅此阵营组合可制造 */
  exclusiveTo?: { faction?: string; guild?: string };
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
    tier: 'L1',
    cost: { crystal: 100, supply: 1, time: 5 },
    stats: { hp: 80, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.0, damage: 5, dmgType: 'physical', range: 3, cooldown: 1.0, sight: 5 },
    attackEffect: 'melee',
  },
  unit_rifleman: {
    displayName: '水晶步枪兵',
    tier: 'L1',
    cost: { crystal: 150, supply: 1, time: 8 },
    stats: { hp: 120, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.2, damage: 16, dmgType: 'crystal', range: 5, cooldown: 0.8, sight: 7 },
    attackEffect: 'proj_bullet',
  },
  unit_battle_mage: {
    displayName: '战斗法师',
    tier: 'L2',
    cost: { crystal: 300, supply: 2, time: 15 },
    stats: { hp: 150, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.5, damage: 35, dmgType: 'magic', range: 6, cooldown: 1.0, sight: 6 },
    attackEffect: 'proj_magic_bolt',
    techReq: ['tech:battle_mage_training'],
    favoredBy: ['arcane_empire'],
  },
  unit_magitech_mech: {
    displayName: '魔导机甲',
    tier: 'L2',
    cost: { crystal: 400, supply: 3, time: 25 },
    stats: { hp: 500, armor: 'mechanical', armorValue: 5, category: 'vehicle', speed: 1.5, damage: 35, dmgType: 'physical', range: 5, cooldown: 1.5, sight: 5 },
    attackEffect: 'proj_cannon',
    techReq: ['tech:mech_assembly'],
    favoredBy: ['hammer_federation'],
  },
  unit_arcane_heavy: {
    displayName: '奥术重步',
    tier: 'L2',
    cost: { crystal: 350, supply: 3, time: 25 },
    stats: { hp: 250, armor: 'heavy', armorValue: 3, category: 'infantry', speed: 1.8, damage: 20, dmgType: 'magic', range: 4, cooldown: 1.0, sight: 6 },
    attackEffect: 'melee',
    favoredBy: ['arcane_empire'],
  },
  unit_void_probe: {
    displayName: '虚空探针',
    tier: 'L2',
    cost: { crystal: 200, supply: 1, time: 8 },
    stats: { hp: 60, armor: 'light', armorValue: 0, category: 'vehicle', speed: 4.0, damage: 0, dmgType: 'void', range: 0, cooldown: 0, sight: 15 },
    attackEffect: 'melee',
    favoredBy: ['void_institute'],
  },
  unit_assault_worker: {
    displayName: '突击工兵',
    tier: 'L2',
    cost: { crystal: 150, supply: 1, time: 8 },
    stats: { hp: 100, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.2, damage: 10, dmgType: 'physical', range: 3, cooldown: 1.0, sight: 6 },
    attackEffect: 'proj_bullet',
    favoredBy: ['hammer_federation'],
  },
  unit_scout_bike: {
    displayName: '侦察摩托',
    tier: 'L1',
    cost: { crystal: 200, supply: 1, time: 10 },
    stats: { hp: 150, armor: 'light', armorValue: 2, category: 'vehicle', speed: 5.0, damage: 0, dmgType: 'physical', range: 0, cooldown: 0, sight: 12 },
    attackEffect: 'melee',
  },
  unit_transport: {
    displayName: '运输卡车',
    tier: 'L1',
    cost: { crystal: 300, supply: 2, time: 15 },
    stats: { hp: 250, armor: 'mechanical', armorValue: 5, category: 'vehicle', speed: 3.5, damage: 0, dmgType: 'physical', range: 0, cooldown: 0, sight: 6 },
    attackEffect: 'melee',
  },
  unit_basic_turret: {
    displayName: '基础炮塔',
    tier: 'L1',
    cost: { crystal: 400, supply: 1, time: 20 },
    stats: { hp: 400, armor: 'structure', armorValue: 8, category: 'vehicle', speed: 0, damage: 25, dmgType: 'physical', range: 6, cooldown: 1.2, sight: 6 },
    attackEffect: 'proj_bullet',
  },
  // === L3 专属兵种 ===
  unit_arcane_guard: {
    displayName: '奥术守卫',
    tier: 'L3',
    cost: { crystal: 500, supply: 3, time: 25 },
    stats: { hp: 350, armor: 'shield', armorValue: 15, category: 'infantry', speed: 1.8, damage: 30, dmgType: 'magic', range: 1, cooldown: 1.2, sight: 5 },
    attackEffect: 'melee',
    exclusiveTo: { faction: 'arcane_empire' },
  },
  unit_hammer_squad: {
    displayName: '铁锤步兵团',
    tier: 'L3',
    cost: { crystal: 350, supply: 4, time: 18 },
    stats: { hp: 400, armor: 'light', armorValue: 2, category: 'infantry', speed: 2.0, damage: 60, dmgType: 'physical', range: 5, cooldown: 1.8, sight: 7 },
    attackEffect: 'proj_bullet',
    exclusiveTo: { faction: 'hammer_federation' },
  },
  unit_grenadier: {
    displayName: '掷弹兵',
    tier: 'L2',
    cost: { crystal: 250, supply: 2, time: 14 },
    stats: { hp: 100, armor: 'light', armorValue: 1, category: 'infantry', speed: 2.4, damage: 30, dmgType: 'alchemy', range: 4, cooldown: 1.5, sight: 5 },
    attackEffect: 'proj_cannon',
    favoredBy: ['alchemists_society'],
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
  /** 防御建筑战斗属性（非零=可攻击） */
  combat?: { damage: number; dmgType: DamageType; range: number; cooldown: number };
}

export const BUILDING_DEFS: Record<string, BuildingDefData> = {
  bld_cc_empire: {
    displayName: '帝国指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 50 },
    produces: ['unit_worker', 'hero:isabelle'],
    researches: ['tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce'],
  },
  bld_cc_federation: {
    displayName: '联邦指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero:marcus'],
    researches: ['tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce'],
  },
  bld_barracks: {
    displayName: '兵营',
    cost: { crystal: 300, industry: 20, time: 20 },
    hp: 800,
    provides: { supply: 20, industry: 0 },
    produces: ['unit_rifleman', 'unit_battle_mage', 'unit_arcane_heavy', 'unit_grenadier', 'unit_assault_worker'],
  },
  bld_factory: {
    displayName: '工厂',
    cost: { crystal: 500, industry: 40, time: 30 },
    hp: 1000,
    provides: { supply: 20, industry: 30 },
    produces: ['unit_magitech_mech', 'unit_scout_bike', 'unit_transport', 'unit_hammer_squad', 'unit_void_probe'],
  },
  bld_refinery: {
    displayName: '采矿场',
    cost: { crystal: 400, industry: 30, time: 25 },
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
    combat: { damage: 25, dmgType: 'physical', range: 6, cooldown: 1.2 },
  },
bld_ancient_archive: {
    displayName: '古代典籍馆',
    cost: { crystal: 350, industry: 20, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: ['unit_arcane_guard'],
    researches: ['tech:battle_mage_training', 'tech:mech_assembly'],
  },
  bld_assembly_workshop: {
    displayName: '流水线车间',
    cost: { crystal: 350, industry: 20, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: ['unit_hammer_squad'],
    researches: ['tech:mech_assembly'],
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

/** 推断建筑类别（防御建筑自动识别） */
export function getBuildingCategory(defId: string): BuildingCategory {
  if (defId === 'bld_wall' || defId === 'bld_turret') return 'defense';
  if (defId === 'bld_refinery' || defId === 'bld_power_plant') return 'resource';
  if (defId === 'bld_ancient_archive' || defId === 'bld_assembly_workshop') return 'tech';
  return 'production';
}

/** 创建建筑的共享工厂（消除 BuildController / CommandExecutor / UnitSpawner 重复代码） */
export function createBuilding(
  owner: number, faction: string, defId: string, tileX: number, tileY: number,
): Building {
  const bldDef = BUILDING_DEFS[defId];
  const cost = getBuildingCost(defId, faction);
  const bld = new Building(
    owner, faction as any, tileX, tileY,
    bldDef?.hp ?? 800, 'structure',
    getBuildingCategory(defId),
    defId,
    cost?.providesSupply ?? 0, cost?.providesIndustry ?? 0,
  );
  // 防御建筑战斗属性
  if (bldDef?.combat) {
    bld.attackDamage = bldDef.combat.damage;
    bld.attackRange = bldDef.combat.range;
    bld.attackCooldown = bldDef.combat.cooldown;
    bld.attackType = bldDef.combat.dmgType;
  }
  return bld;
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
    /** 建筑造价倍率 (联邦 0.80 = 建筑-20%) */
    buildCostMult: number;
    /** 生产速度倍率 (联邦 0.85 = 生产+15%) */
    productionSpeedMult: number;
    /** 研究速度倍率 (帝国 0.85 = 研究+15%) */
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
    startingUnits: [['unit_worker', 3], ['unit_arcane_guard', 1]],
    bonuses: {
      buildCostMult: 1.0,
      productionSpeedMult: 0.95,
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
      buildCostMult: 0.80,
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
  'tech:battle_mage_training': {
    name: '战斗法师训练',
    crystal: 200,
    time: 30,
    desc: '解锁战斗法师训练',
  },
  'tech:mech_assembly': {
    name: '机甲装配技术',
    crystal: 350,
    time: 35,
    desc: '解锁魔导机甲制造',
  },
  'tech:crystal_smelting': {
    name: '水晶冶炼 L1',
    crystal: 150,
    time: 25,
    desc: '水晶采集 +15%',
  },
  'tech:refining_tech': {
    name: '精炼技术 L2',
    crystal: 400,
    time: 50,
    desc: '水晶采集 +25%（与L1叠加）',
    prerequisites: ['tech:crystal_smelting'],
  },
};