/**
 * CombatSystem 单元测试 — 锁定战斗结算审计修复点
 *
 * 覆盖：
 *  - calculateDamage 伤害矩阵（physical/magic/void vs light/heavy/shield/structure/mechanical）
 *  - 奥术帝国魔法伤害 +10%（faction magicDmgMult）
 *  - findNearestEnemy：异方过滤、迷雾过滤（仅玩家受迷雾）、射程/视野判定
 *  - calculateAOE：排除主目标不二次伤害、范围内敌人受伤害、playerIndex 记录
 *  - Entity.takeDamage：护甲减伤、虚空穿透 50% 护甲、护盾优先吸收
 *  - 防御建筑索敌：同时搜索单位和建筑（P1-G2）
 */
import { describe, it, expect } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { FogOfWar, FogState } from '../core/FogOfWar';

/** 造单位 */
function makeUnit(
  owner = 0, tileX = 5, tileY = 5,
  armorType: 'light' | 'heavy' | 'shield' | 'bio' | 'structure' | 'mechanical' = 'light',
  hp = 100,
  attackDamage = 10,
  attackType: 'physical' | 'magic' | 'alchemy' | 'crystal' | 'void' = 'physical',
  range = 3,
  sight = 5,
  spriteKey = 'unit_rifleman',
): Unit {
  return new Unit(
    owner, owner === 0 ? 'arcane_empire' : 'hammer_federation', tileX, tileY,
    hp, armorType, 'infantry', 2, attackDamage, attackType, range, 1, sight, spriteKey,
  );
}

/** 造防御建筑 */
function makeTurret(owner = 0, tileX = 0, tileY = 0, range = 5): Building {
  const b = new Building(owner, 'arcane_empire', tileX, tileY, 800, 'structure', 'defense', 'bld_turret', 0, 0);
  b.attackDamage = 20;
  b.attackRange = range;
  b.attackCooldown = 1;
  b.attackType = 'physical';
  b.complete();
  return b;
}

describe('CombatSystem.calculateDamage — 伤害矩阵', () => {
  it('physical vs light = 1.0（无克制）', () => {
    expect(CombatSystem.calculateDamage(100, 'physical', 'light')).toBe(100);
  });

  it('physical vs heavy = 0.75（被克制）', () => {
    expect(CombatSystem.calculateDamage(100, 'physical', 'heavy')).toBe(75);
  });

  it('magic vs heavy = 1.25（克制）', () => {
    expect(CombatSystem.calculateDamage(100, 'magic', 'heavy')).toBe(125);
  });

  it('magic vs shield = 1.5（强克制）', () => {
    expect(CombatSystem.calculateDamage(100, 'magic', 'shield')).toBe(150);
  });

  it('physical vs structure = 0.5（攻城劣势）', () => {
    expect(CombatSystem.calculateDamage(100, 'physical', 'structure')).toBe(50);
  });

  it('void vs bio = 1.25', () => {
    expect(CombatSystem.calculateDamage(100, 'void', 'bio')).toBe(125);
  });

  it('alchemy vs shield = 2.0（炼金破盾）', () => {
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'shield')).toBe(200);
  });

  it('奥术帝国魔法伤害 +10%（magicDmgMult=1.1）', () => {
    expect(CombatSystem.calculateDamage(100, 'magic', 'light', 'arcane_empire')).toBe(110);
  });

  it('非帝国阵营魔法无加成', () => {
    expect(CombatSystem.calculateDamage(100, 'magic', 'light', 'hammer_federation')).toBe(100);
  });

  it('帝国非魔法伤害无加成', () => {
    expect(CombatSystem.calculateDamage(100, 'physical', 'light', 'arcane_empire')).toBe(100);
  });
});

describe('Entity.takeDamage — 护甲与护盾', () => {
  it('固定护甲减伤（最低 1）', () => {
    const u = makeUnit(0, 5, 5, 'light', 100);
    u.armor = 5;
    u.takeDamage(20, 'physical');
    expect(u.hp).toBe(100 - (20 - 5));
  });

  it('伤害不低于 1（护甲极高时）', () => {
    const u = makeUnit(0, 5, 5, 'light', 100);
    u.armor = 100;
    u.takeDamage(10, 'physical');
    expect(u.hp).toBe(99); // max(1, 10-100) = 1
  });

  it('护盾优先吸收伤害', () => {
    const u = makeUnit(0, 5, 5, 'light', 100);
    u.shieldHp = 30;
    u.maxShieldHp = 30;
    u.takeDamage(40, 'physical');
    // 护盾吸 30，剩 10 走护甲（armor=0）→ hp=90
    expect(u.shieldHp).toBe(0);
    expect(u.hp).toBe(90);
  });

  it('虚空伤害穿透 50% 护甲', () => {
    const u = makeUnit(0, 5, 5, 'light', 100);
    u.armor = 10;
    // physical: 20 - 10 = 10; void: 20 - floor(10*0.5)=20-5=15
    u.takeDamage(20, 'void');
    expect(u.hp).toBe(100 - 15);
  });

  it('致死伤害使 isActive=false 并返回 true', () => {
    const u = makeUnit(0, 5, 5, 'light', 10);
    const died = u.takeDamage(100, 'physical');
    expect(died).toBe(true);
    expect(u.isAlive).toBe(false);
    expect(u.hp).toBe(0);
  });

  it('已死亡实体不再受伤', () => {
    const u = makeUnit(0, 5, 5, 'light', 10);
    u.takeDamage(100, 'physical');
    const died2 = u.takeDamage(100, 'physical');
    expect(died2).toBe(false);
  });
});

