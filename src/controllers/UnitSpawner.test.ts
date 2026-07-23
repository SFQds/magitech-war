/**
 * UnitSpawner 单元测试 - 单位生成 / 起始单位 / 英雄生成
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnitSpawner } from './UnitSpawner';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Hero } from '../entities/Hero';
import { grassMap, makeWorld } from '../__fixtures__/factories';

function setupSpawner() {
  const map = grassMap(32, 32);
  const addedUnits: Unit[] = [];
  const addedBuildings: Building[] = [];
  const spawner = new UnitSpawner(
    map,
    (u) => { addedUnits.push(u); },
    (b) => { addedBuildings.push(b); },
    (owner: number) => owner === 0 ? 'arcane_empire' : 'hammer_federation',
  );
  return { map, addedUnits, addedBuildings, spawner };
}

describe('UnitSpawner.spawnUnit normal units', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('calls addUnit with correct stats from UNIT_DEFS for unit_worker', () => {
    const { spawner, addedUnits } = setupSpawner();
    spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 0);
    expect(addedUnits).toHaveLength(1);
    const u = addedUnits[0];
    expect(u.spriteKey).toBe('unit_worker');
    expect(u.owner).toBe(0);
    expect(u.tileX).toBe(5);
    expect(u.supplyCost).toBe(1); // not freeSpawn
  });

  it('with freeSpawn=true sets supplyCost=0', () => {
    const { spawner, addedUnits } = setupSpawner();
    spawner.spawnUnit('unit_rifleman', { x: 5, y: 5 }, 0, true);
    expect(addedUnits[0].supplyCost).toBe(0);
  });

  it('relocates to nearby passable tile when target tile blocked', () => {
    const { map, spawner, addedUnits } = setupSpawner();
    map.setTile(5, 5, 'water');
    spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 0);
    // should NOT be at (5,5) since water
    expect(addedUnits[0].tileX === 5 && addedUnits[0].tileY === 5).toBe(false);
  });

  it('marks the spawn tile occupied immediately (P1-R4)', () => {
    const { map, spawner } = setupSpawner();
    spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 0);
    expect(map.isOccupied(5, 5)).toBe(true);
  });

  it('emits UNIT_CREATED with unitId, playerIndex, defId, position', () => {
    const { spawner } = setupSpawner();
    const spy = vi.fn();
    EventBus.on(GameEvent.UNIT_CREATED, spy);
    spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 0);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      playerIndex: 0, defId: 'unit_worker', position: { x: 5, y: 5 },
    }));
  });

  it('for unknown unitDefId (non-hero) returns {pos} without calling addUnit', () => {
    const { spawner, addedUnits } = setupSpawner();
    const result = spawner.spawnUnit('unit_nonexistent', { x: 5, y: 5 }, 0);
    expect(addedUnits).toHaveLength(0);
    expect(result.pos).toEqual({ x: 5, y: 5 });
    expect(result.unitId).toBeUndefined();
  });

  it('for unit_arcane_guard sets shieldHp=200 and maxShieldHp=200', () => {
    const { spawner, addedUnits } = setupSpawner();
    spawner.spawnUnit('unit_arcane_guard', { x: 5, y: 5 }, 0);
    expect(addedUnits[0].shieldHp).toBe(200);
    expect(addedUnits[0].maxShieldHp).toBe(200);
  });

  it('returns SpawnResult with unitId for normal units', () => {
    const { spawner } = setupSpawner();
    const result = spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 0);
    expect(result.unitId).toBeDefined();
  });

  it('does not enforce tech requirements (techReq only checked in CommandExecutor)', () => {
    // battle_mage has techReq but spawnUnit should still succeed
    const { spawner, addedUnits } = setupSpawner();
    spawner.spawnUnit('unit_battle_mage', { x: 5, y: 5 }, 0);
    expect(addedUnits).toHaveLength(1);
  });
});

describe('UnitSpawner.spawnUnit heroes', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('for hero_ prefix delegates to HeroSystem.trainHero and emits UNIT_CREATED', () => {
    const { spawner, addedUnits } = setupSpawner();
    const spy = vi.fn();
    EventBus.on(GameEvent.UNIT_CREATED, spy);
    spawner.spawnUnit('hero_isabelle', { x: 5, y: 5 }, 0);
    expect(addedUnits).toHaveLength(1);
    expect(addedUnits[0]).toBeInstanceOf(Hero);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      defId: 'hero_isabelle', playerIndex: 0,
    }));
  });

  it('returns SpawnResult WITHOUT unitId for heroes', () => {
    const { spawner } = setupSpawner();
    const result = spawner.spawnUnit('hero_isabelle', { x: 5, y: 5 }, 0);
    expect(result.unitId).toBeUndefined();
  });
});

describe('UnitSpawner.placeStartingUnits', () => {
  it('creates a CC + starting units for each faction', () => {
    const { spawner, addedBuildings, addedUnits } = setupSpawner();
    spawner.placeStartingUnits({ x: 6, y: 6 }, { x: 56, y: 56 }, 'arcane_empire', 'hammer_federation');
    expect(addedBuildings).toHaveLength(2); // 2 CCs
    expect(addedBuildings[0].spriteKey).toBe('bld_cc_empire');
    expect(addedBuildings[1].spriteKey).toBe('bld_cc_federation');
    // starting units: check some workers exist
    expect(addedUnits.length).toBeGreaterThan(4);
    expect(addedUnits.some(u => u.spriteKey === 'unit_worker')).toBe(true);
  });

  it('starting CC is completed (state=idle)', () => {
    const { spawner, addedBuildings } = setupSpawner();
    spawner.placeStartingUnits({ x: 6, y: 6 }, { x: 56, y: 56 }, 'arcane_empire', 'hammer_federation');
    expect(addedBuildings[0].state).toBe('idle');
    expect(addedBuildings[0].buildProgress).toBe(1);
  });

  it('starting units have supplyCost=0 (no refund on death)', () => {
    const { spawner, addedUnits } = setupSpawner();
    spawner.placeStartingUnits({ x: 6, y: 6 }, { x: 56, y: 56 }, 'arcane_empire', 'hammer_federation');
    for (const u of addedUnits) {
      expect(u.supplyCost).toBe(0);
    }
  });

  it('with unknown faction does not create CC for that side', () => {
    const { spawner, addedBuildings } = setupSpawner();
    spawner.placeStartingUnits({ x: 6, y: 6 }, { x: 56, y: 56 }, 'nonexistent', 'arcane_empire');
    // only player 1's CC created (arcane_empire), player 0 skipped
    expect(addedBuildings).toHaveLength(1);
    expect(addedBuildings[0].owner).toBe(1);
  });
});

describe('UnitSpawner.getFaction callback', () => {
  it('is consulted for each spawn (owner->faction mapping)', () => {
    const map = grassMap(32, 32);
    const addedUnits: Unit[] = [];
    const spawner = new UnitSpawner(map, (u) => addedUnits.push(u), () => {}, (o: number) => o === 0 ? 'arcane_empire' : 'hammer_federation');
    spawner.spawnUnit('unit_worker', { x: 5, y: 5 }, 1);
    expect(addedUnits[0].faction).toBe('hammer_federation');
  });
});
