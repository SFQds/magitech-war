/**
 * 存档/读档系统 — 纯逻辑层
 *
 * 职责：
 *  - 将 GameWorld + EntityRegistry + 游戏计时器 序列化为 JSON 兼容的 SaveData
 *  - 从 SaveData 反序列化重建 GameWorld + EntityRegistry + 子系统状态
 *  - localStorage 存取：save/load/list/delete/deleteOldest
 *
 * 原则：
 *  - 零 Phaser 依赖（node 测试环境可用）
 *  - 序列化只保留可 JSON 序列化的数据（丢弃 sprite 引用、ability.execute 函数等）
 *  - cargo 单位用 ID 列表表示（反序列化时按 ID 重新挂载）
 *  - 投射物不存档（生命周期极短），读档时 projectiles 为空
 *  - 传送门冷却不存档（minor transient state，可接受丢失）
 */
import { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { Unit } from '../entities/Unit';
import { Hero } from '../entities/Hero';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { TechSystem } from '../systems/TechSystem';
import { SuperWeaponSystem } from '../systems/SuperWeaponSystem';
import { HERO_DEFS } from '../config/heroData';
import { _getBackend } from '../save/storageAdapter';
import type { StorageBackend } from '../save/storageAdapter';
import type { FactionId, TerrainType } from '../types/data';
import type {
  SaveData,
  SaveMeta,
  SerializedUnit,
  SerializedBuilding,
  SerializedField,
  SerializedPlayer,
  SerializedTechTree,
  SerializedArcaneCharge,
} from '../save/SaveData';
import { SAVE_VERSION } from '../save/SaveData';

// ============ localStorage key 前缀 ============

const SAVE_KEY_PREFIX = 'magewar_save_';
const META_KEY = 'magewar_save_list'; // 存储所有存档名数组（JSON）

/** 存档列表项 */
export interface SaveSlot {
  key: string;       // localStorage 完整 key
  name: string;      // 存档名（时间戳格式化）
  createdAt: number; // ms 时间戳
  gameTimer: number; // 游戏秒数
  mapId: string;
}

// ============================================================
// 序列化：游戏状态 → SaveData
// ============================================================

export interface SerializeInput {
  world: GameWorld;
  entities: EntityRegistry;
  gameTimer: number;
  graceTimers: [number, number];
  meta: SaveMeta;
  /**
   * SAVE-2: 是否序列化玩家0已探索迷雾掩膜。
   * 仅单机磁盘存档传 true；联机快照保持 false（客户端每帧重算，避免泄漏主机探索/膨胀快照）。
   */
  includeFog?: boolean;
}

export function serialize(input: SerializeInput): SaveData {
  const { world, entities, gameTimer, graceTimers, meta } = input;

  // 玩家状态
  const players: SerializedPlayer[] = world.players.map(p => ({
    index: p.index,
    faction: p.faction,
    guilds: [...p.guilds],
    resources: { ...p.resources },
    _industryTimer: p._industryTimer ?? 0,
    isAI: p.isAI,
    aiDifficulty: p.aiDifficulty,
  }));

  // 单位（含英雄）
  const units: SerializedUnit[] = [];
  for (const u of entities.units) {
    if (u instanceof Hero) {
      units.push(serializeHero(u));
    } else {
      units.push(serializeUnit(u));
    }
  }

  // 建筑
  const buildings: SerializedBuilding[] = entities.buildings.map(serializeBuilding);

  // 资源点（含枯竭的，读档时靠 isActive 区分）
  const fields: SerializedField[] = entities.fields.map(serializeField);

  // 科技树
  const techTrees: SerializedTechTree[] = [];
  for (const [pi, tt] of world.techTrees) {
    techTrees.push({ playerIndex: pi, researched: tt.getResearched() });
  }

  // 超武状态
  const superWeapons = SuperWeaponSystem.snapshotAll();

  // 法师公会充能计时器
  const arcaneChargeTimers: SerializedArcaneCharge[] = [];
  for (const [pi, timer] of world.arcaneChargeTimers) {
    arcaneChargeTimers.push({ playerIndex: pi, timer: timer ?? 0 });
  }

  // 地形（仅保存非默认 grass 的 tile，缩小体积）
  const map = world.map;
  const terrain: string[][] = [];
  let hasNonGrass = false;
  for (let y = 0; y < map.config.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < map.config.width; x++) {
      const t = map.getTile(x, y);
      row.push(t);
      if (t !== 'grass') hasNonGrass = true;
    }
    terrain.push(row as any);
  }

  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    meta,
    gameTimer,
    graceTimers: [...graceTimers] as [number, number],
    players,
    units,
    buildings,
    fields,
    techTrees,
    superWeapons,
    arcaneChargeTimers,
    terrain: hasNonGrass ? (terrain as TerrainType[][]) : undefined,
    fogExplored: input.includeFog ? serializeFog(world) : undefined,
  };
}

