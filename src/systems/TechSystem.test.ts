/**
 * TechSystem 单元测试 — 科技效果缓存与应用
 *
 * 覆盖：
 *  - getTree：返回玩家科技树
 *  - getEffects：默认值（无科技）
 *  - refresh：研究采集科技后 gatherMult 叠乘
 *  - refresh：步兵护甲科技 → infantryArmor=5
 *  - refresh：建筑加固科技 → buildingHpMult=1.2
 *  - applyToUnit：步兵科技给步兵加护甲，非步兵不受影响
 *  - applyToBuilding：建筑加固按倍率放大 maxHp 并钳制 hp
 */
import { describe, it, expect } from 'vitest';
import { TechSystem } from './TechSystem';
import { makeWorld, makeInfantry, makeBuilding } from '../__fixtures__/factories';

describe('TechSystem — 基础', () => {
  it('getTree 返回玩家科技树', () => {
    const ts = new TechSystem(makeWorld(16, 16, true));
    expect(ts.getTree(0)).toBeDefined();
  });

  it('getEffects 无科技时返回默认值', () => {
    const ts = new TechSystem(makeWorld(16, 16, true));
    const e = ts.getEffects(0);
    expect(e.gatherMult).toBe(1.0);
    expect(e.infantryArmor).toBe(0);
    expect(e.buildingHpMult).toBe(1.0);
  });

  it('initAll 后所有玩家都有缓存', () => {
    const w = makeWorld(16, 16, true);
    w.addPlayer('hammer_federation', [], true);
    const ts = new TechSystem(w);
    ts.initAll();
    expect(ts.getEffects(0)).toBeDefined();
    expect(ts.getEffects(1)).toBeDefined();
  });
});

describe('TechSystem.refresh — 采集科技叠乘', () => {
  it('advanced_mining → ×1.2', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    ts.getTree(0).completeTech('tech:advanced_mining');
    ts.refresh(0);
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.2, 5);
  });

  it('三个采集科技叠乘 1.2×1.15×1.25', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    const tt = ts.getTree(0);
    tt.completeTech('tech:advanced_mining');
    tt.completeTech('tech:crystal_smelting');
    tt.completeTech('tech:refining_tech');
    ts.refresh(0);
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.2 * 1.15 * 1.25, 5);
  });
});

describe('TechSystem.refresh — 护甲/建筑科技', () => {
  it('infantry_armor → infantryArmor=5', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    ts.getTree(0).completeTech('tech:infantry_armor');
    ts.refresh(0);
    expect(ts.getEffects(0).infantryArmor).toBe(5);
  });

  it('structure_reinforce → buildingHpMult=1.2', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    ts.getTree(0).completeTech('tech:structure_reinforce');
    ts.refresh(0);
    expect(ts.getEffects(0).buildingHpMult).toBeCloseTo(1.2, 5);
  });
});

describe('TechSystem.applyToUnit — 步兵护甲', () => {
  it('步兵有 infantry_armor 科技时 armor = baseArmor + 5', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    ts.getTree(0).completeTech('tech:infantry_armor');
    ts.refresh(0);
    const u = makeInfantry();
    u.baseArmor = 2;
    ts.applyToUnit(u);
    expect(u.armor).toBe(7);
  });

  it('无科技时步兵护甲不变', () => {
    const ts = new TechSystem(makeWorld(16, 16, true));
    const u = makeInfantry();
    u.baseArmor = 2;
    u.armor = 2;
    ts.applyToUnit(u);
    expect(u.armor).toBe(2);
  });
});

describe('TechSystem.applyToBuilding — 建筑加固', () => {
  it('有 structure_reinforce 时 maxHp×1.2 且 hp 钳制', () => {
    const w = makeWorld(16, 16, true);
    const ts = new TechSystem(w);
    ts.getTree(0).completeTech('tech:structure_reinforce');
    ts.refresh(0);
    const b = makeBuilding({ owner: 0, hp: 800 });
    ts.applyToBuilding(b);
    expect(b.maxHp).toBe(960); // round(800*1.2)
    expect(b.hp).toBeLessThanOrEqual(b.maxHp);
  });

  it('无科技时建筑 HP 不变', () => {
    const ts = new TechSystem(makeWorld(16, 16, true));
    const b = makeBuilding({ owner: 0, hp: 800 });
    ts.applyToBuilding(b);
    expect(b.maxHp).toBe(800);
  });
});
