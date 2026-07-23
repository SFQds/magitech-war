/**
 * GameMap 单元测试 - 瓦片网格系统（地形/可通过性/占用/邻格查找）
 */
import { describe, it, expect } from 'vitest';
import { GameMap } from './GameMap';
import { grassMap } from '../__fixtures__/factories';

describe('GameMap terrain defaults', () => {
  it('a new map defaults every tile to grass, passable, non-sight-blocking', () => {
    const m = grassMap(4, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        expect(m.getTile(x, y)).toBe('grass');
        expect(m.isPassable(x, y)).toBe(true);
        expect(m.blocksSight(x, y)).toBe(false);
      }
    }
  });
});

describe('GameMap getTile / setTile', () => {
  it('getTile on out-of-bounds returns mountain', () => {
    const m = grassMap(4, 4);
    expect(m.getTile(-1, 0)).toBe('mountain');
    expect(m.getTile(4, 4)).toBe('mountain');
    expect(m.getTile(0, 4)).toBe('mountain');
  });

  it('setTile ignores out-of-bounds writes', () => {
    const m = grassMap(4, 4);
    m.setTile(-1, 0, 'water');
    m.setTile(4, 4, 'water');
    expect(m.getTile(0, 0)).toBe('grass');
  });

  it('setTile updates passability and sight-blocking per terrain tables', () => {
    const m = grassMap(8, 8);
    m.setTile(1, 1, 'water');
    expect(m.isPassable(1, 1)).toBe(false);
    expect(m.blocksSight(1, 1)).toBe(false);

    m.setTile(2, 2, 'mountain');
    expect(m.isPassable(2, 2)).toBe(false);
    expect(m.blocksSight(2, 2)).toBe(true);

    m.setTile(3, 3, 'forest');
    expect(m.isPassable(3, 3)).toBe(true);
    expect(m.blocksSight(3, 3)).toBe(true);

    m.setTile(0, 0, 'sand');
    expect(m.isPassable(0, 0)).toBe(true);
    expect(m.blocksSight(0, 0)).toBe(false);
  });
});

describe('GameMap isPassable / isPassableWithUnits', () => {
  it('isPassable returns false for out-of-bounds', () => {
    const m = grassMap(4, 4);
    expect(m.isPassable(-1, -1)).toBe(false);
    expect(m.isPassable(4, 4)).toBe(false);
  });

  it('isPassableWithUnits is false OOB and on impassable terrain', () => {
    const m = grassMap(8, 8);
    m.setTile(1, 1, 'water');
    expect(m.isPassableWithUnits(1, 1)).toBe(false);
    expect(m.isPassableWithUnits(-5, 0)).toBe(false);
  });

  it('isPassableWithUnits returns false when a unit occupies the tile', () => {
    const m = grassMap(8, 8);
    m.markOccupied(2, 2);
    expect(m.isPassableWithUnits(2, 2)).toBe(false);
    expect(m.isPassable(2, 2)).toBe(true); // terrain still passable
  });

  it('markOccupied and removeOccupancy toggle occupancy', () => {
    const m = grassMap(8, 8);
    m.markOccupied(1, 1);
    expect(m.isOccupied(1, 1)).toBe(true);
    m.removeOccupancy(1, 1);
    expect(m.isOccupied(1, 1)).toBe(false);
    expect(m.isOccupied(99, 99)).toBe(false); // nonexistent key
  });

  it('rebuildUnitOccupancy only indexes alive units and clears prior occupancy', () => {
    const m = grassMap(8, 8);
    m.markOccupied(3, 3);
    m.rebuildUnitOccupancy([
      { tileX: 1, tileY: 1, isAlive: true },
      { tileX: 2, tileY: 2, isAlive: false },
    ]);
    expect(m.isOccupied(3, 3)).toBe(false);
    expect(m.isOccupied(1, 1)).toBe(true);
    expect(m.isOccupied(2, 2)).toBe(false); // dead unit ignored
  });
});

describe('GameMap resource tiles', () => {
  it('register/unregister/isResourceTile round-trip', () => {
    const m = grassMap(8, 8);
    m.registerResourceTile(5, 5);
    expect(m.isResourceTile(5, 5)).toBe(true);
    m.unregisterResourceTile(5, 5);
    expect(m.isResourceTile(5, 5)).toBe(false);
  });

  it('unregister on a non-registered tile is a no-op', () => {
    const m = grassMap(8, 8);
    expect(() => m.unregisterResourceTile(0, 0)).not.toThrow();
  });
});

describe('GameMap blocksSight / inBounds', () => {
  it('blocksSight returns true for out-of-bounds', () => {
    const m = grassMap(8, 8);
    expect(m.blocksSight(-1, 0)).toBe(true);
    expect(m.blocksSight(8, 8)).toBe(true);
  });

  it('inBounds: 0..width-1 / 0..height-1 inclusive, negatives false', () => {
    const m = grassMap(8, 8);
    expect(m.inBounds(0, 0)).toBe(true);
    expect(m.inBounds(7, 7)).toBe(true);
    expect(m.inBounds(8, 7)).toBe(false);
    expect(m.inBounds(7, 8)).toBe(false);
    expect(m.inBounds(-1, 0)).toBe(false);
    expect(m.inBounds(0, -1)).toBe(false);
    expect(m.inBounds(-100, -100)).toBe(false);
  });
});

describe('GameMap loadFromData', () => {
  it('copies only the overlapping region and ignores extra rows/cols', () => {
    const m = grassMap(3, 3);
    m.loadFromData({ tiles: [
      ['water', 'water', 'water', 'water'],
      ['mountain', 'mountain'],
    ] });
    expect(m.getTile(0, 0)).toBe('water');
    expect(m.getTile(2, 0)).toBe('water');
    expect(m.getTile(0, 1)).toBe('mountain');
    expect(m.getTile(1, 1)).toBe('mountain');
    expect(m.getTile(0, 2)).toBe('grass'); // row 2 untouched (min(2,3) rows)
  });
});