/**
 * SAVE-2: 序列化玩家0视角的已探索迷雾掩膜（单机读档保留地图记忆）。
 * 独立函数便于测试；联机快照走 broadcastSnapshot 时不会用到（客户端自行重算）。
 */
function serializeFog(world: GameWorld): boolean[][] {
  const fog = world.fogOfWar;
  const w = world.map.config.width;
  const h = world.map.config.height;
  const grid: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      row.push(fog.isExplored(x, y));
    }
    grid.push(row);
  }
  return grid;
}

// ---- 实体序列化 helpers ----

function serializeUnit(u: Unit): SerializedUnit {
  return {
    kind: 'unit',
    subtype: 'unit',
    id: u.id,
    owner: u.owner,
    faction: u.faction,
    tileX: u.tileX,
    tileY: u.tileY,
    hp: u.hp,
    maxHp: u.maxHp,
    armorType: u.armorType,
    armor: u.armor,
    shieldHp: u.shieldHp,
    maxShieldHp: u.maxShieldHp,
    isActive: u.isActive,
    spriteKey: u.spriteKey,
    category: u.category,
    state: u.state,
    speed: u.speed,
    attackDamage: u.attackDamage,
    attackType: u.attackType,
    attackRange: u.attackRange,
    attackCooldown: u.attackCooldown,
    attackTimer: u.attackTimer,
    sight: u.sight,
    path: u.path.map(p => ({ x: p.x, y: p.y })),
    pathIndex: u.pathIndex,
    targetEntityId: u.targetEntityId,
    targetResourceId: u.targetResourceId,
    cargoIds: u.cargo.map(c => c.id),
    abilityCharges: u.abilityCharges,
    maxAbilityCharges: u.maxAbilityCharges,
    holdPosition: u.holdPosition,
    aiLockedAction: u.aiLockedAction,
    supplyCost: u.supplyCost,
    gatherTimer: u.gatherTimer,
    unloadTarget: u.unloadTarget ? { x: u.unloadTarget.x, y: u.unloadTarget.y } : null,
    isCargo: u.isCargo,
    baseArmor: u.baseArmor,
    baseAttackDamage: u.baseAttackDamage,
    hadIronskin: u.hadIronskin,
    pursueFailTimer: u.pursueFailTimer,
    pursueRetickTimer: u.pursueRetickTimer,
    alchemyBuffTimer: u.alchemyBuffTimer,
    alchemyBuffType: u.alchemyBuffType,
    alchemyBuffValue: u.alchemyBuffValue,
    isVoidOvercharged: u.isVoidOvercharged,
    voidOverloadTimer: u.voidOverloadTimer,
    isVoidOptimized: u.isVoidOptimized,
    frostBastionTimer: u._frostBastionTimer,
    chargeStrikeUses: u._chargeStrikeUses,
  };
}

