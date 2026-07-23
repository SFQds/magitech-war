/**
 * MilitaryAI 单元测试 - 撤退/防守/进攻/视野/目标权重
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MilitaryAI } from './MilitaryAI';
import { StrategyDirective } from './StrategyManager';
import { makeWorld, makeUnit, makeBuilding, makeCommandCenter } from '../__fixtures__/factories';

const EARLY: StrategyDirective = {
  phase: 'early', aggression: 0.1, expansion: 0.8, defense: 0.2,
  preferredUnits: ['unit_worker', 'unit_rifleman'],
};

function setupAI(owner = 1, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const world = makeWorld(32, 32, true);
  return { world, ai: new MilitaryAI(world, owner, difficulty) };
}

describe('MilitaryAI basics', () => {
  it('returns [] when ownCombat is empty (only workers)', () => {
    const { ai } = setupAI();
    const worker = makeUnit({ owner: 1, spriteKey: 'unit_worker', hp: 80 });
    expect(ai.evaluate([worker], [], EARLY)).toEqual([]);
  });

  it('does NOT see enemy beyond all own units/buildings sight', () => {
    const { ai } = setupAI();
    const own = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 5, hp: 100 });
    own.sight = 5;
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 20, tileY: 5, hp: 100 });
    const cmds = ai.evaluate([own, enemy], [], EARLY);
    // enemy invisible -> no attack_move
    expect(cmds.every(c => c.type !== 'attack_move')).toBe(true);
  });
});

describe('MilitaryAI retreat', () => {
  it('retreats when hpPercent < retreatThreshold (normal 0.30)', () => {
    const { ai } = setupAI(1, 'normal');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 5, hp: 25 });
    unit.maxHp = 100;
    const cc = makeCommandCenter(1, 10, 10);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    ai.evaluate([unit, enemy], [cc], EARLY);
    expect(unit.aiLockedAction).toBe('retreat');
  });

  it('easy AI never retreats (skipRetreat) even at 1 hp', () => {
    const { ai } = setupAI(1, 'easy');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 5, hp: 1 });
    unit.maxHp = 100;
    const cc = makeCommandCenter(1, 10, 10);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    ai.evaluate([unit, enemy], [cc], EARLY);
    expect(unit.aiLockedAction).not.toBe('retreat');
  });

  it('hard retreats at 0.45 threshold', () => {
    const { ai } = setupAI(1, 'hard');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 5, hp: 44 });
    unit.maxHp = 100;
    const cc = makeCommandCenter(1, 10, 10);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    ai.evaluate([unit, enemy], [cc], EARLY);
    expect(unit.aiLockedAction).toBe('retreat');
  });

  it('with no own buildings, retreat clears aiLockedAction (no permanent lock)', () => {
    const { ai } = setupAI(1, 'normal');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 5, hp: 20 });
    unit.maxHp = 100;
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    ai.evaluate([unit, enemy], [], EARLY);
    expect(unit.aiLockedAction).toBeNull();
  });

  it('unit in recover near building heals +6/tick (hard only)', () => {
    const { ai } = setupAI(1, 'hard');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 10, tileY: 10, hp: 50 });
    unit.maxHp = 100;
    unit.aiLockedAction = 'recover';
    const cc = makeCommandCenter(1, 10, 10);
    ai.evaluate([unit], [cc], EARLY);
    expect(unit.hp).toBe(56); // 50 + 3*2
  });

  it('recovering unit above RECOVER_HP_TARGET(0.7) clears aiLockedAction and sets retreatCooldown', () => {
    const { ai } = setupAI(1, 'normal');
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 10, tileY: 10, hp: 75 });
    unit.maxHp = 100;
    unit.aiLockedAction = 'recover';
    const cc = makeCommandCenter(1, 10, 10);
    ai.evaluate([unit], [cc], EARLY);
    expect(unit.aiLockedAction).toBeNull();
  });
});

describe('MilitaryAI defense', () => {
  it('assigns nearest idle defender to enemy within 8 tiles of own building', () => {
    const { ai } = setupAI(1, 'normal');
    const cc = makeCommandCenter(1, 5, 5);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 7, tileY: 5, hp: 100 });
    const defender = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 9, tileY: 9, hp: 100 });
    ai.evaluate([defender, enemy], [cc], EARLY);
    expect(defender.aiLockedAction).toBe('defend');
    expect(defender.targetEntityId).toBe(enemy.id);
  });

  it('defender keeps defending while target alive (no reassignment)', () => {
    const { ai } = setupAI(1, 'normal');
    const cc = makeCommandCenter(1, 5, 5);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 7, tileY: 5, hp: 100 });
    const defender = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    defender.aiLockedAction = 'defend';
    defender.attackTarget(enemy.id);
    const cmds = ai.evaluate([defender, enemy], [cc], EARLY);
    // defend + target alive -> continue (no new commands for this unit)
    expect(cmds.filter(c => c.unitIds.includes(defender.id))).toHaveLength(0);
  });

  it('defender clears lock when its target dies', () => {
    const { ai } = setupAI(1, 'normal');
    const cc = makeCommandCenter(1, 5, 5);
    const defender = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    defender.aiLockedAction = 'defend';
    defender.targetEntityId = 'dead_enemy';
    ai.evaluate([defender], [cc], EARLY);
    expect(defender.aiLockedAction).toBeNull();
    expect(defender.targetEntityId).toBeNull();
  });
});

describe('MilitaryAI offense', () => {
  it('normal requires 3 idle units before attacking (attackThreshold=3)', () => {
    const { ai } = setupAI(1, 'normal');
    // place CC far from enemy so defense block does NOT preempt (enemy > 8 tiles from CC)
    const cc = makeCommandCenter(1, 5, 5);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 20, tileY: 5, hp: 100 });
    // own rifleman near enemy so AI can see it (within sight 5)
    const u1 = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 17, tileY: 5, hp: 100 });
    const u2 = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 16, tileY: 5, hp: 100 });
    // 2 idle units -> no offense (defense not triggered, enemy far from CC)
    let cmds = ai.evaluate([u1, u2, enemy], [cc], EARLY);
    expect(cmds.some(c => c.type === 'attack_move')).toBe(false);
    // 3 idle units -> offense fires
    const u3 = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 15, tileY: 5, hp: 100 });
    cmds = ai.evaluate([u1, u2, u3, enemy], [cc], EARLY);
    expect(cmds.some(c => c.type === 'attack_move')).toBe(true);
  });

  it('hard attacks with 1 idle unit (attackThreshold=1)', () => {
    const { ai } = setupAI(1, 'hard');
    const cc = makeCommandCenter(1, 5, 5);
    const enemy = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    const unit = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 7, hp: 100 });
    const cmds = ai.evaluate([unit, enemy], [cc], EARLY);
    expect(cmds.some(c => c.type === 'attack_move')).toBe(true);
  });
});

describe('MilitaryAI target selection priority', () => {
  it('selectBestTarget prefers enemy attacking own building (priority 100) over low-hp enemy', () => {
    const { ai } = setupAI(1, 'hard');
    const cc = makeCommandCenter(1, 5, 5);
    // enemyA targeting our CC
    const enemyA = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    enemyA.targetEntityId = cc.id;
    // enemyB low hp
    const enemyB = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 10 });
    enemyB.maxHp = 100;
    const attacker = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', tileX: 5, tileY: 6, hp: 100 });
    const cmds = ai.evaluate([attacker, enemyA, enemyB], [cc], EARLY);
    // attacker should target enemyA (priority 100)
    expect(attacker.targetEntityId).toBe(enemyA.id);
  });
});
