/**
 * unitData 纯查询函数单元测试
 *
 * 覆盖 getBuildingCost / getUnitCostWithFaction / getBuildingProduces /
 * getDisplayName / getBuildingCategory / getFactionBonuses / createBuilding。
 * 数据完整性由 unitData.test.ts 覆盖，本文件聚焦函数行为与边界。
 */
import { describe, it, expect } from 'vitest';
import {
  getBuildingCost,
  getUnitCostWithFaction,
  getBuildingProduces,
  getDisplayName,
  getBuildingCategory,
  getFactionBonuses,
  createBuilding,
  BUILDING_DEFS,
  UNIT_DEFS,
} from './unitData';

// ============ getBuildingCost ============

describe('getBuildingCost', () => {
  it('返回建筑基础成本（无阵营 = buildCostMult 1）', () => {
    const c = getBuildingCost('bld_barracks');
    expect(c).not.toBeNull();
    expect(c!.crystal).toBe(300); // 300 * 1
    expect(c!.industry).toBe(20);
    expect(c!.time).toBe(20);
    expect(c!.providesSupply).toBe(20);
    expect(c!.providesIndustry).toBe(0);
  });

  it('帝国阵营 buildCostMult=1.0 不打折', () => {
    const c = getBuildingCost('bld_barracks', 'arcane_empire');
    expect(c!.crystal).toBe(300);
    expect(c!.industry).toBe(20);
  });

  it('联邦阵营 buildCostMult=0.80 打 8 折（四舍五入）', () => {
    const c = getBuildingCost('bld_barracks', 'hammer_federation');
    expect(c!.crystal).toBe(240); // 300 * 0.8 = 240
    expect(c!.industry).toBe(16); // 20 * 0.8 = 16
  });

  it('联邦折扣对 industry=0 的建筑仍为 0', () => {
    const c = getBuildingCost('bld_power_plant', 'hammer_federation');
    // cost.industry = 0, 0*0.8 = 0
    expect(c!.industry).toBe(0);
    expect(c!.crystal).toBe(200); // 250 * 0.8 = 200
  });

  it('time 字段不受阵营折扣影响', () => {
    const c = getBuildingCost('bld_barracks', 'hammer_federation');
    expect(c!.time).toBe(20);
  });

  it('未知建筑返回 null', () => {
    expect(getBuildingCost('bld_nonexistent')).toBeNull();
  });

  it('未知建筑 + 阵营仍返回 null', () => {
    expect(getBuildingCost('bld_nonexistent', 'hammer_federation')).toBeNull();
  });

  it('城墙 bld_wall 最便宜建筑成本', () => {
    const c = getBuildingCost('bld_wall');
    expect(c!.crystal).toBe(50);
    expect(c!.industry).toBe(0);
    expect(c!.time).toBe(5);
  });

  it('工厂 bld_factory 含 industry=40', () => {
    const c = getBuildingCost('bld_factory');
    expect(c!.crystal).toBe(500);
    expect(c!.industry).toBe(40);
    expect(c!.providesIndustry).toBe(30);
  });
});

// ============ getUnitCostWithFaction ============

describe('getUnitCostWithFaction', () => {
  it('无 favoredBy 的单位原价返回', () => {
    const c = getUnitCostWithFaction('unit_worker');
    expect(c).not.toBeNull();
    expect(c!.crystal).toBe(100);
    expect(c!.supply).toBe(1);
    expect(c!.time).toBe(5);
  });

  it('无 favoredBy 的单位传入任意阵营也不打折', () => {
    const c = getUnitCostWithFaction('unit_worker', 'arcane_empire');
    expect(c!.crystal).toBe(100);
  });

  it('favoredBy 阵营匹配时打 8 折（battle_mage + arcane_empire）', () => {
    const c = getUnitCostWithFaction('unit_battle_mage', 'arcane_empire');
    expect(c!.crystal).toBe(240); // 300 * 0.8 = 240
  });

  it('favoredBy 阵营不匹配时不打折（battle_mage + hammer_federation）', () => {
    const c = getUnitCostWithFaction('unit_battle_mage', 'hammer_federation');
    expect(c!.crystal).toBe(300);
  });

  it('favoredBy 公会匹配时打 8 折（grenadier + alchemists_society）', () => {
    const c = getUnitCostWithFaction('unit_grenadier', undefined, ['alchemists_society']);
    expect(c!.crystal).toBe(200); // 250 * 0.8 = 200
  });

  it('favoredBy 公会不匹配时不打折（grenadier + mages_guild）', () => {
    const c = getUnitCostWithFaction('unit_grenadier', undefined, ['mages_guild']);
    expect(c!.crystal).toBe(250);
  });

  it('favoredBy 公会空数组不打折', () => {
    const c = getUnitCostWithFaction('unit_grenadier', undefined, []);
    expect(c!.crystal).toBe(250);
  });

  it('favoredBy 公会数组中第一个匹配即打折（break）', () => {
    const c = getUnitCostWithFaction('unit_grenadier', undefined, ['mages_guild', 'alchemists_society']);
    expect(c!.crystal).toBe(200);
  });

  it('void_institute 公会折扣对 void_probe 生效', () => {
    const c = getUnitCostWithFaction('unit_void_probe', undefined, ['void_institute']);
    expect(c!.crystal).toBe(160); // 200 * 0.8 = 160
  });

  it('阵营 + 公会双重匹配只打一次 8 折（不叠加）', () => {
    // battle_mage favoredBy=['arcane_empire']，同时给阵营和无关公会
    const c = getUnitCostWithFaction('unit_battle_mage', 'arcane_empire', ['alchemists_society']);
    // 阵营匹配 -> 240；公会 alchemists 不在 favoredBy -> 不再打折
    expect(c!.crystal).toBe(240);
  });

  it('supply 与 time 不受折扣影响', () => {
    const c = getUnitCostWithFaction('unit_battle_mage', 'arcane_empire');
    expect(c!.supply).toBe(2);
    expect(c!.time).toBe(15);
  });

  it('未知单位返回 null', () => {
    expect(getUnitCostWithFaction('unit_nonexistent')).toBeNull();
  });

  it('L3 专属单位仍有成本查询', () => {
    const c = getUnitCostWithFaction('unit_arcane_guard');
    expect(c!.crystal).toBe(500);
  });
});

