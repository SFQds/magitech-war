/**
 * UnitSpecialSystem 单元测试 - L3 单位特殊机制
 *
 * 验证: 移动工坊维修光环、不稳定水晶倒计时爆炸、炼金巨像死亡自爆、
 *       秘法炮台充能×3、符文泰坦混合伤害切换。
 *       奥术壁垒坚守buff、腐蚀巨兽叠甲、虚空行者闪烁、攻城炮对建筑增伤。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnitSpecialSystem } from './UnitSpecialSystem';
import { makeUnit } from '../__fixtures__/factories';
import { EventBus } from '../utils/EventBus';

beforeEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });
afterEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });

describe('UnitSpecialSystem - 移动工坊 (unit_mobile_workshop)', () => {
  it('周围4格内友方机械单位每秒回血 maxHp*1.5%（下限1）', () => {
    const ws = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_mobile_workshop' });
    ws.maxHp = 300; ws.hp = 300;
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 6, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    UnitSpecialSystem.update([ws, mech], 1.0);
    // 400*0.015 = 6 -> 100+6 = 106
    expect(mech.hp).toBe(106);
  });

  it('不修自己（移动工坊自身 hp 不变）', () => {
    const ws = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_mobile_workshop' });
    ws.maxHp = 300; ws.hp = 100;
    UnitSpecialSystem.update([ws], 1.0);
    expect(ws.hp).toBe(100);
  });

  it('超出4格半径的机械单位不受增益', () => {
    const ws = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_mobile_workshop' });
    ws.maxHp = 300; ws.hp = 300;
    const mech = makeUnit({ owner: 0, tileX: 10, tileY: 5, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    UnitSpecialSystem.update([ws, mech], 1.0);
    expect(mech.hp).toBe(100);
  });

  it('非机械单位不受增益', () => {
    const ws = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_mobile_workshop' });
    ws.maxHp = 300; ws.hp = 300;
    const infantry = makeUnit({ owner: 0, tileX: 5, tileY: 6, armorType: 'light', hp: 50 });
    infantry.maxHp = 100;
    UnitSpecialSystem.update([ws, infantry], 1.0);
    expect(infantry.hp).toBe(50);
  });
});

describe('UnitSpecialSystem - 不稳定水晶炸弹 (unit_unstable_crystal)', () => {
  it('生成后10秒内不爆炸', () => {
    const bomb = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_unstable_crystal' });
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 1000 });
    enemy.maxHp = 1000;
    UnitSpecialSystem.update([bomb, enemy], 9.0);
    expect(bomb.isAlive).toBe(true);
    expect(enemy.hp).toBe(1000); // 未受伤害
  });

  it('10秒后爆炸：范围内所有单位受500水晶伤害（不分敌我）', () => {
    const bomb = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_unstable_crystal' });
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 1000 });
    enemy.maxHp = 1000;
    const ally = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 600 });
    ally.maxHp = 600;
    UnitSpecialSystem.update([bomb, enemy, ally], 10.5);
    // 炸弹自毁
    expect(bomb.isAlive).toBe(false);
    // 敌方 1000 - 500 = 500（水晶伤害）
    expect(enemy.hp).toBeLessThanOrEqual(500);
    expect(enemy.hp).toBeGreaterThan(450); // 受护甲减免，约 500-armor
    // 友方 600 - 500 受伤
    expect(ally.hp).toBeLessThan(600);
  });

  it('爆炸范围外单位不受伤害', () => {
    const bomb = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_unstable_crystal' });
    const far = makeUnit({ owner: 1, tileX: 20, tileY: 5, hp: 1000 });
    far.maxHp = 1000;
    UnitSpecialSystem.update([bomb, far], 10.5);
    expect(far.hp).toBe(1000);
  });
});

describe('UnitSpecialSystem - 炼金巨像死亡自爆 (unit_alchemy_colossus)', () => {
  it('死亡时对范围内所有单位造成300炼金伤害', () => {
    const colossus = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_alchemy_colossus' });
    colossus.maxHp = 800; colossus.hp = 0; colossus.isActive = false;
    const enemy1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 500 });
    enemy1.maxHp = 500;
    const enemy2 = makeUnit({ owner: 1, tileX: 20, tileY: 5, hp: 500 });
    enemy2.maxHp = 500;
    const hits = UnitSpecialSystem.onUnitDeath(colossus, [colossus, enemy1, enemy2]);
    expect(hits).toBe(1); // 仅 enemy1 在范围内
    expect(enemy1.hp).toBeLessThan(500); // 受300炼金伤害（护甲减免后）
    expect(enemy1.hp).toBeGreaterThan(150);
    expect(enemy2.hp).toBe(500); // 范围外未受伤
  });

  it('非炼金巨像单位死亡不触发自爆', () => {
    const rifleman = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    rifleman.hp = 0; rifleman.isActive = false;
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 500 });
    enemy.maxHp = 500;
    const hits = UnitSpecialSystem.onUnitDeath(rifleman, [rifleman, enemy]);
    expect(hits).toBe(0);
    expect(enemy.hp).toBe(500);
  });
});

describe('UnitSpecialSystem.getAttackDamageMult - 秘法炮台充能', () => {
  it('秘法炮台有充能时 ×3，并消耗1层充能', () => {
    const cannon = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_arcane_cannon' });
    cannon.abilityCharges = 2;
    const mult = UnitSpecialSystem.getAttackDamageMult(cannon);
    expect(mult).toBe(3.0);
    expect(cannon.abilityCharges).toBe(1); // 消耗1层
    // 再次调用仍 ×3（还剩1层）
    const mult2 = UnitSpecialSystem.getAttackDamageMult(cannon);
    expect(mult2).toBe(3.0);
    expect(cannon.abilityCharges).toBe(0);
  });

  it('秘法炮台无充能时 ×1', () => {
    const cannon = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_arcane_cannon' });
    cannon.abilityCharges = 0;
    expect(UnitSpecialSystem.getAttackDamageMult(cannon)).toBe(1.0);
  });

  it('非秘法炮台单位始终 ×1', () => {
    const rifleman = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    rifleman.abilityCharges = 5; // 即使有充能也不触发
    expect(UnitSpecialSystem.getAttackDamageMult(rifleman)).toBe(1.0);
  });
});

describe('UnitSpecialSystem.getAttackDamageType - 符文泰坦混合伤害', () => {
  it('符文泰坦对重甲目标用魔法', () => {
    const titan = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rune_titan' });
    expect(UnitSpecialSystem.getAttackDamageType(titan, 'heavy', 'physical')).toBe('magic');
    expect(UnitSpecialSystem.getAttackDamageType(titan, 'structure', 'physical')).toBe('magic');
    expect(UnitSpecialSystem.getAttackDamageType(titan, 'mechanical', 'physical')).toBe('magic');
  });

  it('符文泰坦对轻甲目标用物理', () => {
    const titan = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rune_titan' });
    expect(UnitSpecialSystem.getAttackDamageType(titan, 'light', 'physical')).toBe('physical');
    expect(UnitSpecialSystem.getAttackDamageType(titan, 'bio', 'physical')).toBe('physical');
  });

  it('非符文泰坦返回 fallback', () => {
    const rifleman = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    expect(UnitSpecialSystem.getAttackDamageType(rifleman, 'heavy', 'physical')).toBe('physical');
    expect(UnitSpecialSystem.getAttackDamageType(rifleman, 'light', 'magic')).toBe('magic');
  });
});

// ============ 新 L3: 奥术壁垒 ============

describe('UnitSpecialSystem - 奥术壁垒 (unit_arcane_bastion)', () => {
  it('坚守时 +10护甲 +100护盾', () => {
    const bastion = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_arcane_bastion' });
    bastion.baseArmor = 6;
    bastion.armor = 6;
    bastion.holdPosition = true;
    UnitSpecialSystem.update([bastion], 0.5);
    expect(bastion.armor).toBe(16); // 6 + 10
    expect(bastion.shieldHp).toBe(100);
    expect(bastion.maxShieldHp).toBe(100);
  });

  it('非坚守时恢复基础护甲', () => {
    const bastion = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_arcane_bastion' });
    bastion.baseArmor = 6;
    bastion.armor = 16; // 之前加了 10
    bastion.holdPosition = false;
    UnitSpecialSystem.update([bastion], 0.5);
    expect(bastion.armor).toBe(6);
  });
});

// ============ 新 L3: 腐蚀巨兽 ============

describe('UnitSpecialSystem - 腐蚀巨兽 (unit_corrosion_beast)', () => {
  it('攻击命中叠1层减甲3', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    target.baseArmor = 5;
    target.armor = 5;
    UnitSpecialSystem.onCorrosionHit(target.id);
    expect(UnitSpecialSystem.getCorrosionPenalty(target.id)).toBe(3);
  });

  it('叠到5层上限 = 减甲15', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    target.baseArmor = 20;
    target.armor = 20;
    for (let i = 0; i < 6; i++) UnitSpecialSystem.onCorrosionHit(target.id);
    expect(UnitSpecialSystem.getCorrosionPenalty(target.id)).toBe(15);
  });

  it('腐蚀过期后恢复护甲', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    target.baseArmor = 10;
    target.armor = 10;
    UnitSpecialSystem.onCorrosionHit(target.id);
    UnitSpecialSystem.update([target], 6.0); // 超过5秒过期
    expect(UnitSpecialSystem.getCorrosionPenalty(target.id)).toBe(0);
    expect(target.armor).toBe(10); // 恢复
  });
});

// ============ 新 L3: 攻城炮 ============

describe('UnitSpecialSystem.getAttackDamageMult - 魔导攻城炮', () => {
  it('对建筑 (structure) ×1.5', () => {
    const siege = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_siege_engine' });
    expect(UnitSpecialSystem.getAttackDamageMult(siege, true)).toBe(1.5);
  });

  it('对非建筑 ×1', () => {
    const siege = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_siege_engine' });
    expect(UnitSpecialSystem.getAttackDamageMult(siege, false)).toBe(1.0);
  });

  it('非攻城炮单位不受影响', () => {
    const rifleman = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    expect(UnitSpecialSystem.getAttackDamageMult(rifleman, true)).toBe(1.0);
  });
});


// ============================================================
// 批4: 第二期阵营单位机制测试
// ============================================================
describe('UnitSpecialSystem - 批4 霜脊守卫 (unit_frost_guard)', () => {
  it('固守时护甲翻倍（baseArmor 30 -> 60）', () => {
    const guard = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_frost_guard' });
    guard.baseArmor = 30;
    guard.armor = 30;
    guard.holdPosition = true;
    UnitSpecialSystem.update([guard], 0.1);
    expect(guard.armor).toBe(60);
  });

  it('非固守时恢复基础护甲', () => {
    const guard = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_frost_guard' });
    guard.baseArmor = 30;
    guard.armor = 60;
    guard.holdPosition = false;
    UnitSpecialSystem.update([guard], 0.1);
    expect(guard.armor).toBe(30);
  });

  it('非霜脊守卫单位不受固守翻倍影响', () => {
    const rifle = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    rifle.baseArmor = 10;
    rifle.armor = 10;
    rifle.holdPosition = true;
    UnitSpecialSystem.update([rifle], 0.1);
    expect(rifle.armor).toBe(10);
  });
});

describe('UnitSpecialSystem - 批4 深矿破坏者 (unit_deep_destroyer)', () => {
  it('攻击溅射：对主目标相邻敌方单位造成 30% 伤害', () => {
    const attacker = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_deep_destroyer' });
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 6, hp: 1000 });
    const adjacent = makeUnit({ owner: 1, tileX: 5, tileY: 7, hp: 1000 });
    UnitSpecialSystem.onDeepDestroyerHit(attacker, target, [attacker, target, adjacent], 100, 'crystal');
    // 主目标不受溅射（仅 adjacent 受 30）
    expect(target.hp).toBe(1000);
    expect(adjacent.hp).toBeLessThan(1000);
  });

  it('溅射不误伤己方单位', () => {
    const attacker = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_deep_destroyer' });
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 6, hp: 1000 });
    const ally = makeUnit({ owner: 0, tileX: 5, tileY: 7, hp: 1000 });
    UnitSpecialSystem.onDeepDestroyerHit(attacker, target, [attacker, target, ally], 100, 'crystal');
    expect(ally.hp).toBe(1000);
  });
});

describe('UnitSpecialSystem - 批4 翡翠斥候 (unit_jade_scout)', () => {
  it('isUnitStealth: 翡翠斥候永久隐形', () => {
    const scout = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_jade_scout' });
    expect(UnitSpecialSystem.isUnitStealth(scout)).toBe(true);
  });

  it('isUnitStealth: 普通单位不隐形', () => {
    const rifle = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });
    expect(UnitSpecialSystem.isUnitStealth(rifle)).toBe(false);
  });

  it('markTarget + getMarkBonus: 被标记单位受伤 +25%', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5 });
    UnitSpecialSystem.markTarget(target.id);
    expect(UnitSpecialSystem.getMarkBonus(target.id)).toBe(0.25);
  });

  it('未标记单位 getMarkBonus = 0', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5 });
    expect(UnitSpecialSystem.getMarkBonus(target.id)).toBe(0);
  });

  it('标记 30 秒后过期', () => {
    const target = makeUnit({ owner: 1, tileX: 5, tileY: 5 });
    UnitSpecialSystem.markTarget(target.id);
    UnitSpecialSystem.update([target], 31);
    expect(UnitSpecialSystem.getMarkBonus(target.id)).toBe(0);
  });

  it('翡翠斥候靠近敌方 3 格内自动标记', () => {
    const scout = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_jade_scout' });
    const enemy = makeUnit({ owner: 1, tileX: 5, tileY: 7, hp: 100 });
    UnitSpecialSystem.update([scout, enemy], 0.1);
    expect(UnitSpecialSystem.getMarkBonus(enemy.id)).toBe(0.25);
  });
});
