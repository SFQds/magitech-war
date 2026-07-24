/**
 * Projectile 实体单元测试 - 投射物
 *
 * 覆盖构造默认值、reset() 对象池复用、继承自 Entity 的 takeDamage。
 * Projectile 生命周期短，ObjectPool 复用，reset 是关键方法。
 */
import { describe, it, expect } from 'vitest';
import { Projectile } from './Projectile';

describe('Projectile - 构造', () => {
  it('设置基础战斗字段与默认 isHoming=true', () => {
    const p = new Projectile(0, 'arcane_empire', 1, 2, 'src1', 'tgt1', 8, 25, 'physical');
    expect(p.owner).toBe(0);
    expect(p.faction).toBe('arcane_empire');
    expect(p.tileX).toBe(1);
    expect(p.tileY).toBe(2);
    expect(p.sourceId).toBe('src1');
    expect(p.targetId).toBe('tgt1');
    expect(p.speed).toBe(8);
    expect(p.damage).toBe(25);
    expect(p.damageType).toBe('physical');
    expect(p.isHoming).toBe(true); // 默认
  });

  it('显式 isHoming=false 生效', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'magic', false);
    expect(p.isHoming).toBe(false);
  });

  it('hp=1（命中即销毁），armorType=light，spriteKey=proj', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    expect(p.hp).toBe(1);
    expect(p.maxHp).toBe(1);
    expect(p.armorType).toBe('light');
    expect(p.spriteKey).toBe('projectile');
  });

  it('rawDamage/corrosionPenalty 默认为 0', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    expect(p.rawDamage).toBe(0);
    expect(p.corrosionPenalty).toBe(0);
  });

  it('id 以 proj_ 前缀生成', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    expect(p.id.startsWith('proj_')).toBe(true);
  });

  it('支持所有 DamageType', () => {
    for (const dt of ['physical', 'magic', 'alchemy', 'crystal', 'void'] as const) {
      const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, dt);
      expect(p.damageType).toBe(dt);
    }
  });
});

describe('Projectile.reset（对象池复用）', () => {
  it('重置 owner/faction/位置/sourceId/targetId/damage/damageType', () => {
    const p = new Projectile(0, 'arcane_empire', 1, 2, 's', 't', 5, 10, 'physical');
    p.reset(1, 'hammer_federation', 9, 8, 's2', 't2', 50, 'magic');
    expect(p.owner).toBe(1);
    expect(p.faction).toBe('hammer_federation');
    expect(p.tileX).toBe(9);
    expect(p.tileY).toBe(8);
    expect(p.sourceId).toBe('s2');
    expect(p.targetId).toBe('t2');
    expect(p.damage).toBe(50);
    expect(p.damageType).toBe('magic');
  });

  it('重置后 hp=1 且 isActive=true（复活用于复用）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    p.takeDamage(1); // 销毁
    expect(p.isActive).toBe(false);
    expect(p.hp).toBe(0);
    p.reset(0, 'arcane_empire', 0, 0, 's', 't', 10, 'physical');
    expect(p.hp).toBe(1);
    expect(p.isActive).toBe(true);
  });

  it('reset 不更新 speed 和 isHoming（保留构造期值）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 12, 10, 'physical', false);
    p.reset(1, 'hammer_federation', 0, 0, 's2', 't2', 50, 'magic');
    expect(p.speed).toBe(12); // 保留原值
    expect(p.isHoming).toBe(false); // 保留原值
  });

  it('reset 不更新 rawDamage/corrosionPenalty（外部按需设置）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    p.rawDamage = 30;
    p.corrosionPenalty = 5;
    p.reset(0, 'arcane_empire', 0, 0, 's', 't', 10, 'physical');
    expect(p.rawDamage).toBe(30);
    expect(p.corrosionPenalty).toBe(5);
  });

  it('reset 不更新 damageType 之外的字段，多次复用累积同一实例', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    const id1 = p.id;
    p.reset(0, 'arcane_empire', 1, 1, 's', 't', 10, 'magic');
    p.reset(0, 'arcane_empire', 2, 2, 's', 't', 20, 'void');
    expect(p.id).toBe(id1); // 同一实例
    expect(p.tileX).toBe(2);
    expect(p.damage).toBe(20);
    expect(p.damageType).toBe('void');
  });
});

describe('Projectile.takeDamage（命中销毁）', () => {
  it('1 点伤害即销毁（hp=1, isActive=false, 返回 true）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    expect(p.takeDamage(1)).toBe(true);
    expect(p.hp).toBe(0);
    expect(p.isActive).toBe(false);
  });

  it('护甲减伤：light armor=0 时 1 伤害直接命中', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    p.armor = 0;
    expect(p.takeDamage(1)).toBe(true);
  });

  it('已销毁后再次 takeDamage 返回 false 且不变化', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    p.takeDamage(1);
    const hp = p.hp;
    expect(p.takeDamage(50)).toBe(false);
    expect(p.hp).toBe(hp);
  });
});

describe('Projectile - 字段可变性', () => {
  it('rawDamage 可在构造后设置（AOE 溅射用）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'alchemy');
    p.rawDamage = 40;
    expect(p.rawDamage).toBe(40);
  });

  it('corrosionPenalty 可在构造后设置（腐蚀弹用）', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'alchemy');
    p.corrosionPenalty = 3;
    expect(p.corrosionPenalty).toBe(3);
  });

  it('tileX/tileY 可随飞行更新', () => {
    const p = new Projectile(0, 'arcane_empire', 0, 0, 's', 't', 5, 10, 'physical');
    p.tileX = 3.5;
    p.tileY = 4.5;
    expect(p.tileX).toBe(3.5);
    expect(p.tileY).toBe(4.5);
  });
});
