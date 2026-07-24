/**
 * DeathCleanupSystem 单元测试 — 死亡清理/退款/cargo 释放
 *
 * L2 集成：用回调 stub 验证单位/建筑/矿点清理逻辑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeathCleanupSystem } from './DeathCleanupSystem';
import { makeWorld, makeUnit, makeBuilding, makeResourceField, makeHero, makeDeadUnit } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { HERO_DEFS } from '../config/heroData';

let world: ReturnType<typeof makeWorld>;
let entities: EntityRegistry;
let cleanup: DeathCleanupSystem;
let removedUnits: string[];
let removedBuildings: string[];
let removedFields: string[];
let xpRewarded: number[];
let selHighlightCalls: number;

beforeEach(() => {
  EventBus.clear();
  world = makeWorld(32, 32, true);
  entities = new EntityRegistry();
  removedUnits = [];
  removedBuildings = [];
  removedFields = [];
  xpRewarded = [];
  selHighlightCalls = 0;
  cleanup = new DeathCleanupSystem(world, entities, {
    removeUnitSprite: (id) => {},
    removeBuildingSprite: (id) => {},
    removeFieldSprite: (id) => { removedFields.push(id); },
    onUnitRemoved: (id) => { removedUnits.push(id); },
    onBuildingRemoved: (id) => { removedBuildings.push(id); },
    rewardBuildingXp: (owner) => { xpRewarded.push(owner); },
    updateSelectionHighlight: () => { selHighlightCalls++; },
    getSelection: () => [],
    setSelection: () => {},
    clearSelection: () => {},
    consumeIfSelectedBuilding: () => false,
  });
});

afterEach(() => EventBus.clear());

describe('DeathCleanupSystem — 单位清理', () => {
  it('死亡单位退还 supply', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker' });
    u.supplyCost = 1;
    world.players[0].resources.supply = 5;
    entities.addUnit(u);
    u.takeDamage(999, 'physical'); // 杀死
    cleanup.cleanup();
    expect(world.players[0].resources.supply).toBe(4); // 5 - 1
  });

  it('死亡工人释放采集位 currentGatherers--', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 0, spriteKey: 'unit_worker' });
    const field = makeResourceField(5, 0, 1000);
    entities.addUnit(u);
    entities.addField(field);
    u.targetResourceId = field.id;
    field.currentGatherers = 2;
    u.takeDamage(999, 'physical');
    cleanup.cleanup();
    expect(field.currentGatherers).toBe(1);
  });

  it('存活单位不被清理', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5 });
    entities.addUnit(u);
    cleanup.cleanup();
    expect(entities.units.length).toBe(1);
  });
});

describe('DeathCleanupSystem — 建筑清理', () => {
  it('建筑摧毁发 BUILDING_DESTROYED 事件', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    const spy = vi.fn();
    EventBus.on(GameEvent.BUILDING_DESTROYED, spy);
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ buildingId: b.id, playerIndex: 0 }));
  });

  it('非 constructing 建筑摧毁奖励英雄 XP', () => {
    const b = makeBuilding({ owner: 1, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    expect(xpRewarded).toContain(1); // destroyedOwner=1
  });

  it('constructing 建筑摧毁不奖励 XP', () => {
    const b = makeBuilding({ owner: 1, tileX: 5, tileY: 5, completed: false });
    entities.addBuilding(b);
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    expect(xpRewarded).not.toContain(1);
  });

  it('生产队列按折扣价退款', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.productionQueue.push({ unitDefId: 'unit_battle_mage', timeRemaining: 10, totalTime: 15 });
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    // battle_mage favoredBy arcane_empire → 300*0.8=240 退款
    expect(world.players[0].resources.crystal).toBe(before + 240);
  });

  it('研究进度按剩余比例退款', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.researchingTechId = 'tech:advanced_mining'; // cost 200
    b.researchProgress = 0.5; // 剩余 50% → 退款 100
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.crystal).toBe(before + 100);
  });

  it('建造中建筑摧毁释放工人', () => {
    const worker = makeUnit({ owner: 0, tileX: 4, tileY: 4, spriteKey: 'unit_worker' });
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addUnit(worker);
    entities.addBuilding(b);
    b.builderId = worker.id;
    worker.state = 'building';
    worker.aiLockedAction = 'building';
    b.takeDamage(9999, 'physical');
    cleanup.cleanup();
    expect(worker.state).toBe('idle');
    expect(worker.aiLockedAction).toBeNull();
  });
});

describe('DeathCleanupSystem — 矿点清理', () => {
  it('枯竭矿点注销资源格 + 移除 sprite', () => {
    const field = makeResourceField(5, 0, 1); // 只剩 1
    entities.addField(field);
    world.map.registerResourceTile(5, 0);
    field.gather(1); // 采完 → isDepleted
    expect(field.isDepleted).toBe(true);
    cleanup.cleanup();
    expect(world.map.isResourceTile(5, 0)).toBe(false);
    expect(removedFields).toContain(field.id);
    expect(entities.fields.length).toBe(0);
  });

  it('活跃矿点不被清理', () => {
    const field = makeResourceField(5, 0, 1000);
    entities.addField(field);
    cleanup.cleanup();
    expect(entities.fields.length).toBe(1);
  });
});

// ===================== 第二轮补洞：P0 关键缺口 =====================

/**
 * 构造一个带可变选中集的 cleanup（用于测试选中清理分支）。
 * 返回 cleanup 与 helper 对象（getSelection 在 cleanup 调用后读最新值）。
 */
