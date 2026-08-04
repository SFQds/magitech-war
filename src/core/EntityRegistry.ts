/**
 * 实体注册表 — 唯一实体状态聚合点
 *
 * 管理 units/buildings/resourceFields 数组 + Map 快速索引。
 * 精灵（Phaser-dependent）由 GameScene 管理。
 */

import { Unit } from '../entities/Unit';
import { Hero } from '../entities/Hero';
import { Building } from '../entities/Building';
import { Projectile } from '../entities/Projectile';
import { ResourceField } from '../entities/ResourceField';

export class EntityRegistry {
  units: Unit[] = [];
  heroes: Hero[] = [];
  buildings: Building[] = [];
  fields: ResourceField[] = [];
  projectiles: Projectile[] = [];

  private unitMap = new Map<string, Unit>();
  private heroMap = new Map<string, Hero>();
  private buildingMap = new Map<string, Building>();
  private fieldMap = new Map<string, ResourceField>();

  // ============ 单位 ============

  // ============ 缓存（避免每帧 filter 分配新数组） ============

  private _aliveUnitsDirty = true;
  private _aliveUnitsCache: Unit[] = [];
  private _aliveBuildingsDirty = true;
  private _aliveBuildingsCache: Building[] = [];
  private _activeFieldsDirty = true;
  private _activeFieldsCache: ResourceField[] = [];

  // ============ 战斗候选空间索引（性能：O(N²) → O(N + k)） ============
  // 每个网格单元约 8×8 瓦片。仅在 updateCombat 帧首按需重建（脏标记），
  // 用于把「最近敌人」扫描从全量数组收窄到小候选集。AABB 预筛是精确欧氏
  // 距离的超集，绝不漏掉线性扫描能命中的候选，故行为不变。
  private static readonly COMBAT_CELL = 8;
  private _combatCellsUnits = new Map<number, Unit[]>();
  private _combatCellsBuildings = new Map<number, Building[]>();
  private _combatIndexDirty = true;

  private static combatCellKey(cx: number, cy: number): number {
    return cy * 100000 + cx;
  }

  /** 帧首重建空间索引（仅当有增删时）。由 CombatSystem.updateCombat 调用。 */
  ensureCombatIndex(): void {
    if (!this._combatIndexDirty) return;
    this._combatCellsUnits.clear();
    this._combatCellsBuildings.clear();
    const cell = EntityRegistry.COMBAT_CELL;
    for (const u of this.units) {
      if (!u.isAlive) continue;
      const key = EntityRegistry.combatCellKey(Math.floor(u.tileX / cell), Math.floor(u.tileY / cell));
      let bucket = this._combatCellsUnits.get(key);
      if (!bucket) { bucket = []; this._combatCellsUnits.set(key, bucket); }
      bucket.push(u);
    }
    for (const b of this.buildings) {
      if (!b.isAlive) continue;
      const key = EntityRegistry.combatCellKey(Math.floor(b.tileX / cell), Math.floor(b.tileY / cell));
      let bucket = this._combatCellsBuildings.get(key);
      if (!bucket) { bucket = []; this._combatCellsBuildings.set(key, bucket); }
      bucket.push(b);
    }
    this._combatIndexDirty = false;
  }

  /** 收集以 (tileX,tileY) 为中心、radius 方形范围内的活单位/建筑（含已方，精确过滤交给调用方）。
   *  用 AABB(|dx|<=radius 且 |dy|<=radius) 预筛，是欧氏距离 radius 的超集。 */
  queryCombatCandidates(tileX: number, tileY: number, radius: number): { units: Unit[]; buildings: Building[] } {
    this.ensureCombatIndex();
    const cell = EntityRegistry.COMBAT_CELL;
    const cx = Math.floor(tileX / cell);
    const cy = Math.floor(tileY / cell);
    const spread = Math.ceil(radius / cell) + 1;
    const units: Unit[] = [];
    const buildings: Building[] = [];
    for (let gx = cx - spread; gx <= cx + spread; gx++) {
      for (let gy = cy - spread; gy <= cy + spread; gy++) {
        const uk = this._combatCellsUnits.get(EntityRegistry.combatCellKey(gx, gy));
        if (uk) {
          for (const u of uk) {
            if (Math.abs(u.tileX - tileX) <= radius && Math.abs(u.tileY - tileY) <= radius) units.push(u);
          }
        }
        const bk = this._combatCellsBuildings.get(EntityRegistry.combatCellKey(gx, gy));
        if (bk) {
          for (const b of bk) {
            if (Math.abs(b.tileX - tileX) <= radius && Math.abs(b.tileY - tileY) <= radius) buildings.push(b);
          }
        }
      }
    }
    return { units, buildings };
  }

  addUnit(unit: Unit): void {
    this.units.push(unit);
    this.unitMap.set(unit.id, unit);
    this._aliveUnitsDirty = true;
    this._combatIndexDirty = true;
    // 英雄额外索引
    if (unit instanceof Hero && !this.heroes.includes(unit)) {
      this.heroes.push(unit);
      this.heroMap.set(unit.id, unit);
    }
  }

  removeUnit(id: string): Unit | undefined {
    const u = this.unitMap.get(id);
    if (u) {
      this.unitMap.delete(id);
      this._aliveUnitsDirty = true;
      this._combatIndexDirty = true;
      // swap-with-last + pop (O(1) 替代 O(N) splice)
      const idx = this.units.indexOf(u);
      if (idx !== -1) {
        this.units[idx] = this.units[this.units.length - 1];
        this.units.pop();
      }
      // 英雄额外清理
      if (u instanceof Hero) {
        this.heroMap.delete(id);
        const hIdx = this.heroes.indexOf(u);
        if (hIdx !== -1) {
          this.heroes[hIdx] = this.heroes[this.heroes.length - 1];
          this.heroes.pop();
        }
      }
    }
    return u;
  }

