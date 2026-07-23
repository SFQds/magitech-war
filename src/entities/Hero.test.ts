/**
 * Hero / ResourceField / Projectile 单元测试
 */
import { describe, it, expect } from 'vitest';
import { Hero } from './Hero';
import { ResourceField } from './ResourceField';
import { Projectile } from './Projectile';
import { HERO_DEFS } from '../config/heroData';
import { makeResourceField } from '../__fixtures__/factories';

function makeHero(owner = 0, tileX = 5, tileY = 5): Hero {
  return new Hero(owner, 'arcane_empire', tileX, tileY, HERO_DEFS['hero_isabelle'], 'hero_isabelle');
}

// ============ Hero ============

describe('Hero construction', () => {
  it('initializes hero fields from heroData', () => {
    const h = makeHero();
    expect(h.heroName).toBe('伊莎贝尔');
    expect(h.title).toBe('默库里合金发明者');
    expect(h.armor).toBe(8); // armorValue
    expect(h.level).toBe(1);
    expect(h.xp).toBe(0);
    expect(h.maxLevel).toBe(5);
    expect(h.skillCooldown).toBe(0);
    expect(h.skillCooldowns).toEqual([0, 0, 0]);
    expect(h.reviveTimer).toBe(0);
    expect(h.auraRadius).toBe(8);
    expect(h.supplyCost).toBe(HERO_DEFS['hero_isabelle'].cost.supply);
  });

  it('defaults auraRadius to 8 when heroData omits it (P1-D11)', () => {
    const data = { ...HERO_DEFS['hero_isabelle'] };
    delete (data as { auraRadius?: number }).auraRadius;
    const h = new Hero(0, 'arcane_empire', 5, 5, data, 'hero_isabelle');
    expect(h.auraRadius).toBe(8);
  });

  it('respects explicit auraRadius from heroData', () => {
    const data = { ...HERO_DEFS['hero_isabelle'], auraRadius: 12 };
    const h = new Hero(0, 'arcane_empire', 5, 5, data, 'hero_isabelle');
    expect(h.auraRadius).toBe(12);
  });

  it('defaults armor to 0 when heroData.armorValue omitted', () => {
    const data = { ...HERO_DEFS['hero_isabelle'] };
    delete (data as { armorValue?: number }).armorValue;
    const h = new Hero(0, 'arcane_empire', 5, 5, data, 'hero_isabelle');
    expect(h.armor).toBe(0);
  });
});

describe('Hero.xpToNextLevel', () => {
  it('returns level*80 for levels 1-4', () => {
    const h = makeHero();
    h.level = 1; expect(h.xpToNextLevel).toBe(80);
    h.level = 3; expect(h.xpToNextLevel).toBe(240);
    h.level = 4; expect(h.xpToNextLevel).toBe(320);
  });

  it('returns 0 at maxLevel', () => {
    const h = makeHero();
    h.level = 5;
    expect(h.xpToNextLevel).toBe(0);
  });
});

