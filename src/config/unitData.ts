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
  // 批2: 霜脊王国专属单位
  unit_frost_guard: {
    displayName: '霜脊守卫',
    tier: 'L3',
    cost: { crystal: 400, supply: 3, time: 28 },
    stats: { hp: 500, armor: 'heavy', armorValue: 30, category: 'infantry', speed: 1.4, damage: 22, dmgType: 'physical', range: 1, cooldown: 1.4, sight: 5 },
    attackEffect: 'melee',
    exclusiveTo: { faction: 'frostridge_kingdom' },
    // 特性"固守:护甲翻倍"由 UnitSpecialSystem 接驻守状态处理
  },
  unit_crystal_catapult: {
    displayName: '水晶投石车',
    tier: 'L3',
    cost: { crystal: 500, supply: 3, time: 24 },
    stats: { hp: 300, armor: 'mechanical', armorValue: 5, category: 'vehicle', speed: 1.6, damage: 60, dmgType: 'crystal', range: 10, cooldown: 2.5, sight: 8 },
    attackEffect: 'proj_cannon',
    favoredBy: ['frostridge_kingdom'],
    exclusiveTo: { faction: 'frostridge_kingdom' },
  },
  // 批2: 深矿破坏者 — 霜脊+虚空研究院组合专属，首批 bio 护甲 + crystal 伤害单位
  unit_deep_destroyer: {
    displayName: '深矿破坏者',
    tier: 'L3',
    cost: { crystal: 600, supply: 4, time: 30 },
    stats: { hp: 600, armor: 'bio', armorValue: 4, category: 'infantry', speed: 2.0, damage: 45, dmgType: 'crystal', range: 4, cooldown: 1.8, sight: 7 },
    attackEffect: 'proj_magic_bolt',
    exclusiveTo: { faction: 'frostridge_kingdom', guild: 'void_institute' },
    // 特性"攻击附带水晶碎片溅射"由 UnitSpecialSystem + CombatSystem 处理
  },
  // 批3: 翡翠邦联专属单位
  unit_jade_scout: {
    displayName: '翡翠斥候',
    tier: 'L3',
    cost: { crystal: 250, supply: 2, time: 12 },
    stats: { hp: 90, armor: 'light', armorValue: 0, category: 'infantry', speed: 4.5, damage: 0, dmgType: 'physical', range: 0, cooldown: 1.0, sight: 12 },
    attackEffect: 'melee',
    exclusiveTo: { faction: 'jade_confederation' },
    // 特性"永久隐形+标记30秒"由 UnitSpecialSystem 处理
  },
  unit_mercenary_sword: {
    displayName: '佣兵剑士',
    tier: 'L2',
    cost: { crystal: 200, supply: 2, time: 14 },
    stats: { hp: 130, armor: 'light', armorValue: 1, category: 'infantry', speed: 2.2, damage: 22, dmgType: 'physical', range: 1, cooldown: 1.2, sight: 6 },
    attackEffect: 'melee',
    favoredBy: ['jade_confederation'],
    exclusiveTo: { faction: 'jade_confederation' },
  },
  unit_grenadier: {
    displayName: '掷弹兵',
    tier: 'L2',
    cost: { crystal: 250, supply: 2, time: 14 },
    stats: { hp: 100, armor: 'light', armorValue: 1, category: 'infantry', speed: 2.4, damage: 30, dmgType: 'alchemy', range: 4, cooldown: 1.5, sight: 5 },
    attackEffect: 'proj_cannon',
    favoredBy: ['alchemists_society'],
  },

  // ============================================================
  // L3 单位 — 行会专属 / 组合专属（需对应行会 + 科技前置）
  // 机制: arcane_cannon→充能×3(待实现); mobile_workshop→移动维修光环(待实现);
  //       alchemy_colossus→死亡自爆300 AOE(待实现); unstable_crystal→部署10s后爆炸500 AOE(待实现);
  //       rune_titan→符文双模式(待实现)
  // ============================================================
  unit_arcane_cannon: {
    displayName: '秘法炮台',
    tier: 'L3',
    cost: { crystal: 600, supply: 4, time: 30 },
    stats: { hp: 350, armor: 'structure', armorValue: 8, category: 'infantry', speed: 0.5, damage: 40, dmgType: 'magic', range: 7, cooldown: 2.5, sight: 8 },
    attackEffect: 'proj_magic_bolt',
    techReq: ['tech:arcane_legacy'],
    exclusiveTo: { faction: 'arcane_empire', guild: 'mages_guild' },
  },
  unit_mobile_workshop: {
    displayName: '移动工坊',
    tier: 'L3',
    cost: { crystal: 450, supply: 3, time: 25 },
    stats: { hp: 300, armor: 'mechanical', armorValue: 5, category: 'vehicle', speed: 1.8, damage: 0, dmgType: 'physical', range: 0, cooldown: 1, sight: 6 },
    attackEffect: 'melee',
    techReq: ['tech:mech_assembly'],
    exclusiveTo: { faction: 'hammer_federation', guild: 'mechanists_guild' },
  },
  unit_alchemy_colossus: {
    displayName: '炼金巨像',
    tier: 'L3',
    cost: { crystal: 700, supply: 5, time: 35 },
    stats: { hp: 800, armor: 'bio', armorValue: 3, category: 'infantry', speed: 1.4, damage: 45, dmgType: 'alchemy', range: 1, cooldown: 1.8, sight: 6 },
    attackEffect: 'melee',
    techReq: ['tech:advanced_potions'],
    exclusiveTo: { guild: 'alchemists_society' },
  },
  unit_unstable_crystal: {
    displayName: '不稳定水晶炸弹',
    tier: 'L3',
    cost: { crystal: 300, supply: 2, time: 15 },
    stats: { hp: 120, armor: 'light', armorValue: 0, category: 'infantry', speed: 2.8, damage: 0, dmgType: 'crystal', range: 0, cooldown: 1, sight: 5 },
    attackEffect: 'melee',
    techReq: ['tech:void_amplify'],
    exclusiveTo: { guild: 'void_institute' },
  },
  unit_rune_titan: {
    displayName: '符文泰坦',
    tier: 'L3',
    cost: { crystal: 900, supply: 6, time: 40 },
    stats: { hp: 1200, armor: 'mechanical', armorValue: 12, category: 'vehicle', speed: 1.2, damage: 70, dmgType: 'physical', range: 5, cooldown: 2.0, sight: 7 },
    attackEffect: 'proj_cannon',
    techReq: ['tech:arcane_legacy', 'tech:mech_assembly'],
    exclusiveTo: { faction: 'arcane_empire', guild: 'mechanists_guild' },
  },
  unit_arcane_bastion: {
    displayName: '奥术壁垒',
    tier: 'L3',
    cost: { crystal: 650, supply: 4, time: 35 },
    stats: { hp: 500, armor: 'heavy', armorValue: 6, category: 'infantry', speed: 1.0, damage: 45, dmgType: 'magic', range: 7, cooldown: 2.5, sight: 8 },
    attackEffect: 'proj_magic_bolt',
    techReq: ['tech:arcane_legacy'],
    exclusiveTo: { faction: 'hammer_federation', guild: 'mages_guild' },
  },
  unit_corrosion_beast: {
    displayName: '腐蚀巨兽',
    tier: 'L3',
    cost: { crystal: 550, supply: 4, time: 28 },
    stats: { hp: 600, armor: 'bio', armorValue: 4, category: 'infantry', speed: 2.0, damage: 35, dmgType: 'alchemy', range: 3, cooldown: 1.5, sight: 6 },
    attackEffect: 'melee',
    techReq: ['tech:advanced_potions'],
    exclusiveTo: { faction: 'hammer_federation', guild: 'alchemists_society' },
  },
  unit_void_walker: {
    displayName: '虚空行者',
    tier: 'L3',
    cost: { crystal: 500, supply: 3, time: 25 },
    stats: { hp: 350, armor: 'light', armorValue: 2, category: 'infantry', speed: 3.0, damage: 45, dmgType: 'void', range: 4, cooldown: 1.2, sight: 8 },
    attackEffect: 'melee',
    techReq: ['tech:void_amplify'],
    exclusiveTo: { faction: 'arcane_empire', guild: 'void_institute' },
  },
  unit_siege_engine: {
    displayName: '魔导攻城炮',
    tier: 'L3',
    cost: { crystal: 550, supply: 4, time: 30 },
    stats: { hp: 450, armor: 'mechanical', armorValue: 7, category: 'vehicle', speed: 1.0, damage: 80, dmgType: 'physical', range: 8, cooldown: 3.0, sight: 7 },
    attackEffect: 'proj_cannon',
    techReq: ['tech:mech_assembly'],
    exclusiveTo: { guild: 'mechanists_guild' },
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
    // 批C/D: 炼金/虚空科技迁移到专属建筑 bld_alchemy_lab/bld_void_resonator（CC 仅保留通用科技）
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
    ],
  },
  bld_cc_federation: {
    displayName: '联邦指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero_marcus', 'hero_eileen'],
    // 批C/D: 炼金/虚空科技迁移到专属建筑 bld_alchemy_lab/bld_void_resonator（CC 仅保留通用科技）
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
    ],
  },
  // 批2: 霜脊王国指挥中心（数值与帝国/联邦 CC 对齐，保证起手经济公平）
  bld_cc_frostridge: {
    displayName: '霜脊指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero_frost_a', 'hero_frost_b'],
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
      'tech:deep_mining', 'tech:frost_fortification',
    ],
  },
  // 批3: 翡翠邦联指挥中心（数值对齐）
  bld_cc_jade: {
    displayName: '翡翠指挥中心',
    cost: { crystal: 0, industry: 0, time: 0 },
    hp: 2000,
    provides: { supply: 50, industry: 65 },
    produces: ['unit_worker', 'hero_jade_a', 'hero_jade_b'],
    researches: [
      'tech:advanced_mining', 'tech:crystal_smelting', 'tech:refining_tech', 'tech:infantry_armor', 'tech:structure_reinforce',
      'tech:trade_network', 'tech:mercenary_contract',
    ],
  },
  bld_barracks: {
    displayName: '兵营',
    cost: { crystal: 300, industry: 20, time: 20 },
    hp: 800,
    provides: { supply: 20, industry: 0 },
    produces: ['unit_rifleman', 'unit_battle_mage', 'unit_arcane_heavy', 'unit_grenadier', 'unit_assault_worker', 'unit_alchemy_colossus', 'unit_corrosion_beast', 'unit_frost_guard', 'unit_mercenary_sword', 'unit_jade_scout'],
  },
  bld_factory: {
    displayName: '工厂',
    cost: { crystal: 500, industry: 40, time: 30 },
    hp: 1000,
    provides: { supply: 20, industry: 30 },
    produces: ['unit_magitech_mech', 'unit_scout_bike', 'unit_transport', 'unit_hammer_squad', 'unit_void_probe', 'unit_mobile_workshop', 'unit_unstable_crystal', 'unit_rune_titan', 'unit_arcane_bastion', 'unit_siege_engine', 'unit_crystal_catapult', 'unit_deep_destroyer'],
  },
  bld_refinery: {
    displayName: '采矿场',
    cost: { crystal: 400, industry: 30, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: [],
  },
  // 批2: 霜脊深矿竖井 — 替代采矿场，产量+50%（ResourceSystem 把它当 refinery 识别并应用加成），建造+50%时间
  bld_deep_mine: {
    displayName: '深矿竖井',
    cost: { crystal: 400, industry: 30, time: 38 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: [],
    exclusiveTo: { faction: 'frostridge_kingdom' },
  },
  // 批3: 翡翠交易所 — 水晶与工业产值兑换建筑（专属经济建筑）
  bld_trade_post: {
    displayName: '交易所',
    cost: { crystal: 350, industry: 20, time: 22 },
    hp: 700,
    provides: { supply: 0, industry: 15 },
    produces: [],
    exclusiveTo: { faction: 'jade_confederation' },
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
    produces: ['unit_arcane_guard', 'unit_arcane_cannon', 'unit_void_walker'],
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

  // ============================================================
  // 批B/C/D/A: 4 公会专属建筑（需对应行会 + 解锁科技）
  // 机制: 维修站→BuildingSystem光环; 炼金工坊→药剂折扣+研究载体;
  //       虚空共鸣器→ResourceSystem加速采集; 传送门→成对瞬传(待实现)
  // ============================================================
  bld_repair_depot: {
    displayName: '维修站',
    cost: { crystal: 300, industry: 20, time: 25 },
    hp: 500,
    provides: { supply: 0, industry: 0 },
    produces: [],
    // 机制在 BuildingSystem._updateRepairDepots: 周围6格友方机械每秒回血 maxHp*3%
    exclusiveTo: { guild: 'mechanists_guild' },
  },
  bld_alchemy_lab: {
    displayName: '炼金工坊',
    cost: { crystal: 350, industry: 20, time: 25 },
    hp: 600,
    provides: { supply: 0, industry: 10 },
    produces: [],
    // 作为炼金协会科技载体（从 CC 迁移过来：advanced_potions/corrosion_amp/solvent_bomb）
    researches: ['tech:advanced_potions', 'tech:corrosion_amp', 'tech:solvent_bomb'],
    // 机制: 拥有此建筑时药剂调制消耗 -25%（在 GameScene Q键 / MilitaryAI 处查询）
    exclusiveTo: { guild: 'alchemists_society' },
  },
  bld_void_resonator: {
    displayName: '虚空共鸣器',
    cost: { crystal: 400, industry: 30, time: 30 },
    hp: 500,
    provides: { supply: 0, industry: 0 },
    produces: [],
    // 机制在 ResourceSystem: 矿脉附近有共鸣器时采集 ×1.5（同时加速枯竭）
    exclusiveTo: { guild: 'void_institute' },
  },
  bld_teleport_gate: {
    displayName: '传送门',
    cost: { crystal: 450, industry: 25, time: 30 },
    hp: 600,
    provides: { supply: 0, industry: 0 },
    produces: [],
    // 机制: 成对建造，单位进入一端瞬移到另一端（消耗水晶按距离）— 待批A 实现
    exclusiveTo: { guild: 'mages_guild' },
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
  if (defId === 'bld_refinery' || defId === 'bld_power_plant' || defId === 'bld_void_resonator') return 'resource';
  if (defId === 'bld_ancient_archive' || defId === 'bld_assembly_workshop' || defId === 'bld_alchemy_lab') return 'tech';
  if (defId === 'bld_repair_depot' || defId === 'bld_teleport_gate') return 'utility';
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
    /** 批2: 水晶采集倍率 (霜脊 1.25 = 采集+25%)；默认 1.0 */
    crystalGatherMult?: number;
    /** 批2: 护甲加成倍率 (霜脊 1.1 = 护甲+10%)；默认 1.0 */
    armorBonusMult?: number;
    /** 批3: 单位移速倍率 (翡翠 1.1 = 移速+10%)；默认 1.0 */
    moveSpeedMult?: number;
  };
  // ---- 批1: 数据驱动字段（消除 AI/GameScene 硬编码 faction 分支） ----
  /** 科技/经济倾向建筑 id（替代 EconomyAI 的 faction?bld_a:bld_b 硬编码） */
  techBuilding: string;
  /** 该王国英雄 id 列表（替代 heroData.getFactionHero 硬编码） */
  heroIds: string[];
  /** 指挥中心建筑 id（替代 GameScene/GameWorld/EconomyAI 的 CC 映射硬编码） */
  ccBuilding: string;
  /** AI 偏好单位三元组（替代 StrategyManager.getFactionUnits 硬编码） */
  preferredUnits: { rifleman: string; elite: string; tier2: string };
  /** 反制单位（敌方重甲/轻甲多时追加训练；替代 EconomyAI:419/425 硬编码） */
  counterUnits?: { vsHeavy?: string; vsLight?: string };
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
    // 批1: 数据驱动字段（值取自原 EconomyAI/StrategyManager/GameScene 硬编码，行为不变）
    techBuilding: 'bld_ancient_archive',
    heroIds: ['hero_isabelle', 'hero_sebastian'],
    ccBuilding: 'bld_cc_empire',
    preferredUnits: { rifleman: 'unit_rifleman', elite: 'unit_arcane_guard', tier2: 'unit_magitech_mech' },
    counterUnits: { vsHeavy: 'unit_arcane_heavy' },
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
    techBuilding: 'bld_assembly_workshop',
    heroIds: ['hero_marcus', 'hero_eileen'],
    ccBuilding: 'bld_cc_federation',
    preferredUnits: { rifleman: 'unit_rifleman', elite: 'unit_hammer_squad', tier2: 'unit_magitech_mech' },
    counterUnits: { vsLight: 'unit_assault_worker' },
  },
  // 批2: 霜脊王国 — 固守型，水晶采集+25%，护甲+10%
  frostridge_kingdom: {
    name: '霜脊王国',
    econPassive: '水晶采集速度 +25%',
    milPassive: '所有单位护甲 +10%',
    startingCrystal: 2500,
    startingIndustry: 40,
    startingUnits: [['unit_worker', 3], ['unit_frost_guard', 1]],
    bonuses: {
      buildCostMult: 1.0,
      productionSpeedMult: 1.0,
      researchSpeedMult: 1.0,
      magicDmgMult: 1.0,
      crystalGatherMult: 1.25,
      armorBonusMult: 1.1,
    },
    // 批2: 霜脊无独立科技建筑，复用古代典籍馆（与帝国共用）；CC 用霜脊专属
    techBuilding: 'bld_ancient_archive',
    heroIds: ['hero_frost_a', 'hero_frost_b'],
    ccBuilding: 'bld_cc_frostridge',
    preferredUnits: { rifleman: 'unit_rifleman', elite: 'unit_frost_guard', tier2: 'unit_crystal_catapult' },
    counterUnits: { vsHeavy: 'unit_frost_guard' },
  },
  // 批3: 翡翠邦联 — 灵活型，研究+10%/贸易+15%，移速+10%
  jade_confederation: {
    name: '翡翠邦联',
    econPassive: '研究速度 +10%, 贸易收入 +15%',
    milPassive: '单位移速 +10%',
    startingCrystal: 1800,
    startingIndustry: 60,
    startingUnits: [['unit_worker', 3], ['unit_jade_scout', 1]],
    bonuses: {
      buildCostMult: 1.0,
      productionSpeedMult: 1.0,
      researchSpeedMult: 0.9,
      magicDmgMult: 1.0,
      moveSpeedMult: 1.1,
    },
    techBuilding: 'bld_ancient_archive',
    heroIds: ['hero_jade_a', 'hero_jade_b'],
    ccBuilding: 'bld_cc_jade',
    preferredUnits: { rifleman: 'unit_rifleman', elite: 'unit_mercenary_sword', tier2: 'unit_jade_scout' },
    counterUnits: { vsHeavy: 'unit_mercenary_sword' },
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
    crystal: 150,
    time: 25,
    desc: '工人采集 +20%',
  },
  'tech:infantry_armor': {
    name: '步兵护甲 L1',
    crystal: 180,
    time: 28,
    desc: '步兵 +5 护甲',
  },
  'tech:structure_reinforce': {
    name: '建筑加固 L1',
    crystal: 220,
    time: 32,
    desc: '建筑 HP +20%',
  },
  'tech:battle_mage_training': {
    name: '战斗法师训练',
    crystal: 150,
    time: 25,
    desc: '解锁战斗法师训练',
  },
  'tech:mech_assembly': {
    name: '机甲装配技术',
    crystal: 250,
    time: 30,
    desc: '解锁魔导机甲制造',
  },
  'tech:crystal_smelting': {
    name: '水晶冶炼 L1',
    crystal: 220,
    time: 30,
    desc: '水晶采集 +15%',
  },
  'tech:refining_tech': {
    name: '精炼技术 L2',
    crystal: 350,
    time: 45,
    desc: '水晶采集 +25%（与L1叠加）',
    prerequisites: ['tech:crystal_smelting'],
  },
  'tech:arcane_legacy': {
    name: '奥术遗产',
    crystal: 300,
    time: 40,
    desc: '解锁奥术守卫训练',
  },
  // P0-4 修复：添加虚空过载优化科技（此前缺失，导致优化档位无法解锁）
  'tech:production_line_optimized': {
    name: '量产线优化',
    crystal: 220,
    time: 30,
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
  // 批2: 霜脊王国专属科技
  'tech:deep_mining': {
    name: '深矿开采',
    crystal: 350,
    time: 45,
    desc: '解锁霜脊王国专属建筑：深矿竖井（替代采矿场，产量+50%）',
    exclusiveTo: { faction: 'frostridge_kingdom' },
  },
  'tech:frost_fortification': {
    name: '霜脊筑城术',
    crystal: 400,
    time: 50,
    desc: '霜脊守卫固守时附加护盾100，建筑HP+15%',
    exclusiveTo: { faction: 'frostridge_kingdom' },
  },
  'tech:trade_network': {
    name: '贸易网络',
    crystal: 300,
    time: 40,
    desc: '解锁翡翠邦联专属建筑：交易所（水晶与工业产值兑换）',
    exclusiveTo: { faction: 'jade_confederation' },
  },
  'tech:mercenary_contract': {
    name: '佣兵契约',
    crystal: 350,
    time: 45,
    desc: '翡翠斥候标记目标受额外伤害，佣兵剑士造价-20%',
    exclusiveTo: { faction: 'jade_confederation' },
  },
};