  getUnit(id: string): Unit | undefined { return this.unitMap.get(id); }
  hasUnit(id: string): boolean { return this.unitMap.has(id); }

  /** 查找活单位 */
  findAliveUnit(pred: (u: Unit) => boolean): Unit | undefined {
    return this.units.find(u => u.isAlive && pred(u));
  }

  /** 获取存活单位列表 */
  get aliveUnits(): Unit[] {
    if (this._aliveUnitsDirty) {
      this._aliveUnitsCache = this.units.filter(u => u.isAlive);
      this._aliveUnitsDirty = false;
    }
    return this._aliveUnitsCache;
  }

  // ============ 英雄 ============

  addHero(hero: Hero): void {
    if (!this.heroes.includes(hero)) this.heroes.push(hero);
    this.heroMap.set(hero.id, hero);
    if (!this.units.includes(hero)) {
      this.units.push(hero);
      this.unitMap.set(hero.id, hero);
      this._aliveUnitsDirty = true;  // P0修复：英雄加入时刷新缓存
    }
  }

  getHero(id: string): Hero | undefined { return this.heroMap.get(id); }
  get heroesAlive(): Hero[] { return this.heroes.filter(h => h.isAlive); }

  // ============ 建筑 ============

  addBuilding(bld: Building): void {
    this.buildings.push(bld);
    this.buildingMap.set(bld.id, bld);
    this._aliveBuildingsDirty = true;
    this._combatIndexDirty = true;
  }

  removeBuilding(id: string): Building | undefined {
    const b = this.buildingMap.get(id);
    if (b) {
      this.buildingMap.delete(id);
      this._aliveBuildingsDirty = true;
      this._combatIndexDirty = true;
      const idx = this.buildings.indexOf(b);
      if (idx !== -1) {
        this.buildings[idx] = this.buildings[this.buildings.length - 1];
        this.buildings.pop();
      }
    }
    return b;
  }

  getBuilding(id: string): Building | undefined { return this.buildingMap.get(id); }
  get aliveBuildings(): Building[] {
    if (this._aliveBuildingsDirty) {
      this._aliveBuildingsCache = this.buildings.filter(b => b.isAlive);
      this._aliveBuildingsDirty = false;
    }
    return this._aliveBuildingsCache;
  }

  // ============ 资源 ============

  addField(field: ResourceField): void {
    this.fields.push(field);
    this.fieldMap.set(field.id, field);
    this._activeFieldsDirty = true;
  }

  removeField(id: string): ResourceField | undefined {
    const f = this.fieldMap.get(id);
    if (f) {
      this.fieldMap.delete(id);
      this._activeFieldsDirty = true;
      const idx = this.fields.indexOf(f);
      if (idx !== -1) {
        this.fields[idx] = this.fields[this.fields.length - 1];
        this.fields.pop();
      }
    }
    return f;
  }

  getField(id: string): ResourceField | undefined { return this.fieldMap.get(id); }
  get activeFields(): ResourceField[] {
    if (this._activeFieldsDirty) {
      this._activeFieldsCache = this.fields.filter(f => f.isActive && !f.isDepleted);
      this._activeFieldsDirty = false;
    }
    return this._activeFieldsCache;
  }

  // ============ 索引暴露（供 ProjectileController 等需要快速 Map 查询的模块） ============

  get unitIndex(): Map<string, Unit> { return this.unitMap; }
  get buildingIndex(): Map<string, Building> { return this.buildingMap; }
  get fieldIndex(): Map<string, ResourceField> { return this.fieldMap; }

  // ============ 通用查询 ============

  findEntity(id: string): Unit | Building | ResourceField | undefined {
    return this.unitMap.get(id) ?? this.buildingMap.get(id) ?? this.fieldMap.get(id);
  }

  /** 单位是否存在且存活 */
  isUnitAlive(id: string): boolean {
    const u = this.unitMap.get(id);
    return u !== undefined && u.isAlive;
  }

  /** 检查指定位置是否有活建筑 */
  hasBuildingAt(tileX: number, tileY: number): boolean {
    return this.buildings.some(b => b.isAlive && b.tileX === tileX && b.tileY === tileY);
  }

  /** 找出离某点最近的活建筑 */
  findClosestBuilding(tileX: number, tileY: number, owner?: number): Building | undefined {
    let best: Building | undefined;
    let bestDist = Infinity;
    for (const b of this.buildings) {
      if (!b.isAlive) continue;
      if (owner !== undefined && b.owner !== owner) continue;
      const d = Math.abs(b.tileX - tileX) + Math.abs(b.tileY - tileY);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  clear(): void {
    this.units = []; this.heroes = []; this.buildings = []; this.fields = []; this.projectiles = [];
    this.unitMap.clear(); this.heroMap.clear(); this.buildingMap.clear(); this.fieldMap.clear();
    // 清空缓存
    this._aliveUnitsCache = []; this._aliveBuildingsCache = []; this._activeFieldsCache = [];
    this._aliveUnitsDirty = true; this._aliveBuildingsDirty = true; this._activeFieldsDirty = true;
    this._combatCellsUnits.clear(); this._combatCellsBuildings.clear();
    this._combatIndexDirty = true;
  }
}