/**
 * EntityRegistry 单元测试 - 实体注册表（数组+Map索引+缓存）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from './EntityRegistry';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { makeUnit, makeBuilding, makeResourceField } from '../__fixtures__/factories';

function makeHero(owner = 0, tileX = 5, tileY = 5): Hero {
  return new Hero(owner, 'arcane_empire', tileX, tileY, HERO_DEFS['hero_isabelle'], 'hero_isabelle');
}

describe('EntityRegistry unit basics', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('addUnit makes getUnit return the unit and hasUnit true', () => {
    const u = makeUnit();
    r.addUnit(u);
    expect(r.getUnit(u.id)).toBe(u);
    expect(r.hasUnit(u.id)).toBe(true);
  });

  it('addUnit appends to the units array in insertion order', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    const u3 = makeUnit({ tileX: 3 });
    r.addUnit(u1); r.addUnit(u2); r.addUnit(u3);
    expect(r.units).toEqual([u1, u2, u3]);
  });

  it('removeUnit returns the unit and removes it from array and map', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    const u3 = makeUnit({ tileX: 3 });
    r.addUnit(u1); r.addUnit(u2); r.addUnit(u3);
    const removed = r.removeUnit(u2.id);
    expect(removed).toBe(u2);
    expect(r.hasUnit(u2.id)).toBe(false);
    expect(r.units).toHaveLength(2);
    expect(r.units).toContain(u1);
    expect(r.units).toContain(u3);
  });

  it('removeUnit uses swap-with-last (order not preserved)', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    const u3 = makeUnit({ tileX: 3 });
    r.addUnit(u1); r.addUnit(u2); r.addUnit(u3);
    r.removeUnit(u1.id); // remove first -> u3 swaps into slot 0
    expect(r.units).toEqual([u3, u2]);
  });

  it('removeUnit on a non-existent id returns undefined and leaves arrays intact', () => {
    expect(r.removeUnit('nope')).toBeUndefined();
    const u = makeUnit();
    r.addUnit(u);
    r.removeUnit('ghost');
    expect(r.units).toHaveLength(1);
  });

  it('getUnit on a building id returns undefined', () => {
    const b = makeBuilding();
    r.addBuilding(b);
    expect(r.getUnit(b.id)).toBeUndefined();
  });
});

describe('EntityRegistry aliveUnits cache', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('filters out dead units and caches until dirty', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    r.addUnit(u1); r.addUnit(u2);
    u2.hp = 0; // dead
    expect(r.aliveUnits).toEqual([u1]);
  });

  it('cache is stable when nothing changes, invalidates on add', () => {
    const u1 = makeUnit();
    r.addUnit(u1);
    const c1 = r.aliveUnits;
    expect(r.aliveUnits).toBe(c1); // same reference (cache hit)
    const u2 = makeUnit({ tileX: 2 });
    r.addUnit(u2);
    const c2 = r.aliveUnits;
    expect(c2).not.toBe(c1); // dirty invalidated
    expect(c2).toContain(u2);
    expect(r.aliveUnits).toBe(c2); // cache hit again
  });
});

describe('EntityRegistry findAliveUnit', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('returns first alive unit matching predicate', () => {
    const u1 = makeUnit({ tileX: 1, tileY: 1 });
    const u2 = makeUnit({ tileX: 2, tileY: 2 });
    u2.hp = 0;
    r.addUnit(u1); r.addUnit(u2);
    expect(r.findAliveUnit(u => u.tileX === 2)).toBeUndefined();
    expect(r.findAliveUnit(u => u.tileX === 1)).toBe(u1);
  });

  it('returns undefined when only a dead unit matches the predicate', () => {
    const u1 = makeUnit({ tileX: 1 });
    u1.hp = 0;
    r.addUnit(u1);
    expect(r.findAliveUnit(() => true)).toBeUndefined();
  });
});

describe('EntityRegistry hero indexing', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('addHero indexes into heroes and unitMap; getHero returns it', () => {
    const h = makeHero();
    r.addHero(h);
    expect(r.getHero(h.id)).toBe(h);
    expect(r.getUnit(h.id)).toBe(h);
    expect(r.heroes).toContain(h);
    expect(r.units).toContain(h);
  });

  it('addHero is idempotent (adding same hero twice does not duplicate)', () => {
    const h = makeHero();
    r.addHero(h);
    r.addHero(h);
    expect(r.heroes).toHaveLength(1);
    expect(r.units).toHaveLength(1);
  });

  it('addUnit also indexes a Hero instance into heroes', () => {
    const h = makeHero();
    r.addUnit(h);
    expect(r.heroes).toContain(h);
    expect(r.getHero(h.id)).toBe(h);
  });

  it('removeUnit on a Hero cleans heroes array and heroMap', () => {
    const h = makeHero();
    const other = makeUnit();
    r.addHero(h);
    r.addUnit(other);
    r.removeUnit(h.id);
    expect(r.hasUnit(h.id)).toBe(false);
    expect(r.getHero(h.id)).toBeUndefined();
    expect(r.heroes).not.toContain(h);
    expect(r.units).toContain(other);
  });

  it('heroesAlive filters dead heroes', () => {
    const h1 = makeHero(0, 1, 1);
    const h2 = makeHero(0, 2, 2);
    r.addHero(h1); r.addHero(h2);
    h2.hp = 0;
    expect(r.heroesAlive).toEqual([h1]);
  });
});

describe('EntityRegistry buildings', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('addBuilding/getBuilding round-trip', () => {
    const b = makeBuilding();
    r.addBuilding(b);
    expect(r.getBuilding(b.id)).toBe(b);
  });

  it('removeBuilding returns the building and removes it (swap-with-last)', () => {
    const b1 = makeBuilding({ tileX: 1, tileY: 1 });
    const b2 = makeBuilding({ tileX: 2, tileY: 2 });
    const b3 = makeBuilding({ tileX: 3, tileY: 3 });
    r.addBuilding(b1); r.addBuilding(b2); r.addBuilding(b3);
    const removed = r.removeBuilding(b1.id);
    expect(removed).toBe(b1);
    expect(r.getBuilding(b1.id)).toBeUndefined();
    expect(r.buildings).toHaveLength(2);
    expect(r.buildings).toContain(b2);
    expect(r.buildings).toContain(b3);
  });

  it('removeBuilding on non-existent id returns undefined', () => {
    expect(r.removeBuilding('x')).toBeUndefined();
  });

  it('aliveBuildings filters dead buildings and caches', () => {
    const b1 = makeBuilding({ tileX: 1, tileY: 1 });
    const b2 = makeBuilding({ tileX: 2, tileY: 2 });
    r.addBuilding(b1); r.addBuilding(b2);
    b2.hp = 0;
    expect(r.aliveBuildings).toEqual([b1]);
  });
});

describe('EntityRegistry resource fields', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('addField/getField round-trip', () => {
    const f = makeResourceField();
    r.addField(f);
    expect(r.getField(f.id)).toBe(f);
  });

  it('activeFields excludes depleted fields', () => {
    const f1 = makeResourceField(5, 0, 1000);
    const f2 = makeResourceField(6, 0, 5);
    r.addField(f1); r.addField(f2);
    f2.gather(5); // depletes f2
    expect(r.activeFields).toContain(f1);
    expect(r.activeFields).not.toContain(f2);
  });
});

describe('EntityRegistry findEntity', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('resolves unit, building, and field ids', () => {
    const u = makeUnit();
    const b = makeBuilding();
    const f = makeResourceField();
    r.addUnit(u); r.addBuilding(b); r.addField(f);
    expect(r.findEntity(u.id)).toBe(u);
    expect(r.findEntity(b.id)).toBe(b);
    expect(r.findEntity(f.id)).toBe(f);
    expect(r.findEntity('missing')).toBeUndefined();
  });

  it('returns the unit (not building) when ids collide (precedence)', () => {
    // Force a collision by reusing an id via a fresh unit + building.
    const u = makeUnit();
    const b = makeBuilding();
    // overwrite building id to equal unit id
    Object.defineProperty(b, 'id', { value: u.id, configurable: true });
    r.addUnit(u);
    r.addBuilding(b);
    expect(r.findEntity(u.id)).toBe(u);
  });
});

describe('EntityRegistry queries', () => {
  let r: EntityRegistry;
  beforeEach(() => { r = new EntityRegistry(); });

  it('isUnitAlive is true only when unit exists and isAlive', () => {
    const u = makeUnit();
    r.addUnit(u);
    expect(r.isUnitAlive(u.id)).toBe(true);
    u.hp = 0;
    expect(r.isUnitAlive(u.id)).toBe(false);
    expect(r.isUnitAlive('ghost')).toBe(false);
  });

  it('hasBuildingAt returns true only for an alive building at the exact tile', () => {
    const b = makeBuilding({ tileX: 5, tileY: 5 });
    r.addBuilding(b);
    expect(r.hasBuildingAt(5, 5)).toBe(true);
    expect(r.hasBuildingAt(6, 5)).toBe(false);
    b.hp = 0;
    expect(r.hasBuildingAt(5, 5)).toBe(false);
  });

  it('findClosestBuilding returns nearest alive building by Manhattan distance', () => {
    const far = makeBuilding({ tileX: 0, tileY: 0 });
    const near = makeBuilding({ tileX: 5, tileY: 5 });
    r.addBuilding(far); r.addBuilding(near);
    expect(r.findClosestBuilding(5, 5)).toBe(near);
    expect(r.findClosestBuilding(0, 0)).toBe(far);
  });

  it('findClosestBuilding filters by owner', () => {
    const o0 = makeBuilding({ owner: 0, tileX: 0, tileY: 0 });
    const o1 = makeBuilding({ owner: 1, tileX: 1, tileY: 1 });
    r.addBuilding(o0); r.addBuilding(o1);
    expect(r.findClosestBuilding(0, 0, 0)).toBe(o0);
    expect(r.findClosestBuilding(0, 0, 1)).toBe(o1);
    expect(r.findClosestBuilding(0, 0, 9)).toBeUndefined();
  });

  it('findClosestBuilding skips dead buildings', () => {
    const near = makeBuilding({ tileX: 0, tileY: 0 });
    const far = makeBuilding({ tileX: 10, tileY: 10 });
    r.addBuilding(near); r.addBuilding(far);
    near.hp = 0;
    expect(r.findClosestBuilding(9, 9)).toBe(far);
  });

  it('findClosestBuilding returns undefined when no buildings exist', () => {
    expect(r.findClosestBuilding(0, 0)).toBeUndefined();
  });
});

describe('EntityRegistry clear', () => {
  it('empties all arrays, maps, and caches', () => {
    const r = new EntityRegistry();
    const u = makeUnit();
    const b = makeBuilding();
    const f = makeResourceField();
    r.addUnit(u); r.addBuilding(b); r.addField(f);
    r.projectiles.push({} as never);
    r.clear();
    expect(r.units).toEqual([]);
    expect(r.heroes).toEqual([]);
    expect(r.buildings).toEqual([]);
    expect(r.fields).toEqual([]);
    expect(r.projectiles).toEqual([]);
    expect(r.hasUnit(u.id)).toBe(false);
    expect(r.aliveBuildings).toEqual([]);
  });

  it('caches rebuild after clear + re-add', () => {
    const r = new EntityRegistry();
    r.addBuilding(makeBuilding({ tileX: 1, tileY: 1 }));
    r.clear();
    const b = makeBuilding({ tileX: 2, tileY: 2 });
    r.addBuilding(b);
    expect(r.aliveBuildings).toEqual([b]);
  });
});

describe('EntityRegistry index getters', () => {
  it('unitIndex/buildingIndex/fieldIndex return the live internal Maps', () => {
    const r = new EntityRegistry();
    const u = makeUnit();
    r.addUnit(u);
    expect(r.unitIndex.get(u.id)).toBe(u);
    // mutating the returned map corrupts registry state (documented)
    r.unitIndex.delete(u.id);
    expect(r.hasUnit(u.id)).toBe(false);
  });
});
