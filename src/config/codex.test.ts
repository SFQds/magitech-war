/**
 * codex.ts 图鉴数据完整性测试
 */
import { describe, it, expect } from 'vitest';
import { CODEX_ENTRIES, getCodexByCategory, getCodexCategories } from './codex';
import { UNIT_DEFS, BUILDING_DEFS } from './unitData';
import { HERO_DEFS } from './heroData';

describe('CODEX_ENTRIES - 数据完整性', () => {
  it('非空数组', () => {
    expect(CODEX_ENTRIES.length).toBeGreaterThan(0);
  });

  it('每个条目有 id/name/category/desc', () => {
    for (const e of CODEX_ENTRIES) {
      expect(e.id).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.desc.length).toBeGreaterThan(5);
    }
  });

  it('id 无重复', () => {
    const ids = CODEX_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('category 值合法', () => {
    const valid = new Set(['faction', 'unit', 'building', 'tech', 'hero', 'guild', 'superweapon', 'neutral_unit', 'neutral_building']);
    for (const e of CODEX_ENTRIES) {
      expect(valid.has(e.category)).toBe(true);
    }
  });
});

describe('CODEX_ENTRIES - 覆盖率', () => {
  it('所有 UNIT_DEFS 都有图鉴条目', () => {
    for (const id of Object.keys(UNIT_DEFS)) {
      expect(CODEX_ENTRIES.some(e => e.id === id), `unit ${id} missing`).toBe(true);
    }
  });

  it('所有 BUILDING_DEFS 都有图鉴条目', () => {
    for (const id of Object.keys(BUILDING_DEFS)) {
      expect(CODEX_ENTRIES.some(e => e.id === id), `building ${id} missing`).toBe(true);
    }
  });

  it('所有 HERO_DEFS 都有图鉴条目', () => {
    for (const id of Object.keys(HERO_DEFS)) {
      expect(CODEX_ENTRIES.some(e => e.id === id), `hero ${id} missing`).toBe(true);
    }
  });

  it('4个行会都有图鉴条目', () => {
    for (const g of ['mages_guild', 'mechanists_guild', 'alchemists_society', 'void_institute']) {
      expect(CODEX_ENTRIES.some(e => e.id === g)).toBe(true);
    }
  });

  it('4个超级武器都有图鉴条目', () => {
    for (const sw of ['elemental_storm', 'orbital_cannon', 'solvent_bomb', 'void_rift']) {
      expect(CODEX_ENTRIES.some(e => e.id === sw)).toBe(true);
    }
  });

  it('2个阵营都有图鉴条目', () => {
    for (const f of ['arcane_empire', 'hammer_federation']) {
      expect(CODEX_ENTRIES.some(e => e.id === f)).toBe(true);
    }
  });

  it('3个中立单位都有图鉴条目', () => {
    for (const n of ['neutral_crystal_wisp', 'neutral_feral_mech', 'neutral_mountain_beast']) {
      expect(CODEX_ENTRIES.some(e => e.id === n)).toBe(true);
    }
  });

  it('4个中立建筑都有图鉴条目', () => {
    for (const n of ['neutral_trade_outpost', 'neutral_ancient_shrine', 'neutral_abandoned_mine', 'neutral_watchtower']) {
      expect(CODEX_ENTRIES.some(e => e.id === n)).toBe(true);
    }
  });
});

describe('getCodexByCategory', () => {
  it('返回指定分类的条目', () => {
    const units = getCodexByCategory('unit');
    expect(units.length).toBeGreaterThan(0);
    expect(units.every(e => e.category === 'unit')).toBe(true);
  });

  it('未知分类返回空数组', () => {
    expect(getCodexByCategory('nonexistent' as any)).toEqual([]);
  });

  it('每个分类至少有1个条目', () => {
    const cats = getCodexCategories();
    for (const c of cats) {
      expect(c.count).toBeGreaterThan(0);
    }
  });
});

describe('getCodexCategories', () => {
  it('返回所有分类', () => {
    const cats = getCodexCategories();
    expect(cats.length).toBeGreaterThanOrEqual(8);
  });

  it('每个分类有 label 和 count', () => {
    const cats = getCodexCategories();
    for (const c of cats) {
      expect(c.label).toBeTruthy();
      expect(c.count).toBeGreaterThan(0);
    }
  });

  it('分类无重复', () => {
    const cats = getCodexCategories();
    const set = new Set(cats.map(c => c.category));
    expect(set.size).toBe(cats.length);
  });
});
