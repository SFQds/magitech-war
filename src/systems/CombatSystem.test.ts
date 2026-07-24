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
import { makeUnit as makeUnitBase, makeTurret, makeBuilding, grassMap } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { FogOfWar, FogState } from '../core/FogOfWar';

/** 造单位（位置参数风格薄包装，委托夹具库） */
function makeUnit(
  owner = 0, tileX = 5, tileY = 5,
  armorType: 'light' | 'heavy' | 'shield' | 'bio' | 'structure' | 'mechanical' = 'light',
  hp = 100,
  attackDamage = 10,
  attackType: 'physical' | 'magic' | 'alchemy' | 'crystal' | 'void' = 'physical',
  range = 3,
  sight = 5,
  spriteKey = 'unit_rifleman',
) {
  return makeUnitBase({ owner, tileX, tileY, armorType, hp, attackDamage, attackType, range, sight, spriteKey });
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

// ===================== 第二轮补洞 =====================

describe('CombatSystem.calculateDamage - 矩阵补全', () => {
  it('crystal 行: light/heavy/bio/structure = 1.0, mechanical = 1.25', () => {
    expect(CombatSystem.calculateDamage(100, 'crystal', 'light')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'crystal', 'heavy')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'crystal', 'bio')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'crystal', 'structure')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'crystal', 'mechanical')).toBe(125);
  });

  it('crystal vs shield = 0.5', () => {
    expect(CombatSystem.calculateDamage(100, 'crystal', 'shield')).toBe(50);
  });

  it('physical vs shield/bio = 1.0, vs mechanical = 0.75', () => {
    expect(CombatSystem.calculateDamage(100, 'physical', 'shield')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'physical', 'bio')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'physical', 'mechanical')).toBe(75);
  });

  it('magic vs light/bio/structure/mechanical = 1.0', () => {
    expect(CombatSystem.calculateDamage(100, 'magic', 'light')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'magic', 'bio')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'magic', 'structure')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'magic', 'mechanical')).toBe(100);
  });

  it('alchemy vs light/heavy/mechanical = 1.0, bio = 0.9, structure = 1.5', () => {
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'light')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'heavy')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'bio')).toBe(90);
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'structure')).toBe(150);
    expect(CombatSystem.calculateDamage(100, 'alchemy', 'mechanical')).toBe(100);
  });

  it('void vs light/heavy/shield/structure/mechanical = 1.0', () => {
    expect(CombatSystem.calculateDamage(100, 'void', 'light')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'void', 'heavy')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'void', 'shield')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'void', 'structure')).toBe(100);
    expect(CombatSystem.calculateDamage(100, 'void', 'mechanical')).toBe(100);
  });
});


