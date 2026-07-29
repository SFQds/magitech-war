/**
 * heroData.ts 数据完整性测试 - HERO_DEFS 自洽性 + getFactionHero
 *
 * L1 单元：纯数据校验，无依赖。
 */
import { describe, it, expect } from 'vitest';
import { HERO_DEFS, getFactionHero } from './heroData';
import { FACTION_DEFS } from './unitData';
import { PNG_SPRITE_KEYS } from './sprites';
import { MAX_CRYSTAL } from './balance';

const ARMOR_TYPES = new Set(['light', 'heavy', 'shield', 'bio', 'structure', 'mechanical']);
const DAMAGE_TYPES = new Set(['physical', 'magic', 'alchemy', 'crystal', 'void']);

describe('HERO_DEFS - 数据自洽性', () => {
  it('包含 hero_isabelle 和 hero_marcus', () => {
    const keys = Object.keys(HERO_DEFS);
    expect(keys).toContain('hero_isabelle');
    expect(keys).toContain('hero_marcus');
  });

  it('每个英雄 faction 是合法 FACTION_DEFS key', () => {
    const validFactions = new Set(Object.keys(FACTION_DEFS));
    for (const def of Object.values(HERO_DEFS)) {
      expect(validFactions.has(def.faction)).toBe(true);
    }
  });

  it('每个英雄 stats.armor 是合法 ArmorType', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(ARMOR_TYPES.has(def.stats.armor)).toBe(true);
    }
  });

  it('每个英雄 stats.dmgType 是合法 DamageType', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(DAMAGE_TYPES.has(def.stats.dmgType)).toBe(true);
    }
  });

  it('每个英雄 stats 有正 hp/speed/sight 和非负 damage/range/cooldown', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.stats.hp).toBeGreaterThan(0);
      expect(def.stats.speed).toBeGreaterThan(0);
      expect(def.stats.sight).toBeGreaterThan(0);
      expect(def.stats.damage).toBeGreaterThanOrEqual(0);
      expect(def.stats.range).toBeGreaterThanOrEqual(0);
      expect(def.stats.cooldown).toBeGreaterThanOrEqual(0);
    }
  });

  it('每个英雄 armorValue 是非负数', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.armorValue ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('每个英雄 auraRadius 是正数', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.auraRadius ?? 8).toBeGreaterThan(0);
    }
  });

  it('isabelle auraRadius=8, marcus auraRadius=12', () => {
    expect(HERO_DEFS['hero_isabelle'].auraRadius).toBe(8);
    expect(HERO_DEFS['hero_marcus'].auraRadius).toBe(12);
  });

  it('每个英雄 skillTree 有 5 个条目, 含 name/cooldown/description', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.skillTree).toHaveLength(5);
      for (const skill of def.skillTree) {
        expect(skill.name).toBeTruthy();
        expect(skill.cooldown).toBeGreaterThanOrEqual(0);
        expect(skill.description).toBeDefined();
      }
    }
  });

  it('active.name === skillTree[0].name (Lv1 主动与 active 一致)', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.active.name).toBe(def.skillTree[0].name);
    }
  });

  it('每个英雄 reviveCooldown 为正', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.reviveCooldown).toBeGreaterThan(0);
    }
  });

  it('每个英雄 cost 有 crystal>=0, supply>0, time>0', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.cost.crystal).toBeGreaterThanOrEqual(0);
      expect(def.cost.supply).toBeGreaterThan(0);
      expect(def.cost.time).toBeGreaterThan(0);
    }
  });

  it('每个英雄 cost.crystal 不超过 MAX_CRYSTAL', () => {
    for (const def of Object.values(HERO_DEFS)) {
      expect(def.cost.crystal).toBeLessThanOrEqual(MAX_CRYSTAL);
    }
  });

  it('每个英雄 key 都有对应 PNG sprite key', () => {
    const set = new Set<string>(PNG_SPRITE_KEYS as readonly string[]);
    for (const key of Object.keys(HERO_DEFS)) {
      expect(set.has(key)).toBe(true);
    }
  });
});

describe('getFactionHero', () => {
  it('arcane_empire -> hero_isabelle', () => {
    expect(getFactionHero('arcane_empire')).toBe('hero_isabelle');
  });

  it('hammer_federation -> hero_marcus', () => {
    expect(getFactionHero('hammer_federation')).toBe('hero_marcus');
  });

  it('已配置阵营 frostridge_kingdom -> hero_frost_a / hero_frost_b', () => {
    expect(getFactionHero('frostridge_kingdom', 0)).toBe('hero_frost_a');
    expect(getFactionHero('frostridge_kingdom', 1)).toBe('hero_frost_b');
  });

  it('空字符串 -> undefined', () => {
    expect(getFactionHero('')).toBeUndefined();
  });

  it('未知阵营 -> undefined', () => {
    expect(getFactionHero('not_a_faction')).toBeUndefined();
  });

  it('faction->hero 映射结果都在 HERO_DEFS 中', () => {
    const factionKeys = Object.keys(FACTION_DEFS);
    for (const f of factionKeys) {
      const h = getFactionHero(f);
      if (h) expect(HERO_DEFS[h]).toBeDefined();
    }
  });
});