function makeCleanupWithSelection(
  w: ReturnType<typeof makeWorld>,
  ents: EntityRegistry,
  initialSelection: string[] = [],
  selectedBuilding: string | null = null,
): { cleanup: DeathCleanupSystem; getSelection: () => string[]; getSelectedBuilding: () => string | null; removedUnits: string[]; removedBuildings: string[]; selHighlightCalls: () => number } {
  let sel = [...initialSelection];
  let selBld = selectedBuilding;
  const removedUnits: string[] = [];
  const removedBuildings: string[] = [];
  let selHighlightCalls = 0;
  const cleanup = new DeathCleanupSystem(w, ents, {
    removeUnitSprite: () => {},
    removeBuildingSprite: () => {},
    removeFieldSprite: () => {},
    onUnitRemoved: (id) => { removedUnits.push(id); },
    onBuildingRemoved: (id) => { removedBuildings.push(id); },
    rewardBuildingXp: () => {},
    updateSelectionHighlight: () => { selHighlightCalls++; },
    getSelection: () => sel,
    setSelection: (ids) => { sel = ids; },
    clearSelection: () => { sel = []; },
    consumeIfSelectedBuilding: (id) => {
      if (id === selBld) { selBld = null; return true; }
      return false;
    },
  });
  return { cleanup, getSelection: () => sel, getSelectedBuilding: () => selBld, removedUnits, removedBuildings, selHighlightCalls: () => selHighlightCalls };
}

describe('DeathCleanupSystem — Hero 复活保留', () => {
  it('reviveTimer>0 的死亡英雄不被清理（复活中保留）', () => {
    const h = makeHero({ owner: 0 });
    h.takeDamage(99999, 'physical'); // 死亡 → reviveTimer=reviveCooldown
    expect(h.reviveTimer).toBeGreaterThan(0);
    entities.addUnit(h);
    cleanup.cleanup();
    expect(entities.units.length).toBe(1);
    expect(removedUnits).not.toContain(h.id);
  });

  it('reviveTimer=-1（就绪待复活）的英雄也不被清理（!== 0 钉住当前行为）', () => {
    const h = makeHero({ owner: 0 });
    h.takeDamage(99999, 'physical');
    h.reviveTimer = -1; // 手动设为就绪
    entities.addUnit(h);
    cleanup.cleanup();
    // 源码 isHeroReviving = reviveTimer !== 0 → -1 !== 0 = true → 跳过
    expect(entities.units.length).toBe(1);
    expect(removedUnits).not.toContain(h.id);
  });

  it('普通死亡单位 reviveTimer=undefined 不会被误跳过（仅 Hero 实例检查）', () => {
    const u = makeDeadUnit({ owner: 0 });
    entities.addUnit(u);
    u.supplyCost = 1;
    world.players[0].resources.supply = 5;
    cleanup.cleanup();
    expect(removedUnits).toContain(u.id);
    expect(world.players[0].resources.supply).toBe(4);
  });
});

describe('DeathCleanupSystem — isCargo 跳过', () => {
  it('isCargo=true 的死亡单位不被清理', () => {
    const u = makeDeadUnit({ owner: 0 });
    u.isCargo = true;
    entities.addUnit(u);
    cleanup.cleanup();
    expect(entities.units.length).toBe(1);
    expect(removedUnits).not.toContain(u.id);
  });
});

