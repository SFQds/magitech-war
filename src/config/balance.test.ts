/**
 * 配置层测试 — balance 常量 + getUnitCostWithFaction 阵营折扣
 *
 * 覆盖：
 *  - balance.ts 常量值不变（全局平衡单一事实来源，回归网）
 *  - getUnitCostWithFaction：favoredBy 阵营 -20% 水晶
 *  - getUnitCostWithFaction：favoredBy 行会 -20% 水晶
 *  - getUnitCostWithFaction：非 favored 阵营原价
 *  - getUnitCostWithFaction：未知 unitDefId 返回 null
 *  - 真实 UNIT_DEFS 数据（战斗法师 favoredBy arcane_empire 等）
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_CRYSTAL,
  GATHER_BASE_AMOUNT,
  GATHER_NO_REFINERY_CAP,
  GATHER_TICK_INTERVAL,
  INDUSTRY_REGEN_BASE,
  INDUSTRY_REGEN_PER_OUTPUT,
  AI_RESCUE_CRYSTAL_MIN,
} from './balance';
import { getUnitCostWithFaction, UNIT_DEFS, BUILDING_DEFS, TECH_DEFS } from './unitData';
import { HERO_DEFS } from './heroData';

describe('balance.ts — 全局平衡常量（单一事实来源）', () => {
  it('水晶上限 = 20000', () => {
    expect(MAX_CRYSTAL).toBe(20000);
  });
  it('工人基础采集量 = 10', () => {
    expect(GATHER_BASE_AMOUNT).toBe(10);
  });
  it('无精炼厂采集上限 = 3', () => {
    expect(GATHER_NO_REFINERY_CAP).toBe(3);
  });
  it('采集 tick 间隔 = 1.0 秒', () => {
    expect(GATHER_TICK_INTERVAL).toBe(1.0);
  });
  it('工业再生基础速率 = 0.5', () => {
    expect(INDUSTRY_REGEN_BASE).toBe(0.5);
  });
  it('工业再生每点产出加成 = 0.03', () => {
    expect(INDUSTRY_REGEN_PER_OUTPUT).toBe(0.03);
  });
  it('AI 安全网最低水晶 = 100', () => {
    expect(AI_RESCUE_CRYSTAL_MIN).toBe(100);
  });
});

describe('getUnitCostWithFaction — 阵营/行会 favoredBy 折扣', () => {
  it('favoredBy 阵营 -20% 水晶', () => {
    // 战斗法师 crystal 300, favoredBy arcane_empire
    const cost = getUnitCostWithFaction('unit_battle_mage', 'arcane_empire');
    expect(cost).not.toBeNull();
    expect(cost!.crystal).toBe(Math.round(300 * 0.8)); // 240
    expect(cost!.supply).toBe(2);
    expect(cost!.time).toBe(15);
  });

  it('非 favoredBy 阵营原价', () => {
    const cost = getUnitCostWithFaction('unit_battle_mage', 'hammer_federation');
    expect(cost!.crystal).toBe(300);
  });

  it('favoredBy 行会 -20% 水晶', () => {
    // 虚空探针 crystal 200, favoredBy void_institute
    const cost = getUnitCostWithFaction('unit_void_probe', undefined, ['void_institute']);
    expect(cost!.crystal).toBe(Math.round(200 * 0.8)); // 160
  });

  it('非 favoredBy 行会原价', () => {
    const cost = getUnitCostWithFaction('unit_void_probe', undefined, ['mages_guild']);
    expect(cost!.crystal).toBe(200);
  });

  it('favoredBy 阵营与行会同时命中时顺序叠加（实际行为：300*0.8*0.8=192）', () => {
    // 战斗法师 favoredBy=['arcane_empire']；faction 和 guilds 都命中 → 两次 -20%
    const cost = getUnitCostWithFaction('unit_battle_mage', 'arcane_empire', ['arcane_empire']);
    expect(cost!.crystal).toBe(Math.round(Math.round(300 * 0.8) * 0.8)); // 240 -> 192
  });

  it('无阵营无行会 → 原价', () => {
    const cost = getUnitCostWithFaction('unit_battle_mage');
    expect(cost!.crystal).toBe(300);
  });

  it('未知 unitDefId 返回 null', () => {
    expect(getUnitCostWithFaction('unit_does_not_exist')).toBeNull();
  });
});

describe('UNIT_DEFS — 真实数据完整性', () => {
  it('战斗法师 favoredBy arcane_empire', () => {
    expect(UNIT_DEFS['unit_battle_mage'].favoredBy).toEqual(['arcane_empire']);
  });

  it('魔导机甲 favoredBy hammer_federation', () => {
    expect(UNIT_DEFS['unit_magitech_mech'].favoredBy).toEqual(['hammer_federation']);
  });

  it('虚空探针 favoredBy void_institute', () => {
    expect(UNIT_DEFS['unit_void_probe'].favoredBy).toEqual(['void_institute']);
  });
});

describe('balance.ts - 关系不变量与值域合理性', () => {
  it('GATHER_NO_REFINERY_CAP < GATHER_BASE_AMOUNT', () => {
    expect(GATHER_NO_REFINERY_CAP).toBeLessThan(GATHER_BASE_AMOUNT);
  });

  it('GATHER_BASE_AMOUNT < MAX_CRYSTAL', () => {
    expect(GATHER_BASE_AMOUNT).toBeLessThan(MAX_CRYSTAL);
  });

  it('GATHER_TICK_INTERVAL 是正有限数', () => {
    expect(GATHER_TICK_INTERVAL).toBeGreaterThan(0);
    expect(Number.isFinite(GATHER_TICK_INTERVAL)).toBe(true);
  });

  it('INDUSTRY_REGEN_BASE 和 INDUSTRY_REGEN_PER_OUTPUT 为正', () => {
    expect(INDUSTRY_REGEN_BASE).toBeGreaterThan(0);
    expect(INDUSTRY_REGEN_PER_OUTPUT).toBeGreaterThan(0);
  });

  it('AI_RESCUE_CRYSTAL_MIN < MAX_CRYSTAL', () => {
    expect(AI_RESCUE_CRYSTAL_MIN).toBeLessThan(MAX_CRYSTAL);
  });

  it('所有 balance 常量是有限数', () => {
    const all = [MAX_CRYSTAL, GATHER_BASE_AMOUNT, GATHER_NO_REFINERY_CAP, GATHER_TICK_INTERVAL, INDUSTRY_REGEN_BASE, INDUSTRY_REGEN_PER_OUTPUT, AI_RESCUE_CRYSTAL_MIN];
    for (const v of all) expect(Number.isFinite(v)).toBe(true);
  });

  it('所有 balance 常量非负', () => {
    const all = [MAX_CRYSTAL, GATHER_BASE_AMOUNT, GATHER_NO_REFINERY_CAP, GATHER_TICK_INTERVAL, INDUSTRY_REGEN_BASE, INDUSTRY_REGEN_PER_OUTPUT, AI_RESCUE_CRYSTAL_MIN];
    for (const v of all) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('AI_RESCUE_CRYSTAL_MIN >= GATHER_BASE_AMOUNT', () => {
    expect(AI_RESCUE_CRYSTAL_MIN).toBeGreaterThanOrEqual(GATHER_BASE_AMOUNT);
  });
});

describe('balance.ts - config cost 一致性', () => {
  it('MAX_CRYSTAL 超过所有 unit/building/hero/tech 水晶造价', () => {
    const allCosts = [
      ...Object.values(UNIT_DEFS).map(d => d.cost.crystal),
      ...Object.values(BUILDING_DEFS).map(d => d.cost.crystal),
      ...Object.values(HERO_DEFS).map(d => d.cost.crystal),
      ...Object.values(TECH_DEFS).map(d => d.crystal),
    ];
    for (const c of allCosts) {
      expect(c).toBeLessThanOrEqual(MAX_CRYSTAL);
    }
  });
});
