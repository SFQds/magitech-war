/**
 * 单位生成器 — spawnUnit / spawnFactionStartingUnits / placeStartingUnits
 */
import type { Point } from '../types/entity';
import type { GameWorld } from '../core/GameWorld';
import type { GameMap } from '../core/GameMap';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Hero } from '../entities/Hero';
import { HeroSystem } from '../systems/HeroSystem';
import { UNIT_DEFS, FACTION_DEFS, createBuilding } from '../config/unitData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

type AddUnitFn = (unit: Unit) => void;
type AddBuildingFn = (bld: Building) => void;
type GetFactionFn = (owner: number) => string;

interface SpawnResult {
  unitId?: string;
  pos: Point;
}

export class UnitSpawner {
  private onAddUnit: AddUnitFn;
  private onAddBuilding: AddBuildingFn;
  private getFaction: GetFactionFn;
  private map: GameMap;

  constructor(
    map: GameMap,
    addUnit: AddUnitFn,
    addBuilding: AddBuildingFn,
    getFaction: GetFactionFn,
  ) {
    this.map = map;
    this.onAddUnit = addUnit;
    this.onAddBuilding = addBuilding;
    this.getFaction = getFaction;
  }

  /** 生成单个单位（英雄或普通单位） */
  spawnUnit(unitDefId: string, pos: Point, owner: number): SpawnResult {
    // 安全出生点
    let sx = pos.x, sy = pos.y;
    if (!this.map.isPassable(sx, sy)) {
      const safe = this.map.findNearbyPassable(sx, sy, 10);
      if (safe) { sx = safe.x; sy = safe.y; }
    }

    const faction = this.getFaction(owner);

    // 英雄
    if (unitDefId.startsWith('hero:')) {
      const hero = HeroSystem.trainHero(unitDefId, owner, faction, sx, sy);
      if (hero) {
        this.onAddUnit(hero);
        EventBus.emit(GameEvent.UNIT_CREATED, { unitId: hero.id, playerIndex: owner, defId: unitDefId, position: { x: sx, y: sy } });
      }
      return { pos: { x: sx, y: sy } };
    }

    const def = UNIT_DEFS[unitDefId];
    if (!def) return { pos: { x: sx, y: sy } };

    const s = def.stats;
    const unit = new Unit(owner, faction as any, sx, sy, s.hp, s.armor, s.category,
      s.speed, s.damage, s.dmgType, s.range, s.cooldown, s.sight, unitDefId, def.abilities ?? []);
    // 设置基础护甲值
    unit.armor = s.armorValue ?? 0;
    unit.baseArmor = s.armorValue ?? 0;
    // 设置补给消耗（死亡时退还）
    unit.supplyCost = def.cost.supply;

    // 奥术守卫初始护盾
    if (unitDefId === 'unit_arcane_guard') {
      unit.shieldHp = 200; unit.maxShieldHp = 200;
    }

    this.onAddUnit(unit);
    EventBus.emit(GameEvent.UNIT_CREATED, { unitId: unit.id, playerIndex: owner, defId: unitDefId, position: { x: sx, y: sy } });
    return { unitId: unit.id, pos: { x: sx, y: sy } };
  }

  /** 按阵营配置放置起始单位 */
  placeStartingUnits(p0: Point, p1: Point, p0Faction: string, p1Faction: string): void {
    const pf = p0Faction, af = p1Faction;
    const pCC = pf === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';
    const aCC = af === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';
    this.spawnFactionStartingUnits(0, pf, p0.x, p0.y, pCC);
    this.spawnFactionStartingUnits(1, af, p1.x, p1.y, aCC);
  }

  private spawnFactionStartingUnits(
    owner: number, factionId: string, bx: number, by: number, ccBldId: string,
  ): void {
    const fd = FACTION_DEFS[factionId];
    if (!fd) return;

    const cc = new Building(owner, factionId as any, bx, by, 2000, 'structure', 'production', ccBldId, 50, fd.startingIndustry);
    cc.complete();
    this.onAddBuilding(cc);

    let nx = bx + 1, ny = by + 2;
    for (const [unitDefId, count] of fd.startingUnits) {
      const def = UNIT_DEFS[unitDefId];
      if (!def) continue;
      const s = def.stats;
      for (let i = 0; i < count; i++) {
        const safe = this.map.findNearbyPassable(nx, ny, 8);
        const ux = safe ? safe.x : nx, uy = safe ? safe.y : ny;
const unit = new Unit(owner, factionId as any, ux, uy, s.hp, s.armor, s.category,
              s.speed, s.damage, s.dmgType, s.range, s.cooldown, s.sight, unitDefId, def.abilities ?? []);
            unit.armor = s.armorValue ?? 0;
            unit.baseArmor = s.armorValue ?? 0;
            unit.supplyCost = def.cost.supply;
            // 奥术守卫初始护盾
            if (unitDefId === 'unit_arcane_guard') {
              unit.shieldHp = 200; unit.maxShieldHp = 200;
            }
            this.onAddUnit(unit);
        nx = ux + 1; ny = uy;
      }
    }
  }
}