describe('Hero.gainXp', () => {
  it('below threshold does not level up and returns false', () => {
    const h = makeHero();
    expect(h.gainXp(50)).toBe(false);
    expect(h.level).toBe(1);
    expect(h.xp).toBe(50);
  });

  it('at exactly threshold levels up once', () => {
    const h = makeHero();
    expect(h.gainXp(80)).toBe(true);
    expect(h.level).toBe(2);
    expect(h.xp).toBe(0);
  });

  it('leveling increases maxHp by 15% (rounded)', () => {
    const h = makeHero();
    h.maxHp = 100; h.hp = 100;
    h.gainXp(80);
    expect(h.maxHp).toBe(115); // round(100*1.15)
  });

  it('leveling adds 50 hp capped at new maxHp', () => {
    const h = makeHero();
    h.maxHp = 100; h.hp = 100;
    h.gainXp(80);
    // hp = min(100+50, 115) = 115
    expect(h.hp).toBe(115);
  });

  it('leveling increases attackDamage by 10% (rounded)', () => {
    const h = makeHero();
    h.attackDamage = 20;
    h.gainXp(80);
    expect(h.attackDamage).toBe(22); // round(20*1.1)
  });

  it('rounding attackDamage uses Math.round (rounds .5 up)', () => {
    const h = makeHero();
    h.attackDamage = 15;
    h.gainXp(80);
    // round(15*1.1) = round(16.5) = 17 (Math.round rounds .5 up)
    expect(h.attackDamage).toBe(17);
  });

  it('large amount levels up multiple times in one call', () => {
    const h = makeHero();
    // Lv1 thresh 80, Lv2 thresh 160, Lv3 thresh 240
    // gainXp(400): 80->Lv2 (320 left), 160->Lv3 (160 left), 240 needed but only 160 -> stop
    h.gainXp(400);
    expect(h.level).toBe(3);
    expect(h.xp).toBe(160);
  });

  it('stops at maxLevel and zeroes remaining xp', () => {
    const h = makeHero();
    h.level = 4; // thresh 320
    h.gainXp(1000);
    expect(h.level).toBe(5);
    expect(h.xp).toBe(0);
  });

  it('when already maxLevel returns false and does not accumulate xp', () => {
    const h = makeHero();
    h.level = 5;
    expect(h.gainXp(100)).toBe(false);
    expect(h.xp).toBe(0);
  });
});

describe('Hero.hasSkillSlot / getAvailableSkillSlots', () => {
  it('slot0 unlocked at level 1', () => {
    const h = makeHero();
    expect(h.hasSkillSlot(0)).toBe(true);
  });

  it('slot1 unlocked at level 3, locked at level 2', () => {
    const h = makeHero();
    h.level = 2; expect(h.hasSkillSlot(1)).toBe(false);
    h.level = 3; expect(h.hasSkillSlot(1)).toBe(true);
  });

  it('slot2 unlocked at level 5, locked at level 4', () => {
    const h = makeHero();
    h.level = 4; expect(h.hasSkillSlot(2)).toBe(false);
    h.level = 5; expect(h.hasSkillSlot(2)).toBe(true);
  });

  it('invalid index (3) requires level 5 (else branch)', () => {
    const h = makeHero();
    h.level = 5; expect(h.hasSkillSlot(3)).toBe(true);
    h.level = 4; expect(h.hasSkillSlot(3)).toBe(false);
  });

  it('getAvailableSkillSlots returns [0] at level 1', () => {
    const h = makeHero();
    expect(h.getAvailableSkillSlots()).toEqual([0]);
  });

  it('getAvailableSkillSlots returns [0,1] at level 3', () => {
    const h = makeHero();
    h.level = 3;
    expect(h.getAvailableSkillSlots()).toEqual([0, 1]);
  });

  it('getAvailableSkillSlots returns [0,1,2] at level 5', () => {
    const h = makeHero();
    h.level = 5;
    expect(h.getAvailableSkillSlots()).toEqual([0, 1, 2]);
  });
});

describe('Hero.canUseSkillSlot', () => {
  it('returns true for unlocked slot with no cooldown and alive', () => {
    const h = makeHero();
    h.level = 3;
    expect(h.canUseSkillSlot(1)).toBe(true);
  });

  it('returns false when slot on cooldown', () => {
    const h = makeHero();
    h.level = 3;
    h.skillCooldowns[1] = 5;
    expect(h.canUseSkillSlot(1)).toBe(false);
  });

  it('returns false when hero is dead', () => {
    const h = makeHero();
    h.takeDamage(99999);
    expect(h.canUseSkillSlot(0)).toBe(false);
  });

  it('returns false when slot not unlocked by level', () => {
    const h = makeHero();
    expect(h.canUseSkillSlot(1)).toBe(false); // L1, needs L3
  });

  it('returns false for out-of-range index (3)', () => {
    const h = makeHero();
    expect(h.canUseSkillSlot(3)).toBe(false);
  });

  it('returns false for negative index', () => {
    const h = makeHero();
    expect(h.canUseSkillSlot(-1)).toBe(false);
  });
});