// ============ getBuildingProduces ============

describe('getBuildingProduces', () => {
  it('兵营可训练 10 种单位（含 L3 炼金巨像+腐蚀巨兽+霜脊守卫+翡翠佣兵剑士+翡翠斥候）', () => {
    const p = getBuildingProduces('bld_barracks');
    expect(p).toEqual(['unit_rifleman', 'unit_battle_mage', 'unit_arcane_heavy', 'unit_grenadier', 'unit_assault_worker', 'unit_alchemy_colossus', 'unit_corrosion_beast', 'unit_frost_guard', 'unit_mercenary_sword', 'unit_jade_scout']);
  });

  it('工厂可训练车辆类单位（含 L3 mobile_workshop/unstable_crystal/rune_titan/arcane_bastion/siege_engine）', () => {
    const p = getBuildingProduces('bld_factory');
    expect(p).toContain('unit_magitech_mech');
    expect(p).toContain('unit_transport');
    expect(p).toContain('unit_mobile_workshop');
    expect(p).toContain('unit_unstable_crystal');
    expect(p).toContain('unit_rune_titan');
    expect(p).toContain('unit_arcane_bastion');
    expect(p).toContain('unit_siege_engine');
  });

  it('采矿场 produces 为空数组', () => {
    expect(getBuildingProduces('bld_refinery')).toEqual([]);
  });

  it('城墙 produces 为空数组', () => {
    expect(getBuildingProduces('bld_wall')).toEqual([]);
  });

  it('古代典籍馆可训练奥术守卫', () => {
    const p = getBuildingProduces('bld_ancient_archive');
    expect(p).toContain('unit_arcane_guard');
  });

  it('未知建筑返回空数组（?? 短路）', () => {
    expect(getBuildingProduces('bld_nonexistent')).toEqual([]);
  });

  it('返回的是定义里的引用（未做防御性拷贝）', () => {
    const p = getBuildingProduces('bld_barracks');
    expect(p).toBe(BUILDING_DEFS['bld_barracks'].produces);
  });
});

// ============ getDisplayName ============

describe('getDisplayName', () => {
  it('单位 id 返回中文显示名', () => {
    expect(getDisplayName('unit_worker')).toBe('建造工兵');
    expect(getDisplayName('unit_rifleman')).toBe('水晶步枪兵');
  });

  it('建筑 id 返回中文显示名', () => {
    expect(getDisplayName('bld_barracks')).toBe('兵营');
    expect(getDisplayName('bld_turret')).toBe('炮塔');
  });

  it('英雄 id 不在 UNIT/BUILDING_DEFS 中，回退返回原 id', () => {
    // HERO_DEFS 不被此函数查询
    expect(getDisplayName('hero_isabelle')).toBe('hero_isabelle');
  });

  it('未知 id 回退返回原 id', () => {
    expect(getDisplayName('unknown_thing')).toBe('unknown_thing');
  });

  it('空字符串回退返回空字符串', () => {
    expect(getDisplayName('')).toBe('');
  });

  it('优先单位定义（同名时单位优先于建筑）', () => {
    // 无同名场景，仅验证 unit 优先查找路径
    expect(getDisplayName('unit_worker')).toBe(UNIT_DEFS['unit_worker'].displayName);
  });
});

// ============ getBuildingCategory ============

