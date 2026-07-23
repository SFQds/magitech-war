/**
 * Entity 基类 + Unit + Building 单元测试 - 状态机与战斗属性
 */
import { describe, it, expect, vi } from 'vitest';
import { Entity } from './Entity';
import { Unit } from './Unit';
import { Building } from './Building';
import { makeUnit, makeBuilding } from '../__fixtures__/factories';

// Entity is abstract; a minimal concrete subclass for base-class tests.
class TestEntity extends Entity {
  constructor(maxHp = 100, armor = 0) {
    super(0, 'arcane_empire', 0, 0, maxHp, 'light', 'test', 'test');
    this.armor = armor;
  }
}

describe('Entity base - construction', () => {
  it('constructor sets hp equal to maxHp and isActive=true', () => {
    const e = new TestEntity(100);
    expect(e.hp).toBe(100);
    expect(e.maxHp).toBe(100);
    expect(e.isActive).toBe(true);
    expect(e.armor).toBe(0);
    expect(e.shieldHp).toBe(0);
    expect(e.maxShieldHp).toBe(0);
  });

  it('id starts with the given prefix', () => {
    const e = new TestEntity();
    expect(e.id.startsWith('test_')).toBe(true);
  });
});

describe('Entity.takeDamage', () => {
  it('without armor reduces hp by full amount and returns false (non-lethal)', () => {
    const e = new TestEntity(100, 0);
    expect(e.takeDamage(20, 'physical')).toBe(false);
    expect(e.hp).toBe(80);
  });

  it('with armor subtracts armor (final floors at 1)', () => {
    const e = new TestEntity(100, 5);
    e.takeDamage(20);
    expect(e.hp).toBe(85); // 20 - 5 = 15 damage
  });

  it('final damage floors at 1 when armor exceeds remaining', () => {
    const e = new TestEntity(100, 100);
    e.takeDamage(10);
    expect(e.hp).toBe(99); // max(1, 10-100) = 1 damage
  });

  it('void damage halves armor (floored)', () => {
    const e = new TestEntity(100, 10);
    e.takeDamage(20, 'void');
    expect(e.hp).toBe(85); // effArmor = floor(10*0.5) = 5; 20-5 = 15
  });

  it('void damage with odd armor floors the halved armor', () => {
    const e = new TestEntity(100, 11);
    e.takeDamage(20, 'void');
    // effArmor = floor(11*0.5) = 5; 20-5 = 15
    expect(e.hp).toBe(85);
  });

  it('non-void does not halve armor', () => {
    const e = new TestEntity(100, 10);
    e.takeDamage(20, 'physical');
    expect(e.hp).toBe(90); // 20 - 10 = 10 damage
  });

  it('shield absorbs fully when remaining <= shieldHp (but final still floors at 1)', () => {
    const e = new TestEntity(100, 0);
    e.shieldHp = 30;
    e.takeDamage(20);
    expect(e.shieldHp).toBe(10);
    // remaining=0, but final = max(1, 0 - 0) = 1; hp takes 1 chip damage
    expect(e.hp).toBe(99);
  });

  it('shield overflow carries remainder to hp', () => {
    const e = new TestEntity(100, 0);
    e.shieldHp = 30;
    e.takeDamage(40);
    expect(e.shieldHp).toBe(0);
    expect(e.hp).toBe(90); // 40-30 = 10 damage
  });

  it('lethal damage sets hp=0, isActive=false, returns true', () => {
    const e = new TestEntity(10, 0);
    expect(e.takeDamage(100)).toBe(true);
    expect(e.hp).toBe(0);
    expect(e.isActive).toBe(false);
  });

  it('on already-dead entity returns false and does not mutate', () => {
    const e = new TestEntity(10, 0);
    e.takeDamage(100); // dies
    const hpBefore = e.hp;
    expect(e.takeDamage(50)).toBe(false);
    expect(e.hp).toBe(hpBefore);
  });

  it('void overload (isVoidOvercharged) boosts effective armor by 50%', () => {
    const e = new TestEntity(100, 10) as TestEntity & {
      isVoidOvercharged?: boolean; isVoidOptimized?: boolean; voidOverloadTimer?: number;
    };
    e.isVoidOvercharged = true;
    e.isVoidOptimized = false;
    e.voidOverloadTimer = 5;
    // void: effArmor = floor(floor(10*0.5)) = 5; overload boost: floor(5 * 1.5) = 7; 20-7 = 13
    e.takeDamage(20, 'void');
    expect(e.hp).toBe(87);
  });

  it('void overload with isVoidOptimized uses 35% boost', () => {
    const e = new TestEntity(100, 10) as TestEntity & {
      isVoidOvercharged?: boolean; isVoidOptimized?: boolean; voidOverloadTimer?: number;
    };
    e.isVoidOvercharged = true;
    e.isVoidOptimized = true;
    e.voidOverloadTimer = 5;
    // void: effArmor = 5; optimized boost: floor(5 * 1.35) = 6; 20-6 = 14
    e.takeDamage(20, 'void');
    expect(e.hp).toBe(86);
  });

  it('void overload ignores boost when timer is 0', () => {
    const e = new TestEntity(100, 10) as TestEntity & {
      isVoidOvercharged?: boolean; isVoidOptimized?: boolean; voidOverloadTimer?: number;
    };
    e.isVoidOvercharged = true;
    e.voidOverloadTimer = 0;
    e.takeDamage(20, 'void');
    expect(e.hp).toBe(85); // no boost, plain void halving
  });
});

