/**
 * DeathCleanupSystem 单元测试 — 死亡清理/退款/cargo 释放
 *
 * L2 集成：用回调 stub 验证单位/建筑/矿点清理逻辑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeathCleanupSystem } from './DeathCleanupSystem';
import { makeWorld, makeUnit, makeBuilding, makeResourceField } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

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
