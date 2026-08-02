/**
 * factories.ts 冒烟测试 — 保护全项目"唯一事实来源"
 *
 * factories.ts 被 34 个测试导入，本身无测试。工厂出 bug 会污染所有下游。
 * 本文件验证: 默认值正确、阵营映射、装配链路完整、关键不变量。
 * 不重复测各工厂产物的细节行为（那是各实体测试的职责），只测工厂契约。
 */
import { describe, it, expect } from 'vitest';
import {
  factionForOwner, grassMap, makeWorld,
  makeUnit, makeInfantry, makeWorker, makeHero, makeDeadUnit,
  makeBuilding, makeCommandCenter, makeRefinery, makeTurret, makeResearchingBuilding,
  makeResourceField, bindToField,
  makePlayer, view, setupGame,
} from './factories';

// ============ factionForOwner ============

describe('factories - factionForOwner', () => {
  it('owner 0 -> arcane_empire', () => {
    expect(factionForOwner(0)).toBe('arcane_empire');
  });
  it('owner 非 0 -> hammer_federation', () => {
    expect(factionForOwner(1)).toBe('hammer_federation');
    expect(factionForOwner(99)).toBe('hammer_federation');
  });
});

// ============ 地图与世界 ============

describe('factories - grassMap / makeWorld', () => {
  it('grassMap 默认 16x16 全草', () => {
    const m = grassMap();
    expect(m.config.width).toBe(16);
    expect(m.config.height).toBe(16);
  });
  it('grassMap 接受自定义尺寸', () => {
    const m = grassMap(32, 24);
    expect(m.config.width).toBe(32);
    expect(m.config.height).toBe(24);
  });
  it('makeWorld 默认无玩家', () => {
    const w = makeWorld();
    expect(w.players.length).toBe(0);
  });
  it('makeWorld addPlayers=true 加 2 玩家 (0=empire, 1=federation)', () => {
    const w = makeWorld(32, 32, true);
    expect(w.players.length).toBe(2);
    expect(w.players[0]?.faction).toBe('arcane_empire');
    expect(w.players[1]?.faction).toBe('hammer_federation');
    expect(w.players[1]?.isAI).toBe(true);
  });
  it('makeWorld 带 techTrees (addPlayers 后)', () => {
    const w = makeWorld(16, 16, true);
    expect(w.techTrees.size).toBe(2);
    expect(w.techTrees.get(0)).toBeDefined();
    expect(w.techTrees.get(1)).toBeDefined();
  });
});

// ============ 单位工厂 ============

describe('factories - makeUnit', () => {
  it('默认步枪兵 owner=0 阵营=empire 位置(5,5) hp=100', () => {
    const u = makeUnit();
    expect(u.owner).toBe(0);
    expect(u.faction).toBe('arcane_empire');
    expect(u.tileX).toBe(5);
    expect(u.tileY).toBe(5);
    expect(u.hp).toBe(100);
    expect(u.spriteKey).toBe('unit_rifleman');
    expect(u.category).toBe('infantry');
  });
  it('owner=1 自动映射 hammer_federation', () => {
    const u = makeUnit({ owner: 1 });
    expect(u.faction).toBe('hammer_federation');
  });
  it('自定义参数覆盖默认', () => {
    const u = makeUnit({ owner: 1, tileX: 9, tileY: 8, hp: 200, attackDamage: 25 });
    expect(u.owner).toBe(1);
    expect(u.tileX).toBe(9);
    expect(u.tileY).toBe(8);
    expect(u.hp).toBe(200);
    expect(u.attackDamage).toBe(25);
  });
});

describe('factories - makeInfantry / makeWorker', () => {
  it('makeInfantry 默认步枪兵 hp=100', () => {
    const u = makeInfantry();
    expect(u.spriteKey).toBe('unit_rifleman');
    expect(u.hp).toBe(100);
  });
  it('makeWorker hp=80 attackDamage=5 spriteKey=unit_worker', () => {
    const u = makeWorker();
    expect(u.hp).toBe(80);
    expect(u.attackDamage).toBe(5);
    expect(u.spriteKey).toBe('unit_worker');
  });
  it('makeInfantry 接受 owner/位置/hp 参数', () => {
    const u = makeInfantry(1, 3, 4, 150);
    expect(u.owner).toBe(1);
    expect(u.tileX).toBe(3);
    expect(u.tileY).toBe(4);
    expect(u.hp).toBe(150);
  });
});

describe('factories - makeHero', () => {
  it('默认 owner=0 -> hero_isabelle (spriteKey 即英雄 id)', () => {
    const h = makeHero();
    expect(h.owner).toBe(0);
    expect(h.spriteKey).toBe('hero_isabelle');
  });
  it('owner=1 -> hero_marcus (按 owner 自动选英雄)', () => {
    const h = makeHero({ owner: 1 });
    expect(h.spriteKey).toBe('hero_marcus');
  });
  it('level 参数触发升级循环', () => {
    const h = makeHero({ level: 3 });
    expect(h.level).toBe(3);
  });
  it('显式 heroId 覆盖 owner 默认', () => {
    const h = makeHero({ owner: 0, heroId: 'hero_marcus' });
    expect(h.spriteKey).toBe('hero_marcus');
  });
});

describe('factories - makeDeadUnit', () => {
  it('返回死亡单位 hp=0 isAlive=false', () => {
    const u = makeDeadUnit();
    expect(u.hp).toBe(0);
    expect(u.isAlive).toBe(false);
    expect(u.isActive).toBe(false);
  });
  it('保留 owner/位置参数', () => {
    const u = makeDeadUnit({ owner: 1, tileX: 7 });
    expect(u.owner).toBe(1);
    expect(u.tileX).toBe(7);
  });
});

