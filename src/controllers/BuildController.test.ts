/**
 * BuildController 单元测试 - 建造模式状态机 + 建造推进 + 退款
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BuildController } from './BuildController';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { makeStubScene } from '../__fixtures__/phaserStub';
import { makeWorld, makeBuilding, makeUnit, grassMap } from '../__fixtures__/factories';

describe('BuildController tryEnter / isActive', () => {
  let scene: ReturnType<typeof makeStubScene>;
  let world: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    scene = makeStubScene();
    world = makeWorld(16, 16, true);
  });

  it('isActive is false initially, true after tryEnter, false after cancel', () => {
    const bc = new BuildController(scene);
    expect(bc.isActive).toBe(false);
    const builder = makeUnit({ owner: 0, hp: 80 });
    expect(bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder)).toBe(true);
    expect(bc.isActive).toBe(true);
    bc.cancel();
    expect(bc.isActive).toBe(false);
  });

  it('tryEnter returns false for invalid building def', () => {
    const bc = new BuildController(scene);
    expect(bc.tryEnter('bld_nonexistent', 'b1', 'arcane_empire', world, () => undefined)).toBe(false);
    expect(bc.isActive).toBe(false);
  });

  it('tryEnter returns false when player cannot afford', () => {
    const bc = new BuildController(scene);
    world.getPlayer(0)!.resources.crystal = 0;
    expect(bc.tryEnter('bld_barracks', 'b1', 'arcane_empire', world, () => undefined)).toBe(false);
  });

  it('tryEnter returns false when builder is already building', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    builder.state = 'building';
    expect(bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder)).toBe(false);
  });

  it('tryEnter returns true and sets mode when affordable and builder idle', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    expect(bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder)).toBe(true);
  });
});

describe('BuildController.confirm', () => {
  let scene: ReturnType<typeof makeStubScene>;
  let world: ReturnType<typeof makeWorld>;
  let map: ReturnType<typeof grassMap>;
  beforeEach(() => { scene = makeStubScene(); world = makeWorld(16, 16, true); map = grassMap(16, 16); });

  it('returns false when no active build mode', () => {
    const bc = new BuildController(scene);
    expect(bc.confirm(5, 5, 'arcane_empire', world, map, [], () => {}, () => undefined)).toBe(false);
  });

  it('returns false for out-of-bounds tile', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder);
    expect(bc.confirm(-1, -1, 'arcane_empire', world, map, [], () => {}, () => undefined)).toBe(false);
  });

  it('returns false when tile is a resource tile', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder);
    map.registerResourceTile(5, 5);
    expect(bc.confirm(5, 5, 'arcane_empire', world, map, [], () => {}, () => undefined)).toBe(false);
  });

  it('returns false when another alive building occupies the tile', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder);
    const existing = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    expect(bc.confirm(5, 5, 'arcane_empire', world, map, [existing], () => {}, () => undefined)).toBe(false);
  });

  it('returns false when affordability check fails at confirm time', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder);
    world.getPlayer(0)!.resources.crystal = 0; // spent after tryEnter
    expect(bc.confirm(5, 5, 'arcane_empire', world, map, [], () => {}, () => undefined)).toBe(false);
  });

  it('success: spends resources, creates building, sets builder.aiLockedAction, cancels mode', () => {
    const bc = new BuildController(scene);
    const builder = makeUnit({ owner: 0, hp: 80 });
    bc.tryEnter('bld_barracks', builder.id, 'arcane_empire', world, () => builder);
    const crystalBefore = world.getPlayer(0)!.resources.crystal;
    const addBld = vi.fn();
    const result = bc.confirm(10, 10, 'arcane_empire', world, map, [], addBld, () => builder);
    expect(result).toBe(true);
    expect(world.getPlayer(0)!.resources.crystal).toBeLessThan(crystalBefore);
    expect(addBld).toHaveBeenCalledOnce();
    expect(builder.aiLockedAction).toBe('building');
    expect(bc.isActive).toBe(false);
  });
});

describe('BuildController.updateConstruction', () => {
  let scene: ReturnType<typeof makeStubScene>;
  beforeEach(() => {
    EventBus.clear();
    scene = makeStubScene();
  });
  afterEach(() => EventBus.clear());

  it('completes building when buildProgress>=1, emits BUILDING_COMPLETE', () => {
    const bc = new BuildController(scene);
    const b = makeBuilding({ completed: false });
    b.state = 'constructing';
    b.buildProgress = 0.99;
    // mock getBuildingCost by setting a spriteKey with known cost
    const builder = makeUnit({ owner: 0, hp: 80 });
    builder.state = 'building';
    builder.aiLockedAction = 'building';
    b.builderId = builder.id;
    const spy = vi.fn();
    EventBus.on(GameEvent.BUILDING_COMPLETE, spy);
    // barracks cost.time from BUILDING_DEFS
    bc.updateConstruction(10, [b], (id) => id === builder.id ? builder : undefined);
    expect(b.state).toBe('idle');
    expect(b.buildProgress).toBeGreaterThanOrEqual(1);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fails construction when builder dies -> refund + hp=0 + BUILDING_DESTROYED', () => {
    const bc = new BuildController(scene);
    const b = makeBuilding({ completed: false });
    b.state = 'constructing';
    b.builderId = 'dead_builder';
    const refundFn = vi.fn();
    const spy = vi.fn();
    EventBus.on(GameEvent.BUILDING_DESTROYED, spy);
    bc.updateConstruction(1, [b], () => undefined, refundFn);
    expect(b.hp).toBe(0);
    expect(b.isActive).toBe(false);
    expect(refundFn).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ reason: '建造者已阵亡！' }));
  });

  it('skips non-constructing and dead buildings', () => {
    const bc = new BuildController(scene);
    const idle = makeBuilding({ completed: true }); // idle
    const dead = makeBuilding({ completed: false });
    dead.hp = 0; dead.isActive = false;
    dead.state = 'constructing';
    bc.updateConstruction(1, [idle, dead], () => undefined);
    // no throw, idle unchanged
    expect(idle.state).toBe('idle');
  });
});

describe('BuildController.cancelBuilderConstructions', () => {
  let scene: ReturnType<typeof makeStubScene>;
  beforeEach(() => { EventBus.clear(); scene = makeStubScene(); });
  afterEach(() => EventBus.clear());

  it('fails all in-progress buildings for a builder and refunds each', () => {
    const bc = new BuildController(scene);
    const b1 = makeBuilding({ completed: false });
    b1.state = 'constructing'; b1.builderId = 'b1';
    const b2 = makeBuilding({ completed: false });
    b2.state = 'constructing'; b2.builderId = 'b1';
    const b3 = makeBuilding({ completed: false });
    b3.state = 'constructing'; b3.builderId = 'b2';
    const refundFn = vi.fn();
    bc.cancelBuilderConstructions('b1', [b1, b2, b3], refundFn);
    expect(b1.hp).toBe(0); expect(b1.isActive).toBe(false);
    expect(b2.hp).toBe(0); expect(b2.isActive).toBe(false);
    expect(b3.hp).toBeGreaterThan(0); // untouched
    expect(refundFn).toHaveBeenCalledTimes(2);
  });

  it('ignores completed/idle buildings', () => {
    const bc = new BuildController(scene);
    const idle = makeBuilding({ completed: true });
    idle.builderId = 'b1';
    const refundFn = vi.fn();
    bc.cancelBuilderConstructions('b1', [idle], refundFn);
    expect(refundFn).not.toHaveBeenCalled();
    expect(idle.hp).toBeGreaterThan(0);
  });
});