function serializeHero(h: Hero): SerializedUnit {
  return {
    kind: 'unit',
    subtype: 'hero',
    id: h.id,
    owner: h.owner,
    faction: h.faction,
    tileX: h.tileX,
    tileY: h.tileY,
    hp: h.hp,
    maxHp: h.maxHp,
    armorType: h.armorType,
    armor: h.armor,
    shieldHp: h.shieldHp,
    maxShieldHp: h.maxShieldHp,
    isActive: h.isActive,
    spriteKey: h.spriteKey,
    category: h.category,
    state: h.state,
    speed: h.speed,
    attackDamage: h.attackDamage,
    attackType: h.attackType,
    attackRange: h.attackRange,
    attackCooldown: h.attackCooldown,
    attackTimer: h.attackTimer,
    sight: h.sight,
    path: h.path.map(p => ({ x: p.x, y: p.y })),
    pathIndex: h.pathIndex,
    targetEntityId: h.targetEntityId,
    targetResourceId: h.targetResourceId,
    cargoIds: h.cargo.map(c => c.id),
    abilityCharges: h.abilityCharges,
    maxAbilityCharges: h.maxAbilityCharges,
    holdPosition: h.holdPosition,
    aiLockedAction: h.aiLockedAction,
    supplyCost: h.supplyCost,
    gatherTimer: h.gatherTimer,
    unloadTarget: h.unloadTarget ? { x: h.unloadTarget.x, y: h.unloadTarget.y } : null,
    isCargo: h.isCargo,
    baseArmor: h.baseArmor,
    baseAttackDamage: h.baseAttackDamage,
    hadIronskin: h.hadIronskin,
    pursueFailTimer: h.pursueFailTimer,
    pursueRetickTimer: h.pursueRetickTimer,
    alchemyBuffTimer: h.alchemyBuffTimer,
    alchemyBuffType: h.alchemyBuffType,
    alchemyBuffValue: h.alchemyBuffValue,
    isVoidOvercharged: h.isVoidOvercharged,
    voidOverloadTimer: h.voidOverloadTimer,
    isVoidOptimized: h.isVoidOptimized,
    frostBastionTimer: h._frostBastionTimer,
    chargeStrikeUses: h._chargeStrikeUses,
    // 英雄专属
    heroName: h.heroName,
    title: h.title,
    level: h.level,
    xp: h.xp,
    skillCooldown: h.skillCooldown,
    skillCooldowns: [...h.skillCooldowns],
    reviveTimer: h.reviveTimer,
    auraRadius: h.auraRadius,
  };
}

function serializeBuilding(b: Building): SerializedBuilding {
  return {
    kind: 'building',
    id: b.id,
    owner: b.owner,
    faction: b.faction,
    tileX: b.tileX,
    tileY: b.tileY,
    hp: b.hp,
    maxHp: b.maxHp,
    armorType: b.armorType,
    armor: b.armor,
    shieldHp: b.shieldHp,
    maxShieldHp: b.maxShieldHp,
    isActive: b.isActive,
    spriteKey: b.spriteKey,
    buildingType: b.buildingType,
    state: b.state,
    buildProgress: b.buildProgress,
    rallyPoint: b.rallyPoint ? { x: b.rallyPoint.x, y: b.rallyPoint.y } : null,
    productionQueue: b.productionQueue.map(p => ({ ...p })),
    maxQueueSize: b.maxQueueSize,
    providesSupply: b.providesSupply,
    providesIndustry: b.providesIndustry,
    researchingTechId: b.researchingTechId,
    researchProgress: b.researchProgress,
    researchTotalTime: b.researchTotalTime,
    builderId: b.builderId,
    sight: b.sight,
    productionSpeedBonus: b.productionSpeedBonus,
    _aiBuildTime: b._aiBuildTime,
    attackDamage: b.attackDamage,
    attackRange: b.attackRange,
    attackCooldown: b.attackCooldown,
    attackType: b.attackType,
    attackTimer: b.attackTimer,
    targetEntityId: b.targetEntityId,
  };
}

function serializeField(f: ResourceField): SerializedField {
  return {
    kind: 'field',
    id: f.id,
    owner: f.owner,
    faction: f.faction,
    tileX: f.tileX,
    tileY: f.tileY,
    hp: f.hp,
    maxHp: f.maxHp,
    armorType: f.armorType,
    armor: f.armor,
    shieldHp: f.shieldHp,
    maxShieldHp: f.maxShieldHp,
    isActive: f.isActive,
    spriteKey: f.spriteKey,
    resourceType: f.resourceType as 'crystal',
    amount: f.amount,
    maxGatherers: f.maxGatherers,
    currentGatherers: f.currentGatherers,
  };
}

// ============================================================
// 反序列化：SaveData → GameWorld + EntityRegistry + 子系统状态
// ============================================================

export interface DeserializeResult {
  world: GameWorld;
  entities: EntityRegistry;
  gameTimer: number;
  graceTimers: [number, number];
}

/**
 * 从 SaveData 重建完整游戏状态。
 *
 * 副作用：
 *  - 创建 GameWorld + 恢复玩家/科技/超武状态
 *  - 创建 EntityRegistry 并填充所有实体
 *  - 调用 SuperWeaponSystem.restoreAll()（副作用：覆盖全局静态状态）
 *  - 设置 TechTreeSystem.setResearched()
 *
 * 不包含（需调用方处理）：
 *  - Phaser sprite 创建（渲染层）
 *  - TechSystem.initAll() 重新计算科技效果缓存
 *  - FogOfWar 初始化
 */
