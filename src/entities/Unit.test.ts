/**
 * Unit 单元测试 — 补齐实体层覆盖缺口
 *
 * Hero/Projectile/ResourceField/Entity 均有专属测试，唯独 Unit 缺失。
 * 本文件覆盖 Unit 特有方法（setPath/clearPath/resetCombatState/attackTarget/
 * stopAttacking/addCharge/consumeCharge）及构造默认值、状态转换契约。
 *
 * takeDamage/heal/isAlive 等基类方法由 Entity 覆盖，此处只测 Unit 特有交互。
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { makeUnit, makeResourceField, bindToField } from '../__fixtures__/factories';

// ============ 构造默认值 ============

describe('Unit - 构造默认值', () => {
  it('初始化所有字段', () => {
    const u = new Unit(0, 'arcane_empire', 3, 4, 100, 'light', 'infantry', 2, 10, 'physical', 3, 1, 5, 'unit_rifleman');
    expect(u.owner).toBe(0);
    expect(u.faction).toBe('arcane_empire');
    expect(u.tileX).toBe(3);
    expect(u.tileY).toBe(4);
    expect(u.maxHp).toBe(100);
    expect(u.hp).toBe(100);
    expect(u.armorType).toBe('light');
    expect(u.category).toBe('infantry');
    expect(u.speed).toBe(2);
    expect(u.attackDamage).toBe(10);
    expect(u.attackType).toBe('physical');
    expect(u.attackRange).toBe(3);
    expect(u.attackCooldown).toBe(1);
    expect(u.attackTimer).toBe(0);
    expect(u.sight).toBe(5);
    expect(u.spriteKey).toBe('unit_rifleman');
    expect(u.state).toBe('idle');
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
    expect(u.isActive).toBe(true);
    expect(u.isAlive).toBe(true);
  });

  it('abilities 参数缺省为空数组', () => {
    const u = makeUnit();
    expect(u.abilities).toEqual([]);
  });

  it('abilities 显式传入被保留', () => {
    const u = new Unit(0, 'arcane_empire', 0, 0, 100, 'light', 'infantry', 2, 10, 'physical', 3, 1, 5, 'unit_x', [{ id: 'test', name: '测试' } as any]);
    expect(u.abilities.length).toBe(1);
  });
});

// ============ setPath / clearPath ============

describe('Unit - setPath', () => {
  it('设置路径并进入 moving 状态', () => {
    const u = makeUnit();
    u.state = 'idle';
    u.setPath([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
    expect(u.path.length).toBe(2);
    expect(u.pathIndex).toBe(0);
    expect(u.state).toBe('moving');
  });

  it('空路径不改变 state (不进入 moving)', () => {
    const u = makeUnit();
    u.state = 'idle';
    u.setPath([]);
    expect(u.path).toEqual([]);
    expect(u.state).toBe('idle');
  });

  it('重设路径重置 pathIndex 为 0', () => {
    const u = makeUnit();
    u.setPath([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
    u.pathIndex = 1; // 模拟行进到第二段
    u.setPath([{ x: 7, y: 5 }, { x: 8, y: 5 }]);
    expect(u.pathIndex).toBe(0);
  });
});

describe('Unit - clearPath', () => {
  it('清空路径并从 moving 回到 idle', () => {
    const u = makeUnit();
    u.setPath([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
    expect(u.state).toBe('moving');
    u.clearPath();
    expect(u.path).toEqual([]);
    expect(u.pathIndex).toBe(0);
    expect(u.state).toBe('idle');
  });

  it('从 pursuing 回到 idle', () => {
    const u = makeUnit();
    u.state = 'pursuing';
    u.clearPath();
    expect(u.state).toBe('idle');
  });

  it('attacking 状态不受 clearPath 影响 (保留战斗)', () => {
    const u = makeUnit();
    u.state = 'attacking';
    u.clearPath();
    expect(u.state).toBe('attacking');
  });

  it('idle 状态保持 idle', () => {
    const u = makeUnit();
    u.state = 'idle';
    u.clearPath();
    expect(u.state).toBe('idle');
  });
});

// ============ attackTarget / stopAttacking ============

describe('Unit - attackTarget', () => {
  it('设置目标并进入 attacking 状态, 重置 attackTimer', () => {
    const u = makeUnit();
    u.attackTimer = 5;
    u.attackTarget('enemy_123');
    expect(u.targetEntityId).toBe('enemy_123');
    expect(u.state).toBe('attacking');
    expect(u.attackTimer).toBe(0);
  });
});

describe('Unit - stopAttacking', () => {
  it('清除目标并从 attacking 回到 idle', () => {
    const u = makeUnit();
    u.attackTarget('enemy_123');
    expect(u.state).toBe('attacking');
    u.stopAttacking();
    expect(u.targetEntityId).toBeNull();
    expect(u.state).toBe('idle');
  });

  it('从 pursuing 回到 idle', () => {
    const u = makeUnit();
    u.state = 'pursuing';
    u.targetEntityId = 'enemy_x';
    u.stopAttacking();
    expect(u.targetEntityId).toBeNull();
    expect(u.state).toBe('idle');
  });

  it('idle 状态保持 idle, targetEntityId 仍被清空', () => {
    const u = makeUnit();
    u.state = 'idle';
    u.targetEntityId = 'stale';
    u.stopAttacking();
    expect(u.state).toBe('idle');
    expect(u.targetEntityId).toBeNull();
  });
});

// ============ addCharge / consumeCharge ============

describe('Unit - addCharge / consumeCharge (法师公会充能)', () => {
  it('addCharge 递增 abilityCharges', () => {
    const u = makeUnit();
    expect(u.abilityCharges).toBe(0);
    u.addCharge();
    expect(u.abilityCharges).toBe(1);
    u.addCharge();
    expect(u.abilityCharges).toBe(2);
  });

  it('addCharge 不超过 maxAbilityCharges (默认 3)', () => {
    const u = makeUnit();
    u.addCharge(); u.addCharge(); u.addCharge(); u.addCharge(); // 4 次
    expect(u.abilityCharges).toBe(3);
  });

  it('consumeCharge 成功时扣减并返回 true', () => {
    const u = makeUnit();
    u.addCharge(); u.addCharge();
    expect(u.consumeCharge(1)).toBe(true);
    expect(u.abilityCharges).toBe(1);
  });

  it('consumeCharge 不足时返回 false 且不扣减', () => {
    const u = makeUnit();
    expect(u.consumeCharge(1)).toBe(false);
    expect(u.abilityCharges).toBe(0);
  });

  it('consumeCharge 默认消耗 1', () => {
    const u = makeUnit();
    u.addCharge(); u.addCharge(); u.addCharge();
    expect(u.consumeCharge()).toBe(true);
    expect(u.abilityCharges).toBe(2);
  });

  it('consumeCharge 多层消耗成功', () => {
    const u = makeUnit();
    u.addCharge(); u.addCharge(); u.addCharge();
    expect(u.consumeCharge(3)).toBe(true);
    expect(u.abilityCharges).toBe(0);
  });

  it('consumeCharge 超过现有数量失败', () => {
    const u = makeUnit();
    u.addCharge();
    expect(u.consumeCharge(2)).toBe(false);
    expect(u.abilityCharges).toBe(1);
  });
});

// ============ resetCombatState ============

describe('Unit - resetCombatState (P1-S1 统一清理)', () => {
  it('清除战斗目标与路径, 回到 idle', () => {
    const u = makeUnit();
    u.attackTarget('enemy_1');
    u.setPath([{ x: 5, y: 5 }]);
    u.holdPosition = true;
    u.aiLockedAction = 'attack';
    u.attackTimer = 7;
    u.resetCombatState();
    expect(u.targetEntityId).toBeNull();
    expect(u.path).toEqual([]);
    expect(u.state).toBe('idle');
    expect(u.holdPosition).toBe(false);
    expect(u.aiLockedAction).toBeNull();
    expect(u.attackTimer).toBe(0);
  });

  it('释放采集槽: 调用 releaseGatherSlot 并清 targetResourceId', () => {
    const u = makeUnit();
    const field = makeResourceField(5, 5);
    bindToField(u, field, 1);
    expect(u.targetResourceId).toBe(field.id);
    expect(field.currentGatherers).toBe(1);
    let released = false;
    u.resetCombatState(() => { released = true; field.currentGatherers = 0; });
    expect(released).toBe(true);
    expect(u.targetResourceId).toBeNull();
    expect(field.currentGatherers).toBe(0);
  });

  it('无 releaseGatherSlot 时 targetResourceId 仍被清空 (但不调回调)', () => {
    const u = makeUnit();
    const field = makeResourceField(5, 5);
    bindToField(u, field, 1);
    u.resetCombatState(); // 不传回调
    expect(u.targetResourceId).toBeNull();
    // field.currentGatherers 未被回调修改, 仍为 1 (调用方需自行处理)
    expect(field.currentGatherers).toBe(1);
  });

  it('清除充能打击残留: baseAttackDamage>0 时恢复 attackDamage', () => {
    const u = makeUnit({ attackDamage: 10 });
    // 模拟充能打击生效: 备份原攻击力, 翻倍当前
    u.baseAttackDamage = 10;
    u.attackDamage = 20;
    u.resetCombatState();
    expect(u.attackDamage).toBe(10); // 恢复原始
    expect(u.baseAttackDamage).toBe(0); // 清零
  });

  it('baseAttackDamage=0 时不改变 attackDamage', () => {
    const u = makeUnit({ attackDamage: 15 });
    u.resetCombatState();
    expect(u.attackDamage).toBe(15);
  });

  it('清空 abilityCharges 与炼金/虚空 buff 残留', () => {
    const u = makeUnit();
    u.addCharge();
    u.alchemyBuffTimer = 5;
    u.alchemyBuffType = 'strength';
    u.alchemyBuffValue = 0.5;
    u.isVoidOvercharged = true;
    u.voidOverloadTimer = 3;
    u.resetCombatState();
    expect(u.abilityCharges).toBe(0);
    expect(u.alchemyBuffTimer).toBe(0);
    expect(u.alchemyBuffType).toBe('none');
    expect(u.alchemyBuffValue).toBe(0);
    expect(u.isVoidOvercharged).toBe(false);
    expect(u.voidOverloadTimer).toBe(0);
  });

  it('清空 pursueFailTimer / pursueRetickTimer / unloadTarget', () => {
    const u = makeUnit();
    u.pursueFailTimer = 9;
    u.pursueRetickTimer = 4;
    u.unloadTarget = { x: 1, y: 2 };
    u.resetCombatState();
    expect(u.pursueFailTimer).toBe(0);
    expect(u.pursueRetickTimer).toBe(0);
    expect(u.unloadTarget).toBeNull();
  });
});

// ============ 与基类交互 ============

describe('Unit - 与 Entity 基类交互', () => {
  it('takeDamage 致死 -> isAlive=false', () => {
    const u = makeUnit({ hp: 50 });
    expect(u.isAlive).toBe(true);
    u.takeDamage(99999, 'physical');
    expect(u.hp).toBe(0);
    expect(u.isActive).toBe(false);
    expect(u.isAlive).toBe(false);
  });

  it('死亡后 takeDamage 返回 false 且不再扣血', () => {
    const u = makeUnit({ hp: 50 });
    u.takeDamage(99999, 'physical');
    const hpAfterDeath = u.hp;
    const ret = u.takeDamage(100, 'physical');
    expect(ret).toBe(false);
    expect(u.hp).toBe(hpAfterDeath); // 死亡后不再受伤
  });
});