describe('Entity.heal', () => {
  it('restores hp up to maxHp', () => {
    const e = new TestEntity(100);
    e.hp = 50;
    e.heal(30);
    expect(e.hp).toBe(80);
    e.heal(100);
    expect(e.hp).toBe(100); // capped
  });

  it('ignores amount <= 0 (P2-N4 negative-abuse guard)', () => {
    const e = new TestEntity(100);
    e.hp = 50;
    e.heal(-20);
    e.heal(0);
    expect(e.hp).toBe(50);
  });

  it('on dead entity is a no-op', () => {
    const e = new TestEntity(100);
    e.takeDamage(200); // dies
    e.heal(50);
    expect(e.hp).toBe(0);
    expect(e.isActive).toBe(false);
  });
});

describe('Entity.isAlive / hpPercent', () => {
  it('isAlive returns false when isActive=false even if hp>0', () => {
    const e = new TestEntity(100);
    e.hp = 50;
    e.isActive = false;
    expect(e.isAlive).toBe(false);
  });

  it('isAlive returns false when hp=0 even if isActive=true', () => {
    const e = new TestEntity(100);
    e.hp = 0;
    expect(e.isAlive).toBe(false);
  });

  it('hpPercent returns 0 when maxHp=0 (divide-by-zero guard)', () => {
    const e = new TestEntity(0);
    expect(e.hpPercent).toBe(0);
  });

  it('hpPercent returns correct ratio for partial hp', () => {
    const e = new TestEntity(100);
    e.hp = 75;
    expect(e.hpPercent).toBe(0.75);
  });
});

// ============ Unit ============

describe('Unit construction & defaults', () => {
  it('initializes combat stats and idle state', () => {
    const u = makeUnit();
    expect(u.state).toBe('idle');
    expect(u.attackTimer).toBe(0);
    expect(u.path).toEqual([]);
    expect(u.pathIndex).toBe(0);
    expect(u.targetEntityId).toBeNull();
    expect(u.targetResourceId).toBeNull();
    expect(u.cargo).toEqual([]);
    expect(u.abilityCharges).toBe(0);
    expect(u.maxAbilityCharges).toBe(3);
    expect(u.holdPosition).toBe(false);
    expect(u.aiLockedAction).toBeNull();
    expect(u.supplyCost).toBe(1);
    expect(u.baseArmor).toBe(0);
    expect(u.isVoidOvercharged).toBe(false);
    expect(u.alchemyBuffType).toBe('none');
  });
});