describe('Hero.takeDamage (override)', () => {
  it('lethal sets reviveTimer to reviveCooldown', () => {
    const h = makeHero();
    h.takeDamage(99999);
    expect(h.reviveTimer).toBe(HERO_DEFS['hero_isabelle'].reviveCooldown); // 180
  });

  it('lethal resets all skillCooldowns to [0,0,0] and skillCooldown to 0', () => {
    const h = makeHero();
    h.skillCooldown = 10;
    h.skillCooldowns = [5, 3, 7];
    h.takeDamage(99999);
    expect(h.skillCooldown).toBe(0);
    expect(h.skillCooldowns).toEqual([0, 0, 0]);
  });

  it('non-lethal does not set reviveTimer or clear cooldowns', () => {
    const h = makeHero();
    h.skillCooldown = 10;
    h.skillCooldowns = [5, 3, 7];
    h.takeDamage(10);
    expect(h.reviveTimer).toBe(0);
    expect(h.skillCooldown).toBe(10);
    expect(h.skillCooldowns).toEqual([5, 3, 7]);
  });

  it('returns true on death (passthrough from parent)', () => {
    const h = makeHero();
    expect(h.takeDamage(99999)).toBe(true);
  });

  it('returns false on non-lethal (passthrough)', () => {
    const h = makeHero();
    expect(h.takeDamage(10)).toBe(false);
  });
});

// ============ ResourceField ============

describe('ResourceField construction', () => {
  it('sets neutral owner, structure armor, and resource defaults', () => {
    const f = makeResourceField(5, 0, 1000, 3);
    expect(f.owner).toBe(-1);
    expect(f.faction).toBe('arcane_empire');
    expect(f.armorType).toBe('structure');
    expect(f.maxHp).toBe(9999);
    expect(f.hp).toBe(9999);
    expect(f.amount).toBe(1000);
    expect(f.maxGatherers).toBe(3);
    expect(f.currentGatherers).toBe(0);
    expect(f.isActive).toBe(true);
    expect(f.id.startsWith('resource_')).toBe(true);
  });

  it('respects explicit maxGatherers', () => {
    const f = makeResourceField(5, 0, 1000, 5);
    expect(f.maxGatherers).toBe(5);
  });

  it('defaults maxGatherers to 3 when omitted', () => {
    const f = new ResourceField(5, 0, 'crystal', 1000);
    expect(f.maxGatherers).toBe(3);
  });
});

describe('ResourceField.gather', () => {
  it('with no arg defaults to 10', () => {
    const f = makeResourceField(5, 0, 1000, 3);
    expect(f.gather()).toBe(10);
    expect(f.amount).toBe(990);
  });

  it('reduces remaining and returns gathered', () => {
    const f = makeResourceField(5, 0, 100, 3);
    expect(f.gather(30)).toBe(30);
    expect(f.amount).toBe(70);
  });

  it('larger than remaining returns remaining and depletes', () => {
    const f = makeResourceField(5, 0, 5, 3);
    expect(f.gather(10)).toBe(5);
    expect(f.amount).toBe(0);
    expect(f.isActive).toBe(false);
  });

  it('exactly equal to remaining depletes field', () => {
    const f = makeResourceField(5, 0, 10, 3);
    f.gather(10);
    expect(f.amount).toBe(0);
    expect(f.isActive).toBe(false);
  });

  it('on already-depleted field returns 0 and does not mutate', () => {
    const f = makeResourceField(5, 0, 0, 3);
    f.isActive = false;
    expect(f.gather(10)).toBe(0);
    expect(f.amount).toBe(0);
  });

  it('gather(0) returns 0 without depleting', () => {
    const f = makeResourceField(5, 0, 100, 3);
    expect(f.gather(0)).toBe(0);
    expect(f.amount).toBe(100);
    expect(f.isActive).toBe(true);
  });

  it('gather(negative) inflates amount (pinning current behavior)', () => {
    const f = makeResourceField(5, 0, 100, 3);
    // gathered = min(-5, 100) = -5; amount -= -5 -> 105
    const result = f.gather(-5);
    expect(result).toBe(-5);
    expect(f.amount).toBe(105);
  });

  it('does not consult currentGatherers or maxGatherers (enforcement is external)', () => {
    const f = makeResourceField(5, 0, 100, 3);
    f.currentGatherers = 3; // at max
    expect(f.gather(10)).toBe(10); // ResourceField doesn't self-limit
  });

  it('reducing to exactly 0 sets isActive false (boundary)', () => {
    const f = makeResourceField(5, 0, 10, 3);
    f.gather(10);
    expect(f.isActive).toBe(false);
  });

  it('repeated gather until depletion then gather returns 0', () => {
    const f = makeResourceField(5, 0, 5, 3);
    f.gather(5); // depleted
    expect(f.gather(5)).toBe(0);
  });
});