describe('DeathCleanupSystem — 运输车 cargo 释放', () => {
  it('运输车被摧毁时释放乘客：清除 isCargo、退还 supply、移除乘客', () => {
    const transport = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_transport' });
    const passenger = makeUnit({ owner: 0, tileX: 5, tileY: 5 });
    passenger.supplyCost = 2;
    passenger.isCargo = true;
    transport.cargo = [passenger];
    entities.addUnit(transport);
    entities.addUnit(passenger);
    world.players[0].resources.supply = 10;
    transport.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(passenger.isCargo).toBe(false);
    expect(world.players[0].resources.supply).toBe(7); // 10 - 2(passenger) - 1(transport自身)
    expect(entities.hasUnit(passenger.id)).toBe(false); // 乘客从注册表移除
    expect(transport.cargo).toEqual([]);
  });

  it('cargo 退还 supply 钳制到 0（不减为负）', () => {
    const transport = makeUnit({ owner: 0, spriteKey: 'unit_transport' });
    const passenger = makeUnit({ owner: 0 });
    passenger.supplyCost = 100;
    passenger.isCargo = true;
    transport.cargo = [passenger];
    entities.addUnit(transport);
    entities.addUnit(passenger);
    world.players[0].resources.supply = 5;
    transport.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.supply).toBe(0);
  });

  it('owner 越界的运输车仍清除 isCargo 但不退还 supply', () => {
    const transport = makeUnit({ owner: 99, spriteKey: 'unit_transport' });
    const passenger = makeUnit({ owner: 99 });
    passenger.isCargo = true;
    transport.cargo = [passenger];
    entities.addUnit(transport);
    entities.addUnit(passenger);
    transport.takeDamage(99999, 'physical');
    expect(() => cleanup.cleanup()).not.toThrow();
    expect(passenger.isCargo).toBe(false);
  });

  it('空 cargo 数组的运输车不触发乘客清理', () => {
    const transport = makeUnit({ owner: 0, spriteKey: 'unit_transport' });
    transport.cargo = [];
    entities.addUnit(transport);
    transport.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(removedUnits).toContain(transport.id);
    expect(transport.cargo).toEqual([]);
  });

  it('cargo 中的乘客在选中集中时被清空选中', () => {
    const transport = makeUnit({ owner: 0, spriteKey: 'unit_transport' });
    const passenger = makeUnit({ owner: 0 });
    passenger.isCargo = true;
    transport.cargo = [passenger];
    entities.addUnit(transport);
    entities.addUnit(passenger);
    const helper = makeCleanupWithSelection(world, entities, [passenger.id]);
    transport.takeDamage(99999, 'physical');
    helper.cleanup.cleanup();
    expect(helper.selHighlightCalls()).toBeGreaterThan(0);
  });
});

describe('DeathCleanupSystem — 选中清理 + SELECTION_CHANGED', () => {
  it('阵亡单位从选中集移除，保留其余选中，emit SELECTION_CHANGED', () => {
    const u1 = makeUnit({ owner: 0, tileX: 4, tileY: 4 });
    const u2 = makeUnit({ owner: 0, tileX: 6, tileY: 6 });
    entities.addUnit(u1);
    entities.addUnit(u2);
    const helper = makeCleanupWithSelection(world, entities, [u1.id, u2.id]);
    const spy = vi.fn();
    EventBus.on(GameEvent.SELECTION_CHANGED, spy);
    u1.takeDamage(99999, 'physical');
    helper.cleanup.cleanup();
    expect(helper.getSelection()).toEqual([u2.id]);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ unitIds: [u2.id] }));
    expect(helper.selHighlightCalls()).toBeGreaterThan(0);
  });

  it('不在选中集的阵亡单位不 emit SELECTION_CHANGED', () => {
    const u = makeUnit({ owner: 0 });
    entities.addUnit(u);
    const helper = makeCleanupWithSelection(world, entities, []);
    const spy = vi.fn();
    EventBus.on(GameEvent.SELECTION_CHANGED, spy);
    u.takeDamage(99999, 'physical');
    helper.cleanup.cleanup();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DeathCleanupSystem — 退款边界', () => {
  it('supply 退还钳制到 0（不减为负）', () => {
    const u = makeUnit({ owner: 0 });
    u.supplyCost = 5;
    world.players[0].resources.supply = 2;
    entities.addUnit(u);
    u.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.supply).toBe(0);
  });

  it('supplyCost 缺省退还 1', () => {
    const u = makeUnit({ owner: 0 });
    delete (u as any).supplyCost;
    world.players[0].resources.supply = 5;
    entities.addUnit(u);
    u.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.supply).toBe(4);
  });

  it('owner 越界的单位不退还 supply（无对应 player）', () => {
    const u = makeUnit({ owner: 99 });
    u.supplyCost = 5;
    entities.addUnit(u);
    u.takeDamage(99999, 'physical');
    expect(() => cleanup.cleanup()).not.toThrow();
  });

  it('targetResourceId 指向已移除的 field 仍清除 targetResourceId', () => {
    const u = makeUnit({ owner: 0 });
    u.targetResourceId = 'ghost_field';
    entities.addUnit(u);
    u.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(u.targetResourceId).toBeNull();
  });

  it('currentGatherers=0 时不递减成负数', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 0, spriteKey: 'unit_worker' });
    const field = makeResourceField(5, 0, 1000);
    field.currentGatherers = 0;
    entities.addUnit(u);
    entities.addField(field);
    u.targetResourceId = field.id;
    u.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(field.currentGatherers).toBe(0);
  });

  it('英雄 defId 队列退款走 HERO_DEFS cost', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.productionQueue.push({ unitDefId: 'hero_isabelle', timeRemaining: 10, totalTime: 10 });
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.crystal).toBe(before + HERO_DEFS['hero_isabelle'].cost.crystal);
  });

  it('未知 defId 队列不退款但清空队列', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.productionQueue.push({ unitDefId: 'ghost_unit', timeRemaining: 10, totalTime: 10 });
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.crystal).toBe(before);
    expect(b.productionQueue.length).toBe(0);
  });

  it('研究进度 >1 钳制到 1 → 退款 0', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.researchingTechId = 'tech:advanced_mining';
    b.researchProgress = 1.5;
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.crystal).toBe(before);
  });

  it('研究进度 <0 钳制到 0 → 全额退款', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.researchingTechId = 'tech:advanced_mining';
    b.researchProgress = -0.5;
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(world.players[0].resources.crystal).toBe(before + 200);
  });

  it('未知 researchingTechId 清除 id 不退款', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.researchingTechId = 'tech:ghost';
    world.players[0].resources.crystal = 1000;
    const before = world.players[0].resources.crystal;
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(b.researchingTechId).toBeNull();
    expect(world.players[0].resources.crystal).toBe(before);
  });
});