export function deserialize(data: SaveData): DeserializeResult {
  // SAVE-3: 先做结构校验，缺失关键数组抛出明确错误（而非后续 TypeError），由调用方 try/catch 兜底
  if (!data || typeof data !== 'object') {
    throw new Error('存档数据无效');
  }
  if (data.version !== SAVE_VERSION) {
    throw new Error(`存档版本不兼容: 当前 ${SAVE_VERSION}, 存档 ${data.version}`);
  }
  const meta = data.meta;
  if (!meta || !meta.mapWidth || !meta.mapHeight) {
    throw new Error('存档元数据缺失（地图尺寸无效）');
  }
  const players: SerializedPlayer[] = Array.isArray(data.players) ? data.players : [];
  const units: SerializedUnit[] = Array.isArray(data.units) ? data.units : [];
  const buildings: SerializedBuilding[] = Array.isArray(data.buildings) ? data.buildings : [];
  const fields: SerializedField[] = Array.isArray(data.fields) ? data.fields : [];
  const techTrees: SerializedTechTree[] = Array.isArray(data.techTrees) ? data.techTrees : [];
  const arcaneChargeTimers: SerializedArcaneCharge[] = Array.isArray(data.arcaneChargeTimers) ? data.arcaneChargeTimers : [];

  const world = new GameWorld(meta.mapWidth, meta.mapHeight);

  // 恢复地形
  if (data.terrain) {
    for (let y = 0; y < Math.min(data.terrain.length, meta.mapHeight); y++) {
      for (let x = 0; x < Math.min(data.terrain[y].length, meta.mapWidth); x++) {
        const t = data.terrain[y][x];
        if (t !== 'grass') {
          world.map.setTile(x, y, t);
        }
      }
    }
  }

  // SAVE-2: 恢复玩家0已探索迷雾掩膜（单机读档保留地图记忆；读档时全图视为 hidden，直接标 explored）
  if (data.fogExplored) {
    const fog = world.fogOfWar;
    for (let y = 0; y < Math.min(data.fogExplored.length, meta.mapHeight); y++) {
      for (let x = 0; x < Math.min(data.fogExplored[y].length, meta.mapWidth); x++) {
        if (data.fogExplored[y][x]) fog.revealArea(x, y, 1, 1);
      }
    }
  }

  // 恢复玩家
  for (const sp of players) {
    world.addPlayer(sp.faction, [...sp.guilds], sp.isAI);
    const p = world.getPlayer(sp.index);
    if (p) {
      p.resources = { ...sp.resources };
      p._industryTimer = sp._industryTimer;
      p.aiDifficulty = sp.aiDifficulty;
    }
  }

  // 恢复科技树
  for (const tt of techTrees) {
    const tree = world.techTrees.get(tt.playerIndex);
    if (tree) {
      tree.setResearched(tt.researched);
    }
  }

  // 恢复法师公会充能计时器
  world.arcaneChargeTimers.clear();
  for (const ac of arcaneChargeTimers) {
    world.arcaneChargeTimers.set(ac.playerIndex, ac.timer);
  }

  const __superWeapons = data.superWeapons && typeof data.superWeapons === 'object' ? data.superWeapons : {};
  // 恢复超武状态（副作用：覆盖全局 static Map）
  SuperWeaponSystem.restoreAll(__superWeapons);

  // 构建 EntityRegistry
  const entities = new EntityRegistry();

  // 恢复资源点
  const fieldById = new Map<string, ResourceField>();
  for (const sf of fields) {
    const field = new ResourceField(sf.tileX, sf.tileY, sf.resourceType, sf.amount, sf.maxGatherers);
    // 覆盖自动生成的 ID
    (field as any).id = sf.id;
    field.isActive = sf.isActive;
    field.currentGatherers = sf.currentGatherers;
    field.hp = sf.hp;
    field.maxHp = sf.maxHp;
    entities.addField(field);
    fieldById.set(field.id, field);
    // 注册到地图
    if (field.isActive && !field.isDepleted) {
      world.map.registerResourceTile(field.tileX, field.tileY);
    }
  }

  // 恢复建筑
  for (const sb of buildings) {
    const bld = new Building(
      sb.owner, sb.faction, sb.tileX, sb.tileY,
      sb.maxHp, sb.armorType, sb.buildingType, sb.spriteKey,
      sb.providesSupply, sb.providesIndustry,
    );
    // 覆盖自动生成的 ID
    (bld as any).id = sb.id;
    bld.hp = sb.hp;
    bld.armor = sb.armor;
    bld.shieldHp = sb.shieldHp;
    bld.maxShieldHp = sb.maxShieldHp;
    bld.isActive = sb.isActive;
    bld.state = sb.state;
    bld.buildProgress = sb.buildProgress;
    bld.rallyPoint = sb.rallyPoint ? { x: sb.rallyPoint.x, y: sb.rallyPoint.y } : null;
    bld.productionQueue = sb.productionQueue.map(p => ({ ...p }));
    bld.maxQueueSize = sb.maxQueueSize;
    bld.researchingTechId = sb.researchingTechId;
    bld.researchProgress = sb.researchProgress;
    bld.researchTotalTime = sb.researchTotalTime;
    bld.builderId = sb.builderId;
    bld.sight = sb.sight;
    bld.productionSpeedBonus = sb.productionSpeedBonus;
    bld._aiBuildTime = sb._aiBuildTime;
    bld.attackDamage = sb.attackDamage;
    bld.attackRange = sb.attackRange;
    bld.attackCooldown = sb.attackCooldown;
    bld.attackType = sb.attackType;
    bld.attackTimer = sb.attackTimer;
    bld.targetEntityId = sb.targetEntityId;
    entities.addBuilding(bld);
    // 地图占位
    world.map.markBlocked(bld.tileX, bld.tileY, 1, 1, true);
  }

  // 恢复单位（分两遍：第一遍创建所有单位并建 ID 索引，第二遍恢复 cargo 引用）
  const unitById = new Map<string, Unit>();

  for (const su of units) {
    let unit: Unit;

    if (su.subtype === 'hero') {
      const hd = HERO_DEFS[su.spriteKey];
      if (!hd) {
        // sprite key 不是已知英雄 ID，回退：用未知英雄数据
        continue;
      }
      const hero = new Hero(su.owner, su.faction, su.tileX, su.tileY, hd, su.spriteKey);
      (hero as any).id = su.id;
      // 恢复英雄专属字段
      hero.level = su.level ?? 1;
      hero.xp = su.xp ?? 0;
      hero.skillCooldown = su.skillCooldown ?? 0;
      hero.skillCooldowns = su.skillCooldowns ? [...su.skillCooldowns] : [0, 0, 0];
      hero.reviveTimer = su.reviveTimer ?? 0;
      hero.auraRadius = su.auraRadius ?? 8;
      unit = hero;
    } else {
      unit = new Unit(
        su.owner, su.faction, su.tileX, su.tileY,
        su.maxHp, su.armorType, su.category,
        su.speed, su.attackDamage, su.attackType,
        su.attackRange, su.attackCooldown, su.sight,
        su.spriteKey,
      );
      (unit as any).id = su.id;
    }

    // 恢复通用字段
    unit.hp = su.hp;
    unit.armor = su.armor;
    unit.shieldHp = su.shieldHp;
    unit.maxShieldHp = su.maxShieldHp;
    unit.isActive = su.isActive;
    unit.state = su.state;
    unit.attackTimer = su.attackTimer;
    unit.path = su.path.map(p => ({ x: p.x, y: p.y }));
    unit.pathIndex = su.pathIndex;
    unit.targetEntityId = su.targetEntityId;
    unit.targetResourceId = su.targetResourceId;
    unit.abilityCharges = su.abilityCharges;
    unit.maxAbilityCharges = su.maxAbilityCharges;
    unit.holdPosition = su.holdPosition;
    unit.aiLockedAction = su.aiLockedAction;
    unit.supplyCost = su.supplyCost;
    unit.gatherTimer = su.gatherTimer;
    unit.unloadTarget = su.unloadTarget ? { x: su.unloadTarget.x, y: su.unloadTarget.y } : null;
    unit.isCargo = su.isCargo;
    unit.baseArmor = su.baseArmor;
    unit.baseAttackDamage = su.baseAttackDamage;
    unit.hadIronskin = su.hadIronskin;
    unit.pursueFailTimer = su.pursueFailTimer;
    unit.pursueRetickTimer = su.pursueRetickTimer;
    unit.alchemyBuffTimer = su.alchemyBuffTimer;
    unit.alchemyBuffType = su.alchemyBuffType;
    unit.alchemyBuffValue = su.alchemyBuffValue;
    unit.isVoidOvercharged = su.isVoidOvercharged;
    unit.voidOverloadTimer = su.voidOverloadTimer;
    unit.isVoidOptimized = su.isVoidOptimized;
    // SAVE-1/FAIR-3: 恢复 buff 计时器（此前漏掉导致读档/快照后护甲翻倍与充能打击状态丢失）
    unit._frostBastionTimer = su.frostBastionTimer ?? 0;
    unit._chargeStrikeUses = su.chargeStrikeUses ?? 0;

    entities.addUnit(unit);
    unitById.set(unit.id, unit);
    // 地图占位
    world.map.markOccupied(unit.tileX, unit.tileY);
  }

  // 第二遍：恢复 cargo 引用
  for (const su of units) {
    if (!su.cargoIds || su.cargoIds.length === 0) continue;
    const carrier = unitById.get(su.id);
    if (!carrier) continue;
    for (const cid of su.cargoIds) {
      const passenger = unitById.get(cid);
      if (passenger) {
        carrier.cargo.push(passenger);
      }
    }
  }

  return {
    world,
    entities,
    gameTimer: typeof data.gameTimer === 'number' ? data.gameTimer : 0,
    graceTimers: Array.isArray(data.graceTimers) ? data.graceTimers as [number, number] : [0, 0],
  };
}