describe('CombatSystem.updateCombat - 主动攻击循环', () => {
  function setup() {
    const map = grassMap(16, 16);
    const entities = new EntityRegistry();
    return { map, entities };
  }

  it('死亡单位被跳过', () => {
    const { entities, map } = setup();
    const dead = makeUnit(0, 5, 5);
    dead.takeDamage(999, 'physical');
    entities.addUnit(dead);
    const events = CombatSystem.updateCombat([dead], [], [dead], [], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
  });

  it('attackTimer 每帧递减', () => {
    const { entities, map } = setup();
    const u = makeUnit(0, 5, 5);
    u.attackTimer = 2.0;
    entities.addUnit(u);
    CombatSystem.updateCombat([u], [], [u], [], map, 0.5, undefined, entities);
    expect(u.attackTimer).toBeCloseTo(1.5, 5);
  });

  it('attacking 状态射程内近战 -> 近战伤害事件', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 20, 'physical', 3, 5, 'unit_worker');
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events).toHaveLength(1);
    expect(events[0].isMelee).toBe(true);
    expect(events[0].attackEffect).toBe('melee');
    expect(events[0].damage).toBe(20);
    expect(events[0].attackerId).toBe(attacker.id);
    expect(events[0].targetId).toBe(target.id);
  });

  it('远程单位 -> 弹道事件 isMelee=false', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 15, 'physical', 5, 7, 'unit_rifleman');
    const target = makeUnit(1, 7, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events).toHaveLength(1);
    expect(events[0].isMelee).toBe(false);
    expect(events[0].attackEffect).toBe('proj_bullet');
    expect(events[0].rawDamage).toBe(15);
    expect(events[0].attackerTileX).toBe(5);
    expect(events[0].targetTileX).toBe(7);
  });

  it('零攻击力单位被命攻击 -> stopAttacking 无事件', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 0, 'physical', 3, 5);
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
    expect(attacker.state).toBe('idle');
  });

  it('攻击击杀目标 -> stopAttacking', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 999, 'physical', 3, 5, 'unit_worker');
    const target = makeUnit(1, 6, 5, 'light', 10);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].targetDied).toBe(true);
    expect(attacker.state).toBe('idle');
    expect(attacker.targetEntityId).toBeNull();
  });

  it('attackTimer 攻击后重置为 cooldown', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 20, 'physical', 3, 5);
    attacker.attackCooldown = 1.5;
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(attacker.attackTimer).toBe(1.5);
  });

  it('attackTimer>0 冷却中不攻击', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 20, 'physical', 3, 5);
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 1.0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
  });

  it('追击目标超出射程 -> state=pursuing', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 20, 'physical', 3, 5);
    const target = makeUnit(1, 12, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(attacker.state).toBe('pursuing');
  });

  it('追击进入射程 -> state=attacking 清空 path', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 20, 'physical', 3, 5);
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.state = 'pursuing';
    attacker.targetEntityId = target.id;
    attacker.path = [{ x: 6, y: 5 }];
    attacker.attackTimer = 0;
    CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(attacker.state).toBe('attacking');
    expect(attacker.path).toHaveLength(0);
  });
});

describe('CombatSystem.updateCombat - 自动索敌', () => {
  function setup() {
    const map = grassMap(16, 16);
    const entities = new EntityRegistry();
    return { map, entities };
  }

  it('idle 单位射程内有敌人 -> attackTarget', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const foe = makeUnit(1, 6, 5);
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('attacking');
    expect(self.targetEntityId).toBe(foe.id);
  });

  it('idle 单位视野内但射程外 -> 追击', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 2, 8);
    const foe = makeUnit(1, 10, 5);
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('pursuing');
  });

  it('目标超出视野 -> 不索敌', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 2, 5);
    const foe = makeUnit(1, 20, 5);
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('idle');
    expect(self.targetEntityId).toBeNull();
  });

  it('moving 状态单位不自动索敌', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const foe = makeUnit(1, 6, 5);
    self.state = 'moving';
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('moving');
  });

  it('工人 attackDamage<=0 不自动索敌', () => {
    const { map, entities } = setup();
    const worker = makeUnit(0, 5, 5, 'light', 100, 0, 'physical', 3, 5, 'unit_worker');
    const foe = makeUnit(1, 6, 5);
    entities.addUnit(worker);
    entities.addUnit(foe);
    CombatSystem.updateCombat([worker], [], [worker, foe], [], map, 0.016, undefined, entities);
    expect(worker.state).toBe('idle');
  });

  it('holdPosition=true 不自动索敌', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const foe = makeUnit(1, 6, 5);
    self.holdPosition = true;
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('idle');
  });

  it('aiLockedAction=retreat 不自动索敌', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const foe = makeUnit(1, 6, 5);
    self.aiLockedAction = 'retreat';
    entities.addUnit(self);
    entities.addUnit(foe);
    CombatSystem.updateCombat([self], [], [self, foe], [], map, 0.016, undefined, entities);
    expect(self.state).toBe('idle');
  });

  it('已有 targetEntityId 的单位不进入自动索敌', () => {
    const { map, entities } = setup();
    const self = makeUnit(0, 5, 5, 'light', 100, 10, 'physical', 3, 5);
    const foe = makeUnit(1, 6, 5);
    const other = makeUnit(1, 5, 6);
    self.attackTarget(foe.id);
    entities.addUnit(self);
    entities.addUnit(foe);
    entities.addUnit(other);
    CombatSystem.updateCombat([self], [], [self, foe, other], [], map, 0.016, undefined, entities);
    expect(self.targetEntityId).toBe(foe.id);
  });
});

