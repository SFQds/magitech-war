/**
 * 测试夹具库 — 共享工厂函数
 *
 * 统一各 *.test.ts 里重复的实体/世界构造逻辑，作为唯一事实来源。
 * 用法：`import { makeWorld, makeUnit, ... } from '../__fixtures__/factories';`
 *
 * 原则：
 *  - 默认参数覆盖最常见场景（owner=0 玩家、全地图、满血）
 *  - 复杂装配（GameWorld+EntityRegistry+CommandExecutor 全链路）用 setupGame()
 *  - 不依赖 Phaser 运行时（Entity.sprite 为类型注解，编译时擦除）
 */

import { GameWorld } from '../core/GameWorld';
import { GameMap } from '../core/GameMap';
import { EntityRegistry } from '../core/EntityRegistry';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { TechSystem } from '../systems/TechSystem';
import { ResearchSystem } from '../systems/ResearchSystem';
import { UnitSpawner } from '../controllers/UnitSpawner';
import { CommandExecutor } from '../controllers/CommandExecutor';
import type { PlayerState } from '../types/entity';
import type { FogUnitView } from '../core/FogOfWar';
import type { FactionId, ArmorType, DamageType } from '../types/data';

/** 阵营映射：owner 0 = 奥术帝国，1 = 铁锤联邦（与现有测试约定一致） */
export function factionForOwner(owner: number): FactionId {
  return owner === 0 ? 'arcane_empire' : 'hammer_federation';
}

// ============ 世界与地图 ============

/** 造一张全草地 GameMap */
export function grassMap(w = 16, h = 16): GameMap {
  return new GameMap({ name: 'test', width: w, height: h, tileSize: 32 });
}

/** 造一个 GameWorld（默认 16×16 全草地），可选预先加 2 玩家 */
export function makeWorld(w = 16, h = 16, addPlayers = false): GameWorld {
  const world = new GameWorld(w, h);
  if (addPlayers) {
    world.addPlayer('arcane_empire', [], false);
    world.addPlayer('hammer_federation', [], true);
  }
  return world;
}

// ============ 单位 ============

export interface MakeUnitOptions {
  owner?: number;
  tileX?: number;
  tileY?: number;
  armorType?: ArmorType;
  hp?: number;
  attackDamage?: number;
  attackType?: DamageType;
  range?: number;
  sight?: number;
  spriteKey?: string;
  category?: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
  speed?: number;
}

/** 造一个单位（默认步枪兵，owner 0） */
export function makeUnit(opts: MakeUnitOptions = {}): Unit {
  const {
    owner = 0, tileX = 5, tileY = 5,
    armorType = 'light', hp = 100, attackDamage = 10, attackType = 'physical',
    range = 3, sight = 5, spriteKey = 'unit_rifleman', category = 'infantry', speed = 2,
  } = opts;
  return new Unit(
    owner, factionForOwner(owner), tileX, tileY,
    hp, armorType, category, speed, attackDamage, attackType, range, 1, sight, spriteKey,
  );
}

/** 造一个步兵（默认步枪兵） */
export function makeInfantry(owner = 0, tileX = 5, tileY = 5, hp = 100): Unit {
  return makeUnit({ owner, tileX, tileY, hp, spriteKey: 'unit_rifleman' });
}

/** 造一个工人 */
export function makeWorker(owner = 0, tileX = 5, tileY = 0): Unit {
  return makeUnit({ owner, tileX, tileY, hp: 80, attackDamage: 5, spriteKey: 'unit_worker' });
}

// ============ 建筑 ============

export interface MakeBuildingOptions {
  owner?: number;
  tileX?: number;
  tileY?: number;
  hp?: number;
  buildingType?: 'production' | 'resource' | 'tech' | 'defense' | 'utility';
  spriteKey?: string;
  providesSupply?: number;
  providesIndustry?: number;
  completed?: boolean;
}

/** 造一个建筑（默认兵营，完工状态） */
export function makeBuilding(opts: MakeBuildingOptions = {}): Building {
  const {
    owner = 0, tileX = 1, tileY = 1, hp = 800,
    buildingType = 'production', spriteKey = 'bld_barracks',
    providesSupply = 0, providesIndustry = 0, completed = true,
  } = opts;
  const b = new Building(owner, factionForOwner(owner), tileX, tileY, hp, 'structure', buildingType, spriteKey, providesSupply, providesIndustry);
  if (completed) b.complete();
  return b;
}