// ============ 建筑工厂 ============

describe('factories - makeBuilding', () => {
  it('默认兵营 owner=0 完工 hp=800', () => {
    const b = makeBuilding();
    expect(b.owner).toBe(0);
    expect(b.spriteKey).toBe('bld_barracks');
    expect(b.hp).toBe(800);
    expect(b.state).toBe('idle');        // complete() 后 state=idle
    expect(b.buildProgress).toBe(1);
  });
  it('completed=false 返回未完工建筑', () => {
    const b = makeBuilding({ completed: false });
    expect(b.state).toBe('constructing');
    expect(b.buildProgress).toBe(0);
  });
  it('owner=1 映射 hammer_federation', () => {
    const b = makeBuilding({ owner: 1 });
    expect(b.faction).toBe('hammer_federation');
  });
});

describe('factories - makeCommandCenter', () => {
  it('owner=0 spriteKey=bld_cc_empire 提供 20 补给 10 工业', () => {
    const b = makeCommandCenter(0);
    expect(b.spriteKey).toBe('bld_cc_empire');
    expect(b.providesSupply).toBe(20);
    expect(b.providesIndustry).toBe(10);
    expect(b.hp).toBe(2000);
  });
  it('owner=1 spriteKey=bld_cc_federation', () => {
    const b = makeCommandCenter(1);
    expect(b.spriteKey).toBe('bld_cc_federation');
  });
  it('completed=false 返回未完工 CC', () => {
    const b = makeCommandCenter(0, 6, 6, false);
    expect(b.state).toBe('constructing');
  });
});

describe('factories - makeRefinery / makeTurret / makeResearchingBuilding', () => {
  it('makeRefinery 类型=resource spriteKey=bld_refinery', () => {
    const b = makeRefinery();
    expect(b.buildingType).toBe('resource');
    expect(b.spriteKey).toBe('bld_refinery');
  });
  it('makeTurret 类型=defense 带战斗属性', () => {
    const b = makeTurret(0, 0, 0, 7);
    expect(b.buildingType).toBe('defense');
    expect(b.attackRange).toBe(7);
    expect(b.attackDamage).toBe(20);
  });
  it('makeResearchingBuilding 状态=researching 带科技 id', () => {
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 15);
    expect(b.state).toBe('researching');
    expect(b.researchingTechId).toBe('tech:infantry_armor');
    expect(b.researchTotalTime).toBe(15);
  });
});

// ============ 资源 ============

describe('factories - makeResourceField / bindToField', () => {
  it('makeResourceField 默认水晶 1000 采集者上限 3', () => {
    const f = makeResourceField();
    expect(f.resourceType).toBe('crystal');
    expect(f.amount).toBe(1000);
    expect(f.maxGatherers).toBe(3);
  });
  it('bindToField 设置 worker.targetResourceId 与 field.currentGatherers', () => {
    const w = makeWorker();
    const f = makeResourceField(5, 5);
    bindToField(w, f, 2);
    expect(w.targetResourceId).toBe(f.id);
    expect(w.state).toBe('gathering');
    expect(f.currentGatherers).toBe(2);
  });
});

// ============ 玩家/迷雾 ============

describe('factories - makePlayer / view', () => {
  it('makePlayer 默认 index=0 crystal=0 arcane_empire 无行会', () => {
    const p = makePlayer();
    expect(p.index).toBe(0);
    expect(p.resources.crystal).toBe(0);
    expect(p.faction).toBe('arcane_empire');
    expect(p.guilds).toEqual([]);
    expect(p.isAI).toBe(false);
  });
  it('makePlayer 接受 index/crystal/faction', () => {
    const p = makePlayer(1, 500, 'hammer_federation');
    expect(p.index).toBe(1);
    expect(p.resources.crystal).toBe(500);
    expect(p.faction).toBe('hammer_federation');
  });
  it('view 返回 FogUnitView 结构', () => {
    const v = view(0, 3, 4, 5);
    expect(v.owner).toBe(0);
    expect(v.tileX).toBe(3);
    expect(v.tileY).toBe(4);
    expect(v.sight).toBe(5);
  });
});

// ============ setupGame 全链路装配 ============

describe('factories - setupGame 全链路装配', () => {
  it('返回完整 6 件套, 全部非 null', () => {
    const g = setupGame();
    expect(g.world).toBeDefined();
    expect(g.entities).toBeDefined();
    expect(g.techSystem).toBeDefined();
    expect(g.researchSystem).toBeDefined();
    expect(g.spawner).toBeDefined();
    expect(g.commandExecutor).toBeDefined();
  });
  it('world 含 2 玩家 + 2 techTrees', () => {
    const g = setupGame();
    expect(g.world.players.length).toBe(2);
    expect(g.world.techTrees.size).toBe(2);
  });
  it('techSystem.initAll 已执行 (applyToUnit 不抛错)', () => {
    const g = setupGame();
    const u = makeUnit();
    expect(() => g.techSystem.applyToUnit(u)).not.toThrow();
  });
  it('spawner.spawnUnit 方法存在 (链路装配完整)', () => {
    const g = setupGame();
    expect(typeof g.spawner.spawnUnit).toBe('function');
    expect(typeof g.commandExecutor.execute).toBe('function');
  });
});
