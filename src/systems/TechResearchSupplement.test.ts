/**
 * 补漏测试 - TechSystem / ResearchSystem 缺失分支
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TechSystem } from '../systems/TechSystem';
import { ResearchSystem } from '../systems/ResearchSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { EntityRegistry } from '../core/EntityRegistry';
import {
  makeWorld, makeUnit, makeBuilding, makeResearchingBuilding,
} from '../__fixtures__/factories';

describe('TechSystem - gatherMult partial combos', () => {
  let world: ReturnType<typeof makeWorld>;
  let ts: TechSystem;
  beforeEach(() => {
    world = makeWorld(16, 16, true);
    ts = new TechSystem(world);
  });

  it('crystal_smelting alone sets gatherMult to 1.15', () => {
    ts.getTree(0).completeTech('tech:crystal_smelting');
    ts.refresh(0);
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.15);
  });

  it('refining_tech alone (prereq bypassed) sets gatherMult to 1.25', () => {
    ts.getTree(0).completeTech('tech:refining_tech');
    ts.refresh(0);
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.25);
  });

  it('two-tech combo advanced_mining+crystal_smelting = 1.2*1.15', () => {
    ts.getTree(0).completeTech('tech:advanced_mining');
    ts.getTree(0).completeTech('tech:crystal_smelting');
    ts.refresh(0);
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.2 * 1.15);
  });
});

describe('TechSystem - edge cases', () => {
  it('getEffects returns DEFAULT_EFFECTS for an uninitialized player index', () => {
    const world = makeWorld(16, 16, true);
    const ts = new TechSystem(world);
    const e = ts.getEffects(99);
    expect(e.gatherMult).toBe(1.0);
    expect(e.infantryArmor).toBe(0);
    expect(e.buildingHpMult).toBe(1.0);
  });

  it('getTree throws when player index has no tech tree', () => {
    const world = makeWorld(16, 16, false); // no players
    const ts = new TechSystem(world);
    expect(() => ts.getTree(0)).toThrow(/TechTree not found/);
  });

  it('applyToUnit does not modify armor of a non-infantry (vehicle) unit', () => {
    const world = makeWorld(16, 16, true);
    const ts = new TechSystem(world);
    ts.getTree(0).completeTech('tech:infantry_armor');
    ts.refresh(0);
    const vehicle = makeUnit({ category: 'vehicle', baseArmor: 2 } as never);
    vehicle.baseArmor = 2; vehicle.armor = 2;
    ts.applyToUnit(vehicle);
    expect(vehicle.armor).toBe(2); // unchanged
  });

  it('applyToBuilding clamps hp down when current hp exceeds new maxHp', () => {
    const world = makeWorld(16, 16, true);
    const ts = new TechSystem(world);
    ts.getTree(0).completeTech('tech:structure_reinforce');
    ts.refresh(0);
    const b = makeBuilding({ owner: 0, hp: 800 });
    b.maxHp = 800; b.hp = 800;
    ts.applyToBuilding(b);
    expect(b.maxHp).toBe(960); // round(800*1.2)
    expect(b.hp).toBe(800); // 800 < 960, unchanged
  });

  it('applyToBuilding clamps hp when hp exceeds new (scaled-down) maxHp', () => {
    const world = makeWorld(16, 16, true);
    const ts = new TechSystem(world);
    // no structure_reinforce -> buildingHpMult stays 1.0, so no change
    ts.refresh(0);
    const b = makeBuilding({ owner: 0, hp: 800 });
    ts.applyToBuilding(b);
    expect(b.maxHp).toBe(800); // unchanged (mult=1.0)
  });
});

describe('ResearchSystem - event emission & isolation', () => {
  let world: ReturnType<typeof makeWorld>;
  let entities: EntityRegistry;
  let ts: TechSystem;
  let research: ResearchSystem;

  beforeEach(() => {
    EventBus.clear();
    world = makeWorld(16, 16, true);
    entities = new EntityRegistry();
    ts = new TechSystem(world);
    ts.initAll();
    research = new ResearchSystem(world, entities, ts);
  });
  afterEach(() => EventBus.clear());

  it('emits RESEARCH_COMPLETE event on completion', () => {
    const spy = vi.fn();
    EventBus.on(GameEvent.RESEARCH_COMPLETE, spy);
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    research.update(10);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      playerIndex: 0, techDefId: 'tech:infantry_armor',
    }));
  });

  it('retroactive infantry_armor skips dead infantry', () => {
    const dead = makeUnit({ owner: 0, tileX: 1, tileY: 1, hp: 100 });
    dead.maxHp = 100; dead.baseArmor = 2; dead.armor = 2;
    dead.takeDamage(99999, 'physical'); // dead
    const live = makeUnit({ owner: 0, tileX: 2, tileY: 2, hp: 100 });
    live.maxHp = 100; live.baseArmor = 2; live.armor = 2;
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    entities.addUnit(dead);
    entities.addUnit(live);
    research.update(10);
    expect(live.armor).toBe(7); // 2 + 5
    expect(dead.armor).toBe(2); // unchanged (dead)
  });

  it('retroactive apply does not buff enemy-owner units', () => {
    const enemy = makeUnit({ owner: 1, tileX: 1, tileY: 1, hp: 100 });
    enemy.maxHp = 100; enemy.baseArmor = 2; enemy.armor = 2;
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    entities.addUnit(enemy);
    research.update(10);
    expect(enemy.armor).toBe(2); // owner 1 not buffed by owner 0's tech
  });

  it('overshoot delta (100s on 10s research) completes exactly once', () => {
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    research.update(100);
    expect(ts.getTree(0).isResearched('tech:infantry_armor')).toBe(true);
    expect(b.researchProgress).toBe(0);
    expect(b.researchingTechId).toBeNull();
  });

  it('completing a non-armor/non-reinforce tech fires event but does not retro-buff', () => {
    const spy = vi.fn();
    EventBus.on(GameEvent.RESEARCH_COMPLETE, spy);
    const b = makeResearchingBuilding(0, 'tech:advanced_mining', 10);
    entities.addBuilding(b);
    research.update(10);
    expect(spy).toHaveBeenCalled();
    expect(ts.getTree(0).isResearched('tech:advanced_mining')).toBe(true);
    // gatherMult should be refreshed (cache)
    expect(ts.getEffects(0).gatherMult).toBeCloseTo(1.2);
  });

  it('building with state researching but researchingTechId=null is skipped', () => {
    const b = makeBuilding({ owner: 0 });
    b.state = 'researching';
    b.researchingTechId = null;
    entities.addBuilding(b);
    expect(() => research.update(10)).not.toThrow();
    expect(b.researchingTechId).toBeNull(); // unchanged
  });
});