describe('getBuildingCategory', () => {
  it('bld_wall 归类为 defense', () => {
    expect(getBuildingCategory('bld_wall')).toBe('defense');
  });

  it('bld_turret 归类为 defense', () => {
    expect(getBuildingCategory('bld_turret')).toBe('defense');
  });

  it('bld_refinery 归类为 resource', () => {
    expect(getBuildingCategory('bld_refinery')).toBe('resource');
  });

  it('bld_power_plant 归类为 resource', () => {
    expect(getBuildingCategory('bld_power_plant')).toBe('resource');
  });

  it('bld_ancient_archive 归类为 tech', () => {
    expect(getBuildingCategory('bld_ancient_archive')).toBe('tech');
  });

  it('bld_assembly_workshop 归类为 tech', () => {
    expect(getBuildingCategory('bld_assembly_workshop')).toBe('tech');
  });

  it('bld_barracks 默认归类为 production', () => {
    expect(getBuildingCategory('bld_barracks')).toBe('production');
  });

  it('bld_factory 默认归类为 production', () => {
    expect(getBuildingCategory('bld_factory')).toBe('production');
  });

  it('bld_cc_empire 默认归类为 production', () => {
    expect(getBuildingCategory('bld_cc_empire')).toBe('production');
  });

  it('未知 id 默认归类为 production', () => {
    expect(getBuildingCategory('bld_nonexistent')).toBe('production');
  });

  it('空字符串默认归类为 production', () => {
    expect(getBuildingCategory('')).toBe('production');
  });
});

// ============ getFactionBonuses ============

describe('getFactionBonuses', () => {
  it('奥术帝国 bonuses 完整返回', () => {
    const b = getFactionBonuses('arcane_empire');
    expect(b.buildCostMult).toBe(1.0);
    expect(b.productionSpeedMult).toBe(0.95);
    expect(b.researchSpeedMult).toBe(0.85);
    expect(b.magicDmgMult).toBe(1.1);
  });

  it('铁锤联邦 bonuses 完整返回', () => {
    const b = getFactionBonuses('hammer_federation');
    expect(b.buildCostMult).toBe(0.80);
    expect(b.productionSpeedMult).toBe(0.85);
    expect(b.researchSpeedMult).toBe(1.0);
    expect(b.magicDmgMult).toBe(1.0);
  });

  it('未知阵营返回默认全 1.0 的 bonuses', () => {
    const b = getFactionBonuses('unknown_faction');
    expect(b.buildCostMult).toBe(1);
    expect(b.productionSpeedMult).toBe(1);
    expect(b.researchSpeedMult).toBe(1);
    expect(b.magicDmgMult).toBe(1);
  });

  it('空字符串返回默认 bonuses', () => {
    const b = getFactionBonuses('');
    expect(b.buildCostMult).toBe(1);
  });
});

// ============ createBuilding ============

describe('createBuilding', () => {
  it('造一个兵营：hp/buildingType/spriteKey/provides 正确', () => {
    const b = createBuilding(0, 'arcane_empire', 'bld_barracks', 3, 4);
    expect(b.owner).toBe(0);
    expect(b.faction).toBe('arcane_empire');
    expect(b.tileX).toBe(3);
    expect(b.tileY).toBe(4);
    expect(b.maxHp).toBe(800);
    expect(b.hp).toBe(800);
    expect(b.buildingType).toBe('production');
    expect(b.spriteKey).toBe('bld_barracks');
    expect(b.providesSupply).toBe(20);
    expect(b.providesIndustry).toBe(0);
    expect(b.state).toBe('constructing');
  });

  it('造一个炮塔：注入战斗属性 damage/range/cooldown/dmgType', () => {
    const b = createBuilding(0, 'arcane_empire', 'bld_turret', 1, 1);
    expect(b.attackDamage).toBe(25);
    expect(b.attackRange).toBe(6);
    expect(b.attackCooldown).toBe(1.2);
    expect(b.attackType).toBe('physical');
    expect(b.buildingType).toBe('defense');
  });

  it('造一个非战斗建筑：战斗属性保持默认 0', () => {
    const b = createBuilding(0, 'arcane_empire', 'bld_barracks', 1, 1);
    expect(b.attackDamage).toBe(0);
    expect(b.attackRange).toBe(0);
  });

  it('联邦阵营造兵营：成本折扣不影响 Building 实例字段（createBuilding 不设 cost 字段）', () => {
    const b = createBuilding(0, 'hammer_federation', 'bld_barracks', 1, 1);
    // Building 不存 cost，折扣由 getBuildingCost 在扣费时算
    expect(b.faction).toBe('hammer_federation');
    expect(b.providesSupply).toBe(20);
  });

  it('未知建筑 defId：用兜底 hp=800、production 类别', () => {
    const b = createBuilding(0, 'arcane_empire', 'bld_nonexistent', 1, 1);
    expect(b.maxHp).toBe(800);
    expect(b.buildingType).toBe('production');
    expect(b.providesSupply).toBe(0);
    expect(b.providesIndustry).toBe(0);
  });

  it('id 每次生成都唯一', () => {
    const b1 = createBuilding(0, 'arcane_empire', 'bld_barracks', 1, 1);
    const b2 = createBuilding(0, 'arcane_empire', 'bld_barracks', 1, 1);
    expect(b1.id).not.toBe(b2.id);
  });

  it('owner 传入敌方阵营 faction 时 faction 字段保留传入值', () => {
    const b = createBuilding(1, 'hammer_federation', 'bld_barracks', 1, 1);
    expect(b.owner).toBe(1);
    expect(b.faction).toBe('hammer_federation');
  });
});