describe('CombatSystem.updateCombat - 防御建筑循环', () => {
  function setup() {
    const map = grassMap(16, 16);
    const entities = new EntityRegistry();
    return { map, entities };
  }

  it('防御塔射程内攻击敌人 -> 近战事件', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    const foe = makeUnit(1, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, undefined, entities);
    expect(events).toHaveLength(1);
    expect(events[0].attackerId).toBe(turret.id);
    expect(events[0].targetId).toBe(foe.id);
    expect(events[0].damage).toBe(20);
  });

  it('防御塔击杀目标 -> targetEntityId 清空', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    turret.attackDamage = 999;
    const foe = makeUnit(1, 6, 5, 'light', 10);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, undefined, entities);
    expect(turret.targetEntityId).toBeNull();
  });

  it('constructing 建筑不攻击', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    turret.state = 'constructing';
    const foe = makeUnit(1, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
  });

  it('researching 建筑不攻击', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    turret.state = 'researching';
    const foe = makeUnit(1, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
  });

  it('attackTimer>0 建筑跳过本帧', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    const foe = makeUnit(1, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 1.0;
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, undefined, entities);
    expect(events).toHaveLength(0);
  });

  it('防御塔自动索敌射程内最近敌方单位', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    const near = makeUnit(1, 6, 5);
    const far = makeUnit(1, 9, 5);
    entities.addBuilding(turret);
    entities.addUnit(near);
    entities.addUnit(far);
    turret.attackTimer = 0;
    const events = CombatSystem.updateCombat([], [turret], [near, far], [turret], map, 0.016, undefined, entities);
    expect(events[0].targetId).toBe(near.id);
  });

  it('防御塔也可索敌敌方建筑', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    const enemyBld = makeBuilding({ owner: 1, tileX: 6, tileY: 5 });
    entities.addBuilding(turret);
    entities.addBuilding(enemyBld);
    turret.attackTimer = 0;
    const events = CombatSystem.updateCombat([], [turret], [], [turret, enemyBld], map, 0.016, undefined, entities);
    expect(events).toHaveLength(1);
    expect(events[0].targetId).toBe(enemyBld.id);
  });

  it('玩家防御塔受迷雾限制: 迷雾内敌人不索敌', () => {
    const { map, entities } = setup();
    const turret = makeTurret(0, 5, 5, 5);
    const foe = makeUnit(1, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    const fog = new FogOfWar(16, 16);
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, fog, entities);
    expect(events).toHaveLength(0);
  });

  it('AI 防御塔不受迷雾限制', () => {
    const { map, entities } = setup();
    const turret = makeTurret(1, 5, 5, 5);
    const foe = makeUnit(0, 6, 5);
    entities.addBuilding(turret);
    entities.addUnit(foe);
    turret.attackTimer = 0;
    const fog = new FogOfWar(16, 16);
    const events = CombatSystem.updateCombat([], [turret], [foe], [turret], map, 0.016, fog, entities);
    expect(events).toHaveLength(1);
  });
});