/** 造一个指挥中心（CC，提供 20 补给） */
export function makeCommandCenter(owner = 0, tileX = 6, tileY = 6, completed = true): Building {
  const spriteKey = owner === 0 ? 'bld_cc_empire' : 'bld_cc_federation';
  return makeBuilding({ owner, tileX, tileY, hp: 2000, buildingType: 'production', spriteKey, providesSupply: 20, providesIndustry: 10, completed });
}

/** 造一个精炼厂（完工，无补给/工业） */
export function makeRefinery(owner = 0, tileX = 0, tileY = 0): Building {
  return makeBuilding({ owner, tileX, tileY, buildingType: 'resource', spriteKey: 'bld_refinery' });
}

/** 造一个防御塔（带战斗属性，完工） */
export function makeTurret(owner = 0, tileX = 0, tileY = 0, range = 5): Building {
  const b = makeBuilding({ owner, tileX, tileY, buildingType: 'defense', spriteKey: 'bld_turret' });
  b.attackDamage = 20;
  b.attackRange = range;
  b.attackCooldown = 1;
  b.attackType = 'physical';
  return b;
}

/** 造一个正在研究的科技建筑 */
export function makeResearchingBuilding(owner = 0, techId = 'tech:infantry_armor', totalTime = 10): Building {
  const b = makeBuilding({ owner, tileX: 1, tileY: 1, buildingType: 'tech', spriteKey: 'bld_ancient_archive' });
  b.state = 'researching';
  b.researchingTechId = techId;
  b.researchProgress = 0;
  b.researchTotalTime = totalTime;
  return b;
}

// ============ 资源 ============

/** 造一个水晶矿点 */
export function makeResourceField(tileX = 5, tileY = 0, amount = 1000, maxGatherers = 3): ResourceField {
  return new ResourceField(tileX, tileY, 'crystal', amount, maxGatherers);
}

/** 把工人绑定到矿点（targetResourceId 必须用 field 真实 id） */
export function bindToField(worker: Unit, field: ResourceField, gatherers = 1): void {
  worker.targetResourceId = field.id;
  worker.state = 'gathering';
  field.currentGatherers = gatherers;
}

// ============ 玩家 ============

/** 造一个玩家状态 */
export function makePlayer(index = 0, crystal = 0, faction: FactionId = 'arcane_empire'): PlayerState {
  return {
    index, faction, guilds: [],
    resources: { crystal, industry: 0, supply: 0, supplyCap: 0, industryCap: 0 },
    isAI: false,
  };
}

// ============ 迷雾 ============

/** 造一个 FogUnitView（FogOfWar.update 用） */
export function view(owner: number, tileX: number, tileY: number, sight = 3): FogUnitView {
  return { tileX, tileY, sight, owner };
}

// ============ 全链路装配 ============

export interface GameSetup {
  world: GameWorld;
  entities: EntityRegistry;
  techSystem: TechSystem;
  researchSystem: ResearchSystem;
  spawner: UnitSpawner;
  commandExecutor: CommandExecutor;
}

/**
 * 一键搭建完整游戏链路：GameWorld（2 玩家）+ EntityRegistry + TechSystem + ResearchSystem
 * + UnitSpawner（回调只更新注册表，不建 sprite）+ CommandExecutor。
 * 返回全部引用，测试按需取用。
 */
export function setupGame(w = 32, h = 32): GameSetup {
  const world = makeWorld(w, h, true);
  const entities = new EntityRegistry();
  const techSystem = new TechSystem(world);
  techSystem.initAll();
  const researchSystem = new ResearchSystem(world, entities, techSystem);
  const spawner = new UnitSpawner(
    world.map,
    (u) => { techSystem.applyToUnit(u); entities.addUnit(u); },
    (b) => { techSystem.applyToBuilding(b); entities.addBuilding(b); },
    (owner) => world.players[owner]?.faction ?? 'arcane_empire',
  );
  const commandExecutor = new CommandExecutor(
    world, entities, spawner,
    (bld) => techSystem.applyToBuilding(bld),
    (bld) => entities.addBuilding(bld),
  );
  return { world, entities, techSystem, researchSystem, spawner, commandExecutor };
}