describe('GameMap markBlocked', () => {
  it('markBlocked(w,h,true) makes a rectangle impassable', () => {
    const m = grassMap(10, 10);
    m.markBlocked(2, 2, 3, 2, true);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(m.isPassable(2 + dx, 2 + dy)).toBe(false);
      }
    }
    expect(m.isPassable(5, 2)).toBe(true); // outside region
    m.markBlocked(2, 2, 3, 2, false);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(m.isPassable(2 + dx, 2 + dy)).toBe(true);
      }
    }
  });

  it('markBlocked silently clips to in-bounds for partially OOB rectangles', () => {
    const m = grassMap(4, 4);
    m.markBlocked(2, 2, 10, 10, true);
    expect(m.isPassable(2, 2)).toBe(false);
    expect(m.isPassable(3, 3)).toBe(false);
    expect(m.isPassable(0, 0)).toBe(true); // outside clipped region
  });

  it('markBlocked does not change tile terrain or sight-blocking', () => {
    const m = grassMap(8, 8);
    m.markBlocked(2, 2, 1, 1, true);
    expect(m.getTile(2, 2)).toBe('grass');
    expect(m.blocksSight(2, 2)).toBe(false);
  });
});

describe('GameMap getPassableGrid', () => {
  it('returns the live internal grid (mutations leak, not a copy)', () => {
    const m = grassMap(8, 8);
    const g = m.getPassableGrid();
    m.markBlocked(0, 0, 1, 1, true);
    expect(g[0][0]).toBe(false); // same array reference
  });
});

describe('GameMap findNearbyPassable', () => {
  it('returns the start tile itself when passable and unoccupied', () => {
    const m = grassMap(16, 16);
    expect(m.findNearbyPassable(5, 5)).toEqual({ x: 5, y: 5 });
  });

  it('skips occupied start and returns an adjacent passable neighbor', () => {
    const m = grassMap(16, 16);
    m.markOccupied(5, 5);
    const r = m.findNearbyPassable(5, 5);
    expect(r).not.toBeNull();
    // ring-1 includes orthogonal (manhattan 1) and diagonal (manhattan 2) corners
    expect(Math.abs(r!.x - 5) + Math.abs(r!.y - 5)).toBeLessThanOrEqual(2);
    expect(m.isPassableWithUnits(r!.x, r!.y)).toBe(true);
  });

  it('returns null when no tile within maxRadius is passable-with-units', () => {
    const m = grassMap(2, 2);
    m.setTile(0, 0, 'water');
    m.setTile(1, 0, 'water');
    m.setTile(0, 1, 'water');
    m.setTile(1, 1, 'water');
    expect(m.findNearbyPassable(0, 0, 1)).toBeNull();
  });

  it('uses default maxRadius 10 when omitted', () => {
    // Build a map with a single passable tile far from the start.
    const m = grassMap(20, 20);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++)
        m.setTile(x, y, 'water');
    m.setTile(10, 8, 'grass'); // dist 8 from (2,0)... let's place near (0,0)
    m.setTile(0, 8, 'grass');
    const r = m.findNearbyPassable(0, 0);
    expect(r).not.toBeNull();
  });
});

describe('GameMap findGatherApproachTile', () => {
  it('returns the first orthogonal neighbor that is passable-with-units (up first)', () => {
    const m = grassMap(16, 16);
    // offsets order: up(0,-1), right(1,0), down(0,1), left(-1,0), diagonals...
    const r = m.findGatherApproachTile(5, 5);
    expect(r).toEqual({ x: 5, y: 4 }); // up
  });

  it('falls back to diagonal neighbors when orthogonal are blocked', () => {
    const m = grassMap(16, 16);
    // block up/right/down/left of (5,5)
    m.markOccupied(5, 4);
    m.markOccupied(6, 5);
    m.markOccupied(5, 6);
    m.markOccupied(4, 5);
    const r = m.findGatherApproachTile(5, 5);
    expect(r).toEqual({ x: 6, y: 4 }); // first diagonal offset {dx:1,dy:-1}
  });

  it('returns null when all 8 neighbors are impassable or occupied', () => {
    const m = grassMap(3, 3);
    // surround (1,1) with water on all 8 neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        m.setTile(1 + dx, 1 + dy, 'water');
      }
    }
    expect(m.findGatherApproachTile(1, 1)).toBeNull();
  });

  it('with field on a map border skips OOB neighbors (right wins)', () => {
    const m = grassMap(4, 4);
    // field at (0,0): up(-1,0) OOB skipped; right(1,0) is first valid
    const r = m.findGatherApproachTile(0, 0);
    expect(r).toEqual({ x: 1, y: 0 });
  });
});

describe('GameMap encodeKey negative-coordinate aliasing (documented behavior)', () => {
  it('(-8,1) collides with (0,0) key on a width-8 map', () => {
    // encodeKey(x,y) = round(y)*width + round(x); (-8,1) -> 8 + (-8) = 0 == (0,0)
    const m = grassMap(8, 8);
    m.markOccupied(-8, 1); // writes key 0
    expect(m.isOccupied(0, 0)).toBe(true); // aliased onto (0,0)
  });

  it('(-1,0) does NOT collide with (7,0) on a width-8 map', () => {
    const m = grassMap(8, 8);
    m.markOccupied(-1, 0); // key -1
    expect(m.isOccupied(7, 0)).toBe(false); // key 7, no alias
  });
});
