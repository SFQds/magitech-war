/**
 * 单位/建筑数据配置 — 唯一事实来源
 *
 * 新增单位或建筑只需在这里加一条记录，
 * UNIT_COSTS、spawnUnit、HUD 按钮、建造成本全部自动同步。
 */
import type { DamageType, ArmorType, FactionId, GuildId } from '../types/data';
import type { UnitAbility } from '../types/entity';
import { Building } from '../entities/Building';
import type { BuildingCategory } from '../entities/Building';

// ============================================================
// 单位定义
// ============================================================

export interface UnitDefData {
  displayName: string;
  tier?: 'L1' | 'L2' | 'L3';
  cost: { crystal: number; supply: number; time: number; industry?: number };
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
    displayName: '建造工兵',
    tier: 'L1',
    cost: { crystal: 100, supply: 1, time: 5 },
    stats: { hp: 80, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.0, damage: 5, dmgType: 'physical', range: 3, cooldown: 1.0, sight: 5 },
    attackEffect: 'melee',
  },
  unit_rifleman: {
    displayName: '水晶步枪兵',
    tier: 'L1',
    cost: { crystal: 150, supply: 1, time: 8 },
    stats: { hp: 120, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.2, damage: 18, dmgType: 'physical', range: 5, cooldown: 0.8, sight: 7 },
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
  // P2-D1: removed unit_basic_turret (orphan unit, never produced - bld_turret is the defense tower)
  // === L3 专属兵种 ===
  unit_arcane_guard: {
    displayName: '奥术守卫',
    tier: 'L3',
    cost: { crystal: 500, supply: 3, time: 25 },
    // P2-D4: armor shield->heavy (shield takes +50% magic, self-counter for a magic unit; heavy takes +25%)
    stats: { hp: 350, armor: 'heavy', armorValue: 15, category: 'infantry', speed: 1.8, damage: 30, dmgType: 'magic', range: 1, cooldown: 1.2, sight: 5 },
    attackEffect: 'melee',
    techReq: ['tech:arcane_legacy'],
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
  /** 批1: 建筑 exclusivity gate. faction/guild 不符的玩家无法建造此建筑。
   *  此前 bld_ancient_archive/bld_assembly_workshop 仅靠 AI 约定区分阵营，现显式化。 */
  exclusiveTo?: { faction?: FactionId; guild?: GuildId };
}

export const BUILDING_DEFS: Record<string, BuildingDefData> = {
  bld_cc_empire: {
    displayName: '帝国指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    // P1-D10: industry 50->65 to match federation CC (reduce early-game economic asymmetry)
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero_isabelle', 'hero_sebastian'],
    // 批3: CC 作为炼金协会/虚空研究院科技的兜底研究载体（这两行会暂无专属科技建筑，下一轮补 alchemy_lab/void_resonator）
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
      'tech:advanced_potions', 'tech:corrosion_amp', 'tech:solvent_bomb',
      'tech:void_amplify', 'tech:overload_mastery', 'tech:void_rift',
    ],
  },
  bld_cc_federation: {
    displayName: '联邦指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero_marcus', 'hero_eileen'],
    // 批3: CC 作为炼金协会/虚空研究院科技的兜底研究载体
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
      'tech:advanced_potions', 'tech:corrosion_amp', 'tech:solvent_bomb',
      'tech:void_amplify', 'tech:overload_mastery', 'tech:void_rift',
    ],
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
    // 批3: 追加法师公会科技线（teleport/charge/resonance/elemental_storm 超武解锁）
    researches: [
      'tech:arcane_legacy', 'tech:battle_mage_training', 'tech:mech_assembly', 'tech:production_line_optimized',
      'tech:teleport_network', 'tech:long_range_teleport', 'tech:charge_efficiency', 'tech:resonance_amp', 'tech:elemental_storm',
    ],
    // 批1: 显式化原 AI 约定 — 古代典籍馆是奥术帝国专属科技建筑
    exclusiveTo: { faction: 'arcane_empire' },
  },
  bld_assembly_workshop: {
    displayName: '流水线车间',
    cost: { crystal: 350, industry: 20, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: ['unit_hammer_squad'],
    // 批3: 追加机械行会科技线（repair/mech_armor/orbital_cannon 超武解锁）
    researches: [
      'tech:mech_assembly', 'tech:production_line_optimized',
      'tech:repair_protocol', 'tech:mech_armor', 'tech:orbital_cannon',
    ],
    // 批1: 显式化原 AI 约定 — 流水线车间是铁锤联邦专属科技建筑
    exclusiveTo: { faction: 'hammer_federation' },
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

/** P1-D2: get unit cost with faction/guild favoredBy discount (favored faction or guild -20% crystal) */
export function getUnitCostWithFaction(unitDefId: string, factionId?: string, guilds?: string[]) {
  const def = UNIT_DEFS[unitDefId];
  if (!def) return null;
  let crystal = def.cost.crystal;
  if (factionId && def.favoredBy && def.favoredBy.includes(factionId)) {
    crystal = Math.round(crystal * 0.8);
  }
  // P1-RES3: guild favoredBy discount (void_institute / alchemists_society etc.)
  if (guilds && guilds.length > 0 && def.favoredBy) {
    for (const g of guilds) {
      if (def.favoredBy.includes(g)) {
        crystal = Math.round(crystal * 0.8);
        break;
      }
    }
  }
  return { crystal, supply: def.cost.supply, time: def.cost.time };
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
    // P1-D10: startingIndustry 50->65 to match federation
    startingIndustry: 65,
    // P1-平衡: 起始单位与联邦对齐（4 worker + 2 rifleman），消除早期三重劣势
    startingUnits: [['unit_worker', 4], ['unit_rifleman', 2]],
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
    startingIndustry: 65, // P1-RES2: unify with CC provides.industry=65
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
  /** 批2: 科技 exclusivity gate. faction/guild 不符的玩家无法研究此科技。
   *  公会专属科技（如各行的超武解锁）仅对应行会玩家可研究。 */
  exclusiveTo?: { faction?: FactionId; guild?: GuildId };
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
    crystal: 300,
    time: 40,
    desc: '水晶采集 +15%',
  },
  'tech:refining_tech': {
    name: '精炼技术 L2',
    crystal: 500,
    time: 60,
    desc: '水晶采集 +25%（与L1叠加）',
    prerequisites: ['tech:crystal_smelting'],
  },
  'tech:arcane_legacy': {
    name: '奥术遗产',
    crystal: 400,
    time: 50,
    desc: '解锁奥术守卫训练',
  },
  // P0-4 修复：添加虚空过载优化科技（此前缺失，导致优化档位无法解锁）
  'tech:production_line_optimized': {
    name: '量产线优化',
    crystal: 300,
    time: 35,
    desc: '机械行会并行训练惩罚-5%；虚空过载时长延长至45秒',
  },

  // ============================================================
  // 批2: 公会专属科技树 — 4 行会各一条科技线 + 超武解锁科技
  // 数据来源：GAME_DATA.md §八（法师公会科技/奥术帝国科技）+ §四 超级武器
  //exclusiveTo.guild 门控在批3接入 execResearch/HUDScene/EconomyAI
  // ============================================================

  // --- 法师公会 (mages_guild) ---
  'tech:teleport_network': {
    name: '传送网络',
    crystal: 500,
    time: 60,
    desc: '解锁建筑：传送门（成对建造，瞬时传送单位）',
    exclusiveTo: { guild: 'mages_guild' },
  },
  'tech:long_range_teleport': {
    name: '远程传送',
    crystal: 600,
    time: 70,
    desc: '传送门距离翻倍',
    prerequisites: ['tech:teleport_network'],
    exclusiveTo: { guild: 'mages_guild' },
  },
  'tech:charge_efficiency': {
    name: '充能效率',
    crystal: 400,
    time: 50,
    desc: '奥术充能间隔 30s → 20s',
    exclusiveTo: { guild: 'mages_guild' },
  },
  'tech:resonance_amp': {
    name: '共鸣增幅',
    crystal: 700,
    time: 80,
    desc: '相邻法师塔攻击 +15%',
    exclusiveTo: { guild: 'mages_guild' },
  },
  'tech:elemental_storm': {
    name: '元素风暴',
    crystal: 2000,
    time: 150,
    desc: '解锁法师公会超级武器：元素风暴（12s 范围持续魔法伤害）',
    exclusiveTo: { guild: 'mages_guild' },
  },

  // --- 机械行会 (mechanists_guild) ---
  'tech:repair_protocol': {
    name: '维修协议',
    crystal: 450,
    time: 55,
    desc: '解锁建筑：维修站（周围机械自动回血）',
    exclusiveTo: { guild: 'mechanists_guild' },
  },
  'tech:mech_armor': {
    name: '机甲护甲',
    crystal: 550,
    time: 65,
    desc: '机械单位护甲 +30%',
    exclusiveTo: { guild: 'mechanists_guild' },
  },
  'tech:orbital_cannon': {
    name: '轨道魔导炮',
    crystal: 1800,
    time: 140,
    desc: '解锁机械行会超级武器：轨道魔导炮（单发 300 物理伤害）',
    exclusiveTo: { guild: 'mechanists_guild' },
  },

  // --- 炼金协会 (alchemists_society) ---
  'tech:advanced_potions': {
    name: '高级药剂',
    crystal: 450,
    time: 55,
    desc: '解锁建筑：炼金工坊（高级药剂，降低调制消耗）',
    exclusiveTo: { guild: 'alchemists_society' },
  },
  'tech:corrosion_amp': {
    name: '腐蚀增幅',
    crystal: 550,
    time: 65,
    desc: '腐蚀弹护甲削减 30% → 50%',
    prerequisites: ['tech:advanced_potions'],
    exclusiveTo: { guild: 'alchemists_society' },
  },
  'tech:solvent_bomb': {
    name: '万能溶剂炸弹',
    crystal: 1900,
    time: 145,
    desc: '解锁炼金协会超级武器：万能溶剂炸弹（20s 范围降护甲+腐蚀）',
    exclusiveTo: { guild: 'alchemists_society' },
  },

  // --- 虚空研究院 (void_institute) ---
  'tech:void_amplify': {
    name: '虚空增幅',
    crystal: 500,
    time: 60,
    desc: '解锁建筑：虚空共鸣器（矿脉额外采集站，加速枯竭）',
    exclusiveTo: { guild: 'void_institute' },
  },
  'tech:overload_mastery': {
    name: '过载精通',
    crystal: 600,
    time: 70,
    desc: '水晶过载不再损毁单位，仅进入冷却',
    prerequisites: ['tech:void_amplify'],
    exclusiveTo: { guild: 'void_institute' },
  },
  'tech:void_rift': {
    name: '虚空裂隙',
    crystal: 2100,
    time: 155,
    desc: '解锁虚空研究院超级武器：虚空裂隙（15s 持续伤害+随机传送）',
    exclusiveTo: { guild: 'void_institute' },
  },
};