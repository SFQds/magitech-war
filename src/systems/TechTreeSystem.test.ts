/**
 * TechTreeSystem 单元测试 — 科技解锁判定与依赖链
 *
 * 覆盖：
 *  - completeTech/isResearched 基础存取
 *  - canResearch：已研究过则不可再研究
 *  - canResearch：前置未满足则不可研究
 *  - canResearch：前置满足且未研究过则可研究
 *  - 真实 TECH_DEFS 依赖链（refining_tech 依赖 crystal_smelting）
 *  - canProduce：所需科技全部满足才可生产
 */
import { describe, it, expect } from 'vitest';
import { TechTreeSystem } from './TechTreeSystem';
import { TECH_DEFS } from '../config/unitData';

describe('TechTreeSystem — 基础存取', () => {
  it('completeTech 后 isResearched 返回 true', () => {
    const tt = new TechTreeSystem();
    expect(tt.isResearched('tech:a')).toBe(false);
    tt.completeTech('tech:a');
    expect(tt.isResearched('tech:a')).toBe(true);
  });

  it('getResearched 返回所有已研究科技', () => {
    const tt = new TechTreeSystem();
    tt.completeTech('tech:a');
    tt.completeTech('tech:b');
    expect(tt.getResearched().sort()).toEqual(['tech:a', 'tech:b']);
  });
});

describe('TechTreeSystem.canResearch — 前置与重复检查', () => {
  it('已研究过的科技不可再研究', () => {
    const tt = new TechTreeSystem();
    tt.completeTech('tech:a');
    expect(tt.canResearch('tech:a', TECH_DEFS['tech:advanced_mining'])).toBe(false);
  });

  it('前置未满足 → 不可研究', () => {
    const tt = new TechTreeSystem();
    // refining_tech 依赖 crystal_smelting，未研究 crystal_smelting
    expect(tt.canResearch('tech:refining_tech', TECH_DEFS['tech:refining_tech'])).toBe(false);
  });

  it('前置满足且未研究过 → 可研究', () => {
    const tt = new TechTreeSystem();
    tt.completeTech('tech:crystal_smelting');
    expect(tt.canResearch('tech:refining_tech', TECH_DEFS['tech:refining_tech'])).toBe(true);
  });

  it('无前置的科技，未研究过即可研究', () => {
    const tt = new TechTreeSystem();
    expect(tt.canResearch('tech:crystal_smelting', TECH_DEFS['tech:crystal_smelting'])).toBe(true);
  });
});

describe('TechTreeSystem — 真实科技依赖链', () => {
  it('refining_tech 依赖 crystal_smelting（真实 TECH_DEFS 数据）', () => {
    expect(TECH_DEFS['tech:refining_tech'].prerequisites).toEqual(['tech:crystal_smelting']);
  });

  it('advanced_mining 无前置', () => {
    expect(TECH_DEFS['tech:advanced_mining'].prerequisites).toBeUndefined();
  });
});

describe('TechTreeSystem.canProduce — 单位/建筑科技需求', () => {
  it('所需科技全部满足 → 可生产', () => {
    const tt = new TechTreeSystem();
    tt.completeTech('tech:battle_mage_training');
    tt.completeTech('tech:arcane_legacy');
    expect(tt.canProduce(['tech:battle_mage_training', 'tech:arcane_legacy'])).toBe(true);
  });

  it('缺少任一所需科技 → 不可生产', () => {
    const tt = new TechTreeSystem();
    tt.completeTech('tech:battle_mage_training');
    expect(tt.canProduce(['tech:battle_mage_training', 'tech:arcane_legacy'])).toBe(false);
  });

  it('无科技需求 → 可生产', () => {
    const tt = new TechTreeSystem();
    expect(tt.canProduce([])).toBe(true);
  });
});
