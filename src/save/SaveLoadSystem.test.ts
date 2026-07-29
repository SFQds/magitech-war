/**
 * SaveLoadSystem 单元测试 — 序列化/反序列化/CRUD
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  serialize,
  deserialize,
  save,
  load,
  list,
  remove,
  hasSaves,
  loadLatest,
  deleteOldest,
} from '../save/SaveLoadSystem';
import { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { Unit } from '../entities/Unit';
import { Hero } from '../entities/Hero';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { SuperWeaponSystem } from '../systems/SuperWeaponSystem';
import { HERO_DEFS } from '../config/heroData';
import { makeUnit, makeBuilding, makeCommandCenter, makeResourceField, makeWorld } from '../__fixtures__/factories';
import { MemoryStorage, setStorageBackend } from '../save/storageAdapter';
import type { SaveMeta, SaveData } from '../save/SaveData';
import { SAVE_VERSION } from '../save/SaveData';
import { EventBus } from '../utils/EventBus';

function mockMeta(overrides?: Partial<SaveMeta>): SaveMeta {
  return {
    mapId: 'map_valley',
    mapWidth: 16,
    mapHeight: 16,
    playerFaction: 'arcane_empire',
    aiFaction: 'hammer_federation',
    aiDifficulty: 'normal',
    playerGuilds: ['mages_guild', 'alchemists_society'],
    aiGuilds: ['mechanists_guild', 'alchemists_society'],
    ...overrides,
  };
}

function makeWorldWithPlayers(w = 16, h = 16): GameWorld {
  const world = makeWorld(w, h);
  world.addPlayer('arcane_empire', ['mages_guild', 'alchemists_society'], false);
  world.addPlayer('hammer_federation', ['mechanists_guild', 'alchemists_society'], true);
  return world;
}

describe('SaveLoadSystem - 序列化/反序列化', () => {
  beforeEach(() => {
    SuperWeaponSystem.reset();
    EventBus.clear();
  });

  afterEach(() => {
    SuperWeaponSystem.reset();
  });

  it('serialize 空世界返回有效 SaveData', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();
    const data = serialize({
      world, entities, gameTimer: 0, graceTimers: [0, 0],
      meta: mockMeta(),
    });

    expect(data.version).toBe(SAVE_VERSION);
    expect(data.meta.mapId).toBe('map_valley');
    expect(data.players).toHaveLength(2);
    expect(data.units).toHaveLength(0);
    expect(data.buildings).toHaveLength(0);
    expect(data.fields).toHaveLength(0);
    expect(data.techTrees).toHaveLength(2);
  });

  it('serialize + deserialize 往返一致性（玩家+资源+地形）', () => {
    const world = makeWorldWithPlayers(16, 16);
    world.getPlayer(0)!.resources.crystal = 2500;
    world.getPlayer(1)!.resources.crystal = 3000;
    // 设置一些地形
    world.map.setTile(5, 5, 'mountain');
    world.map.setTile(6, 6, 'water');

    const entities = new EntityRegistry();

    const data = serialize({
      world, entities, gameTimer: 42.5, graceTimers: [10, 5],
      meta: mockMeta(),
    });

    const result = deserialize(data);

    expect(result.gameTimer).toBe(42.5);
    expect(result.graceTimers).toEqual([10, 5]);
    expect(result.world.players).toHaveLength(2);
    expect(result.world.getPlayer(0)!.resources.crystal).toBe(2500);
    expect(result.world.getPlayer(1)!.resources.crystal).toBe(3000);
    // 地形恢复
    expect(result.world.map.getTile(5, 5)).toBe('mountain');
    expect(result.world.map.getTile(6, 6)).toBe('water');
    expect(result.world.map.getTile(0, 0)).toBe('grass'); // 默认草地
  });

  it('序列化单位往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const worker = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker', hp: 80 });
    worker.state = 'gathering';
    worker.targetResourceId = 'field_x';
    worker.alchemyBuffType = 'strength';
    worker.alchemyBuffValue = 0.3;
    worker.holdPosition = true;
    entities.addUnit(worker);

    const rifleman = makeUnit({ owner: 1, tileX: 10, tileY: 10, spriteKey: 'unit_rifleman', hp: 120 });
    entities.addUnit(rifleman);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    expect(result.entities.units).toHaveLength(2);
    const u0 = result.entities.getUnit(worker.id)!;
    expect(u0).toBeDefined();
    expect(u0.spriteKey).toBe('unit_worker');
    expect(u0.state).toBe('gathering');
    expect(u0.targetResourceId).toBe('field_x');
    expect(u0.alchemyBuffType).toBe('strength');
    expect(u0.alchemyBuffValue).toBe(0.3);
    expect(u0.holdPosition).toBe(true);
    expect(u0.hp).toBe(80);
    expect(u0.owner).toBe(0);

    const u1 = result.entities.getUnit(rifleman.id)!;
    expect(u1.owner).toBe(1);
    expect(u1.spriteKey).toBe('unit_rifleman');
  });

  it('序列化英雄往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const hero = new Hero(0, 'arcane_empire', 5, 5, HERO_DEFS['hero_isabelle'], 'hero_isabelle');
    hero.gainXp(200); // Lv up
    hero.skillCooldowns = [3, 0, 0];
    hero.reviveTimer = 15;
    entities.addUnit(hero);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    expect(result.entities.units).toHaveLength(1);
    const h = result.entities.getUnit(hero.id) as Hero;
    expect(h).toBeInstanceOf(Hero);
    expect(h.heroName).toBe('伊莎贝尔');
    expect(h.level).toBe(hero.level);
    expect(h.xp).toBe(hero.xp);
    expect(h.skillCooldowns).toEqual([3, 0, 0]);
    expect(h.reviveTimer).toBe(15);
  });

  it('序列化建筑往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const cc = makeCommandCenter(0, 6, 6);
    cc.state = 'researching';
    cc.researchingTechId = 'tech:infantry_armor';
    cc.researchProgress = 0.5;
    cc.researchTotalTime = 10;
    cc.productionQueue = [{ unitDefId: 'unit_rifleman', timeRemaining: 3, totalTime: 8 }];
    entities.addBuilding(cc);

    const turret = makeBuilding({ owner: 1, tileX: 10, tileY: 10, buildingType: 'defense', spriteKey: 'bld_turret' });
    turret.attackDamage = 20;
    turret.attackRange = 5;
    entities.addBuilding(turret);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    expect(result.entities.buildings).toHaveLength(2);
    const b0 = result.entities.getBuilding(cc.id)!;
    expect(b0.state).toBe('researching');
    expect(b0.researchingTechId).toBe('tech:infantry_armor');
    expect(b0.researchProgress).toBe(0.5);
    expect(b0.productionQueue).toHaveLength(1);
    expect(b0.productionQueue[0].unitDefId).toBe('unit_rifleman');

    const b1 = result.entities.getBuilding(turret.id)!;
    expect(b1.attackDamage).toBe(20);
    expect(b1.attackRange).toBe(5);
  });

  it('序列化资源点往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const field = makeResourceField(3, 5, 3000, 3);
    field.currentGatherers = 2;
    entities.addField(field);

    const depleted = new ResourceField(10, 10, 'crystal', 0, 3);
    depleted.isActive = false;
    entities.addField(depleted);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    expect(result.entities.fields).toHaveLength(2);
    const f0 = result.entities.getField(field.id)!;
    expect(f0.amount).toBe(3000);
    expect(f0.currentGatherers).toBe(2);
    expect(f0.isActive).toBe(true);

    const f1 = result.entities.getField(depleted.id)!;
    expect(f1.amount).toBe(0);
    expect(f1.isActive).toBe(false);
  });

  it('序列化科技树往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const tt0 = world.techTrees.get(0)!;
    tt0.completeTech('tech:infantry_armor');
    tt0.completeTech('tech:advanced_mining');

    const tt1 = world.techTrees.get(1)!;
    tt1.completeTech('tech:mech_assembly');

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    const tree0 = result.world.techTrees.get(0)!;
    expect(tree0.isResearched('tech:infantry_armor')).toBe(true);
    expect(tree0.isResearched('tech:advanced_mining')).toBe(true);
    expect(tree0.isResearched('tech:mech_assembly')).toBe(false);

    const tree1 = result.world.techTrees.get(1)!;
    expect(tree1.isResearched('tech:mech_assembly')).toBe(true);
  });

  it('序列化超武状态往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    // 初始化超武
    SuperWeaponSystem.initPlayer(0, ['mages_guild']);
    SuperWeaponSystem.initPlayer(1, ['mechanists_guild']);

    // 模拟一次激活后的冷却
    const states = SuperWeaponSystem.getStates(0);
    if (states[0]) {
      states[0].cooldownTimer = 120;
      states[0].active = true;
      states[0].activeTimer = 5;
      states[0].targetX = 7;
      states[0].targetY = 7;
    }

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    SuperWeaponSystem.reset();
    const result = deserialize(data);

    const restored = SuperWeaponSystem.getStates(0);
    expect(restored).toHaveLength(1);
    expect(restored[0].weaponId).toBe('elemental_storm');
    expect(restored[0].cooldownTimer).toBe(120);
    expect(restored[0].active).toBe(true);
    expect(restored[0].activeTimer).toBe(5);
  });

  it('序列化法师公会充能计时器', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    world.arcaneChargeTimers.set(0, 12.5);
    world.arcaneChargeTimers.set(1, 8.3);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    expect(result.world.arcaneChargeTimers.get(0)).toBe(12.5);
    expect(result.world.arcaneChargeTimers.get(1)).toBe(8.3);
  });

  it('运输车 cargo 往返一致', () => {
    const world = makeWorldWithPlayers(16, 16);
    const entities = new EntityRegistry();

    const transport = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_transport', hp: 300 });
    const passenger = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman', hp: 120 });
    passenger.isCargo = true;
    passenger.isActive = false;
    transport.cargo.push(passenger);

    entities.addUnit(transport);
    entities.addUnit(passenger);

    const data = serialize({ world, entities, gameTimer: 0, graceTimers: [0, 0], meta: mockMeta() });
    const result = deserialize(data);

    const t = result.entities.getUnit(transport.id)!;
    expect(t.cargo).toHaveLength(1);
    expect(t.cargo[0].id).toBe(passenger.id);
  });

  it('版本不兼容时 deserialize 抛错', () => {
    const data: SaveData = {
      version: 99,
      createdAt: 0,
      meta: mockMeta(),
      gameTimer: 0,
      graceTimers: [0, 0],
      players: [],
      units: [],
      buildings: [],
      fields: [],
      techTrees: [],
      superWeapons: {},
      arcaneChargeTimers: [],
    };
    expect(() => deserialize(data)).toThrow('版本不兼容');
  });
});

// ============ localStorage CRUD 测试（用内存后端） ============

describe('SaveLoadSystem - localStorage CRUD', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    setStorageBackend(storage);
    SuperWeaponSystem.reset();
    EventBus.clear();
  });

  afterEach(() => {
    setStorageBackend(null);
    SuperWeaponSystem.reset();
  });

  function makeSaveData(mapId = 'map_valley', timer = 120): SaveData {
    return {
      version: SAVE_VERSION,
      createdAt: Date.now(),
      meta: mockMeta({ mapId }),
      gameTimer: timer,
      graceTimers: [0, 0],
      players: [],
      units: [],
      buildings: [],
      fields: [],
      techTrees: [],
      superWeapons: {},
      arcaneChargeTimers: [],
    };
  }

  it('save + load 往返一致', () => {
    const data = makeSaveData();
    const r1 = save('test1', data);
    expect(r1.ok).toBe(true);

    const r2 = load('test1');
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.data.meta.mapId).toBe('map_valley');
      expect(r2.data.gameTimer).toBe(120);
    }
  });

  it('load 不存在的存档返回错误', () => {
    const r = load('nonexistent');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('不存在');
  });

  it('list 返回所有存档', () => {
    save('a', makeSaveData('map_valley', 10));
    save('b', makeSaveData('map_river', 20));

    const slots = list();
    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.name).sort()).toEqual(['a', 'b']);
  });

  it('remove 删除存档', () => {
    save('x', makeSaveData());
    expect(list()).toHaveLength(1);

    const r = remove('x');
    expect(r.ok).toBe(true);
    expect(list()).toHaveLength(0);
  });

  it('hasSaves 正确反映存档存在', () => {
    expect(hasSaves()).toBe(false);
    save('s1', makeSaveData());
    expect(hasSaves()).toBe(true);
  });

  it('loadLatest 返回最新存档', () => {
    save('older', { ...makeSaveData(), createdAt: 1000 });
    save('newer', { ...makeSaveData(), createdAt: 2000, gameTimer: 999 });

    const r = loadLatest();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.slot.name).toBe('newer');
      expect(r.data.gameTimer).toBe(999);
    }
  });

  it('loadLatest 无存档返回错误', () => {
    const r = loadLatest();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('没有存档');
  });

  it('deleteOldest 超过上限删最旧', () => {
    for (let i = 0; i < 12; i++) {
      save(`slot_${i}`, { ...makeSaveData(), createdAt: i * 1000 });
    }
    deleteOldest(10);
    const slots = list();
    expect(slots).toHaveLength(10);
    // 最旧的 slot_0, slot_1 应被删
    expect(slots.find(s => s.name === 'slot_0')).toBeUndefined();
    expect(slots.find(s => s.name === 'slot_1')).toBeUndefined();
    expect(slots.find(s => s.name === 'slot_11')).toBeDefined();
  });

  it('覆盖同名存档', () => {
    save('same', { ...makeSaveData(), gameTimer: 10 });
    save('same', { ...makeSaveData(), gameTimer: 20 });

    const slots = list();
    expect(slots).toHaveLength(1);
    const r = load('same');
    if (r.ok) expect(r.data.gameTimer).toBe(20);
  });
});