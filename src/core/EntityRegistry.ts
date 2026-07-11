/**
 * 实体注册表 — 唯一实体状态聚合点
 *
 * 管理 units/buildings/resourceFields 数组 + Map 快速索引。
 * 精灵（Phaser-dependent）由 GameScene 管理。
 */

import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';

export class EntityRegistry {
  units: Unit[] = [];
  buildings: Building[] = [];
  fields: ResourceField[] = [];

  private unitMap = new Map<string, Unit>();
  private buildingMap = new Map<string, Building>();
  private fieldMap = new Map<string, ResourceField>();

  // ============ 单位 ============

  addUnit(unit: Unit): void {
    this.units.push(unit);
    this.unitMap.set(unit.id, unit);
  }

  removeUnit(id: string): Unit | undefined {
    const u = this.unitMap.get(id);
    if (u) {
      this.unitMap.delete(id);
      const idx = this.units.indexOf(u);
      if (idx !== -1) this.units.splice(idx, 1);
    }
    return u;
  }

  getUnit(id: string): Unit | undefined { return this.unitMap.get(id); }
  hasUnit(id: string): boolean { return this.unitMap.has(id); }

  /** 查找活单位 */
  findAliveUnit(pred: (u: Unit) => boolean): Unit | undefined {
    return this.units.find(u => u.isAlive && pred(u));
  }

  // ============ 建筑 ============

  addBuilding(bld: Building): void {
    this.buildings.push(bld);
    this.buildingMap.set(bld.id, bld);
  }

  removeBuilding(id: string): Building | undefined {
    const b = this.buildingMap.get(id);
    if (b) {
      this.buildingMap.delete(id);
      const idx = this.buildings.indexOf(b);
      if (idx !== -1) this.buildings.splice(idx, 1);
    }
    return b;
  }

  getBuilding(id: string): Building | undefined { return this.buildingMap.get(id); }

  // ============ 资源 ============

  addField(field: ResourceField): void {
    this.fields.push(field);
    this.fieldMap.set(field.id, field);
  }

  getField(id: string): ResourceField | undefined { return this.fieldMap.get(id); }

  // ============ 通用查询 ============

  findEntity(id: string): Unit | Building | ResourceField | undefined {
    return this.unitMap.get(id) ?? this.buildingMap.get(id) ?? this.fieldMap.get(id);
  }

  /** 单位是否存在且存活 */
  isUnitAlive(id: string): boolean {
    const u = this.unitMap.get(id);
    return u !== undefined && u.isAlive;
  }

  clear(): void {
    this.units = []; this.buildings = []; this.fields = [];
    this.unitMap.clear(); this.buildingMap.clear(); this.fieldMap.clear();
  }
}