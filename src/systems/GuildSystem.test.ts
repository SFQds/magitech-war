/**
 * GuildSystem 单元测试 - 4 个行会核心机制
 * 法师公会充能/护盾、机械行会并行槽、炼金协会药剂、虚空研究院过载
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuildSystem, ALCHEMY_POTIONS, AlchemyPotion } from './GuildSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { makeUnit, makeBuilding, makeWorld } from '../__fixtures__/factories';
import type { PlayerState } from '../types/entity';

function makeHeroUnit(owner = 0, tileX = 5, tileY = 5): Hero {
  return new Hero(owner, 'arcane_empire', tileX, tileY, HERO_DEFS['hero_isabelle'], 'hero_isabelle');
}

function makeMageUnit(owner = 0, spriteKey = 'unit_battle_mage', tileX = 5, tileY = 5) {
  return makeUnit({ owner, spriteKey, tileX, tileY, hp: 100 });
}

function makePlayerState(index: number, guilds: string[] = []): PlayerState {
  return {
    index, faction: 'arcane_empire', guilds, isAI: false,
    resources: { crystal: 1000, industry: 50, supply: 0, supplyCap: 50, industryCap: 65 },
  };
}

describe('GuildSystem mages charge accumulation', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('accumulates a charge every CHARGE_INTERVAL (30s)', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const unit = makeMageUnit(0, 'unit_battle_mage');
    const timers = new Map<number, number>();
    GuildSystem.update(players, [unit], [], 30, new Map(), timers);
    expect(unit.abilityCharges).toBe(1);
    expect(timers.get(0)).toBe(0); // remainder 0
  });

  it('accumulates partial timer across multiple update calls', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const unit = makeMageUnit(0, 'unit_battle_mage');
    const timers = new Map<number, number>();
    GuildSystem.update(players, [unit], [], 10, new Map(), timers);
    GuildSystem.update(players, [unit], [], 10, new Map(), timers);
    GuildSystem.update(players, [unit], [], 10, new Map(), timers);
    expect(unit.abilityCharges).toBe(1);
  });

  it('caps charges at MAX_CHARGES=3 even after many intervals', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const unit = makeMageUnit(0, 'unit_battle_mage');
    const timers = new Map<number, number>();
    for (let i = 0; i < 10; i++) {
      GuildSystem.update(players, [unit], [], 30, new Map(), timers);
    }
    expect(unit.abilityCharges).toBe(3);
  });

  it('only charges MAGE_GUILD_UNITS, not arbitrary units', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    const rifle = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', hp: 100 });
    const timers = new Map<number, number>();
    GuildSystem.update(players, [mage, rifle], [], 30, new Map(), timers);
    expect(mage.abilityCharges).toBe(1);
    expect(rifle.abilityCharges).toBe(0);
  });

  it('skips dead units when charging', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.hp = 0;
    const timers = new Map<number, number>();
    GuildSystem.update(players, [mage], [], 30, new Map(), timers);
    expect(mage.abilityCharges).toBe(0);
  });

  it('skips units owned by other players', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const enemyMage = makeMageUnit(1, 'unit_battle_mage');
    const timers = new Map<number, number>();
    GuildSystem.update(players, [enemyMage], [], 30, new Map(), timers);
    expect(enemyMage.abilityCharges).toBe(0);
  });
});

describe('GuildSystem mages auto-shield', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('auto-activates shield when hp<50%, charges>=2, shieldHp<=0', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.maxHp = 100; mage.hp = 40; // 40%
    mage.abilityCharges = 2;
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    GuildSystem.update(players, [mage], [], 0.1, new Map(), new Map());
    expect(mage.abilityCharges).toBe(0);
    expect(mage.shieldHp).toBe(150);
    expect(mage.maxShieldHp).toBe(150);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'arcane_shield_auto' }));
  });

  it('does NOT auto-activate when hp >= 50%', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.maxHp = 100; mage.hp = 60;
    mage.abilityCharges = 2;
    GuildSystem.update(players, [mage], [], 0.1, new Map(), new Map());
    expect(mage.shieldHp).toBe(0);
    expect(mage.abilityCharges).toBe(2);
  });

  it('does NOT auto-activate if already shielded', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.maxHp = 100; mage.hp = 40;
    mage.abilityCharges = 2;
    mage.shieldHp = 50;
    GuildSystem.update(players, [mage], [], 0.1, new Map(), new Map());
    expect(mage.abilityCharges).toBe(2);
    expect(mage.shieldHp).toBe(50);
  });

  it('does NOT auto-activate when charges<2', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.maxHp = 100; mage.hp = 40;
    mage.abilityCharges = 1;
    GuildSystem.update(players, [mage], [], 0.1, new Map(), new Map());
    expect(mage.shieldHp).toBe(0);
  });
});

describe('GuildSystem mages active skills', () => {
  it('magesChargeStrike returns false when charges < 1', () => {
    const u = makeUnit({ hp: 100 });
    u.abilityCharges = 0;
    expect(GuildSystem.magesChargeStrike(u)).toBe(false);
  });

  it('magesChargeStrike multiplies attackDamage by 1.5 and consumes 1 charge', () => {
    const u = makeUnit({ hp: 100, attackDamage: 40 });
    u.abilityCharges = 3;
    expect(GuildSystem.magesChargeStrike(u)).toBe(true);
    expect(u.abilityCharges).toBe(2);
    expect(u.baseAttackDamage).toBe(40);
    expect(u.attackDamage).toBe(60); // round(40*1.5)
  });

  it('magesRestoreAfterAttack no-ops when _chargeStrikeUses is 0', () => {
    const u = makeUnit({ hp: 100, attackDamage: 40 });
    GuildSystem.magesRestoreAfterAttack(u); // no throw
    expect(u.attackDamage).toBe(40);
  });

  it('magesRestoreAfterAttack decrements uses; restores attackDamage when uses hit 0', () => {
    const u = makeUnit({ hp: 100, attackDamage: 40 });
    u.abilityCharges = 3;
    GuildSystem.magesChargeStrike(u); // uses=1
    GuildSystem.magesChargeStrike(u); // uses=2
    GuildSystem.magesRestoreAfterAttack(u); // uses=1, still buffed
    expect(u.attackDamage).toBe(60);
    GuildSystem.magesRestoreAfterAttack(u); // uses=0, restore
    expect(u.attackDamage).toBe(40);
    expect(u.baseAttackDamage).toBe(0);
  });

  it('magesGroupShield returns false on <2 charges and grants no shields', () => {
    const caster = makeUnit({ owner: 0, hp: 100 });
    caster.abilityCharges = 1;
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    expect(GuildSystem.magesGroupShield(caster, [ally], 5)).toBe(false);
    expect(ally.shieldHp).toBe(0);
  });

  it('magesGroupShield grants 150 shield to allies within range, skips shielded', () => {
    const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
    caster.abilityCharges = 3;
    const near = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    const shielded = makeUnit({ owner: 0, tileX: 5, tileY: 6, hp: 100 });
    shielded.shieldHp = 80;
    expect(GuildSystem.magesGroupShield(caster, [near, shielded], 5)).toBe(true);
    expect(caster.abilityCharges).toBe(1);
    expect(near.shieldHp).toBe(150);
    expect(shielded.shieldHp).toBe(80); // skipped
  });

  it('magesGroupShield only affects same-owner living allies', () => {
    const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
    caster.abilityCharges = 3;
    const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const dead = makeUnit({ owner: 0, tileX: 5, tileY: 6, hp: 100 });
    dead.hp = 0;
    GuildSystem.magesGroupShield(caster, [enemy, dead], 5);
    expect(enemy.shieldHp).toBe(0);
    expect(dead.shieldHp).toBe(0);
  });

  it('magesElementalSurge returns false on <3 charges', () => {
    const caster = makeUnit({ hp: 100 });
    caster.abilityCharges = 2;
    expect(GuildSystem.magesElementalSurge(caster, [])).toBe(false);
  });

  it('magesElementalSurge damages enemies in range, sets stun, ignores allies/out-of-range', () => {
    const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
    caster.abilityCharges = 3;
    const enemyIn = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 100 });
    const enemyOut = makeUnit({ owner: 1, tileX: 20, tileY: 20, hp: 100 });
    const ally = makeUnit({ owner: 0, tileX: 6, tileY: 5, hp: 100 });
    const spy = vi.spyOn(enemyIn, 'takeDamage');
    expect(GuildSystem.magesElementalSurge(caster, [enemyIn, enemyOut, ally])).toBe(true);
    expect(caster.abilityCharges).toBe(0);
    expect(spy).toHaveBeenCalledWith(80, 'magic');
    expect(enemyIn.attackTimer).toBeGreaterThanOrEqual(2.0);
    expect(enemyOut.hp).toBe(100);
    expect(ally.hp).toBe(100);
  });
});

describe('GuildSystem mechanist helpers', () => {
  it('getMechanistParallelSlots returns 3 for barracks/factory/assembly_workshop', () => {
    for (const key of ['bld_barracks', 'bld_factory', 'bld_assembly_workshop']) {
      const b = makeBuilding({ spriteKey: key });
      expect(GuildSystem.getMechanistParallelSlots(b, false)).toBe(3);
      expect(GuildSystem.getMechanistParallelSlots(b, true)).toBe(3); // param ignored
    }
  });

  it('getMechanistParallelSlots returns 1 for non-parallel buildings', () => {
    const b = makeBuilding({ spriteKey: 'bld_cc_empire' });
    expect(GuildSystem.getMechanistParallelSlots(b, false)).toBe(1);
  });

  it('getMechanistPenalty returns 0 at queueIndex 0 regardless of tech', () => {
    expect(GuildSystem.getMechanistPenalty(0, false)).toBe(0);
    expect(GuildSystem.getMechanistPenalty(0, true)).toBe(0);
  });

  it('getMechanistPenalty scales 0.10/queue without optimized tech and 0.05 with it', () => {
    expect(GuildSystem.getMechanistPenalty(1, false)).toBeCloseTo(0.10);
    expect(GuildSystem.getMechanistPenalty(2, false)).toBeCloseTo(0.20);
    expect(GuildSystem.getMechanistPenalty(1, true)).toBeCloseTo(0.05);
    expect(GuildSystem.getMechanistPenalty(2, true)).toBeCloseTo(0.10);
    expect(GuildSystem.getMechanistPenalty(3, true)).toBeCloseTo(0.15);
  });
});

describe('GuildSystem alchemy potions', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  const strPotion = ALCHEMY_POTIONS.find(p => p.effect === 'strength')!;
  const ironPotion = ALCHEMY_POTIONS.find(p => p.effect === 'ironskin')!;
  const swiftPotion = ALCHEMY_POTIONS.find(p => p.effect === 'swift')!;
  const corrPotion = ALCHEMY_POTIONS.find(p => p.effect === 'corrosion')!;

  it('applyAlchemyPotion strength sets buff fields and emits ABILITY_USED', () => {
    const u = makeUnit({ owner: 0, hp: 100 });
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    GuildSystem.applyAlchemyPotion(u, strPotion);
    expect(u.alchemyBuffType).toBe('strength');
    expect(u.alchemyBuffTimer).toBe(45);
    expect(u.alchemyBuffValue).toBeCloseTo(0.30);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'potion_strength', playerIndex: 0 }));
  });

  it('applyAlchemyPotion ironskin sets armor = round(baseArmor*(1+value)) and hadIronskin=true', () => {
    const u = makeUnit({ owner: 0, hp: 100 });
    u.baseArmor = 10;
    GuildSystem.applyAlchemyPotion(u, ironPotion);
    expect(u.armor).toBe(14); // round(10*1.4)
    expect(u.hadIronskin).toBe(true);
  });

  it('applyAlchemyPotion restores baseArmor when prior ironskin overwritten by non-ironskin', () => {
    const u = makeUnit({ owner: 0, hp: 100 });
    u.baseArmor = 10;
    GuildSystem.applyAlchemyPotion(u, ironPotion);
    expect(u.armor).toBe(14);
    GuildSystem.applyAlchemyPotion(u, strPotion);
    expect(u.armor).toBe(10);
    expect(u.hadIronskin).toBe(false);
    expect(u.alchemyBuffType).toBe('strength');
  });

  it('applyAlchemyPotion swift/corrosion do not change armor or hadIronskin', () => {
    const u = makeUnit({ owner: 0, hp: 100 });
    u.baseArmor = 10;
    u.armor = 10;
    GuildSystem.applyAlchemyPotion(u, swiftPotion);
    expect(u.armor).toBe(10);
    GuildSystem.applyAlchemyPotion(u, corrPotion);
    expect(u.armor).toBe(10);
  });

  it('_updateAlchemyBuffs decrements timer and restores armor when ironskin expires', () => {
    const players = [makePlayerState(0, ['alchemists_society'])];
    const u = makeUnit({ owner: 0, hp: 100 });
    u.baseArmor = 10;
    GuildSystem.applyAlchemyPotion(u, ironPotion);
    expect(u.armor).toBe(14);
    GuildSystem.update(players, [u], [], 45, new Map(), new Map()); // expire
    expect(u.alchemyBuffTimer).toBe(0);
    expect(u.alchemyBuffType).toBe('none');
    expect(u.armor).toBe(10);
    expect(u.hadIronskin).toBe(false);
  });

  it('non-alchemy player still ticks corrosion debuff on own units (P0-6 fix)', () => {
    const players = [makePlayerState(0, [])]; // no alchemists
    const u = makeUnit({ owner: 0, hp: 100 });
    u.alchemyBuffType = 'corrosion';
    u.alchemyBuffTimer = 5;
    u.alchemyBuffValue = 0.30;
    GuildSystem.update(players, [u], [], 5, new Map(), new Map());
    expect(u.alchemyBuffTimer).toBe(0);
    expect(u.alchemyBuffType).toBe('none');
    expect(u.alchemyBuffValue).toBe(0);
  });

  it('non-alchemy player does NOT tick strength/swift/ironskin buff on own units', () => {
    const players = [makePlayerState(0, [])];
    const u = makeUnit({ owner: 0, hp: 100 });
    u.alchemyBuffType = 'strength';
    u.alchemyBuffTimer = 10;
    GuildSystem.update(players, [u], [], 5, new Map(), new Map());
    expect(u.alchemyBuffTimer).toBe(10); // unchanged
  });
});

describe('GuildSystem alchemy getters', () => {
  it('all getters return neutral when timer<=0', () => {
    const u = makeUnit({ hp: 100 });
    expect(GuildSystem.getAlchemyDamageMult(u)).toBe(1.0);
    expect(GuildSystem.getAlchemyArmorBonus(u)).toBe(0);
    expect(GuildSystem.getAlchemySpeedMult(u)).toBe(1.0);
    expect(GuildSystem.getAlchemyCorrosionArmorPenalty(u)).toBe(0);
  });

  it('strength buff -> damageMult 1.3', () => {
    const u = makeUnit({ hp: 100 });
    u.alchemyBuffType = 'strength';
    u.alchemyBuffValue = 0.30;
    u.alchemyBuffTimer = 10;
    expect(GuildSystem.getAlchemyDamageMult(u)).toBeCloseTo(1.30);
  });

  it('ironskin buff -> armorBonus = round(baseArmor*value)', () => {
    const u = makeUnit({ hp: 100 });
    u.baseArmor = 10;
    u.alchemyBuffType = 'ironskin';
    u.alchemyBuffValue = 0.40;
    u.alchemyBuffTimer = 10;
    expect(GuildSystem.getAlchemyArmorBonus(u)).toBe(4); // round(10*0.4)
  });

  it('swift buff -> speedMult 1.4', () => {
    const u = makeUnit({ hp: 100 });
    u.alchemyBuffType = 'swift';
    u.alchemyBuffValue = 0.40;
    u.alchemyBuffTimer = 10;
    expect(GuildSystem.getAlchemySpeedMult(u)).toBeCloseTo(1.40);
  });

  it('corrosion buff -> armorPenalty = value (0.30)', () => {
    const u = makeUnit({ hp: 100 });
    u.alchemyBuffType = 'corrosion';
    u.alchemyBuffValue = 0.30;
    u.alchemyBuffTimer = 10;
    expect(GuildSystem.getAlchemyCorrosionArmorPenalty(u)).toBeCloseTo(0.30);
  });

  it('getEffectiveAlchemyArmorBonus returns 0 for a non-Unit object', () => {
    const fakeTarget = { alchemyBuffTimer: 10, alchemyBuffType: 'ironskin', baseArmor: 10, alchemyBuffValue: 0.4 } as never;
    expect(GuildSystem.getEffectiveAlchemyArmorBonus(fakeTarget)).toBe(0);
  });
});

describe('GuildSystem void overload', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('activateVoidOverload returns false if unit already overcharged', () => {
    const u = makeUnit({ hp: 100 });
    u.isVoidOvercharged = true;
    expect(GuildSystem.activateVoidOverload(u, false)).toBe(false);
  });

  it('activateVoidOverload returns false if unit dead', () => {
    const u = makeUnit({ hp: 100 });
    u.hp = 0;
    expect(GuildSystem.activateVoidOverload(u, false)).toBe(false);
  });

  it('without optimized tech: timer=30, isVoidOptimized=false, mult=1.5', () => {
    const u = makeUnit({ hp: 100 });
    const spy = vi.fn();
    EventBus.on(GameEvent.ABILITY_USED, spy);
    expect(GuildSystem.activateVoidOverload(u, false)).toBe(true);
    expect(u.isVoidOvercharged).toBe(true);
    expect(u.isVoidOptimized).toBe(false);
    expect(u.voidOverloadTimer).toBe(30);
    expect(GuildSystem.getVoidOverloadDamageMult(u)).toBeCloseTo(1.5);
    expect(GuildSystem.getVoidOverloadSpeedMult(u)).toBeCloseTo(1.5);
    expect(GuildSystem.getVoidOverloadArmorMult(u)).toBeCloseTo(1.5);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abilityId: 'void_overload' }));
  });

  it('with optimized tech: timer=45, isVoidOptimized=true, mult=1.35', () => {
    const u = makeUnit({ hp: 100 });
    GuildSystem.activateVoidOverload(u, true);
    expect(u.voidOverloadTimer).toBe(45);
    expect(u.isVoidOptimized).toBe(true);
    expect(GuildSystem.getVoidOverloadDamageMult(u)).toBeCloseTo(1.35);
  });

  it('getVoidOverload*Mult return 1.0 when timer<=0 even if flag set', () => {
    const u = makeUnit({ hp: 100 });
    u.isVoidOvercharged = true;
    u.voidOverloadTimer = 0;
    expect(GuildSystem.getVoidOverloadDamageMult(u)).toBe(1.0);
  });

  it('void overload expiry on normal unit: hp=0, isActive=false, emits UNIT_DESTROYED', () => {
    const players = [makePlayerState(0, ['void_institute'])];
    const u = makeUnit({ owner: 0, hp: 100 });
    GuildSystem.activateVoidOverload(u, false);
    u.voidOverloadTimer = 1;
    const spy = vi.fn();
    EventBus.on(GameEvent.UNIT_DESTROYED, spy);
    GuildSystem.update(players, [u], [], 1, new Map(), new Map());
    expect(u.hp).toBe(0);
    expect(u.isActive).toBe(false);
    expect(u.isVoidOvercharged).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ cause: 'void_overload_expired' }));
  });

  it('void overload expiry on Hero routes through takeDamage (reviveTimer starts) and emits HERO_DIED', () => {
    const players = [makePlayerState(0, ['void_institute'])];
    const h = makeHeroUnit(0);
    GuildSystem.activateVoidOverload(h, false);
    h.voidOverloadTimer = 1;
    const unitSpy = vi.fn();
    const heroSpy = vi.fn();
    EventBus.on(GameEvent.UNIT_DESTROYED, unitSpy);
    EventBus.on(GameEvent.HERO_DIED, heroSpy);
    GuildSystem.update(players, [h], [], 1, new Map(), new Map());
    expect(h.reviveTimer).toBe(HERO_DEFS['hero_isabelle'].reviveCooldown);
    expect(h.isActive).toBe(false);
    expect(unitSpy).toHaveBeenCalled();
    expect(heroSpy).toHaveBeenCalledWith(expect.objectContaining({ heroId: 'hero_isabelle' }));
  });

  it('skips non-overcharged and dead units', () => {
    const players = [makePlayerState(0, ['void_institute'])];
    const normal = makeUnit({ owner: 0, hp: 100 });
    const dead = makeUnit({ owner: 0, hp: 100 });
    dead.isVoidOvercharged = true;
    dead.voidOverloadTimer = 1;
    dead.hp = 0;
    const spy = vi.fn();
    EventBus.on(GameEvent.UNIT_DESTROYED, spy);
    GuildSystem.update(players, [normal, dead], [], 1, new Map(), new Map());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GuildSystem update skip behaviors', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('update with deltaSec=0 does not advance charge timers', () => {
    const players = [makePlayerState(0, ['mages_guild'])];
    const mage = makeMageUnit(0, 'unit_battle_mage');
    const timers = new Map<number, number>();
    GuildSystem.update(players, [mage], [], 0, new Map(), timers);
    expect(mage.abilityCharges).toBe(0);
  });

  it('update skips players whose guilds array lacks the relevant guild', () => {
    const players = [makePlayerState(0, [])]; // no mages_guild
    const mage = makeMageUnit(0, 'unit_battle_mage');
    mage.maxHp = 100; mage.hp = 40;
    mage.abilityCharges = 2;
    GuildSystem.update(players, [mage], [], 30, new Map(), new Map());
    expect(mage.abilityCharges).toBe(2); // unchanged
    expect(mage.shieldHp).toBe(0);
  });
});


describe('GuildSystem - 第二轮补洞', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  describe('充能 if 非行为与边界', () => {
    it('单次 update 60s 只产 1 充能 (if 非 while, 余 30 进 timer)', () => {
      const u = makeMageUnit(0);
      const timers = new Map<number, number>();
      GuildSystem.update([makePlayerState(0, ['mages_guild'])], [u], [], 60, new Map(), timers);
      expect(u.abilityCharges).toBe(1);
      expect(timers.get(0)).toBe(30);
    });

    it('charges 已达 MAX_CHARGES 不再增加', () => {
      const u = makeMageUnit(0);
      u.abilityCharges = 3;
      const timers = new Map<number, number>();
      GuildSystem.update([makePlayerState(0, ['mages_guild'])], [u], [], 30, new Map(), timers);
      expect(u.abilityCharges).toBe(3);
    });
  });

  describe('自动护盾边界', () => {
    it('hp 恰好 50% 不触发 (严格 <0.5)', () => {
      const mage = makeMageUnit(0);
      mage.maxHp = 100; mage.hp = 50;
      mage.abilityCharges = 3; // 已满, update 不会增加, 也不触发护盾
      GuildSystem.update([makePlayerState(0, ['mages_guild'])], [mage], [], 30, new Map(), new Map());
      expect(mage.shieldHp).toBe(0);
      expect(mage.abilityCharges).toBe(3); // 未消耗
    });

    it('hp=49 (略低于 50%) 触发护盾', () => {
      const mage = makeMageUnit(0);
      mage.maxHp = 100; mage.hp = 49;
      mage.abilityCharges = 2;
      GuildSystem.update([makePlayerState(0, ['mages_guild'])], [mage], [], 30, new Map(), new Map());
      expect(mage.shieldHp).toBe(150);
    });

    it('charges=3 时消耗 2 剩 1', () => {
      const mage = makeMageUnit(0);
      mage.maxHp = 100; mage.hp = 40;
      mage.abilityCharges = 3;
      GuildSystem.update([makePlayerState(0, ['mages_guild'])], [mage], [], 30, new Map(), new Map());
      expect(mage.abilityCharges).toBe(1);
    });
  });

  describe('magesChargeStrike 边界', () => {
    it('多次施法不覆盖 baseAttackDamage', () => {
      const u = makeUnit({ hp: 100, attackDamage: 40 });
      u.abilityCharges = 3;
      GuildSystem.magesChargeStrike(u);
      GuildSystem.magesRestoreAfterAttack(u);
      u.abilityCharges = 3;
      GuildSystem.magesChargeStrike(u);
      expect(u.baseAttackDamage).toBe(40);
      expect(u.attackDamage).toBe(60);
    });

    it('奇数 baseAttackDamage 41 * 1.5 = 62 (round)', () => {
      const u = makeUnit({ hp: 100, attackDamage: 41 });
      u.abilityCharges = 1;
      GuildSystem.magesChargeStrike(u);
      expect(u.attackDamage).toBe(Math.round(41 * 1.5));
    });
  });

  describe('magesGroupShield 边界', () => {
    it('恰好 range 距离的盟友受盾 (<=range)', () => {
      const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
      caster.abilityCharges = 2;
      const ally = makeUnit({ owner: 0, tileX: 10, tileY: 5, hp: 100 });
      GuildSystem.magesGroupShield(caster, [ally], 5);
      expect(ally.shieldHp).toBe(150);
    });

    it('施法者自身也在 allUnits 中时也受盾', () => {
      const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
      caster.abilityCharges = 2;
      GuildSystem.magesGroupShield(caster, [caster], 5);
      expect(caster.shieldHp).toBe(150);
    });
  });

  describe('magesElementalSurge 边界', () => {
    it('attackTimer>2.0 不被降低 (max 守卫)', () => {
      const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
      caster.abilityCharges = 3;
      const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 1000 });
      enemy.attackTimer = 5;
      GuildSystem.magesElementalSurge(caster, [enemy], 8);
      expect(enemy.attackTimer).toBe(5);
    });

    it('自定义 damage=120 应用 120 伤害', () => {
      const caster = makeUnit({ owner: 0, tileX: 5, tileY: 5, hp: 100 });
      caster.abilityCharges = 3;
      const enemy = makeUnit({ owner: 1, tileX: 6, tileY: 5, hp: 1000 });
      enemy.armor = 0; enemy.baseArmor = 0;
      const before = enemy.hp;
      GuildSystem.magesElementalSurge(caster, [enemy], 8, 120);
      expect(enemy.hp).toBe(before - 120);
    });
  });

  describe('getMechanistPenalty 无上界', () => {
    it('queueIndex=10 返回 1.0 (100% 惩罚, 无上界钳制)', () => {
      expect(GuildSystem.getMechanistPenalty(10, false)).toBeCloseTo(1.0);
    });

    it('queueIndex=10 with optimized tech 返回 0.5', () => {
      expect(GuildSystem.getMechanistPenalty(10, true)).toBeCloseTo(0.5);
    });
  });

  describe('ALCHEMY_POTIONS 数据完整性', () => {
    it('四种药剂 id/crystalCost/duration 完整', () => {
      const ids = ALCHEMY_POTIONS.map(p => p.id);
      expect(ids).toContain('potion_strength');
      expect(ids).toContain('potion_ironskin');
      expect(ids).toContain('potion_swift');
      expect(ids).toContain('potion_corrosion');
      for (const p of ALCHEMY_POTIONS) {
        expect(p.crystalCost).toBeGreaterThan(0);
        expect(p.duration).toBeGreaterThan(0);
        expect(p.value).toBeGreaterThan(0);
      }
    });

    it('corrosion 药剂 cost=60 duration=30', () => {
      const p = ALCHEMY_POTIONS.find(x => x.effect === 'corrosion')!;
      expect(p.crystalCost).toBe(60);
      expect(p.duration).toBe(30);
    });
  });

  describe('炼金药剂边界', () => {
    it('ironskin 在 baseArmor=0 时 armor=0', () => {
      const u = makeUnit({ hp: 100 });
      u.baseArmor = 0; u.armor = 0;
      const ironPotion = ALCHEMY_POTIONS.find(p => p.effect === 'ironskin')!;
      GuildSystem.applyAlchemyPotion(u, ironPotion);
      expect(u.armor).toBe(0);
      expect(u.hadIronskin).toBe(true);
    });

    it('ironskin buff 不影响 damageMult (返回 1.0)', () => {
      const u = makeUnit({ hp: 100 });
      u.alchemyBuffType = 'ironskin';
      u.alchemyBuffValue = 0.4;
      u.alchemyBuffTimer = 10;
      expect(GuildSystem.getAlchemyDamageMult(u)).toBe(1.0);
    });

    it('strength buff 到期清零 buffType 和 buffValue', () => {
      const u = makeUnit({ hp: 100 });
      u.alchemyBuffType = 'strength';
      u.alchemyBuffValue = 0.3;
      u.alchemyBuffTimer = 1;
      GuildSystem.update([makePlayerState(0, ['alchemists_society'])], [u], [], 1, new Map(), new Map());
      expect(u.alchemyBuffType).toBe('none');
      expect(u.alchemyBuffValue).toBe(0);
    });

    it('applyAlchemyPotion: hadIronskin 但 armor 已等于 base 不恢复', () => {
      const u = makeUnit({ hp: 100 });
      u.baseArmor = 10; u.armor = 10;
      u.hadIronskin = true;
      const strPotion = ALCHEMY_POTIONS.find(p => p.effect === 'strength')!;
      GuildSystem.applyAlchemyPotion(u, strPotion);
      expect(u.armor).toBe(10);
    });
  });

  describe('getEffectiveAlchemyArmorBonus 边界', () => {
    it('ironskin Unit 返回 round(baseArmor*value)', () => {
      const u = makeUnit({ hp: 100 });
      u.baseArmor = 10;
      u.alchemyBuffType = 'ironskin';
      u.alchemyBuffValue = 0.4;
      u.alchemyBuffTimer = 10;
      expect(GuildSystem.getEffectiveAlchemyArmorBonus(u)).toBe(4);
    });

    it('strength buff Unit 返回 0', () => {
      const u = makeUnit({ hp: 100 });
      u.alchemyBuffType = 'strength';
      u.alchemyBuffValue = 0.3;
      u.alchemyBuffTimer = 10;
      expect(GuildSystem.getEffectiveAlchemyArmorBonus(u)).toBe(0);
    });

    it('timer<=0 的 ironskin Unit 返回 0', () => {
      const u = makeUnit({ hp: 100 });
      u.baseArmor = 10;
      u.alchemyBuffType = 'ironskin';
      u.alchemyBuffValue = 0.4;
      u.alchemyBuffTimer = 0;
      expect(GuildSystem.getEffectiveAlchemyArmorBonus(u)).toBe(0);
    });
  });

  describe('虚空过载边界', () => {
    it('activateVoidOverload: 已过载且死亡返回 false 不改状态', () => {
      const u = makeUnit({ hp: 100 });
      u.isVoidOvercharged = true;
      u.takeDamage(999, 'physical');
      expect(GuildSystem.activateVoidOverload(u, false)).toBe(false);
    });

    it('getVoidOverloadDamageMult: isVoidOptimized 为 undefined 走非优化 1.5', () => {
      const u = makeUnit({ hp: 100 });
      u.isVoidOvercharged = true;
      u.voidOverloadTimer = 10;
      delete (u as any).isVoidOptimized;
      expect(GuildSystem.getVoidOverloadDamageMult(u)).toBeCloseTo(1.5);
    });
  });

  describe('非 alchemy 玩家腐蚀边界', () => {
    it('非 alchemy 玩家只对自己单位 tick 腐蚀, 不 tick 敌方', () => {
      const enemy = makeUnit({ owner: 1, hp: 100 });
      enemy.alchemyBuffType = 'corrosion';
      enemy.alchemyBuffValue = 0.3;
      enemy.alchemyBuffTimer = 5;
      GuildSystem.update([makePlayerState(0, [])], [enemy], [], 5, new Map(), new Map());
      expect(enemy.alchemyBuffTimer).toBe(5);
    });
  });
});