// ============================================================
// localStorage CRUD
// ============================================================

function getBackendSafe() {
  try {
    return _getBackend();
  } catch {
    return null;
  }
}

/** 持久化存档到 localStorage */
export function save(name: string, data: SaveData): { ok: true } | { ok: false; reason: string } {
  try {
    const backend = getBackendSafe();
    if (!backend) return { ok: false, reason: '存储不可用（无 localStorage）' };

    const key = SAVE_KEY_PREFIX + name;
    backend.setItem(key, JSON.stringify(data));

    // 更新存档列表
    _updateSlotList(backend, name, {
      key,
      name,
      createdAt: data.createdAt,
      gameTimer: data.gameTimer,
      mapId: data.meta.mapId,
    });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? '存档失败' };
  }
}

/** 从 localStorage 加载存档 */
export function load(name: string): { ok: true; data: SaveData } | { ok: false; reason: string } {
  try {
    const backend = getBackendSafe();
    if (!backend) return { ok: false, reason: '存储不可用（无 localStorage）' };

    const key = SAVE_KEY_PREFIX + name;
    const raw = backend.getItem(key);
    if (!raw) return { ok: false, reason: `存档「${name}」不存在` };

    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) {
      return { ok: false, reason: `存档版本不兼容: 当前 ${SAVE_VERSION}, 存档 ${data.version}` };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? '读档失败' };
  }
}