describe('CombatSystem.findNearestEnemy — 索敌过滤', () => {
  it('返回最近的异方单位', () => {
    const self = makeUnit(0, 5, 5);
    const far = makeUnit(1, 8, 5);   // dist 3
    const near = makeUnit(1, 6, 5);  // dist 1
    const enemy = CombatSystem.findNearestEnemy(self, [far, near], []);
    expect(enemy?.id).toBe(near.id);
  });

  it('忽略己方单位', () => {
    const self = makeUnit(0, 5, 5);
    const ally = makeUnit(0, 6, 5);  // dist 1 但同方
    const foe = makeUnit(1, 8, 5);   // dist 3
    const enemy = CombatSystem.findNearestEnemy(self, [ally, foe], []);
    expect(enemy?.id).toBe(foe.id);
  });

  it('超出视野(sight)的不索敌', () => {
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5); // sight=5
    const far = makeUnit(1, 20, 5); // dist 15 > sight 5
    const enemy = CombatSystem.findNearestEnemy(self, [far], []);
    expect(enemy).toBeNull();
  });

  it('玩家(0)单位受迷雾限制：迷雾内敌人不可见', () => {
    const self = makeUnit(0, 5, 5);
    const foe = makeUnit(1, 6, 5); // dist 1 在视野内
    const fog = new FogOfWar(16, 16);
    // 不 update 迷雾，foe 所在格保持 Hidden → 玩家不可见
    expect(fog.getState(6, 5)).toBe(FogState.Hidden);
    const enemy = CombatSystem.findNearestEnemy(self, [foe], [], fog);
    expect(enemy).toBeNull();
  });

  it('AI(1)单位不受迷雾限制：能索敌迷雾内敌人', () => {
    const aiSelf = makeUnit(1, 5, 5);
    const playerFoe = makeUnit(0, 6, 5); // dist 1
    const fog = new FogOfWar(16, 16); // 全 Hidden
    const enemy = CombatSystem.findNearestEnemy(aiSelf, [playerFoe], [], fog);
    expect(enemy?.id).toBe(playerFoe.id);
  });

  it('也可索敌异方建筑', () => {
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const enemyBld = makeTurret(1, 6, 5);
    const enemy = CombatSystem.findNearestEnemy(self, [], [enemyBld]);
    expect(enemy?.id).toBe(enemyBld.id);
  });
});

describe('CombatSystem.calculateAOE — 范围伤害', () => {
  it('对范围内所有异方单位造成伤害', () => {
    const a = makeUnit(1, 5, 5); // dist 0 (中心)
    const b = makeUnit(1, 6, 5); // dist 1
    const c = makeUnit(1, 8, 5); // dist 3
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [a, b, c], []);
    // 半径 2 内：a(0), b(1) 受伤；c(3) 不受
    expect(events).toHaveLength(2);
    expect(events.map(e => e.targetId).sort()).toEqual([a.id, b.id].sort());
  });

  it('排除主目标不二次伤害（excludeTargetId）', () => {
    const a = makeUnit(1, 5, 5); // 中心
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [a], [], a.id);
    expect(events).toHaveLength(0);
  });

  it('己方单位不受 AOE 伤害', () => {
    const ally = makeUnit(0, 5, 5);
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [ally], []);
    expect(events).toHaveLength(0);
  });

  it('AOE 事件记录受害者 playerIndex（P0-6 修复）', () => {
    const foe = makeUnit(1, 5, 5);
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [foe], []);
    expect(events[0].playerIndex).toBe(1);
  });

  it('AOE 也能伤害范围内异方建筑', () => {
    const bld = makeTurret(1, 5, 5);
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [], [bld]);
    expect(events).toHaveLength(1);
    expect(events[0].targetId).toBe(bld.id);
  });

  it('AOE 击杀时 targetDied=true', () => {
    const weak = makeUnit(1, 5, 5, 'light', 10);
    const events = CombatSystem.calculateAOE(5, 5, 2, 100, 'physical', 0, 'arcane_empire', [weak], []);
    expect(events[0].targetDied).toBe(true);
    expect(weak.isAlive).toBe(false);
  });
});
