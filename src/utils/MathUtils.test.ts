/**
 * MathUtils 单元测试 - 纯函数数学工具
 */
import { describe, it, expect, vi } from 'vitest';
import {
  tileKey,
  tileKeyDecode,
  tileToWorld,
  worldToTile,
  distance,
  manhattan,
  octile,
  clamp,
  lerp,
  randInt,
  deepClone,
  generateId,
} from './MathUtils';

describe('tileKey', () => {
  it('encodes (x,y) as y*mapWidth + x', () => {
    expect(tileKey(3, 4, 10)).toBe(43);
    expect(tileKey(0, 0, 10)).toBe(0);
    expect(tileKey(7, 0, 10)).toBe(7);
    expect(tileKey(0, 2, 10)).toBe(20);
  });

  it('rounds non-integer coords via Math.round', () => {
    expect(tileKey(2.4, 3.6, 10)).toBe(Math.round(3.6) * 10 + Math.round(2.4)); // 4*10+2 = 42
    expect(tileKey(2.6, 3.4, 10)).toBe(3 * 10 + 3); // 33
  });
});

describe('tileKeyDecode', () => {
  it('is the inverse of tileKey for non-negative in-range coords', () => {
    for (const [x, y] of [[0, 0], [7, 3], [15, 15], [1, 0]] as const) {
      const k = tileKey(x, y, 16);
      expect(tileKeyDecode(k, 16)).toEqual({ x, y });
    }
  });

  it('decodes a negative key to a negative x (no wraparound)', () => {
    // -1 % 10 = -1, (-1/10)|0 = 0
    expect(tileKeyDecode(-1, 10)).toEqual({ x: -1, y: 0 });
  });
});

describe('tileToWorld', () => {
  it('returns the tile center for default tileSize 32', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 16, y: 16 });
    expect(tileToWorld(1, 2, 32)).toEqual({ x: 48, y: 80 });
  });

  it('respects a custom tileSize', () => {
    expect(tileToWorld(1, 1, 16)).toEqual({ x: 24, y: 24 });
  });

  it('returns a new object each call (no shared reference)', () => {
    const a = tileToWorld(0, 0);
    const b = tileToWorld(0, 0);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('worldToTile', () => {
  it('is the inverse of tileToWorld (floor of center/size)', () => {
    expect(worldToTile(16, 16, 32)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(48, 80, 32)).toEqual({ x: 1, y: 2 });
    expect(worldToTile(31, 31, 32)).toEqual({ x: 0, y: 0 });
  });

  it('floors negative coordinates toward negative infinity', () => {
    expect(worldToTile(-1, -1, 32)).toEqual({ x: -1, y: -1 });
    expect(worldToTile(-33, 0, 32)).toEqual({ x: -2, y: 0 });
  });
});

describe('distance', () => {
  it('returns 0 for identical points', () => {
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(Math.SQRT2);
  });

  it('is symmetric', () => {
    const a = { x: 2, y: 3 }, b = { x: 9, y: 1 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a));
  });
});

describe('manhattan', () => {
  it('returns 0 for identical points', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
  });

  it('returns |dx|+|dy|', () => {
    expect(manhattan({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7);
    expect(manhattan({ x: -3, y: 0 }, { x: 2, y: 0 })).toBe(5);
  });

  it('is symmetric and non-negative', () => {
    const a = { x: -5, y: 7 }, b = { x: 3, y: -2 };
    expect(manhattan(a, b)).toBe(manhattan(b, a));
    expect(manhattan(a, b)).toBeGreaterThanOrEqual(0);
  });
});

describe('octile', () => {
  it('returns 0 for identical points', () => {
    expect(octile({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('equals manhattan when axis-aligned (dx or dy = 0)', () => {
    expect(octile({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5);
    expect(octile({ x: 0, y: 0 }, { x: 0, y: 3 })).toBe(3);
  });

  it('equals sqrt2*dx for a pure diagonal', () => {
    expect(octile({ x: 0, y: 0 }, { x: 3, y: 3 })).toBeCloseTo(3 * Math.SQRT2);
    // (3+3) + (SQRT2-2)*3 = 6 + 3*SQRT2 - 6 = 3*SQRT2
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 4 }, b = { x: 9, y: 2 };
    expect(octile(a, b)).toBeCloseTo(octile(b, a));
  });
});

describe('clamp', () => {
  it('returns min when value < min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value > max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('with min > max returns min (Math.max wins, degenerate input)', () => {
    // Math.max(10, Math.min(0, 5)) = Math.max(10, 0) = 10
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('propagates NaN', () => {
    expect(Number.isNaN(clamp(NaN, 0, 10))).toBe(true);
  });
});

describe('lerp', () => {
  it('interpolates endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('extrapolates for t outside [0,1]', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it('with a===b always returns a regardless of t', () => {
    expect(lerp(7, 7, 0.5)).toBe(7);
    expect(lerp(7, 7, 3)).toBe(7);
  });
});

describe('randInt', () => {
  it('returns values within [min,max] inclusive', () => {
    const results = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randInt(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      results.add(v);
    }
    // statistical: every integer in range appears
    expect(results.size).toBe(3);
  });

  it('with min===max always returns that value', () => {
    for (let i = 0; i < 10; i++) {
      expect(randInt(4, 4)).toBe(4);
    }
  });

  it('is deterministic with a Math.random spy', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randInt(1, 5)).toBe(1); // floor(0*5)+1 = 1
    spy.mockReturnValue(0.9999);
    expect(randInt(1, 5)).toBe(5); // floor(0.9999*5)+1 = floor(4.9995)+1 = 5
    spy.mockRestore();
  });
});

describe('deepClone', () => {
  it('produces an equal but distinct object', () => {
    const o = { a: 1, b: [2, { c: 3 }] };
    const c = deepClone(o);
    expect(c).toEqual(o);
    expect(c).not.toBe(o);
    expect(c.b).not.toBe(o.b);
  });

  it('drops functions and undefined (JSON semantics)', () => {
    const o = { fn: () => 1, u: undefined, n: null };
    expect(deepClone(o)).toEqual({ n: null });
  });

  it('of a primitive returns the primitive', () => {
    expect(deepClone(5)).toBe(5);
    expect(deepClone('hi')).toBe('hi');
    expect(deepClone(null)).toBeNull();
  });
});

describe('generateId', () => {
  it('produces a string matching the prefix_counter_timestamp format', () => {
    expect(generateId('unit')).toMatch(/^unit_\d+_[0-9a-z]+$/);
    expect(generateId('bld')).toMatch(/^bld_/);
  });

  it('defaults the prefix to "entity" when omitted', () => {
    expect(generateId()).toMatch(/^entity_/);
  });

  it('counter increments by 1 between consecutive calls (module state)', () => {
    const a = generateId('t');
    const b = generateId('t');
    const na = parseInt(a.split('_')[1], 10);
    const nb = parseInt(b.split('_')[1], 10);
    expect(nb).toBe(na + 1);
  });

  it('counter is strictly increasing across prefixes', () => {
    const a = parseInt(generateId('x').split('_')[1], 10);
    const b = parseInt(generateId('y').split('_')[1], 10);
    expect(b).toBeGreaterThan(a);
  });
});