/** 列出所有存档的元数据 */
export function list(): SaveSlot[] {
  try {
    const backend = getBackendSafe();
    if (!backend) return [];

    const raw = backend.getItem(META_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SaveSlot[];
  } catch {
    return [];
  }
}

/** 删除指定存档 */
export function remove(name: string): { ok: true } | { ok: false; reason: string } {
  try {
    const backend = getBackendSafe();
    if (!backend) return { ok: false, reason: '存储不可用' };

    const key = SAVE_KEY_PREFIX + name;
    backend.removeItem(key);

    // 更新存档列表
    const slots = list().filter(s => s.name !== name);
    backend.setItem(META_KEY, JSON.stringify(slots));

    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? '删除失败' };
  }
}

/** 删除最旧的存档（最多保存 MAX 个；若超出则删最旧） */
export function deleteOldest(maxSlots: number = 10): void {
  const slots = list();
  if (slots.length <= maxSlots) return;

  // 按创建时间排序
  slots.sort((a, b) => a.createdAt - b.createdAt);
  const toDelete = slots.slice(0, slots.length - maxSlots);
  for (const s of toDelete) {
    remove(s.name);
  }
}

/** 检查是否有存档（用于决定是否显示"继续游戏"按钮） */
export function hasSaves(): boolean {
  return list().length > 0;
}

/** 获取最新的存档数据（用于继续游戏） */
export function loadLatest(): { ok: true; data: SaveData; slot: SaveSlot } | { ok: false; reason: string } {
  const slots = list();
  if (slots.length === 0) return { ok: false, reason: '没有存档' };

  // 按 createdAt 降序
  slots.sort((a, b) => b.createdAt - a.createdAt);
  const latest = slots[0];
  const result = load(latest.name);
  if (!result.ok) return result;
  return { ok: true, data: result.data, slot: latest };
}

// ---- 内部 helpers ----

function _updateSlotList(backend: StorageBackend, name: string, slot: SaveSlot): void {
  const slots = list();
  const idx = slots.findIndex(s => s.name === name);
  if (idx >= 0) {
    slots[idx] = slot;
  } else {
    slots.push(slot);
  }
  backend.setItem(META_KEY, JSON.stringify(slots));
}