describe('CombatSystem.updateCombat - GuildSystem 交互', () => {
  function setup() {
    const map = grassMap(16, 16);
    const entities = new EntityRegistry();
    return { map, entities };
  }

  it('力量药剂 -> 攻击伤害 x1.30', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 100, 'physical', 3, 5);
    attacker.alchemyBuffType = 'strength';
    attacker.alchemyBuffValue = 0.3;
    attacker.alchemyBuffTimer = 30;
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].damage).toBe(130);
  });

  it('虚空过载 -> 攻击伤害 x1.50', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 100, 'physical', 3, 5);
    attacker.isVoidOvercharged = true;
    attacker.voidOverloadTimer = 30;
    attacker.isVoidOptimized = false;
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].damage).toBe(150);
  });

  it('虚空过载优化 -> 攻击伤害 x1.35', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 100, 'physical', 3, 5);
    attacker.isVoidOvercharged = true;
    attacker.voidOverloadTimer = 45;
    attacker.isVoidOptimized = true;
    const target = makeUnit(1, 6, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].damage).toBe(135);
  });

  it('腐蚀弹: 近战命中临时扣减目标护甲后恢复', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 100, 'physical', 3, 5);
    attacker.alchemyBuffType = 'corrosion';
    attacker.alchemyBuffValue = 0.3;
    attacker.alchemyBuffTimer = 30;
    attacker.baseArmor = 0;
    const target = makeUnit(1, 6, 5, 'light', 1000);
    target.armor = 10;
    target.baseArmor = 10;
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(target.armor).toBe(10); // 恢复
  });

  it('腐蚀弹: 远程弹道事件携带 corrosionPenalty 字段', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 100, 'physical', 5, 7, 'unit_rifleman');
    attacker.alchemyBuffType = 'corrosion';
    attacker.alchemyBuffValue = 0.3;
    attacker.alchemyBuffTimer = 30;
    attacker.baseArmor = 10;
    const target = makeUnit(1, 7, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].corrosionPenalty).toBe(3); // round(10*0.3)
  });

  it('无腐蚀: 远程弹道事件 corrosionPenalty=undefined', () => {
    const { entities, map } = setup();
    const attacker = makeUnit(0, 5, 5, 'light', 100, 15, 'physical', 5, 7, 'unit_rifleman');
    const target = makeUnit(1, 7, 5);
    entities.addUnit(attacker);
    entities.addUnit(target);
    attacker.attackTarget(target.id);
    attacker.attackTimer = 0;
    const events = CombatSystem.updateCombat([attacker], [], [attacker, target], [], map, 0.016, undefined, entities);
    expect(events[0].corrosionPenalty).toBeUndefined();
  });
});

describe('CombatSystem.findNearestEnemy - 边界', () => {
  it('死亡敌方单位被跳过', () => {
    const self = makeUnit(0, 5, 5);
    const dead = makeUnit(1, 6, 5);
    dead.takeDamage(999, 'physical');
    const enemy = CombatSystem.findNearestEnemy(self, [dead], []);
    expect(enemy).toBeNull();
  });

  it('死亡敌方建筑被跳过', () => {
    const self = makeUnit(0, 5, 5);
    const deadBld = makeTurret(1, 6, 5);
    deadBld.takeDamage(99999, 'physical');
    const enemy = CombatSystem.findNearestEnemy(self, [], [deadBld]);
    expect(enemy).toBeNull();
  });

  it('空 units + 空 buildings -> null', () => {
    const self = makeUnit(0, 5, 5);
    const enemy = CombatSystem.findNearestEnemy(self, [], []);
    expect(enemy).toBeNull();
  });

  it('玩家单位索敌建筑受迷雾限制', () => {
    const self = makeUnit(0, 5, 5);
    const enemyBld = makeTurret(1, 6, 5);
    const fog = new FogOfWar(16, 16);
    const enemy = CombatSystem.findNearestEnemy(self, [], [enemyBld], fog);
    expect(enemy).toBeNull();
  });
});

describe('CombatSystem.calculateAOE - 边界', () => {
  it('d===radius 边界: 恰在半径上受伤', () => {
    const foe = makeUnit(1, 7, 5); // dist 2 from (5,5)
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [foe], []);
    expect(events).toHaveLength(1);
  });

  it('死亡单位不在 AOE 范围内不受伤害', () => {
    const dead = makeUnit(1, 5, 5, 'light', 10);
    dead.takeDamage(999, 'physical');
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [dead], []);
    expect(events).toHaveLength(0);
  });

  it('excludeTargetId 匹配建筑 -> 排除', () => {
    const bld = makeBuilding({ owner: 1, tileX: 5, tileY: 5 });
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [], [bld], bld.id);
    expect(events).toHaveLength(0);
  });

  it('空 units + 空 buildings -> []', () => {
    const events = CombatSystem.calculateAOE(5, 5, 2, 50, 'physical', 0, 'arcane_empire', [], []);
    expect(events).toHaveLength(0);
  });
});