describe('DeathCleanupSystem — 事件与建筑选中', () => {
  it('constructing 建筑摧毁发 reason=construction_failed', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5, completed: false });
    entities.addBuilding(b);
    const spy = vi.fn();
    EventBus.on(GameEvent.BUILDING_DESTROYED, spy);
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'construction_failed' }));
  });

  it('已完工建筑摧毁发 reason=destroyed', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    const spy = vi.fn();
    EventBus.on(GameEvent.BUILDING_DESTROYED, spy);
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'destroyed' }));
  });

  it('建筑摧毁发 RESOURCE_CHANGED 事件', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    const spy = vi.fn();
    EventBus.on(GameEvent.RESOURCE_CHANGED, spy);
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ playerIndex: 0, resource: 'crystal', delta: 0 }));
  });

  it('选中建筑被摧毁时 consumeIfSelectedBuilding 返回 true 并刷新高亮', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    const helper = makeCleanupWithSelection(world, entities, [], b.id);
    b.takeDamage(99999, 'physical');
    helper.cleanup.cleanup();
    expect(helper.getSelectedBuilding()).toBeNull(); // 被消费了
    expect(helper.selHighlightCalls()).toBeGreaterThan(0);
  });

  it('builder 已死亡的建造中建筑不重置 builder 状态', () => {
    const worker = makeUnit({ owner: 0, tileX: 4, tileY: 4, spriteKey: 'unit_worker' });
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addUnit(worker);
    entities.addBuilding(b);
    b.builderId = worker.id;
    worker.state = 'building';
    worker.takeDamage(99999, 'physical'); // builder 先死
    b.takeDamage(99999, 'physical');
    cleanup.cleanup();
    // builder 已死 → isAlive=false → 不重置
    expect(worker.state).toBe('building');
  });

  it('builderId 指向不存在的单位不抛异常', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    b.builderId = 'ghost_unit';
    b.takeDamage(99999, 'physical');
    expect(() => cleanup.cleanup()).not.toThrow();
  });
});

describe('DeathCleanupSystem — 矿点边界', () => {
  it('isActive=false 但未枯竭的矿点仍被清理', () => {
    const field = makeResourceField(5, 0, 1000);
    field.isActive = false;
    entities.addField(field);
    world.map.registerResourceTile(5, 0);
    cleanup.cleanup();
    expect(removedFields).toContain(field.id);
    expect(entities.fields.length).toBe(0);
  });

  it('存活建筑不被清理', () => {
    const b = makeBuilding({ owner: 0, tileX: 5, tileY: 5 });
    entities.addBuilding(b);
    cleanup.cleanup();
    expect(entities.buildings.length).toBe(1);
    expect(removedBuildings).not.toContain(b.id);
  });
});