describe('ResourceField.isDepleted', () => {
  it('returns true when amount is 0', () => {
    const f = makeResourceField(5, 0, 0, 3);
    expect(f.isDepleted).toBe(true);
  });

  it('returns true when amount is negative', () => {
    const f = makeResourceField(5, 0, 100, 3);
    f.amount = -1;
    expect(f.isDepleted).toBe(true);
  });

  it('returns false when amount > 0', () => {
    const f = makeResourceField(5, 0, 5, 3);
    expect(f.isDepleted).toBe(false);
  });
});

// ============ Projectile ============

describe('Projectile construction', () => {
  it('initializes projectile with hp=1 and light armor', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical', true);
    expect(p.hp).toBe(1);
    expect(p.maxHp).toBe(1);
    expect(p.armorType).toBe('light');
    expect(p.isActive).toBe(true);
    expect(p.spriteKey).toBe('projectile');
  });

  it('sets source/target/speed/damage/damageType', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'magic', true);
    expect(p.sourceId).toBe('src1');
    expect(p.targetId).toBe('tgt1');
    expect(p.speed).toBe(15);
    expect(p.damage).toBe(20);
    expect(p.damageType).toBe('magic');
  });

  it('defaults isHoming to true when omitted', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    expect(p.isHoming).toBe(true);
  });

  it('accepts isHoming=false explicitly', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical', false);
    expect(p.isHoming).toBe(false);
  });

  it('defaults rawDamage and corrosionPenalty to 0', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    expect(p.rawDamage).toBe(0);
    expect(p.corrosionPenalty).toBe(0);
  });

  it('id prefix is "proj"', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    expect(p.id.startsWith('proj_')).toBe(true);
  });
});

describe('Projectile.reset', () => {
  it('overwrites owner, faction, position, source, target, damage, damageType', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.owner).toBe(0);
    expect(p.faction).toBe('arcane_empire');
    expect(p.tileX).toBe(9);
    expect(p.tileY).toBe(9);
    expect(p.sourceId).toBe('src2');
    expect(p.targetId).toBe('tgt2');
    expect(p.damage).toBe(25);
    expect(p.damageType).toBe('magic');
  });

  it('sets hp=1 and isActive=true (revives for pool reuse)', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    p.hp = 0;
    p.isActive = false;
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.hp).toBe(1);
    expect(p.isActive).toBe(true);
  });

  it('does NOT change speed (persists from construction)', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.speed).toBe(15); // unchanged
  });

  it('does NOT change isHoming', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical', false);
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.isHoming).toBe(false); // persists
  });

  it('does NOT clear rawDamage (stale data across pool reuse)', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    p.rawDamage = 50;
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.rawDamage).toBe(50); // persists - potential pool bug
  });

  it('does NOT clear corrosionPenalty', () => {
    const p = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    p.corrosionPenalty = 3;
    p.reset(0, 'arcane_empire', 9, 9, 'src2', 'tgt2', 25, 'magic');
    expect(p.corrosionPenalty).toBe(3); // persists
  });
});

describe('Projectile two instances get distinct ids', () => {
  it('two projectiles have different ids', () => {
    const p1 = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    const p2 = new Projectile(1, 'hammer_federation', 5, 5, 'src1', 'tgt1', 15, 20, 'physical');
    expect(p1.id).not.toBe(p2.id);
  });
});
