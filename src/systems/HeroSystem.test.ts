/**
 * HeroSystem 单元测试 - 被动光环 + 复活/技能冷却 + 自动技能 + 手动激活 + trainHero
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeroSystem } from './HeroSystem';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { makeUnit, makeBuilding, makeWorld } from '../__fixtures__/factories';

function makeHero(heroId: 'hero_isabelle' | 'hero_marcus' = 'hero_isabelle', owner = 0, tileX = 5, tileY = 5): Hero {
  const hd = HERO_DEFS[heroId];
  return new Hero(owner, hd.faction, tileX, tileY, hd, heroId);
}

describe('HeroSystem.update auras', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('resets productionSpeedBonus to 0 on every building each frame', () => {
    const b = makeBuilding();
    b.productionSpeedBonus = 0.5;
    HeroSystem.update([], [], [b], makeWorld(), 0.05);
    expect(b.productionSpeedBonus).toBe(0);
  });

  it('Isabelle aura heals same-owner living allies within auraRadius (8) by 2*deltaSec', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10, maxHp: 100 } as never);
    ally.maxHp = 100; ally.hp = 10;
    HeroSystem.update([hero], [hero, ally], [], world, 1);
    expect(ally.hp).toBe(12); // 10 + 2*1
  });

  it('Isabelle aura does not heal out-of-range allies', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const farAlly = makeUnit({ owner: 0, tileX: 20, tileY: 20, hp: 10 });
    farAlly.maxHp = 100; farAlly.hp = 10;
    HeroSystem.update([hero], [hero, farAlly], [], world, 1);
    expect(farAlly.hp).toBe(10);
  });

  it('Isabelle aura does not heal enemies, dead allies, or self', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 10 });
    const deadAlly = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 0 });
    const heroHpBefore = hero.hp;
    HeroSystem.update([hero], [hero, enemy, deadAlly], [], world, 1);
    expect(enemy.hp).toBe(10);
    expect(deadAlly.hp).toBe(0);
    expect(hero.hp).toBe(heroHpBefore); // self excluded
  });

  it('Marcus aura adds +0.20 productionSpeedBonus to same-owner living production buildings within auraRadius (12)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    const b = makeBuilding({ owner: 0, tileX: 6, tileY: 5 });
    HeroSystem.update([hero], [], [b], world, 0.05);
    expect(b.productionSpeedBonus).toBeCloseTo(0.20);
  });

  it('Marcus aura accumulates (two marcus heroes stack to 0.40)', () => {
    const world = makeWorld(16, 16, true);
    const h1 = makeHero('hero_marcus', 0, 5, 5);
    const h2 = makeHero('hero_marcus', 0, 6, 5);
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    HeroSystem.update([h1, h2], [], [b], world, 0.05);
    expect(b.productionSpeedBonus).toBeCloseTo(0.40);
  });

  it('Marcus aura skips dead/other-owner buildings (constructing still gets buff)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    const constructing = makeBuilding({ owner: 0, tileX: 6, tileY: 5, completed: false });
    const dead = makeBuilding({ owner: 0, tileX: 5, tileY: 6 });
    dead.hp = 0;
    const other = makeBuilding({ owner: 1, tileX: 5, tileY: 4 });
    HeroSystem.update([hero], [], [constructing, dead, other], world, 0.05);
    // constructing has no state guard in aura loop, so it still gets buff
    expect(constructing.productionSpeedBonus).toBeCloseTo(0.20);
    expect(dead.productionSpeedBonus).toBe(0);
    expect(other.productionSpeedBonus).toBe(0);
  });

  it('dead heroes are skipped entirely (no aura, no auto-skill)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.hp = 0;
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    HeroSystem.update([hero], [hero, ally], [], world, 1);
    expect(ally.hp).toBe(10); // no heal
  });
});

describe('HeroSystem.update revive & cooldown timers', () => {
  it('dead hero reviveTimer decrements to 0 then sets -1 (ready)', () => {
    const world = makeWorld();
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.hp = 0; hero.isActive = false;
    hero.reviveTimer = 5;
    HeroSystem.update([hero], [hero], [], world, 3);
    expect(hero.reviveTimer).toBe(2);
    HeroSystem.update([hero], [hero], [], world, 3);
    expect(hero.reviveTimer).toBe(-1);
  });

  it('living hero skillCooldown and per-slot skillCooldowns decrement but not below 0', () => {
    const world = makeWorld();
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.skillCooldown = 5;
    hero.skillCooldowns = [10, 5, 0];
    HeroSystem.update([hero], [hero], [], world, 7);
    expect(hero.skillCooldown).toBe(0);
    expect(hero.skillCooldowns).toEqual([3, 0, 0]);
  });

  it('holdPosition hero skips auto-skills entirely', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.holdPosition = true;
    const weakAlly = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    weakAlly.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, weakAlly], [], world, 0.05);
    expect(spy).not.toHaveBeenCalled();
    expect(weakAlly.shieldHp).toBe(0);
  });

  it('update with empty heroes array returns {spawnCommands:[]} and does not throw', () => {
    expect(HeroSystem.update([], [], [], makeWorld(), 0.05)).toEqual({ spawnCommands: [] });
  });
});

describe('HeroSystem Isabelle auto-skills', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('auto slot0 shields weakest ally below 60% hp, sets cooldown 30', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5); // L1
    const weak = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 40 });
    weak.maxHp = 100;
    const healthy = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 90 });
    healthy.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, weak, healthy], [], world, 0.05);
    expect(weak.shieldHp).toBe(200);
    expect(weak.maxShieldHp).toBe(200);
    expect(hero.skillCooldowns[0]).toBe(30);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'isabelle_shield' }));
  });

  it('auto slot0 does nothing if no ally below 60% hp', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 90 });
    ally.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    expect(spy).not.toHaveBeenCalled();
    expect(ally.shieldHp).toBe(0);
  });

  it('auto slot1 (alchemy) triggers when >=3 enemies within 8 tiles, sets attackTimer>=3.0', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 3; // unlock slot1
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    const e3 = makeUnit({ owner: 1, tileX: 5, tileY: 6, hp: 100 });
    HeroSystem.update([hero], [hero, e1, e2, e3], [], world, 0.05);
    expect(e1.attackTimer).toBeGreaterThanOrEqual(3.0);
    expect(e2.attackTimer).toBeGreaterThanOrEqual(3.0);
    expect(e3.attackTimer).toBeGreaterThanOrEqual(3.0);
    expect(hero.skillCooldowns[1]).toBe(60); // L3 cooldown
  });

  it('auto slot2 (rain) heals allies within 10 tiles only when hero hpPercent<0.35', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 5; // unlock slot2
    hero.maxHp = 350; hero.hp = 100; // ~0.286 < 0.35
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    expect(ally.hp).toBe(100); // 10+150 capped at maxHp=100
    expect(hero.skillCooldowns[2]).toBe(120);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'isabelle_rain' }));
  });

  it('auto slot2 does NOT trigger when hero hp >= 0.35', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 350; hero.hp = 200; // ~0.57
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    // slot2 cooldown stays 0 = did not trigger (aura may tick hp slightly)
    expect(hero.skillCooldowns[2]).toBe(0);
  });
});

describe('HeroSystem Marcus auto-skills', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('auto slot0 airdrops 3 riflemen when own rifleman count <6 (L1)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    // 2 own riflemen
    const r1 = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 1, tileY: 1, hp: 100 });
    const r2 = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 2, tileY: 1, hp: 100 });
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    const result = HeroSystem.update([hero], [hero, r1, r2], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(1);
    expect(result.spawnCommands[0]).toEqual({
      unitDefId: 'unit_rifleman', count: 3,
      position: { x: 6, y: 6 }, playerIndex: 0,
    });
    expect(hero.skillCooldowns[0]).toBe(35);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'marcus_airdrop' }));
  });

  it('auto slot0 L2 airdrops 5 riflemen + 1 assault_worker (2 spawnCommands)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 2;
    const r1 = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 1, tileY: 1, hp: 100 });
    const result = HeroSystem.update([hero], [hero, r1], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(2);
    expect(result.spawnCommands[0].unitDefId).toBe('unit_rifleman');
    expect(result.spawnCommands[0].count).toBe(5);
    expect(result.spawnCommands[1].unitDefId).toBe('unit_assault_worker');
    expect(hero.skillCooldowns[0]).toBe(30);
  });

  it('auto slot0 does nothing when rifleman count >=6', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    const riflemen = Array.from({ length: 6 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: i, tileY: 1, hp: 100 }),
    );
    const result = HeroSystem.update([hero], [hero, ...riflemen], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(0);
  });

  it('auto slot1 (repair) heals self +5% maxHp and mechanical allies within 5 tiles when hp<0.45', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 3;
    hero.maxHp = 1000; hero.hp = 400; // 0.4 < 0.45
    // 6 riflemen so slot0 (airdrop) does NOT fire and preempt slot1
    const riflemen = Array.from({ length: 6 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: i, tileY: 10, hp: 100 }),
    );
    const mechAlly = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10, armorType: 'mechanical' });
    mechAlly.maxHp = 100;
    const nonMech = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 10, armorType: 'light' });
    nonMech.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, ...riflemen, mechAlly, nonMech], [], world, 0.05);
    expect(hero.hp).toBe(450); // 400 + round(1000*0.05)=50
    expect(mechAlly.hp).toBe(15); // 10 + round(100*0.05)=5
    expect(nonMech.hp).toBe(10); // unchanged
    expect(hero.skillCooldowns[1]).toBe(50);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'marcus_repair' }));
  });

  it('auto slot2 (overdrive) damages all enemies within 5 tiles when >=3 nearby AND hp<0.5', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 1000; hero.hp = 400; // 0.4 < 0.5
    // 6 riflemen so slot0 (airdrop) does NOT fire
    const riflemen = Array.from({ length: 6 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: i, tileY: 10, hp: 100 }),
    );
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 });
    e1.maxHp = 200;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 200 });
    e2.maxHp = 200;
    const e3 = makeUnit({ owner: 1, tileX: 5, tileY: 6, hp: 200 });
    e3.maxHp = 200;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, ...riflemen, e1, e2, e3], [], world, 0.05);
    expect(spy).toHaveBeenCalledWith(150, 'physical');
    expect(hero.skillCooldowns[2]).toBe(200);
  });
});

describe('HeroSystem.activateSkill', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('returns success:false when canUseSkillSlot is false (cooldown active)', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.skillCooldowns[0] = 10;
    const result = HeroSystem.activateSkill(hero, 0, { units: [], buildings: [] });
    expect(result.success).toBe(false);
    expect(result.skillName).toBe('N/A');
  });

  it('returns success:false for unknown heroId', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    Object.defineProperty(hero, 'spriteKey', { value: 'hero_unknown', configurable: true });
    const result = HeroSystem.activateSkill(hero, 0, { units: [], buildings: [] });
    expect(result.success).toBe(false);
  });

  it('Isabelle slot0: sets cooldown 30, emits abilityId hero_isabelle_slot0, shields weakest ally', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 40 });
    ally.maxHp = 100;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    const result = HeroSystem.activateSkill(hero, 0, { units: [hero, ally], buildings: [] });
    expect(result.success).toBe(true);
    expect(result.skillName).toBe('默库里合金镀层');
    expect(hero.skillCooldowns[0]).toBe(30);
    expect(ally.shieldHp).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'hero_isabelle_slot0' }));
  });

  it('Marcus slot0 returns spawnCommands in result (3 riflemen at L1)', () => {
    const hero = makeHero('hero_marcus', 0, 5, 5);
    const result = HeroSystem.activateSkill(hero, 0, { units: [hero], buildings: [] });
    expect(result.success).toBe(true);
    expect(result.spawnCommands).toHaveLength(1);
    expect(result.spawnCommands![0].unitDefId).toBe('unit_rifleman');
    expect(result.spawnCommands![0].count).toBe(3);
  });

  it('Marcus slot2 sets cooldown 200', () => {
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 5;
    const result = HeroSystem.activateSkill(hero, 2, { units: [hero], buildings: [] });
    expect(result.success).toBe(true);
    expect(hero.skillCooldowns[2]).toBe(200);
  });

  it('picks Lv2 skill variant (skillTree idx 1) when hero.level>=2 for slot0', () => {
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 2;
    const result = HeroSystem.activateSkill(hero, 0, { units: [hero], buildings: [] });
    expect(result.skillName).toBe('空投+'); // idx 1
    expect(hero.skillCooldowns[0]).toBe(30);
  });

  it('picks Lv4 variant (idx 3) for slot1 when level>=4', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 4;
    const result = HeroSystem.activateSkill(hero, 1, { units: [hero], buildings: [] });
    expect(result.skillName).toBe('转化+');
    expect(hero.skillCooldowns[1]).toBe(45);
  });
});

describe('HeroSystem.getSkillInfo', () => {
  it('returns null for unknown hero', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    Object.defineProperty(hero, 'spriteKey', { value: 'hero_unknown', configurable: true });
    expect(HeroSystem.getSkillInfo(hero, 0)).toBeNull();
  });

  it('reports unlocked=false for slot1 at L1-L2, true at L3', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    expect(HeroSystem.getSkillInfo(hero, 1)!.unlocked).toBe(false);
    hero.level = 3;
    expect(HeroSystem.getSkillInfo(hero, 1)!.unlocked).toBe(true);
  });

  it('reports currentCooldown from hero.skillCooldowns[slotIndex]', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.skillCooldowns = [5, 0, 0];
    expect(HeroSystem.getSkillInfo(hero, 0)!.currentCooldown).toBe(5);
    expect(HeroSystem.getSkillInfo(hero, 1)!.currentCooldown).toBe(0);
  });

  it('slot0 returns Lv1 skill name at L1, Lv2 name at L2', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    expect(HeroSystem.getSkillInfo(hero, 0)!.name).toBe('默库里合金镀层');
    hero.level = 2;
    expect(HeroSystem.getSkillInfo(hero, 0)!.name).toBe('镀层+');
  });

  it('available reflects canUseSkillSlot (cooldown + unlocked + alive)', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    expect(HeroSystem.getSkillInfo(hero, 0)!.available).toBe(true);
    hero.skillCooldowns[0] = 5;
    expect(HeroSystem.getSkillInfo(hero, 0)!.available).toBe(false);
  });
});

describe('HeroSystem.trainHero', () => {
  it('returns null for unknown heroId', () => {
    expect(HeroSystem.trainHero('hero_nope', 0, 'arcane_empire', 5, 5)).toBeNull();
  });

  it('constructs a Hero with correct spriteKey, owner, faction, stats from HERO_DEFS', () => {
    const h = HeroSystem.trainHero('hero_isabelle', 0, 'arcane_empire', 5, 5)!;
    expect(h).toBeInstanceOf(Hero);
    expect(h.spriteKey).toBe('hero_isabelle');
    expect(h.owner).toBe(0);
    expect(h.maxHp).toBe(350);
    expect(h.armor).toBe(8);
    expect(h.auraRadius).toBe(8);
    expect(h.level).toBe(1);
  });
});

describe('HeroSystem _exec* direct calls', () => {
  it('_execMarcusRepair heals hero and only mechanical allies within 5 tiles', () => {
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.maxHp = 1000; hero.hp = 500;
    const mech = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10, armorType: 'mechanical' });
    mech.maxHp = 100;
    const nonMech = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 10, armorType: 'light' });
    nonMech.maxHp = 100;
    HeroSystem._execMarcusRepair(hero, [hero, mech, nonMech]);
    expect(hero.hp).toBe(550); // +50
    expect(mech.hp).toBe(15); // +5
    expect(nonMech.hp).toBe(10);
  });

  it('_execMarcusAirdrop returns 1 cmd at L1, 2 cmds at L2', () => {
    const h1 = makeHero('hero_marcus', 0, 5, 5);
    const cmds1 = HeroSystem._execMarcusAirdrop(h1);
    expect(cmds1).toHaveLength(1);
    expect(cmds1[0].position).toEqual({ x: 6, y: 6 });
    const h2 = makeHero('hero_marcus', 0, 5, 5);
    h2.level = 2;
    const cmds2 = HeroSystem._execMarcusAirdrop(h2);
    expect(cmds2).toHaveLength(2);
  });

  it('_execIsabelleRain heals allies within 10 tiles, capped at maxHp', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    const fullAlly = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 100 });
    fullAlly.maxHp = 100;
    HeroSystem._execIsabelleRain(hero, [hero, ally, fullAlly]);
    expect(ally.hp).toBe(100); // 10+150 capped at 100
    expect(fullAlly.hp).toBe(100); // already full
  });
});


describe('HeroSystem - 第二轮补洞: 边界与 L4 变体', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('Isabelle aura 恰好 Manhattan 距离=auraRadius(8) 治疗盟友 (<=)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 13, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    HeroSystem.update([hero], [hero, ally], [], world, 1.0);
    expect(ally.hp).toBe(12);
  });

  it('Isabelle aura 不溢出治疗 (满血盟友保持 maxHp)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    ally.maxHp = 100;
    HeroSystem.update([hero], [hero, ally], [], world, 1.0);
    expect(ally.hp).toBe(100);
  });

  it('reviveTimer=-1 (就绪) 的英雄保持 -1 不递减', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.hp = 0;
    hero.reviveTimer = -1;
    HeroSystem.update([hero], [hero], [], world, 5);
    expect(hero.reviveTimer).toBe(-1);
  });

  it('reviveTimer 恰好减到 0 时设为 -1 (就绪)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.hp = 0;
    hero.reviveTimer = 5;
    HeroSystem.update([hero], [hero], [], world, 5);
    expect(hero.reviveTimer).toBe(-1);
  });

  it('Isabelle auto slot1 仅 2 个敌人不触发 (需 >=3)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 3;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(hero.skillCooldowns[1]).toBe(0);
  });

  it('Isabelle auto slot2 恰好 hpPercent=0.35 不触发 (严格 <0.35)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 100; hero.hp = 35;
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 100;
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    expect(hero.skillCooldowns[2]).toBe(0);
  });

  it('Isabelle rain 治疗 150 在未满血时不被 cap (hp+150 < maxHp)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 100; hero.hp = 30; // hpPercent=0.3 < 0.35
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 10 });
    ally.maxHp = 200;
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    expect(ally.hp).toBeCloseTo(160, 0);
  });

  it('Marcus auto slot1 L4 治疗 8% maxHp', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 4;
    hero.maxHp = 1000; hero.hp = 400;
    const mech = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100, spriteKey: 'unit_magitech_mech' });
    mech.armorType = 'mechanical';
    // 6 riflemen 防止 slot0 airdrop 抢占 slot1
    const rifles = Array.from({ length: 6 }, (_, i) => makeUnit({ owner: 0, tileX: 7 + i, tileY: 5, spriteKey: 'unit_rifleman' }));
    HeroSystem.update([hero], [hero, mech, ...rifles], [], world, 0.05);
    expect(hero.hp).toBe(480);
  });

  it('Marcus slot2 仅 2 敌人不触发 (需 >=3)', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 1000; hero.hp = 400;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(hero.skillCooldowns[2]).toBe(0);
  });

  it('Marcus slot2 3 敌人但 hp>=50% 不触发', () => {
    const world = makeWorld(16, 16, true);
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 1000; hero.hp = 600;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    const e3 = makeUnit({ owner: 1, tileX: 8, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1, e2, e3], [], world, 0.05);
    expect(hero.skillCooldowns[2]).toBe(0);
  });

  it('activateSkill slotIndex 越界 (5) 返回 success=false', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    const r = HeroSystem.activateSkill(hero, 5, { units: [], buildings: [] });
    expect(r.success).toBe(false);
  });

  it('activateSkill Marcus slot1 通过 activateSkill 路径治疗自己', () => {
    const hero = makeHero('hero_marcus', 0, 5, 5);
    hero.level = 3;
    hero.maxHp = 1000; hero.hp = 500;
    const r = HeroSystem.activateSkill(hero, 1, { units: [hero], buildings: [] });
    expect(r.success).toBe(true);
    expect(hero.hp).toBeGreaterThan(500);
  });

  it('getSkillInfo slot2 L4 unlocked=false, L5 unlocked=true', () => {
    const hero = makeHero('hero_isabelle', 0, 5, 5);
    hero.level = 4;
    expect(HeroSystem.getSkillInfo(hero, 2)!.unlocked).toBe(false);
    hero.level = 5;
    expect(HeroSystem.getSkillInfo(hero, 2)!.unlocked).toBe(true);
  });

  it('trainHero marcus 构造正确 stats', () => {
    const h = HeroSystem.trainHero('hero_marcus', 0, 'hammer_federation', 5, 5)!;
    expect(h).toBeInstanceOf(Hero);
    expect(h.spriteKey).toBe('hero_marcus');
    expect(h.auraRadius).toBe(12);
  });

  it('trainHero 未知 heroId 返回 null', () => {
    expect(HeroSystem.trainHero('hero_ghost', 0, 'arcane_empire', 5, 5)).toBeNull();
  });
});
