/**
 * HeroSystem 单元测试 - 被动光环 + 复活/技能冷却 + 自动技能 + 手动激活 + trainHero
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeroSystem } from './HeroSystem';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { makeUnit, makeBuilding, makeWorld, makeResourceField, makePlayer, makeRefinery, bindToField } from '../__fixtures__/factories';
import { ResourceSystem } from './ResourceSystem';
import { UnitSpecialSystem } from './UnitSpecialSystem';
import { ResourceField } from '../entities/ResourceField';
import { GATHER_TICK_INTERVAL, GATHER_BASE_AMOUNT } from '../config/balance';

type TestHeroId = 'hero_isabelle' | 'hero_marcus' | 'hero_frost_a' | 'hero_frost_b' | 'hero_jade_a' | 'hero_jade_b';
function makeHero(heroId: TestHeroId = 'hero_isabelle', owner = 0, tileX = 5, tileY = 5): Hero {
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

describe('HeroSystem 艾纳尔 (hero_frost_a)', () => {
  beforeEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });
  afterEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });

  it('山之王座光环: 周围10格友方 auraArmorBonus +8', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    const farAlly = makeUnit({ owner: 0, tileX: 20, tileY: 20, hp: 100 });
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, ally, farAlly, enemy], [], world, 0.05);
    expect(ally.auraArmorBonus).toBe(8);
    expect(farAlly.auraArmorBonus).toBe(0);
    expect(enemy.auraArmorBonus).toBe(0);
  });

  it('山之王座光环: 两个艾纳尔叠加到 +16', () => {
    const world = makeWorld(20, 20, true);
    const h1 = makeHero('hero_frost_a', 0, 5, 5);
    const h2 = makeHero('hero_frost_a', 0, 6, 5);
    const ally = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
    HeroSystem.update([h1, h2], [h1, h2, ally], [], world, 0.05);
    expect(ally.auraArmorBonus).toBe(16);
  });

  it('auto slot0 磐石壁垒: HP<0.6 时触发，自身+周围5格友方设护甲翻倍 buff timer 8s(L1)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.maxHp = 900; hero.hp = 400; // ~0.44 < 0.6
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    ally.baseArmor = 10;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    // buff timer 已设
    expect((hero as any)._frostBastionTimer).toBe(8);
    expect((ally as any)._frostBastionTimer).toBe(8);
    expect(hero.skillCooldowns[0]).toBe(35);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'frost_a_bastion' }));
    // buff 触发当帧只设 timer，下一帧起效：跑第二帧验证 auraArmorBonus 含翻倍 baseArmor
    HeroSystem.update([hero], [hero, ally], [], world, 0.05);
    expect(ally.auraArmorBonus).toBe(ally.baseArmor + 8); // 光环8 + 翻倍baseArmor
  });

  it('auto slot0 L2 持续时间 12s 且冷却 28', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.level = 2;
    hero.maxHp = 900; hero.hp = 400;
    HeroSystem.update([hero], [hero], [], world, 0.05);
    expect((hero as any)._frostBastionTimer).toBe(12);
    expect(hero.skillCooldowns[0]).toBe(28);
  });

  it('auto slot0 HP>=0.6 不触发', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.maxHp = 900; hero.hp = 600; // ~0.67
    HeroSystem.update([hero], [hero], [], world, 0.05);
    expect(hero.skillCooldowns[0]).toBe(0);
  });

  it('auto slot1 山之怒: 周围6格敌人>=2 时造成=护甲值物理伤害', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.level = 3; // 解锁 slot1
    hero.armor = 28; // 基础护甲
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 }); e1.maxHp = 200;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 }); e2.maxHp = 200;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    // 伤害 = hero.armor(28) + hero.auraArmorBonus(8, 艾纳尔自身光环) = 36
    expect(spy).toHaveBeenCalledWith(36, 'physical');
    expect(hero.skillCooldowns[1]).toBe(50);
  });

  it('auto slot1 L4 伤害翻倍+眩晕(attackTimer>=2.0)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.level = 4;
    hero.armor = 28;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 200 }); e2.maxHp = 300;
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(e1.attackTimer).toBeGreaterThanOrEqual(2.0);
    expect(hero.skillCooldowns[1]).toBe(40);
  });

  it('auto slot1 仅1敌人不触发 (需>=2)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.level = 3;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1], [], world, 0.05);
    expect(hero.skillCooldowns[1]).toBe(0);
  });

  it('auto slot2 万山臣服: HP<0.4 时周围10格友方+护盾300，敌方攻击延迟', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 900; hero.hp = 300; // ~0.33 < 0.4
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    const enemy = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, ally, enemy], [], world, 0.05);
    expect(ally.shieldHp).toBe(300);
    expect(enemy.attackTimer).toBeGreaterThanOrEqual(2.0);
    expect(hero.skillCooldowns[2]).toBe(160);
  });

  it('activateSkill slot0 经 activateSkill 路径设 buff timer', () => {
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    const r = HeroSystem.activateSkill(hero, 0, { units: [hero], buildings: [] });
    expect(r.success).toBe(true);
    expect((hero as any)._frostBastionTimer).toBe(8);
  });

  it('_execFrostAFury 直接调用对敌人造成护甲值伤害', () => {
    const hero = makeHero('hero_frost_a', 0, 5, 5);
    hero.armor = 30;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 }); e1.maxHp = 200;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem._execFrostAFury(hero, [hero, e1]);
    expect(spy).toHaveBeenCalledWith(30, 'physical');
  });
});

describe('HeroSystem 希尔德 (hero_frost_b)', () => {
  beforeEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });
  afterEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });

  it('矿脉感应光环: 矿场9格内有希尔德时采集+30%', () => {
    const worker = makeUnit({ owner: 0, tileX: 5, tileY: 0, hp: 100 }) as any;
    worker.state = 'gathering';
    const field = makeResourceField(5, 0, 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0); // 满速
    const player = makePlayer(0);
    const hilde = makeHero('hero_frost_b', 0, 6, 0); // 距矿场(5,0)=1格 <=9
    const events = ResourceSystem.updateGathering(
      [worker, hilde], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(Math.round(GATHER_BASE_AMOUNT * 1.3));
  });

  it('矿脉感应光环: 希尔德超过9格不生效', () => {
    const worker = makeUnit({ owner: 0, tileX: 5, tileY: 0, hp: 100 }) as any;
    worker.state = 'gathering';
    const field = makeResourceField(5, 0, 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const player = makePlayer(0);
    const hilde = makeHero('hero_frost_b', 0, 20, 0); // 距矿场15格 >9
    const events = ResourceSystem.updateGathering(
      [worker, hilde], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT); // 无加成
  });

  it('auto slot0 水晶裂隙: 周围8格敌人>=2 时水晶伤害60+减速(L1)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 200 }); e2.maxHp = 300;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(spy).toHaveBeenCalledWith(60, 'crystal');
    expect(e1.attackTimer).toBeGreaterThanOrEqual(2.0);
    expect(hero.skillCooldowns[0]).toBe(30);
  });

  it('auto slot0 L2 范围10格+伤害80+冷却25', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    hero.level = 2;
    // 敌人在9格处（L1范围8够不着，L2范围10够得着）
    const e1 = makeUnit({ owner: 1, tileX: 14, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const e2 = makeUnit({ owner: 1, tileX: 13, tileY: 5, hp: 200 }); e2.maxHp = 300;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(spy).toHaveBeenCalledWith(80, 'crystal');
    expect(hero.skillCooldowns[0]).toBe(25);
  });

  it('auto slot0 仅1敌人不触发 (需>=2)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1], [], world, 0.05);
    expect(hero.skillCooldowns[0]).toBe(0);
  });

  it('auto slot1 深矿涌动: 周围6格敌人>=3 时水晶伤害100(L3)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    hero.level = 3;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 200 }); e2.maxHp = 300;
    const e3 = makeUnit({ owner: 1, tileX: 5, tileY: 6, hp: 200 }); e3.maxHp = 300;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, e1, e2, e3], [], world, 0.05);
    expect(spy).toHaveBeenCalledWith(100, 'crystal');
    expect(hero.skillCooldowns[1]).toBe(45);
  });

  it('auto slot1 L4 伤害150+冷却35', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    hero.level = 4;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 200 }); e2.maxHp = 300;
    const e3 = makeUnit({ owner: 1, tileX: 8, tileY: 5, hp: 200 }); e3.maxHp = 300;
    const spy = vi.spyOn(e1, 'takeDamage');
    HeroSystem.update([hero], [hero, e1, e2, e3], [], world, 0.05);
    expect(spy).toHaveBeenCalledWith(150, 'crystal');
    expect(hero.skillCooldowns[1]).toBe(35);
  });

  it('auto slot1 仅2敌人不触发 (需>=3)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    hero.level = 3;
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const e2 = makeUnit({ owner: 1, tileX: 7, tileY: 5, hp: 100 });
    HeroSystem.update([hero], [hero, e1, e2], [], world, 0.05);
    expect(hero.skillCooldowns[1]).toBe(0);
  });

  it('auto slot2 山脉之心: HP<0.3 时矿脉4格内敌方受200水晶伤害', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 380; hero.hp = 100; // ~0.26 < 0.3
    const field = makeResourceField(10, 5, 1000);
    const enemyNearField = makeUnit({ owner: 1, tileX: 11, tileY: 5, hp: 300 }); enemyNearField.maxHp = 400;
    const enemyFar = makeUnit({ owner: 1, tileX: 18, tileY: 18, hp: 300 }); enemyFar.maxHp = 400;
    const spyNear = vi.spyOn(enemyNearField, 'takeDamage');
    const spyFar = vi.spyOn(enemyFar, 'takeDamage');
    HeroSystem.update([hero], [hero, enemyNearField, enemyFar], [], world, 0.05, [field]);
    expect(spyNear).toHaveBeenCalledWith(200, 'crystal');
    expect(spyFar).not.toHaveBeenCalled();
    expect(hero.skillCooldowns[2]).toBe(150);
  });

  it('activateSkill slot0 经 activateSkill 路径造成水晶伤害', () => {
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 200 }); e1.maxHp = 300;
    const spy = vi.spyOn(e1, 'takeDamage');
    const r = HeroSystem.activateSkill(hero, 0, { units: [hero, e1], buildings: [] });
    expect(r.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(60, 'crystal');
  });

  it('_execFrostBHeart 直接调用: 矿脉附近敌人受伤', () => {
    const hero = makeHero('hero_frost_b', 0, 5, 5);
    const field = makeResourceField(10, 5, 1000);
    const enemy = makeUnit({ owner: 1, tileX: 11, tileY: 5, hp: 300 }); enemy.maxHp = 400;
    const spy = vi.spyOn(enemy, 'takeDamage');
    HeroSystem._execFrostBHeart(hero, [hero, enemy], [field]);
    expect(spy).toHaveBeenCalledWith(200, 'crystal');
  });
});

describe('HeroSystem 卡林 (hero_jade_a)', () => {
  beforeEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });
  afterEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });

  it('auto slot0 市场操纵: 周围8格敌人>=1 时标记20秒(受伤+25%)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 }); e1.maxHp = 200;
    HeroSystem.update([hero], [hero, e1], [], world, 0.05);
    expect(UnitSpecialSystem.getMarkBonus(e1.id)).toBe(0.25);
    expect(hero.skillCooldowns[0]).toBe(30);
  });

  it('auto slot0 L2 范围10格+冷却25', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 2;
    // 敌人在9格处（L1范围8够不着）
    const e1 = makeUnit({ owner: 1, tileX: 14, tileY: 5, hp: 100 }); e1.maxHp = 200;
    HeroSystem.update([hero], [hero, e1], [], world, 0.05);
    expect(UnitSpecialSystem.getMarkBonus(e1.id)).toBe(0.25);
    expect(hero.skillCooldowns[0]).toBe(25);
  });

  it('auto slot0 无敌人不触发', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    HeroSystem.update([hero], [hero], [], world, 0.05);
    expect(hero.skillCooldowns[0]).toBe(0);
  });

  it('auto slot1 情报泄露: 周围8格敌方建筑>=1 时对建筑物理伤害80(L3)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 3;
    const enemyBld = makeBuilding({ owner: 1, tileX: 6, tileY: 5 });
    enemyBld.maxHp = 500; enemyBld.hp = 500;
    const spy = vi.spyOn(enemyBld, 'takeDamage');
    HeroSystem.update([hero], [hero], [enemyBld], world, 0.05);
    expect(spy).toHaveBeenCalledWith(80, 'physical');
    expect(hero.skillCooldowns[1]).toBe(45);
  });

  it('auto slot1 L4 伤害120+冷却35', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 4;
    const enemyBld = makeBuilding({ owner: 1, tileX: 6, tileY: 5 });
    enemyBld.maxHp = 500; enemyBld.hp = 500;
    const spy = vi.spyOn(enemyBld, 'takeDamage');
    HeroSystem.update([hero], [hero], [enemyBld], world, 0.05);
    expect(spy).toHaveBeenCalledWith(120, 'physical');
    expect(hero.skillCooldowns[1]).toBe(35);
  });

  it('auto slot2 玉港资本: +500水晶且设60秒采集debuff', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 5;
    const player = world.players[0];
    const crystalBefore = player.resources.crystal;
    HeroSystem.update([hero], [hero], [], world, 0.05);
    expect(player.resources.crystal).toBe(crystalBefore + 500);
    expect(player.gatherDebuffTimer).toBe(60);
    expect(hero.skillCooldowns[2]).toBe(140);
  });

  it('玉港资本 debuff 期间采集-50%', () => {
    const worker = makeUnit({ owner: 0, tileX: 5, tileY: 0, hp: 100 }) as any;
    worker.state = 'gathering';
    const field = makeResourceField(5, 0, 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const player = makePlayer(0);
    player.gatherDebuffTimer = 60;
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    // 满速 GATHER_BASE_AMOUNT * 0.5
    expect(events[0].amount).toBe(Math.round(GATHER_BASE_AMOUNT * 0.5));
  });

  it('activateSkill slot0 经 activateSkill 路径标记敌人', () => {
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    const e1 = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 }); e1.maxHp = 200;
    const r = HeroSystem.activateSkill(hero, 0, { units: [hero, e1], buildings: [] });
    expect(r.success).toBe(true);
    expect(UnitSpecialSystem.getMarkBonus(e1.id)).toBe(0.25);
  });

  it('activateSkill slot2 经 activateSkill 路径加水晶(需传 world)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 5;
    const player = world.players[0];
    const before = player.resources.crystal;
    const r = HeroSystem.activateSkill(hero, 2, { units: [hero], buildings: [] }, undefined, world);
    expect(r.success).toBe(true);
    expect(player.resources.crystal).toBe(before + 500);
  });

  it('_execJadeALeak 直接调用对敌方建筑伤害', () => {
    const hero = makeHero('hero_jade_a', 0, 5, 5);
    hero.level = 4;
    const enemyBld = makeBuilding({ owner: 1, tileX: 6, tileY: 5 });
    enemyBld.maxHp = 500; enemyBld.hp = 500;
    const spy = vi.spyOn(enemyBld, 'takeDamage');
    HeroSystem._execJadeALeak(hero, [enemyBld]);
    expect(spy).toHaveBeenCalledWith(120, 'physical');
  });
});

describe('HeroSystem 薇拉 (hero_jade_b)', () => {
  beforeEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });
  afterEach(() => { EventBus.clear(); UnitSpecialSystem.resetForTest(); });

  it('佣兵契约光环: 周围8格友方步兵 auraAttackMult +0.15', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    const infantry = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100, category: 'infantry' });
    const vehicle = makeUnit({ owner: 0, tileX: 7, tileY: 5, hp: 100, category: 'vehicle' });
    const farInfantry = makeUnit({ owner: 0, tileX: 20, tileY: 20, hp: 100, category: 'infantry' });
    HeroSystem.update([hero], [hero, infantry, vehicle, farInfantry], [], world, 0.05);
    expect(infantry.auraAttackMult).toBeCloseTo(1.15);
    expect(vehicle.auraAttackMult).toBe(1.0); // 非步兵不加
    expect(farInfantry.auraAttackMult).toBe(1.0); // 超出范围
  });

  it('佣兵契约光环: 两个薇拉叠加到 1.30', () => {
    const world = makeWorld(20, 20, true);
    const h1 = makeHero('hero_jade_b', 0, 5, 5);
    const h2 = makeHero('hero_jade_b', 0, 6, 5);
    const infantry = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100, category: 'infantry' });
    HeroSystem.update([h1, h2], [h1, h2, infantry], [], world, 0.05);
    expect(infantry.auraAttackMult).toBeCloseTo(1.30);
  });

  it('auto slot0 雇佣空降: 己方佣兵剑士<4 时空投2个(L1)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    const result = HeroSystem.update([hero], [hero], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(1);
    expect(result.spawnCommands[0]).toEqual({
      unitDefId: 'unit_mercenary_sword', count: 2,
      position: { x: 6, y: 6 }, playerIndex: 0,
    });
    expect(hero.skillCooldowns[0]).toBe(35);
  });

  it('auto slot0 L2 空投3佣兵剑士+1翡翠斥候(2 spawnCommands)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    hero.level = 2;
    const result = HeroSystem.update([hero], [hero], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(2);
    expect(result.spawnCommands[0].unitDefId).toBe('unit_mercenary_sword');
    expect(result.spawnCommands[0].count).toBe(3);
    expect(result.spawnCommands[1].unitDefId).toBe('unit_jade_scout');
    expect(hero.skillCooldowns[0]).toBe(28);
  });

  it('auto slot0 己方佣兵剑士>=4 不触发', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    const mercs = Array.from({ length: 4 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_mercenary_sword', tileX: i, tileY: 10, hp: 100 }),
    );
    const result = HeroSystem.update([hero], [hero, ...mercs], [], world, 0.05);
    expect(result.spawnCommands).toHaveLength(0);
  });

  it('auto slot1 战场佣金: 周围8格友方步兵>=3 时攻击+0.20(L3)', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    hero.level = 3;
    // 4个佣兵剑士使 slot0 不触发，且提供 slot1 的步兵
    const mercs = Array.from({ length: 4 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_mercenary_sword', tileX: 6 + i, tileY: 5, hp: 100, category: 'infantry' }),
    );
    HeroSystem.update([hero], [hero, ...mercs], [], world, 0.05);
    // 基础光环 0.15 + 战场佣金 0.20 = 1.35
    expect(mercs[0].auraAttackMult).toBeCloseTo(1.35);
    expect(hero.skillCooldowns[1]).toBe(40);
  });

  it('auto slot1 L4 攻击+0.30+冷却32', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    hero.level = 4;
    const mercs = Array.from({ length: 4 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_mercenary_sword', tileX: 6 + i, tileY: 5, hp: 100, category: 'infantry' }),
    );
    HeroSystem.update([hero], [hero, ...mercs], [], world, 0.05);
    expect(mercs[0].auraAttackMult).toBeCloseTo(1.45); // 0.15 + 0.30
    expect(hero.skillCooldowns[1]).toBe(32);
  });

  it('auto slot2 翡翠军团: HP<0.4 时召唤3佣兵+1斥候，全军攻速+50%', () => {
    const world = makeWorld(20, 20, true);
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    hero.level = 5;
    hero.maxHp = 650; hero.hp = 200; // ~0.31 < 0.4
    // 4个佣兵使 slot0 不触发
    const mercs = Array.from({ length: 4 }, (_, i) =>
      makeUnit({ owner: 0, spriteKey: 'unit_mercenary_sword', tileX: 10 + i, tileY: 10, hp: 100, category: 'infantry' }),
    );
    mercs[0].attackTimer = mercs[0].attackCooldown; // 设满冷却验证减半
    const result = HeroSystem.update([hero], [hero, ...mercs], [], world, 0.05);
    // 2个 spawnCommands (3佣兵 + 1斥候)
    expect(result.spawnCommands).toHaveLength(2);
    expect(result.spawnCommands[0].unitDefId).toBe('unit_mercenary_sword');
    expect(result.spawnCommands[0].count).toBe(3);
    expect(result.spawnCommands[1].unitDefId).toBe('unit_jade_scout');
    // 全军攻速：attackTimer 减半
    expect(mercs[0].attackTimer).toBeCloseTo(mercs[0].attackCooldown * 0.5, 1);
    expect(hero.skillCooldowns[2]).toBe(160);
  });

  it('activateSkill slot0 返回 spawnCommands (2佣兵 L1)', () => {
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    const r = HeroSystem.activateSkill(hero, 0, { units: [hero], buildings: [] });
    expect(r.success).toBe(true);
    expect(r.spawnCommands).toHaveLength(1);
    expect(r.spawnCommands![0].unitDefId).toBe('unit_mercenary_sword');
    expect(r.spawnCommands![0].count).toBe(2);
  });

  it('_execJadeBAirdrop 直接调用: L2 返回 2 cmds', () => {
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    hero.level = 2;
    const cmds = HeroSystem._execJadeBAirdrop(hero);
    expect(cmds).toHaveLength(2);
    expect(cmds[0].unitDefId).toBe('unit_mercenary_sword');
    expect(cmds[1].unitDefId).toBe('unit_jade_scout');
  });

  it('_execJadeBLegion 直接调用: 返回召唤命令+全军攻速', () => {
    const hero = makeHero('hero_jade_b', 0, 5, 5);
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100, category: 'infantry' });
    ally.attackTimer = ally.attackCooldown;
    const cmds = HeroSystem._execJadeBLegion(hero, [hero, ally]);
    expect(cmds).toHaveLength(2);
    expect(ally.attackTimer).toBeCloseTo(ally.attackCooldown * 0.5, 1);
  });
});