describe('Unit.setPath / clearPath', () => {
  it('setPath with non-empty path sets state to moving and resets pathIndex', () => {
    const u = makeUnit();
    u.setPath([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(u.state).toBe('moving');
    expect(u.pathIndex).toBe(0);
    expect(u.path).toHaveLength(2);
  });

  it('setPath with empty path does not change state to moving', () => {
    const u = makeUnit();
    u.setPath([]);
    expect(u.state).toBe('idle');
    expect(u.path).toHaveLength(0);
  });

  it('setPath overwrites previous path and resets pathIndex', () => {
    const u = makeUnit();
    u.setPath([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    u.pathIndex = 2;
    u.setPath([{ x: 5, y: 5 }]);
    expect(u.path).toHaveLength(1);
    expect(u.pathIndex).toBe(0);
  });

  it('clearPath from moving state resets to idle', () => {
    const u = makeUnit();
    u.setPath([{ x: 1, y: 1 }]);
    u.clearPath();
    expect(u.state).toBe('idle');
    expect(u.path).toEqual([]);
    expect(u.pathIndex).toBe(0);
  });

  it('clearPath from pursuing state resets to idle', () => {
    const u = makeUnit();
    u.state = 'pursuing';
    u.clearPath();
    expect(u.state).toBe('idle');
  });

  it('clearPath from idle leaves state unchanged', () => {
    const u = makeUnit();
    u.clearPath();
    expect(u.state).toBe('idle');
  });

  it('clearPath from attacking leaves state unchanged', () => {
    const u = makeUnit();
    u.attackTarget('enemy_1');
    u.clearPath();
    expect(u.state).toBe('attacking');
  });

  it('clearPath from gathering leaves state unchanged', () => {
    const u = makeUnit();
    u.state = 'gathering';
    u.clearPath();
    expect(u.state).toBe('gathering');
  });
});

describe('Unit.attackTarget / stopAttacking', () => {
  it('attackTarget sets target, state=attacking, resets attackTimer', () => {
    const u = makeUnit();
    u.attackTimer = 5;
    u.attackTarget('enemy_1');
    expect(u.targetEntityId).toBe('enemy_1');
    expect(u.state).toBe('attacking');
    expect(u.attackTimer).toBe(0);
  });

  it('stopAttacking from attacking clears target and returns to idle', () => {
    const u = makeUnit();
    u.attackTarget('enemy_1');
    u.stopAttacking();
    expect(u.targetEntityId).toBeNull();
    expect(u.state).toBe('idle');
  });

  it('stopAttacking from pursuing clears target and returns to idle', () => {
    const u = makeUnit();
    u.state = 'pursuing';
    u.targetEntityId = 'enemy_1';
    u.stopAttacking();
    expect(u.state).toBe('idle');
  });

  it('stopAttacking from idle leaves state unchanged', () => {
    const u = makeUnit();
    u.stopAttacking();
    expect(u.state).toBe('idle');
  });
});

describe('Unit.addCharge / consumeCharge', () => {
  it('addCharge increments up to maxAbilityCharges', () => {
    const u = makeUnit();
    for (let i = 0; i < 5; i++) u.addCharge();
    expect(u.abilityCharges).toBe(3); // capped
  });

  it('addCharge at max does not exceed cap', () => {
    const u = makeUnit();
    u.abilityCharges = 3;
    u.addCharge();
    expect(u.abilityCharges).toBe(3);
  });

  it('consumeCharge(1) decrements and returns true when sufficient', () => {
    const u = makeUnit();
    u.abilityCharges = 2;
    expect(u.consumeCharge()).toBe(true);
    expect(u.abilityCharges).toBe(1);
  });

  it('consumeCharge with explicit count decrements correctly', () => {
    const u = makeUnit();
    u.abilityCharges = 3;
    expect(u.consumeCharge(2)).toBe(true);
    expect(u.abilityCharges).toBe(1);
  });

  it('consumeCharge returns false when insufficient', () => {
    const u = makeUnit();
    u.abilityCharges = 1;
    expect(u.consumeCharge(2)).toBe(false);
    expect(u.abilityCharges).toBe(1); // unchanged
  });

  it('consumeCharge(0) returns true without changing charges', () => {
    const u = makeUnit();
    u.abilityCharges = 2;
    expect(u.consumeCharge(0)).toBe(true);
    expect(u.abilityCharges).toBe(2);
  });
});

describe('Unit.resetCombatState', () => {
  it('clears targetEntityId and sets state to idle', () => {
    const u = makeUnit();
    u.attackTarget('e1');
    u.resetCombatState();
    expect(u.targetEntityId).toBeNull();
    expect(u.state).toBe('idle');
    expect(u.attackTimer).toBe(0);
  });

  it('calls releaseGatherSlot when targetResourceId is set', () => {
    const u = makeUnit();
    u.targetResourceId = 'f1';
    const cb = vi.fn();
    u.resetCombatState(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not call releaseGatherSlot when targetResourceId is null', () => {
    const u = makeUnit();
    const cb = vi.fn();
    u.resetCombatState(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('nulls targetResourceId after release callback', () => {
    const u = makeUnit();
    u.targetResourceId = 'f1';
    u.resetCombatState(() => {});
    expect(u.targetResourceId).toBeNull();
  });

  it('clears aiLockedAction, holdPosition, unloadTarget, pursue timers', () => {
    const u = makeUnit();
    u.aiLockedAction = 'retreat';
    u.holdPosition = true;
    u.unloadTarget = { x: 1, y: 1 };
    u.pursueFailTimer = 5;
    u.pursueRetickTimer = 3;
    u.resetCombatState();
    expect(u.aiLockedAction).toBeNull();
    expect(u.holdPosition).toBe(false);
    expect(u.unloadTarget).toBeNull();
    expect(u.pursueFailTimer).toBe(0);
    expect(u.pursueRetickTimer).toBe(0);
  });

  it('restores baseAttackDamage when set (P1-F5 charge-strike cleanup)', () => {
    const u = makeUnit();
    u.baseAttackDamage = 15;
    u.attackDamage = 30;
    u.resetCombatState();
    expect(u.attackDamage).toBe(15);
    expect(u.baseAttackDamage).toBe(0);
  });

  it('does not touch attackDamage when baseAttackDamage is 0', () => {
    const u = makeUnit();
    u.attackDamage = 10;
    u.resetCombatState();
    expect(u.attackDamage).toBe(10);
  });

  it('resets abilityCharges to 0 and clears alchemy/void buffs', () => {
    const u = makeUnit();
    u.abilityCharges = 2;
    u.alchemyBuffTimer = 10;
    u.alchemyBuffType = 'strength';
    u.alchemyBuffValue = 0.3;
    u.isVoidOvercharged = true;
    u.voidOverloadTimer = 5;
    u.resetCombatState();
    expect(u.abilityCharges).toBe(0);
    expect(u.alchemyBuffTimer).toBe(0);
    expect(u.alchemyBuffType).toBe('none');
    expect(u.alchemyBuffValue).toBe(0);
    expect(u.isVoidOvercharged).toBe(false);
    expect(u.voidOverloadTimer).toBe(0);
  });
});

// ============ Building ============

describe('Building construction & defaults', () => {
  it('constructor sets constructing state and defaults', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    expect(b.state).toBe('constructing');
    expect(b.buildProgress).toBe(0);
    expect(b.rallyPoint).toBeNull();
    expect(b.productionQueue).toEqual([]);
    expect(b.maxQueueSize).toBe(5);
    expect(b.researchingTechId).toBeNull();
    expect(b.researchProgress).toBe(0);
    expect(b.builderId).toBeNull();
    expect(b.sight).toBe(6);
    expect(b.productionSpeedBonus).toBe(0);
    expect(b.attackDamage).toBe(0);
  });
});

describe('Building.complete', () => {
  it('sets state to idle and buildProgress to 1', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    b.complete();
    expect(b.state).toBe('idle');
    expect(b.buildProgress).toBe(1);
  });

  it('is idempotent when called twice', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    b.complete();
    b.complete();
    expect(b.state).toBe('idle');
    expect(b.buildProgress).toBe(1);
  });
});

describe('Building.canEnqueue', () => {
  it('returns false while constructing', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    expect(b.canEnqueue()).toBe(false);
  });

  it('returns true when completed and queue under cap', () => {
    const b = makeBuilding(); // completed by default
    expect(b.canEnqueue()).toBe(true);
  });

  it('returns false when queue is at maxQueueSize', () => {
    const b = makeBuilding();
    for (let i = 0; i < 5; i++) b.productionQueue.push({ unitDefId: 'x', timeRemaining: 1, totalTime: 1 });
    expect(b.canEnqueue()).toBe(false);
  });

  it('returns true at maxQueueSize-1 (boundary below cap)', () => {
    const b = makeBuilding();
    for (let i = 0; i < 4; i++) b.productionQueue.push({ unitDefId: 'x', timeRemaining: 1, totalTime: 1 });
    expect(b.canEnqueue()).toBe(true);
  });

  it('returns true while researching if under cap (researching is not constructing)', () => {
    const b = makeBuilding();
    b.state = 'researching';
    expect(b.canEnqueue()).toBe(true);
  });
});

describe('Building.enqueueProduction', () => {
  const item = (id: string) => ({ unitDefId: id, timeRemaining: 5, totalTime: 5 });

  it('on idle building sets state to producing', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    expect(b.state).toBe('producing');
    expect(b.productionQueue).toHaveLength(1);
  });

  it('while already producing keeps state and appends', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    expect(b.state).toBe('producing');
    expect(b.productionQueue).toHaveLength(2);
  });

  it('while researching does NOT change state (P1-CC fix)', () => {
    const b = makeBuilding();
    b.state = 'researching';
    b.enqueueProduction(item('a'));
    expect(b.state).toBe('researching');
    expect(b.productionQueue).toHaveLength(1);
  });
});

describe('Building.cancelProduction', () => {
  const item = (id: string) => ({ unitDefId: id, timeRemaining: 5, totalTime: 5 });

  it('removes first item and returns its unitDefId', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    expect(b.cancelProduction(0)).toBe('a');
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['b']);
  });

  it('removes last item', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    expect(b.cancelProduction(1)).toBe('b');
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['a']);
  });

  it('removes middle item preserving order', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    b.enqueueProduction(item('c'));
    expect(b.cancelProduction(1)).toBe('b');
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['a', 'c']);
  });

  it('on last queue item transitions producing to idle', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    expect(b.cancelProduction(0)).toBe('a');
    expect(b.state).toBe('idle');
    expect(b.productionQueue).toHaveLength(0);
  });

  it('leaving non-empty queue keeps producing state', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    b.cancelProduction(0);
    expect(b.state).toBe('producing');
  });

  it('out-of-bounds index returns null and does not mutate queue', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    expect(b.cancelProduction(5)).toBeNull();
    expect(b.productionQueue).toHaveLength(1);
  });

  it('negative index returns null', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    expect(b.cancelProduction(-1)).toBeNull();
    expect(b.productionQueue).toHaveLength(1);
  });

  it('out-of-bounds on empty producing queue transitions to idle', () => {
    const b = makeBuilding();
    b.state = 'producing';
    expect(b.productionQueue).toHaveLength(0);
    expect(b.cancelProduction(0)).toBeNull();
    expect(b.state).toBe('idle');
  });

  it('out-of-bounds on non-empty queue leaves state producing', () => {
    const b = makeBuilding();
    b.enqueueProduction(item('a'));
    b.enqueueProduction(item('b'));
    b.cancelProduction(99);
    expect(b.state).toBe('producing');
  });
});

describe('Unit.takeDamage does not change state field (death handled externally)', () => {
  it('guard: takeDamage kills but leaves state as idle', () => {
    const u = makeUnit({ hp: 10 });
    u.takeDamage(100);
    expect(u.isAlive).toBe(false);
    expect(u.state).toBe('idle'); // state NOT changed to 'dead'
  });
});
